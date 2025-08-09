import mongoose from 'mongoose';
import logger from '../utils/logger';

export class TransactionService {
  /**
   * 执行数据库事务
   * @param callback 事务回调函数
   * @returns 事务结果
   */
  static async executeTransaction<T>(callback: (session: mongoose.ClientSession | null) => Promise<T>): Promise<T> {
    // 检查是否支持事务
    const supportsTransactions = await this.checkTransactionSupport();

    if (!supportsTransactions) {
      // 如果不支持事务，直接执行操作而不使用session
      logger.info('数据库不支持事务，直接执行操作');
      return await callback(null);
    }

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

  // 检查数据库是否支持事务
  private static async checkTransactionSupport(): Promise<boolean> {
    try {
      if (!mongoose.connection.db) {
        logger.warn('数据库连接不可用，假设不支持事务');
        return false;
      }

      const admin = mongoose.connection.db.admin();
      const result = await admin.command({ ismaster: 1 });
      // 检查是否是副本集或分片集群
      return !!(result.setName || result.msg === 'isdbgrid');
    } catch (error) {
      logger.warn('检查事务支持失败，假设不支持事务:', error);
      return false;
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
    // 验证输入参数
    if (!resourceId || typeof resourceId !== 'string' || resourceId.trim() === '') {
      logger.error('资源ID验证失败：资源ID为空', { resourceId, type: typeof resourceId });
      throw new Error('资源ID不能为空');
    }

    // 验证资源ID格式（MongoDB ObjectId格式）
    if (resourceId.length !== 24 || !/^[0-9a-fA-F]{24}$/.test(resourceId)) {
      logger.error('资源ID格式验证失败', {
        resourceId,
        length: resourceId.length,
        isValidHex: /^[0-9a-fA-F]{24}$/.test(resourceId)
      });
      throw new Error('无效的资源ID格式，必须是24位十六进制字符串');
    }

    if (!count || typeof count !== 'number' || count <= 0 || count > 5000) {
      throw new Error('无效的生成数量，必须在1-5000之间');
    }

    return this.executeTransaction(async (session) => {
      // 验证资源存在
      const ResourceModel = mongoose.model('Resource');
      const resource = session
        ? await ResourceModel.findById(resourceId).session(session)
        : await ResourceModel.findById(resourceId);
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

      // 根据是否有session决定是否传递session参数
      const insertOptions = session ? { session } : {};
      await CDKModel.insertMany(cdks, insertOptions);
      logger.info('批量生成CDK成功', { resourceId, count });

      return cdks.map(cdk => cdk.toObject());
    });
  }

  /**
   * 删除资源及其相关CDK的事务操作
   */
  static async deleteResourceWithCDKs(resourceId: string) {
    // 验证输入参数
    if (!resourceId || typeof resourceId !== 'string' || resourceId.trim() === '') {
      throw new Error('资源ID不能为空');
    }

    // 验证资源ID格式（MongoDB ObjectId格式）
    if (resourceId.length !== 24 || !/^[0-9a-fA-F]{24}$/.test(resourceId)) {
      throw new Error('无效的资源ID格式，必须是24位十六进制字符串');
    }

    return this.executeTransaction(async (session) => {
      const ResourceModel = mongoose.model('Resource');
      const CDKModel = mongoose.model('CDK');

      // 删除资源
      const resource = session
        ? await ResourceModel.findByIdAndDelete(resourceId).session(session)
        : await ResourceModel.findByIdAndDelete(resourceId);
      if (!resource) {
        throw new Error('资源不存在');
      }

      // 删除相关的CDK
      const deleteResult = session
        ? await CDKModel.deleteMany({ resourceId }).session(session)
        : await CDKModel.deleteMany({ resourceId });

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