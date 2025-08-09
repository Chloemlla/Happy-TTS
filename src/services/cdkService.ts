import mongoose from 'mongoose';
import { ICDK } from '../models/cdkModel';
import CDKModel from '../models/cdkModel';
import ResourceModel from '../models/resourceModel';
import { ResourceService } from './resourceService';
import { TransactionService } from './transactionService';
import logger from '../utils/logger';

export class CDKService {
  private resourceService = new ResourceService();

  async redeemCDK(code: string, userInfo?: { userId: string; username: string }, forceRedeem?: boolean) {
    try {
      // 验证CDK代码格式
      if (!code || typeof code !== 'string' || code.length !== 16 || !/^[A-Z0-9]{16}$/.test(code)) {
        logger.warn('无效的CDK代码格式', { code });
        throw new Error('无效的CDK代码格式');
      }

      // 验证和清理用户信息以防止NoSQL注入
      if (userInfo) {
        if (!userInfo.userId || typeof userInfo.userId !== 'string' || userInfo.userId.length > 100) {
          logger.warn('无效的用户ID格式', { userId: userInfo.userId });
          throw new Error('无效的用户ID格式');
        }
        if (!userInfo.username || typeof userInfo.username !== 'string' || userInfo.username.length > 50) {
          logger.warn('无效的用户名格式', { username: userInfo.username });
          throw new Error('无效的用户名格式');
        }
        
        // 清理用户输入，移除潜在的NoSQL注入字符
        userInfo.userId = userInfo.userId.replace(/[{}$]/g, '');
        userInfo.username = userInfo.username.replace(/[{}$]/g, '');
      }
      
      // 首先查找CDK以获取资源ID
      const cdkToRedeem = await CDKModel.findOne({
        code,
        isUsed: false,
        $or: [
          { expiresAt: { $exists: false } },
          { expiresAt: { $gt: new Date() } }
        ]
      });
      
      if (!cdkToRedeem) {
        logger.warn('CDK兑换失败：无效或已使用', { code });
        throw new Error('无效或已使用的CDK');
      }

      // 如果提供了用户信息且未强制兑换，检查用户是否已拥有该资源
      if (userInfo && !forceRedeem) {
        // 使用参数化查询防止NoSQL注入
        const existingCDK = await CDKModel.findOne({
          resourceId: new mongoose.Types.ObjectId(cdkToRedeem.resourceId),
          isUsed: true,
          'usedBy.userId': { $eq: userInfo.userId } // 使用$eq操作符确保精确匹配
        });

        if (existingCDK) {
          // 用户已拥有该资源，返回特殊错误以触发前端确认对话框
          const resource = await this.resourceService.getResourceById(cdkToRedeem.resourceId);
          const error = new Error('DUPLICATE_RESOURCE') as any;
          error.resourceTitle = resource?.title || '未知资源';
          error.resourceId = cdkToRedeem.resourceId;
          throw error;
        }
      }
      
      const updateData: any = {
        isUsed: true,
        usedAt: new Date(),
        usedIp: '127.0.0.1' // 实际应用中需要获取真实IP
      };

      // 如果提供了用户信息，则记录用户信息
      if (userInfo) {
        updateData.usedBy = {
          userId: userInfo.userId,
          username: userInfo.username
        };
      }

      const cdk = await CDKModel.findOneAndUpdate(
        { 
          code, 
          isUsed: false,
          $or: [
            { expiresAt: { $exists: false } },
            { expiresAt: { $gt: new Date() } }
          ]
        },
        { $set: updateData },
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

      logger.info('CDK兑换成功', { code, resourceId: cdk.resourceId, resourceTitle: resource.title, forceRedeem });
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
      // 验证和清理输入参数
      const validatedPage = Math.max(1, Math.floor(Number(page) || 1));
      const pageSize = 10;
      const skip = (validatedPage - 1) * pageSize;
      
      // 验证resourceId格式
      const validatedResourceId = resourceId && 
        typeof resourceId === 'string' && 
        resourceId.trim() !== '' &&
        resourceId.length === 24 && 
        /^[0-9a-fA-F]{24}$/.test(resourceId) ? resourceId : undefined;
      
      const queryFilter: any = {};
      if (validatedResourceId) {
        queryFilter.resourceId = validatedResourceId;
      }
      
      const [cdks, total] = await Promise.all([
        CDKModel.find(queryFilter).skip(skip).limit(pageSize).sort({ createdAt: -1 }),
        CDKModel.countDocuments(queryFilter)
      ]);

      logger.info('获取CDK列表成功', { page: validatedPage, resourceId: validatedResourceId, total });
      return {
        cdks: cdks.map(c => {
          const obj = c.toObject();
          // 确保id字段存在，将_id转换为id
          obj.id = obj._id.toString();
          delete obj._id;
          delete obj.__v;
          return obj;
        }),
        total,
        page: validatedPage,
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

  // 批量删除CDK
  async batchDeleteCDKs(ids: string[]) {
    try {
      // 验证输入参数
      if (!Array.isArray(ids) || ids.length === 0) {
        throw new Error('请提供有效的CDK ID列表');
      }

      // 验证每个ID的格式
      const validIds = ids.filter(id => 
        typeof id === 'string' && 
        id.length === 24 && 
        /^[0-9a-fA-F]{24}$/.test(id)
      );

      if (validIds.length === 0) {
        throw new Error('没有有效的CDK ID');
      }

      // 查找所有要删除的CDK
      const cdks = await CDKModel.find({ _id: { $in: validIds } });
      
      if (cdks.length === 0) {
        throw new Error('没有找到要删除的CDK');
      }

      // 检查是否有已使用的CDK
      const usedCDKs = cdks.filter(cdk => cdk.isUsed);
      if (usedCDKs.length > 0) {
        const usedCodes = usedCDKs.map(cdk => cdk.code).join(', ');
        throw new Error(`以下CDK已被使用，无法删除：${usedCodes}`);
      }

      // 执行批量删除
      const deleteResult = await CDKModel.deleteMany({ 
        _id: { $in: validIds },
        isUsed: false // 双重保险，确保不删除已使用的CDK
      });

      logger.info('批量删除CDK成功', { 
        requestedCount: ids.length,
        validCount: validIds.length,
        deletedCount: deleteResult.deletedCount,
        deletedCodes: cdks.map(cdk => cdk.code)
      });

      return {
        requestedCount: ids.length,
        validCount: validIds.length,
        deletedCount: deleteResult.deletedCount,
        deletedCodes: cdks.map(cdk => cdk.code)
      };
    } catch (error) {
      logger.error('批量删除CDK失败:', error);
      throw error;
    }
  }

  // 获取用户已兑换的资源
  async getUserRedeemedResources(userIp: string) {
    try {
      // 查找该IP地址兑换过的CDK
      const redeemedCDKs = await CDKModel.find({ 
        isUsed: true, 
        usedIp: userIp 
      }).sort({ usedAt: -1 });

      if (redeemedCDKs.length === 0) {
        return { resources: [], total: 0 };
      }

      // 获取资源详情
      const resourceIds = [...new Set(redeemedCDKs.map(cdk => cdk.resourceId))];
      const resources = await ResourceModel.find({ _id: { $in: resourceIds } });

      // 合并CDK信息和资源信息
      const result = resources.map((resource: any) => {
        const relatedCDKs = redeemedCDKs.filter(cdk => cdk.resourceId === resource._id.toString());
        const latestRedemption = relatedCDKs[0]; // 已按时间排序
        
        return {
          id: resource._id.toString(),
          title: resource.title,
          description: resource.description,
          downloadUrl: resource.downloadUrl,
          price: resource.price,
          category: resource.category,
          imageUrl: resource.imageUrl,
          redeemedAt: latestRedemption.usedAt,
          cdkCode: latestRedemption.code,
          redemptionCount: relatedCDKs.length
        };
      });

      logger.info('获取用户已兑换资源成功', { userIp, total: result.length });
      return { resources: result, total: result.length };
    } catch (error) {
      logger.error('获取用户已兑换资源失败:', error);
      throw error;
    }
  }

  // 获取CDK总数量
  async getTotalCDKCount() {
    try {
      const count = await CDKModel.countDocuments({});
      logger.info('获取CDK总数量成功', { totalCount: count });
      return { totalCount: count };
    } catch (error) {
      logger.error('获取CDK总数量失败:', error);
      throw error;
    }
  }

  // 删除所有CDK
  async deleteAllCDKs() {
    try {
      const result = await CDKModel.deleteMany({});
      logger.info('删除所有CDK成功', { deletedCount: result.deletedCount });
      return { deletedCount: result.deletedCount };
    } catch (error) {
      logger.error('删除所有CDK失败:', error);
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