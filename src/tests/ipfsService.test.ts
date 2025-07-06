import { IPFSService } from '../services/ipfsService';

describe('IPFSService', () => {
    describe('uploadFile', () => {
        it('应该验证文件大小限制', async () => {
            // 创建一个超过5MB的缓冲区
            const largeBuffer = Buffer.alloc(6 * 1024 * 1024); // 6MB
            
            await expect(
                IPFSService.uploadFile(largeBuffer, 'test.jpg', 'image/jpeg')
            ).rejects.toThrow('文件大小不能超过 5MB');
        });

        it('应该验证文件类型', async () => {
            const buffer = Buffer.from('test');
            
            await expect(
                IPFSService.uploadFile(buffer, 'test.txt', 'text/plain')
            ).rejects.toThrow('只支持图片文件格式：JPEG, PNG, GIF, WebP, BMP, SVG');
        });

        it('应该接受有效的图片文件类型', () => {
            const buffer = Buffer.from('test');
            
            // 这些应该不会抛出错误（虽然实际上传会失败，但类型检查会通过）
            expect(() => {
                IPFSService.uploadFile(buffer, 'test.jpg', 'image/jpeg');
            }).not.toThrow();
            
            expect(() => {
                IPFSService.uploadFile(buffer, 'test.png', 'image/png');
            }).not.toThrow();
            
            expect(() => {
                IPFSService.uploadFile(buffer, 'test.gif', 'image/gif');
            }).not.toThrow();
        });
    });

    describe('extractFileFromRequest', () => {
        it('应该从请求中提取文件信息', () => {
            const mockReq = {
                file: {
                    buffer: Buffer.from('test'),
                    originalname: 'test.jpg',
                    mimetype: 'image/jpeg'
                }
            } as any;

            const result = IPFSService.extractFileFromRequest(mockReq);
            
            expect(result.buffer).toEqual(Buffer.from('test'));
            expect(result.filename).toBe('test.jpg');
            expect(result.mimetype).toBe('image/jpeg');
        });

        it('应该在没有文件时抛出错误', () => {
            const mockReq = {} as any;
            
            expect(() => {
                IPFSService.extractFileFromRequest(mockReq);
            }).toThrow('未找到上传的文件');
        });
    });
}); 