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
    private static readonly IPFS_UPLOAD_URL = 'https://ipfs-relay.crossbell.io/upload';
    private static readonly IPFS_BACKUP_URL = 'https://ipfs.infura.io:5001/api/v0/add'; // 备用IPFS网关
    private static readonly MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

    /**
     * 上传文件到IPFS
     * @param fileBuffer 文件缓冲区
     * @param filename 文件名
     * @param mimetype 文件类型
     * @returns IPFS上传响应
     */
    public static async uploadFile(
        fileBuffer: Buffer,
        filename: string,
        mimetype: string,
        options?: { shortLink?: boolean; userId?: string; username?: string }
    ): Promise<IPFSUploadResponse> {
        const MAX_RETRIES = 2;
        let lastError: any = null;
        
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

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
                logger.info(`[IPFS] 尝试上传文件 (第${attempt + 1}次): ${filename}`);
                
                // 创建FormData
                const formData = new (require('form-data'))();
                formData.append('file', fileBuffer, {
                    filename,
                    contentType: mimetype
                });
                
                // 发送请求到IPFS
                const response = await (require('axios')).post(
                    this.IPFS_UPLOAD_URL,
                    formData,
                    {
                        headers: {
                            ...formData.getHeaders(),
                        },
                        timeout: 30000, // 30秒超时
                    }
                );
                
                logger.info(`[IPFS] 上传成功: ${filename}, CID: ${response.data.cid}`);
                
                // 上传成功后生成短链（仅当 options.shortLink 为 true 时）
                let shortUrl = '';
                if (options && options.shortLink && response.data.web2url) {
                  try {
                    // 使用迁移服务自动修正目标URL
                    const fixedTarget = shortUrlMigrationService.fixTargetUrlBeforeSave(response.data.web2url);
                    
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
                      target: response.data.web2url, 
                      error: err instanceof Error ? err.message : String(err) 
                    });
                    // 不抛出错误，继续返回IPFS上传结果
                  }
                }
                return { ...response.data, shortUrl };
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
                
                // 如果是503错误，说明服务不可用，可以尝试备用方案
                if (statusCode === 503) {
                    logger.warn(`[IPFS] 主服务不可用 (503)，尝试备用方案`);
                    try {
                        return await this.uploadToBackup(fileBuffer, filename, mimetype, options);
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
     * 备用IPFS上传方案
     */
    private static async uploadToBackup(
        fileBuffer: Buffer,
        filename: string,
        mimetype: string,
        options?: { shortLink?: boolean; userId?: string; username?: string }
    ): Promise<IPFSUploadResponse> {
        logger.info(`[IPFS] 使用备用方案上传: ${filename}`);
        
        try {
            const formData = new (require('form-data'))();
            formData.append('file', fileBuffer, {
                filename,
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
            
            logger.info(`[IPFS] 备用方案上传成功: ${filename}, CID: ${cid}`);
            
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