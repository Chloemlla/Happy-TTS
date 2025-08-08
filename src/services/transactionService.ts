import mongoose from 'mongoose';
import logger from '../utils/logger';

export class TransactionService {
  /**
   * 执行数据库事务
   * @param callback 事务回调函数
   * @returns 事务结果
   */
  static async executeTransaction<T>(callback: (session: mongoose.ClientSession) => Promise<T>): Promise<T> {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      const result = await callback(session);
      await session.commitTransaction();
      logger.info('事务执行成功');
      return result;
    } catch (error) {
      await session.abortTransaction();
      logger.error('事务执行失败，已回滚:', error);
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * 批量生成CDK的事务操作
   */
  static async generateCDKsWithTransaction(
    resourceId: string, 
    count: number, 
    expiresAt?: Date
  ) {
    return this.executeTransaction(async (session) => {
      // 验证资源存在
      const ResourceModel = mongoose.model('Resource');
      const resource = await ResourceModel.findById(resourceId).session(session);
      if (!resource) {
        throw new Error('资源不存在');
      }

      // 生成CDK
      const CDKModel = mongoose.model('CDK');
      const cdks = [];
      
      for (let i = 0; i < count; i++) {
        const code = this.generateUniqueCode();
        const cdk = new CDKModel({
          code,
          resourceId,
          isUsed: false,
          expiresAt
        });
        cdks.push(cdk);
      }

      await CDKModel.insertMany(cdks, { session });
      logger.info('批量生成CDK成功', { resourceId, count });
      
      return cdks.map(cdk => cdk.toObject());
    });
  }

  /**
   * 删除资源及其相关CDK的事务操作
   */
  static async deleteResourceWithCDKs(resourceId: string) {
    return this.executeTransaction(async (session) => {
      const ResourceModel = mongoose.model('Resource');
      const CDKModel = mongoose.model('CDK');

      // 删除资源
      const resource = await ResourceModel.findByIdAndDelete(resourceId).session(session);
      if (!resource) {
        throw new Error('资源不存在');
      }

      // 删除相关的CDK
      const deleteResult = await CDKModel.deleteMany({ resourceId }).session(session);
      
      logger.info('删除资源及相关CDK成功', { 
        resourceId, 
        resourceTitle: resource.title,
        deletedCDKs: deleteResult.deletedCount 
      });
      
      return { resource: resource.toObject(), deletedCDKs: deleteResult.deletedCount };
    });
  }

  private static generateUniqueCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 16; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }
} 