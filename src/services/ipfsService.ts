import axios from 'axios';
import FormData from 'form-data';
import { Request } from 'express';
import logger from '../utils/logger';

export interface IPFSUploadResponse {
    status: string;
    cid: string;
    url: string;
    web2url: string;
    fileSize: string;
    gnfd_id: string | null;
    gnfd_txn: string | null;
}

export class IPFSService {
    private static readonly IPFS_UPLOAD_URL = 'https://ipfs-relay.crossbell.io/upload';
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
        mimetype: string
    ): Promise<IPFSUploadResponse> {
        const MAX_RETRIES = 2;
        let lastError: any = null;
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
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
                // 创建FormData
                const formData = new FormData();
                formData.append('file', fileBuffer, {
                    filename,
                    contentType: mimetype
                });
                // 发送请求到IPFS
                const response = await axios.post<IPFSUploadResponse>(
                    this.IPFS_UPLOAD_URL,
                    formData,
                    {
                        headers: {
                            ...formData.getHeaders(),
                        },
                        timeout: 30000, // 30秒超时
                    }
                );
                logger.info('IPFS上传成功', {
                    filename,
                    fileSize: fileBuffer.length,
                    cid: response.data.cid,
                    web2url: response.data.web2url
                });
                return response.data;
            } catch (error) {
                lastError = error;
                logger.error('IPFS上传失败', {
                    filename,
                    fileSize: fileBuffer.length,
                    error: error instanceof Error ? error.message : '未知错误',
                    attempt: attempt + 1
                });
                if (attempt < MAX_RETRIES) {
                    // 等待1秒后重试
                    await new Promise(res => setTimeout(res, 1000));
                }
            }
        }
        // 全部重试失败后抛出最后一次错误
        throw lastError;
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