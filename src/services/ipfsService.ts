import axios from 'axios';
import FormData from 'form-data';
import { Request } from 'express';
import logger from '../utils/logger';
const nanoid = require('nanoid').nanoid;
import mongoose from 'mongoose';
import { shortUrlMigrationService } from './shortUrlMigrationService';
import ShortUrlModel from '../models/shortUrlModel';
import { TransactionService } from './transactionService';
import { ShortUrlService } from './shortUrlService';
import { JSDOM } from 'jsdom';
import createDOMPurify from 'dompurify';
import { TurnstileService } from './turnstileService';

// IPFS服务设置（支持从 MongoDB 读取配置，优先于环境变量）
interface IPFSSettingDoc { key: string; value: string; updatedAt?: Date }
const IPFSSettingSchema = new mongoose.Schema<IPFSSettingDoc>({
  key: { type: String, required: true },
  value: { type: String, required: true },
  updatedAt: { type: Date, default: Date.now }
}, { collection: 'shorturl_settings' });
const IPFSSettingModel = (mongoose.models.IPFSSetting as mongoose.Model<IPFSSettingDoc>) || mongoose.model<IPFSSettingDoc>('IPFSSetting', IPFSSettingSchema);

async function getIPFSUploadURL(): Promise<string> {
  try {
    if (mongoose.connection.readyState === 1) {
      const doc = await IPFSSettingModel.findOne({ key: 'IPFS_UPLOAD_URL' }).lean().exec();
      if (doc && typeof doc.value === 'string' && doc.value.trim().length > 0) {
        logger.info('[IPFS] 从MongoDB读取到IPFS_UPLOAD_URL配置:', doc.value);
        return doc.value.trim();
      }
    }
  } catch (e) {
    logger.error('[IPFS] 读取IPFS_UPLOAD_URL配置失败', e);
  }
  
  // 如果没有配置，抛出错误
  throw new Error('IPFS_UPLOAD_URL配置未设置，请在MongoDB的shorturl_settings集合中设置key为"IPFS_UPLOAD_URL"的配置');
}


export interface IPFSUploadResponse {
    status: string;
    cid: string;
    url: string;
    web2url: string;
    fileSize: string;
    gnfd_id: string | null;
    gnfd_txn: string | null;
    shortUrl?: string;
}

// 确保 mongoose 连接已建立
async function ensureMongoConnected() {
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/tts');
  }
}

export class IPFSService {
    private static readonly IPFS_BACKUP_URL = 'https://ipfs.infura.io:5001/api/v0/add'; // 备用IPFS网关
    private static readonly MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
    private static dompurifyInstance: any | null = null;

    // 懒加载并返回 DOMPurify 实例（Node 环境使用 JSDOM）
    private static getDOMPurify(): any {
        if (!this.dompurifyInstance) {
            const { window } = new JSDOM('');
            this.dompurifyInstance = (createDOMPurify as any)(window as any);
        }
        return this.dompurifyInstance;
    }

    /**
     * 上传文件到IPFS
     * @param fileBuffer 文件缓冲区
     * @param filename 文件名
     * @param mimetype 文件类型
     * @param options 上传选项
     * @param cfToken Turnstile验证token（可选）
     * @returns IPFS上传响应
     */
    public static async uploadFile(
        fileBuffer: Buffer,
        filename: string,
        mimetype: string,
        options?: { shortLink?: boolean; userId?: string; username?: string },
        cfToken?: string
    ): Promise<IPFSUploadResponse> {
        // 如果提供了cfToken，进行Turnstile验证
        if (cfToken) {
            if (await TurnstileService.isEnabled()) {
                try {
                    const isValid = await TurnstileService.verifyToken(cfToken);
                    if (!isValid) {
                        throw new Error('人机验证失败，请重新验证');
                    }
                    logger.info('[IPFS] Turnstile验证通过');
                } catch (error) {
                    logger.error('[IPFS] Turnstile验证失败:', error instanceof Error ? error.message : String(error));
                    throw new Error('人机验证失败，请重新验证');
                }
            } else {
                logger.warn('[IPFS] Turnstile服务未启用，跳过验证');
            }
        } else {
            logger.info('[IPFS] 未提供cfToken，跳过Turnstile验证');
        }
        
        // 检查文件大小
        if (fileBuffer.length > this.MAX_FILE_SIZE) {
            throw new Error(`文件大小不能超过 ${this.MAX_FILE_SIZE / 1024 / 1024}MB`);
        }
        
        // 检查文件类型（只允许图片）
        const allowedMimeTypes = [
            'image/jpeg',
            'image/jpg',
            'image/png',
            'image/gif',
            'image/webp',
            'image/bmp',
            'image/svg+xml'
        ];
        if (!allowedMimeTypes.includes(mimetype.toLowerCase())) {
            throw new Error('只支持图片文件格式：JPEG, PNG, GIF, WebP, BMP, SVG');
        }

        // 规范化文件名，特别是SVG文件
        const normalizedFilename = this.normalizeFilename(filename, mimetype);
        logger.info(`[IPFS] 原始文件名: ${filename}, 规范化后: ${normalizedFilename}`);
        
        // 如果规范化后的文件名有问题，使用原始文件名
        const finalFilename = normalizedFilename && normalizedFilename !== '.svg' ? normalizedFilename : filename;
        
        // 如果是SVG文件，验证和优化文件内容
        if (mimetype.toLowerCase() === 'image/svg+xml' || filename.toLowerCase().endsWith('.svg')) {
            logger.info(`[IPFS] 检测到SVG文件，进行安全验证和优化: ${filename}`);
            this.validateSVGContent(fileBuffer);
            // 优化SVG内容
            fileBuffer = Buffer.from(this.optimizeSVGContent(fileBuffer.toString('utf-8')));
        }

        try {
            return await this.uploadFileInternal(fileBuffer, finalFilename, mimetype, options, cfToken);
        } catch (error) {
            // SVG转PNG功能已移除，直接抛出错误
            throw error;
        }
    }

    /**
     * 备用IPFS上传方案
     */
    private static async uploadToBackup(
        fileBuffer: Buffer,
        filename: string,
        mimetype: string,
        options?: { shortLink?: boolean; userId?: string; username?: string },
        cfToken?: string
    ): Promise<IPFSUploadResponse> {
        // 规范化文件名
        const normalizedFilename = this.normalizeFilename(filename, mimetype);
        logger.info(`[IPFS] 使用备用方案上传: ${normalizedFilename}`);
        
        try {
            const formData = new (require('form-data'))();
            formData.append('file', fileBuffer, {
                filename: normalizedFilename,
                contentType: mimetype
            });
            
            const response = await (require('axios')).post(
                this.IPFS_BACKUP_URL,
                formData,
                {
                    headers: {
                        ...formData.getHeaders(),
                    },
                    timeout: 45000, // 备用服务可能需要更长时间
                }
            );
            
            // 备用服务返回格式可能不同，需要适配
            const cid = response.data.Hash;
            const web2url = `https://ipfs.io/ipfs/${cid}`;
            
            logger.info(`[IPFS] 备用方案上传成功: ${normalizedFilename}, CID: ${cid}`);
            
            return {
                status: 'success',
                cid,
                url: `ipfs://${cid}`,
                web2url,
                fileSize: fileBuffer.length.toString(),
                gnfd_id: null,
                gnfd_txn: null
            };
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error(`[IPFS] 备用方案失败: ${errorMessage}`);
            throw new Error(`备用IPFS服务也失败: ${errorMessage}`);
        }
    }

    /**
     * 内部上传方法，包含重试逻辑
     * @param fileBuffer 文件缓冲区
     * @param filename 文件名
     * @param mimetype 文件类型
     * @param options 上传选项
     * @param cfToken Turnstile验证token（可选）
     * @returns IPFS上传响应
     */
    private static async uploadFileInternal(
        fileBuffer: Buffer,
        filename: string,
        mimetype: string,
        options?: { shortLink?: boolean; userId?: string; username?: string },
        cfToken?: string
    ): Promise<IPFSUploadResponse> {
        const MAX_RETRIES = 2;
        let lastError: any = null;

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
                logger.info(`[IPFS] 尝试上传文件 (第${attempt + 1}次): ${filename}`);
                
                // 创建FormData
                const formData = new (require('form-data'))();
                formData.append('file', fileBuffer, {
                    filename,
                    contentType: mimetype
                });
                
                // 动态获取IPFS上传URL
                let ipfsUploadUrl;
                try {
                    ipfsUploadUrl = await getIPFSUploadURL();
                } catch (configError) {
                    logger.error('[IPFS] 获取IPFS配置失败:', configError instanceof Error ? configError.message : String(configError));
                    throw new Error('IPFS服务配置未设置，请联系管理员配置IPFS_UPLOAD_URL');
                }
                
                // 发送请求到IPFS
                const response = await (require('axios')).post(
                    `${ipfsUploadUrl}?stream-channels=true&pin=false&wrap-with-directory=false&progress=false`,
                    formData,
                    {
                        headers: {
                            ...formData.getHeaders(),
                        },
                        timeout: 30000, // 30秒超时
                    }
                );
                
                // 新API返回格式：{ "Name": "文件名", "Hash": "CID", "Size": "文件大小" }
                const cid = response.data.Hash;
                const web2url = `https://ipfs.hapxs.com/ipfs/${cid}`;
                
                logger.info(`[IPFS] 上传成功: ${filename}, CID: ${cid}, 文件大小: ${response.data.Size} bytes`);
                logger.info(`[IPFS] API响应:`, response.data);
                
                // 构建标准化的响应格式
                const uploadResponse = {
                    status: 'success',
                    cid,
                    url: `ipfs://${cid}`,
                    web2url,
                    fileSize: response.data.Size || fileBuffer.length.toString(),
                    gnfd_id: null,
                    gnfd_txn: null
                };
                
                // 上传成功后生成短链（仅当 options.shortLink 为 true 时）
                let shortUrl = '';
                if (options && options.shortLink && web2url) {
                  try {
                    // 使用迁移服务自动修正目标URL
                    const fixedTarget = shortUrlMigrationService.fixTargetUrlBeforeSave(web2url);
                    
                    // 使用短链服务创建短链，确保并发安全
                    shortUrl = await ShortUrlService.createShortUrl(
                      fixedTarget,
                      options.userId || 'admin',
                      options.username || 'admin'
                    );
                    
                    logger.info('[ShortLink] 短链创建成功', { 
                      target: fixedTarget, 
                      userId: options.userId, 
                      username: options.username 
                    });
                  } catch (err) {
                    logger.error('[ShortLink] 短链创建失败', { 
                      target: web2url, 
                      error: err instanceof Error ? err.message : String(err) 
                    });
                    // 不抛出错误，继续返回IPFS上传结果
                  }
                }
                return { ...uploadResponse, shortUrl };
            } catch (error: unknown) {
                lastError = error;
                const errorMessage = error instanceof Error ? error.message : String(error);
                const statusCode = (error as any)?.response?.status;
                
                logger.error(`[IPFS] 上传失败 (第${attempt + 1}次): ${filename}`, {
                    error: errorMessage,
                    statusCode,
                    attempt: attempt + 1,
                    maxRetries: MAX_RETRIES
                });
                
                // 如果是503或500错误，说明服务不可用，可以尝试备用方案
                if (statusCode === 503 || statusCode === 500) {
                    logger.warn(`[IPFS] 主服务不可用 (${statusCode})，尝试备用方案`);
                    try {
                        return await this.uploadToBackup(fileBuffer, filename, mimetype, options, cfToken);
                    } catch (backupError) {
                        logger.error(`[IPFS] 备用方案也失败: ${backupError instanceof Error ? backupError.message : String(backupError)}`);
                        lastError = new Error(`IPFS服务暂时不可用，请稍后重试。错误详情: ${errorMessage}`);
                    }
                }
                
                if (attempt < MAX_RETRIES) {
                    const delay = (attempt + 1) * 2000; // 递增延迟：2秒、4秒
                    logger.info(`[IPFS] ${delay}ms后重试上传`);
                    await new Promise(res => setTimeout(res, delay));
                }
            }
        }
        
        // 所有重试都失败了
        const finalError = lastError instanceof Error ? lastError.message : String(lastError);
        logger.error(`[IPFS] 所有上传尝试都失败: ${filename}`, { finalError });
        throw new Error(`IPFS上传失败: ${finalError}`);
    }

    /**
     * 优化SVG文件内容
     * @param content SVG文件内容
     * @returns 优化后的SVG内容
     */
    private static optimizeSVGContent(content: string): string {
        try {
            // 使用 JSDOM 移除注释，避免基于正则的多字符清理导致的遗漏
            try {
                const dom = new JSDOM(content, { contentType: 'image/svg+xml' });
                const doc = dom.window.document;
                const walker = doc.createTreeWalker(doc, dom.window.NodeFilter.SHOW_COMMENT);
                const toRemove: Comment[] = [] as unknown as Comment[];
                while (walker.nextNode()) {
                    toRemove.push(walker.currentNode as Comment);
                }
                toRemove.forEach((node) => node.parentNode?.removeChild(node));
                // 使用序列化后的 SVG 作为后续处理输入
                content = doc.documentElement ? doc.documentElement.outerHTML : content;
            } catch {
                // 忽略解析失败，继续后续清理
            }
            
            // 移除潜在的危险属性 - 使用更严格的正则表达式
            // 使用更安全的清理方法
            content = this.safeRemoveEventHandlers(content);
            content = this.safeRemoveDangerousProtocols(content);
            content = this.safeRemoveDangerousTags(content);
            content = this.safeRemoveExternalReferences(content);
            
            // 使用额外的安全清理
            content = this.performAdditionalSanitization(content);

            // 最终使用 DOMPurify 清理，避免使用不可靠的 HTML 正则
            content = this.sanitizeSVGWithDOMPurify(content);
            
            logger.info('[IPFS] SVG文件内容优化完成');
            return content;
        } catch (error) {
            logger.warn('[IPFS] SVG文件内容优化失败，使用原始内容:', error instanceof Error ? error.message : String(error));
            return content;
        }
    }

    // 使用 DOMPurify 进行 SVG 安全清理
    private static sanitizeSVGWithDOMPurify(content: string): string {
        const DOMPurify = this.getDOMPurify();
        return DOMPurify.sanitize(content, {
            USE_PROFILES: { svg: true, svgFilters: true, html: false },
            FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'link', 'meta', 'style', 'foreignObject'],
            FORBID_ATTR: [/^on/i, 'href', 'xlink:href', 'src', 'style'],
            ALLOW_UNKNOWN_PROTOCOLS: false,
            // 禁止一切 URI（包括 http/https/data/javascript 等）
            ALLOWED_URI_REGEXP: /^(?!)$/,
            KEEP_CONTENT: false
        } as any);
    }

    /**
     * 安全移除事件处理器
     * @param content SVG文件内容
     * @returns 清理后的SVG内容
     */
    private static safeRemoveEventHandlers(content: string): string {
        try {
            const dom = new JSDOM(content, { contentType: 'image/svg+xml' });
            const doc = dom.window.document;
            const elements = doc.querySelectorAll('*');
            for (const el of Array.from(elements)) {
                const toRemove: string[] = [];
                for (const attr of Array.from(el.attributes)) {
                    if (/^on/i.test(attr.name)) {
                        toRemove.push(attr.name);
                    }
                }
                toRemove.forEach((name) => el.removeAttribute(name));
            }
            return doc.documentElement ? doc.documentElement.outerHTML : content;
        } catch {
            return content;
        }
    }

    /**
     * 安全移除危险协议
     * @param content SVG文件内容
     * @returns 清理后的SVG内容
     */
    private static safeRemoveDangerousProtocols(content: string): string {
        try {
            const dom = new JSDOM(content, { contentType: 'image/svg+xml' });
            const doc = dom.window.document;
            const elements = doc.querySelectorAll('*');
            const hasUnsafeProtocol = (val: string) =>
                /^[a-zA-Z][a-zA-Z0-9+.-]*\s*:/i.test(val) && !val.trim().startsWith('#');
            for (const el of Array.from(elements)) {
                const toRemove: string[] = [];
                for (const attr of Array.from(el.attributes)) {
                    const name = attr.name;
                    const value = attr.value || '';
                    if (hasUnsafeProtocol(value)) {
                        toRemove.push(name);
                        continue;
                    }
                    if (name.toLowerCase() === 'style') {
                        // 移除包含外部协议的 url() 引用
                        if (/url\(\s*["']?\s*(https?:|data:|javascript:|vbscript:)/i.test(value)) {
                            toRemove.push(name);
                        }
                    }
                }
                toRemove.forEach((n) => el.removeAttribute(n));
            }
            return doc.documentElement ? doc.documentElement.outerHTML : content;
        } catch {
            return content;
        }
    }

    /**
     * 安全移除危险标签
     * @param content SVG文件内容
     * @returns 清理后的SVG内容
     */
    private static safeRemoveDangerousTags(content: string): string {
        try {
            const dom = new JSDOM(content, { contentType: 'image/svg+xml' });
            const doc = dom.window.document;
            const forbiddenTags = ['script', 'iframe', 'object', 'embed', 'link', 'meta', 'style', 'foreignObject'];
            for (const tag of forbiddenTags) {
                doc.querySelectorAll(tag).forEach((el) => el.remove());
            }
            return doc.documentElement ? doc.documentElement.outerHTML : content;
        } catch {
            return content;
        }
    }

    /**
     * 安全移除外部引用
     * @param content SVG文件内容
     * @returns 清理后的SVG内容
     */
    private static safeRemoveExternalReferences(content: string): string {
        try {
            const dom = new JSDOM(content, { contentType: 'image/svg+xml' });
            const doc = dom.window.document;
            const elements = doc.querySelectorAll('*');
            for (const el of Array.from(elements)) {
                // href/src/xlink:href 仅保留内部引用 #id
                ['href', 'xlink:href', 'src'].forEach((name) => {
                    const val = el.getAttribute(name);
                    if (val && !val.trim().startsWith('#')) {
                        el.removeAttribute(name);
                    }
                });
                // style 中的外部 url() 引用不允许
                const style = el.getAttribute('style');
                if (style && /url\(\s*["']?\s*https?:/i.test(style)) {
                    el.removeAttribute('style');
                }
            }
            return doc.documentElement ? doc.documentElement.outerHTML : content;
        } catch {
            return content;
        }
    }

    /**
     * 执行额外的安全清理，确保SVG内容安全
     * @param content SVG文件内容
     * @returns 清理后的SVG内容
     */
    private static performAdditionalSanitization(content: string): string {
        // 使用循环确保所有内容都被清理
        content = this.safeRemoveCDATA(content);
        content = this.safeRemoveDataAttributes(content);
        content = this.safeRemoveExternalUrls(content);
        content = this.safeRemoveEncodedContent(content);
        content = this.safeRemoveComments(content);
        
        return content;
    }

    /**
     * 安全移除CDATA部分
     * @param content SVG文件内容
     * @returns 清理后的SVG内容
     */
    private static safeRemoveCDATA(content: string): string {
        let previousContent = '';
        while (previousContent !== content) {
            previousContent = content;
            content = content.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '');
        }
        return content;
    }

    /**
     * 安全移除data属性
     * @param content SVG文件内容
     * @returns 清理后的SVG内容
     */
    private static safeRemoveDataAttributes(content: string): string {
        let previousContent = '';
        while (previousContent !== content) {
            previousContent = content;
            content = content.replace(/\s*data-[^=]*\s*=\s*["'][^"']*["']/gi, '');
        }
        return content;
    }

    /**
     * 安全移除外部URL
     * @param content SVG文件内容
     * @returns 清理后的SVG内容
     */
    private static safeRemoveExternalUrls(content: string): string {
        let previousContent = '';
        while (previousContent !== content) {
            previousContent = content;
            content = content.replace(/url\s*\(\s*["']?https?:\/\//gi, 'url(');
            content = content.replace(/href\s*=\s*["']?https?:\/\//gi, 'href=');
            content = content.replace(/src\s*=\s*["']?https?:\/\//gi, 'src=');
        }
        return content;
    }

    /**
     * 安全移除编码内容
     * @param content SVG文件内容
     * @returns 清理后的SVG内容
     */
    private static safeRemoveEncodedContent(content: string): string {
        let previousContent = '';
        while (previousContent !== content) {
            previousContent = content;
            // 移除所有可能的编码绕过
            content = content.replace(/&#x?[0-9a-f]+;/gi, '');
            content = content.replace(/\\x[0-9a-f]{2}/gi, '');
            content = content.replace(/\\u[0-9a-f]{4}/gi, '');
            content = content.replace(/\\u\{[0-9a-f]+\}/gi, '');
            content = content.replace(/&[a-z]+;/gi, '');
        }
        return content;
    }

    /**
     * 安全移除注释
     * @param content SVG文件内容
     * @returns 清理后的SVG内容
     */
    private static safeRemoveComments(content: string): string {
        let previousContent = '';
        while (previousContent !== content) {
            previousContent = content;
            content = content.replace(/\/\*[\s\S]*?\*\//g, '');
            content = content.replace(/\/\/.*$/gm, '');
        }
        return content;
    }

    /**
     * 验证SVG文件内容
     * @param fileBuffer 文件缓冲区
     */
    private static validateSVGContent(fileBuffer: Buffer): void {
        try {
            const content = fileBuffer.toString('utf-8');
            
            // 检查是否包含基本的SVG标签
            if (!content.includes('<svg') || !content.includes('</svg>')) {
                throw new Error('无效的SVG文件：缺少SVG标签');
            }
            
            // 检查文件大小（SVG文件通常不应该太大）
            if (content.length > 1024 * 1024) { // 1MB
                throw new Error('SVG文件过大，可能包含恶意内容');
            }
            // 使用 JSDOM 进行结构化校验
            const dom = new JSDOM(content, { contentType: 'image/svg+xml' });
            const doc = dom.window.document;

            // 禁止的标签
            const forbiddenTags = ['script', 'iframe', 'object', 'embed', 'link', 'meta', 'style', 'foreignObject'];
            if (doc.querySelector(forbiddenTags.join(','))) {
                throw new Error('SVG文件包含禁止的标签');
            }

            // 遍历所有元素，检查属性安全性
            const elements = doc.querySelectorAll('*');
            for (const el of Array.from(elements)) {
                for (const attr of Array.from(el.attributes)) {
                    const name = attr.name;
                    const value = attr.value || '';
                    // 禁止事件处理器
                    if (/^on/i.test(name)) {
                        throw new Error(`SVG文件包含事件处理器属性: ${name}`);
                    }
                    // 禁止危险引用属性（仅允许内部引用 #id）
                    if (['href', 'xlink:href', 'src', 'style'].includes(name)) {
                        if (!value.trim().startsWith('#')) {
                            throw new Error(`SVG文件包含外部引用或危险属性: ${name}`);
                        }
                    }
                    // 禁止任何包含外部 url(http/https) 的属性值
                    if (/url\(\s*["']?https?:/i.test(value)) {
                        throw new Error('SVG文件包含外部URL引用');
                    }
                    // 禁止任何带有协议的值（如 javascript:, data:, vbscript:, http: 等），除非是内部引用
                    if (/^[a-zA-Z][a-zA-Z0-9+.-]*\s*:/i.test(value) && !value.trim().startsWith('#')) {
                        throw new Error('SVG文件包含不安全的URI协议');
                    }
                }
            }

            logger.info('[IPFS] SVG文件内容验证通过');
        } catch (error) {
            logger.error('[IPFS] SVG文件内容验证失败:', error instanceof Error ? error.message : String(error));
            throw new Error(`SVG文件验证失败: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * 规范化文件名，特别是处理SVG文件的中文名称
     * @param filename 原始文件名
     * @param mimetype 文件类型
     * @returns 规范化后的文件名
     */
    private static normalizeFilename(filename: string, mimetype: string): string {
        // 移除文件扩展名
        const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');
        const ext = filename.match(/\.[^/.]+$/)?.[0] || '';
        
        // 如果是SVG文件，特殊处理中文名称
        if (mimetype.toLowerCase() === 'image/svg+xml' || ext.toLowerCase() === '.svg') {
            // 检测是否包含中文字符
            const hasChinese = /[\u4e00-\u9fff]/.test(nameWithoutExt);
            
            if (hasChinese) {
                // 生成一个基于时间戳和随机数的英文名称
                const timestamp = Date.now();
                const randomId = nanoid(8);
                return `svg_${timestamp}_${randomId}.svg`;
            }
        }
        
        // 对于其他文件，清理特殊字符但保留原始名称
        let cleanedName = nameWithoutExt;
        
        // 如果名称为空或只包含特殊字符，生成一个默认名称
        if (!cleanedName || cleanedName.trim() === '') {
            const timestamp = Date.now();
            const randomId = nanoid(8);
            cleanedName = `file_${timestamp}_${randomId}`;
        } else {
            // 清理特殊字符但保留中文
            cleanedName = cleanedName
                .replace(/[^\w\u4e00-\u9fff\-_]/g, '_') // 只保留字母、数字、中文、连字符和下划线
                .replace(/_+/g, '_') // 将多个连续下划线替换为单个
                .replace(/^_|_$/g, ''); // 移除开头和结尾的下划线
        }
        
        return `${cleanedName}${ext}`;
    }

    /**
     * 设置IPFS上传URL配置
     * @param url IPFS上传URL
     * @returns 设置结果
     */
    public static async setIPFSUploadURL(url: string): Promise<boolean> {
        try {
            if (!url || typeof url !== 'string' || url.trim().length === 0) {
                throw new Error('IPFS上传URL不能为空');
            }

            const trimmedUrl = url.trim();
            
            // 验证URL格式
            try {
                new URL(trimmedUrl);
            } catch {
                throw new Error('IPFS上传URL格式无效');
            }

            // 确保MongoDB连接
            await ensureMongoConnected();

            // 更新或创建配置
            await IPFSSettingModel.findOneAndUpdate(
                { key: 'IPFS_UPLOAD_URL' },
                { 
                    key: 'IPFS_UPLOAD_URL',
                    value: trimmedUrl,
                    updatedAt: new Date()
                },
                { upsert: true, new: true }
            );

            logger.info('[IPFS] IPFS_UPLOAD_URL配置已更新:', trimmedUrl);
            return true;
        } catch (error) {
            logger.error('[IPFS] 设置IPFS_UPLOAD_URL失败:', error);
            throw error;
        }
    }

    /**
     * 获取当前IPFS上传URL配置
     * @returns 当前配置的URL
     * @throws 如果配置未设置
     */
    public static async getCurrentIPFSUploadURL(): Promise<string> {
        try {
            return await getIPFSUploadURL();
        } catch (error) {
            logger.error('[IPFS] 获取当前IPFS配置失败:', error instanceof Error ? error.message : String(error));
            throw new Error('IPFS_UPLOAD_URL配置未设置，请先使用setIPFSUploadURL方法设置配置');
        }
    }

    /**
     * 从Express请求中提取文件信息
     * @param req Express请求对象
     * @returns 文件信息
     */
    public static extractFileFromRequest(req: Request): {
        buffer: Buffer;
        filename: string;
        mimetype: string;
    } {
        // 这里需要根据实际的文件上传中间件来提取文件
        // 假设使用multer中间件
        const file = (req as any).file;
        
        if (!file) {
            throw new Error('未找到上传的文件');
        }

        return {
            buffer: file.buffer,
            filename: file.originalname,
            mimetype: file.mimetype
        };
    }
} 