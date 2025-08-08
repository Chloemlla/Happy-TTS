import { ICDK } from '../models/cdkModel';
import CDKModel from '../models/cdkModel';
import { ResourceService } from './resourceService';
import { TransactionService } from './transactionService';
import logger from '../utils/logger';

export class CDKService {
  private resourceService = new ResourceService();

  async redeemCDK(code: string) {
    try {
      // 使用findOneAndUpdate确保原子性操作，避免并发问题
      const cdk = await CDKModel.findOneAndUpdate(
        { 
          code, 
          isUsed: false,
          $or: [
            { expiresAt: { $exists: false } },
            { expiresAt: { $gt: new Date() } }
          ]
        },
        {
          $set: {
            isUsed: true,
            usedAt: new Date(),
            usedIp: '127.0.0.1' // 实际应用中需要获取真实IP
          }
        },
        { new: true }
      );
      
      if (!cdk) {
        logger.warn('CDK兑换失败：无效或已使用', { code });
        throw new Error('无效或已使用的CDK');
      }

      const resource = await this.resourceService.getResourceById(cdk.resourceId);
      if (!resource) {
        logger.warn('CDK兑换失败：资源不存在', { code, resourceId: cdk.resourceId });
        throw new Error('资源不存在');
      }

      logger.info('CDK兑换成功', { code, resourceId: cdk.resourceId, resourceTitle: resource.title });
      return {
        resource,
        cdk: cdk.toObject()
      };
    } catch (error) {
      logger.error('CDK兑换失败:', error);
      throw error;
    }
  }

  async getCDKs(page: number, resourceId?: string) {
    try {
      const pageSize = 10;
      const skip = (page - 1) * pageSize;
      
      let query = CDKModel.find();
      if (resourceId) {
        query = query.where('resourceId', resourceId);
      }
      
      const [cdks, total] = await Promise.all([
        query.skip(skip).limit(pageSize).sort({ createdAt: -1 }),
        query.countDocuments()
      ]);

      logger.info('获取CDK列表成功', { page, resourceId, total });
      return {
        cdks: cdks.map(c => c.toObject()),
        total,
        page,
        pageSize
      };
    } catch (error) {
      logger.error('获取CDK列表失败:', error);
      throw error;
    }
  }

  async getCDKStats() {
    try {
      const [total, used] = await Promise.all([
        CDKModel.countDocuments(),
        CDKModel.countDocuments({ isUsed: true })
      ]);

      logger.info('获取CDK统计成功', { total, used, available: total - used });
      return {
        total,
        used,
        available: total - used
      };
    } catch (error) {
      logger.error('获取CDK统计失败:', error);
      throw error;
    }
  }

  async generateCDKs(resourceId: string, count: number, expiresAt?: Date) {
    try {
      // 使用事务确保数据一致性
      return await TransactionService.generateCDKsWithTransaction(resourceId, count, expiresAt);
    } catch (error) {
      logger.error('生成CDK失败:', error);
      throw error;
    }
  }

  async deleteCDK(id: string) {
    try {
      const cdk = await CDKModel.findById(id);
      if (!cdk) {
        logger.warn('删除CDK失败：CDK不存在', { id });
        throw new Error('CDK不存在');
      }
      
      if (cdk.isUsed) {
        logger.warn('删除CDK失败：CDK已被使用', { id, code: cdk.code });
        throw new Error('CDK已被使用，无法删除');
      }
      
      await CDKModel.findByIdAndDelete(id);
      logger.info('删除CDK成功', { id, code: cdk.code });
    } catch (error) {
      logger.error('删除CDK失败:', error);
      throw error;
    }
  }

  private generateUniqueCode(): string {
    // 生成16位随机字符串
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 16; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }
} 