import { imageDataService } from '../services/imageDataService';

describe('ImageDataService', () => {
  const testImageData = {
    imageId: 'test-image-id-123',
    fileName: 'test.jpg',
    fileSize: 1024,
    fileHash: 'test-file-hash-123',
    md5Hash: 'test-md5-hash-123',
    web2url: 'https://example.com/test.jpg',
    cid: 'test-cid-123',
    uploadTime: new Date().toISOString()
  };

  beforeAll(async () => {
    // 等待数据库连接
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  describe('recordImageData', () => {
    it('should record image data successfully', async () => {
      const result = await imageDataService.recordImageData(testImageData);
      expect(result).toBeDefined();
      expect(result.imageId).toBe(testImageData.imageId);
    });
  });

  describe('validateImageData', () => {
    it('should validate image data successfully with correct hashes', async () => {
      const result = await imageDataService.validateImageData(
        testImageData.imageId,
        testImageData.fileHash,
        testImageData.md5Hash
      );
      expect(result.isValid).toBe(true);
      expect(result.message).toBe('验证通过');
    });

    it('should fail validation with incorrect file hash', async () => {
      const result = await imageDataService.validateImageData(
        testImageData.imageId,
        'incorrect-file-hash',
        testImageData.md5Hash
      );
      expect(result.isValid).toBe(false);
      expect(result.message).toBe('文件Hash不匹配');
    });

    it('should fail validation with incorrect md5 hash', async () => {
      const result = await imageDataService.validateImageData(
        testImageData.imageId,
        testImageData.fileHash,
        'incorrect-md5-hash'
      );
      expect(result.isValid).toBe(false);
      expect(result.message).toBe('MD5 Hash不匹配');
    });

    it('should fail validation for non-existent image', async () => {
      const result = await imageDataService.validateImageData(
        'non-existent-id',
        testImageData.fileHash,
        testImageData.md5Hash
      );
      expect(result.isValid).toBe(false);
      expect(result.message).toBe('图片数据不存在');
    });
  });

  describe('validateBatchImageData', () => {
    it('should validate batch image data successfully', async () => {
      const batchData = [
        {
          imageId: testImageData.imageId,
          fileHash: testImageData.fileHash,
          md5Hash: testImageData.md5Hash
        }
      ];

      const results = await imageDataService.validateBatchImageData(batchData);
      expect(results).toHaveLength(1);
      expect(results[0].isValid).toBe(true);
    });
  });

  describe('getImageDataInfo', () => {
    it('should get image data info successfully', async () => {
      const result = await imageDataService.getImageDataInfo(testImageData.imageId);
      expect(result).toBeDefined();
      expect(result?.imageId).toBe(testImageData.imageId);
    });

    it('should return null for non-existent image', async () => {
      const result = await imageDataService.getImageDataInfo('non-existent-id');
      expect(result).toBeNull();
    });
  });

  describe('static methods', () => {
    it('should generate unique image IDs', () => {
      const id1 = (imageDataService as any).constructor.generateImageId();
      const id2 = (imageDataService as any).constructor.generateImageId();
      expect(id1).not.toBe(id2);
    });

    it('should generate file hash', () => {
      const testBuffer = Buffer.from('test content');
      const hash = (imageDataService as any).constructor.generateFileHash(testBuffer);
      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
    });

    it('should generate MD5 hash', () => {
      const testBuffer = Buffer.from('test content');
      const hash = (imageDataService as any).constructor.generateMD5Hash(testBuffer);
      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
    });
  });
}); 