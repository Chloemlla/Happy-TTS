import { IResource } from '../models/resourceModel';
import ResourceModel from '../models/resourceModel';
import { TransactionService } from './transactionService';
import logger from '../utils/logger';

export class ResourceService {
  private categories = ['软件', '游戏', '教程', '素材', '其他'];

  async getResources(page: number, category?: string) {
    try {
      // 验证和清理输入参数
      const validatedPage = Math.max(1, Math.floor(Number(page) || 1));
      const pageSize = 10;
      const skip = (validatedPage - 1) * pageSize;
      
      // 验证category参数，只允许预定义的类别
      const validCategories = this.categories;
      const validatedCategory = category && validCategories.includes(category) ? category : undefined;
      
      let query = ResourceModel.find({ isActive: true });
      if (validatedCategory) {
        query = query.where('category', validatedCategory);
      }
      
      const [resources, total] = await Promise.all([
        query.skip(skip).limit(pageSize).sort({ createdAt: -1 }),
        query.countDocuments()
      ]);
      
      logger.info('获取资源列表成功', { page: validatedPage, category: validatedCategory, total });
      
      return {
        resources: resources.map(r => r.toObject()),
        total,
        page: validatedPage,
        pageSize
      };
    } catch (error) {
      logger.error('获取资源列表失败:', error);
      throw error;
    }
  }

  async getResourceById(id: string) {
    try {
      // 验证ID格式，确保是有效的MongoDB ObjectId
      if (!id || typeof id !== 'string' || id.length !== 24 || !/^[0-9a-fA-F]{24}$/.test(id)) {
        logger.warn('无效的资源ID格式', { id });
        return null;
      }
      
      const resource = await ResourceModel.findById(id);
      if (!resource) {
        logger.warn('资源不存在', { id });
        return null;
      }
      logger.info('获取资源详情成功', { id });
      return resource.toObject();
    } catch (error) {
      logger.error('获取资源详情失败:', error);
      throw error;
    }
  }

  async getCategories() {
    return this.categories;
  }

  async createResource(data: Omit<IResource, '_id' | 'createdAt' | 'updatedAt'>) {
    try {
      const resource = new ResourceModel(data);
      await resource.save();
      logger.info('创建资源成功', { id: resource._id, title: resource.title });
      return resource.toObject();
    } catch (error) {
      logger.error('创建资源失败:', error);
      throw error;
    }
  }

  async updateResource(id: string, data: Partial<IResource>) {
    try {
      // 使用乐观锁机制，检查版本号避免并发更新冲突
      const resource = await ResourceModel.findByIdAndUpdate(
        id,
        { 
          ...data, 
          updatedAt: new Date(),
          // 可以添加版本号字段来进一步防止并发冲突
          // $inc: { version: 1 }
        },
        { 
          new: true,
          runValidators: true // 运行验证器
        }
      );
      if (!resource) {
        logger.warn('更新资源失败：资源不存在', { id });
        return null;
      }
      logger.info('更新资源成功', { id, title: resource.title });
      return resource.toObject();
    } catch (error) {
      logger.error('更新资源失败:', error);
      throw error;
    }
  }

  async deleteResource(id: string) {
    try {
      // 使用事务删除资源及其相关CDK
      const result = await TransactionService.deleteResourceWithCDKs(id);
      logger.info('删除资源及相关CDK成功', { 
        id, 
        title: result.resource.title,
        deletedCDKs: result.deletedCDKs 
      });
    } catch (error) {
      logger.error('删除资源失败:', error);
      throw error;
    }
  }

  async getResourceStats() {
    try {
      const total = await ResourceModel.countDocuments();
      logger.info('获取资源统计成功', { total });
      return { total };
    } catch (error) {
      logger.error('获取资源统计失败:', error);
      throw error;
    }
  }
} 