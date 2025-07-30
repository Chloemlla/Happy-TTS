import { Request, Response } from 'express';
import { imageDataService } from '../services/imageDataService';

export const imageDataController = {
  // 验证图片数据
  async validateImageData(req: Request, res: Response) {
    try {
      const { imageId, fileHash, md5Hash } = req.body;
      
      if (!imageId || !fileHash || !md5Hash) {
        return res.status(400).json({
          success: false,
          error: '缺少必要参数：imageId, fileHash, md5Hash'
        });
      }

      const result = await imageDataService.validateImageData(imageId, fileHash, md5Hash);
      
      res.json({
        success: true,
        data: result
      });
    } catch (error: any) {
      console.error('验证图片数据失败:', error);
      res.status(500).json({
        success: false,
        error: error.message || '验证失败'
      });
    }
  },

  // 批量验证图片数据
  async validateBatchImageData(req: Request, res: Response) {
    try {
      const { imageDataList } = req.body;
      
      if (!Array.isArray(imageDataList)) {
        return res.status(400).json({
          success: false,
          error: 'imageDataList必须是数组'
        });
      }

      const results = await imageDataService.validateBatchImageData(imageDataList);
      
      res.json({
        success: true,
        data: results
      });
    } catch (error: any) {
      console.error('批量验证图片数据失败:', error);
      res.status(500).json({
        success: false,
        error: error.message || '批量验证失败'
      });
    }
  },

  // 获取图片数据信息
  async getImageDataInfo(req: Request, res: Response) {
    try {
      const { imageId } = req.params;
      
      if (!imageId) {
        return res.status(400).json({
          success: false,
          error: '缺少imageId参数'
        });
      }

      const imageData = await imageDataService.getImageDataInfo(imageId);
      
      if (!imageData) {
        return res.status(404).json({
          success: false,
          error: '图片数据不存在'
        });
      }

      res.json({
        success: true,
        data: imageData
      });
    } catch (error: any) {
      console.error('获取图片数据信息失败:', error);
      res.status(500).json({
        success: false,
        error: error.message || '获取失败'
      });
    }
  },

  // 记录图片数据到数据库
  async recordImageData(req: Request, res: Response) {
    try {
      const { imageId, fileName, fileSize, fileHash, md5Hash, web2url, cid, uploadTime } = req.body;
      
      if (!imageId || !fileName || !fileHash || !md5Hash) {
        return res.status(400).json({
          success: false,
          error: '缺少必要参数'
        });
      }

      const result = await imageDataService.recordImageData({
        imageId,
        fileName,
        fileSize,
        fileHash,
        md5Hash,
        web2url,
        cid,
        uploadTime
      });
      
      res.json({
        success: true,
        data: result
      });
    } catch (error: any) {
      console.error('记录图片数据失败:', error);
      res.status(500).json({
        success: false,
        error: error.message || '记录失败'
      });
    }
  }
}; 