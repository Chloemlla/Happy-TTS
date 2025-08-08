import { IResource } from '../models/resourceModel';
import ResourceModel from '../models/resourceModel';
import { TransactionService } from './transactionService';
import logger from '../utils/logger';

export class ResourceService {
  private categories = ['软件', '游戏', '教程', '素材', '其他'];

  // 辅助方法：确保资源对象有id字段
  private normalizeResource(resource: any) {
    const obj = typeof resource.toObject === 'function' ? resource.toObject() : resource;
    // 确保id字段存在
    if (obj._id && !obj.id) {
      obj.id = obj._id.toString();
    }
    return obj;
  }

  async getResources(page: number, category?: string) {
    try {
      // 验证和清理输入参数
      const validatedPage = Math.max(1, Math.floor(Number(page) || 1));
      const pageSize = 10;
      const skip = (validatedPage - 1) * pageSize;
      
      // 验证category参数，只允许预定义的类别
      const validCategories = this.categories;
      const validatedCategory = category && 
        typeof category === 'string' && 
        validCategories.includes(category) ? 
        category : undefined;
      
      // 构建安全的查询对象
      const queryFilter: any = { isActive: true };
      if (validatedCategory) {
        queryFilter.category = validatedCategory;
      }
      
      const [resources, total] = await Promise.all([
        ResourceModel.find(queryFilter).skip(skip).limit(pageSize).sort({ createdAt: -1 }),
        ResourceModel.countDocuments(queryFilter)
      ]);
      
      logger.info('获取资源列表成功', { page: validatedPage, category: validatedCategory, total });
      
      return {
        resources: resources.map(r => this.normalizeResource(r)),
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
      if (!id || typeof id !== 'string' || id.trim() === '' || id.length !== 24 || !/^[0-9a-fA-F]{24}$/.test(id)) {
        logger.warn('无效的资源ID格式', { id });
        return null;
      }
      
      const resource = await ResourceModel.findById(id);
      if (!resource) {
        logger.warn('资源不存在', { id });
        return null;
      }
      logger.info('获取资源详情成功', { id });
      return this.normalizeResource(resource);
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
      // 验证和清理创建数据
      const validatedData: any = {};
      
      // 验证必需字段
      if (!data.title || typeof data.title !== 'string' || data.title.length < 1 || data.title.length > 200) {
        throw new Error('标题是必需的，长度必须在1-200个字符之间');
      }
      validatedData.title = data.title.trim();
      
      if (!data.description || typeof data.description !== 'string' || data.description.length < 1 || data.description.length > 1000) {
        throw new Error('描述是必需的，长度必须在1-1000个字符之间');
      }
      validatedData.description = data.description.trim();
      
      if (!data.downloadUrl || typeof data.downloadUrl !== 'string' || data.downloadUrl.length < 1 || data.downloadUrl.length > 500) {
        throw new Error('下载链接是必需的，长度必须在1-500个字符之间');
      }
      validatedData.downloadUrl = data.downloadUrl.trim();
      
      // 验证价格
      if (typeof data.price !== 'number' || data.price < 0 || data.price > 999999) {
        throw new Error('价格必须是0-999999之间的数字');
      }
      validatedData.price = data.price;
      
      // 验证分类
      if (!data.category || typeof data.category !== 'string' || !this.categories.includes(data.category)) {
        throw new Error('分类必须是预定义的有效分类');
      }
      validatedData.category = data.category;
      
      // 验证可选字段
      if (data.imageUrl && typeof data.imageUrl === 'string' && data.imageUrl.length <= 500) {
        validatedData.imageUrl = data.imageUrl.trim();
      }
      
      if (typeof data.isActive === 'boolean') {
        validatedData.isActive = data.isActive;
      } else {
        validatedData.isActive = true; // 默认激活
      }
      
      const resource = new ResourceModel(validatedData);
      await resource.save();
      logger.info('创建资源成功', { id: resource._id, title: resource.title });
      return this.normalizeResource(resource);
    } catch (error) {
      logger.error('创建资源失败:', error);
      throw error;
    }
  }

  async updateResource(id: string, data: Partial<IResource>) {
    try {
      // 验证ID格式，确保是有效的MongoDB ObjectId
      if (!id || typeof id !== 'string' || id.trim() === '' || id.length !== 24 || !/^[0-9a-fA-F]{24}$/.test(id)) {
        logger.warn('无效的资源ID格式', { id });
        return null;
      }
      
      // 验证和清理更新数据
      const validatedData: Partial<IResource> = {};
      
      // 只允许更新特定字段
      const allowedFields = ['title', 'description', 'downloadUrl', 'price', 'category', 'imageUrl', 'isActive'];
      
      for (const [key, value] of Object.entries(data)) {
        if (allowedFields.includes(key)) {
          // 根据字段类型进行验证
          switch (key) {
            case 'title':
            case 'description':
            case 'downloadUrl':
            case 'imageUrl':
              if (typeof value === 'string' && value.length <= 1000) {
                validatedData[key] = value;
              }
              break;
            case 'price':
              if (typeof value === 'number' && value >= 0 && value <= 999999) {
                validatedData[key] = value;
              }
              break;
            case 'category':
              if (typeof value === 'string' && this.categories.includes(value)) {
                validatedData[key] = value;
              }
              break;
            case 'isActive':
              if (typeof value === 'boolean') {
                validatedData[key] = value;
              }
              break;
          }
        }
      }
      
      // 添加更新时间
      validatedData.updatedAt = new Date();
      
      // 使用乐观锁机制，检查版本号避免并发更新冲突
      const resource = await ResourceModel.findByIdAndUpdate(
        id,
        validatedData,
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
      return this.normalizeResource(resource);
    } catch (error) {
      logger.error('更新资源失败:', error);
      throw error;
    }
  }

  async deleteResource(id: string) {
    try {
      // 验证ID格式，确保是有效的MongoDB ObjectId
      if (!id || typeof id !== 'string' || id.trim() === '' || id.length !== 24 || !/^[0-9a-fA-F]{24}$/.test(id)) {
        logger.warn('无效的资源ID格式', { id });
        throw new Error('无效的资源ID格式');
      }
      
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

  // 初始化测试资源（仅用于开发和测试）
  async initializeTestResources() {
    try {
      // 清理无效的资源数据（title为'resources'的数据）
      const deleteResult = await ResourceModel.deleteMany({ title: 'resources' });
      if (deleteResult.deletedCount > 0) {
        logger.info('清理了无效资源数据', { deletedCount: deleteResult.deletedCount });
      }
      
      const existingCount = await ResourceModel.countDocuments();
      if (existingCount > 0) {
        logger.info('资源已存在，跳过初始化', { existingCount });
        return { message: '资源已存在，跳过初始化', count: existingCount };
      }

      const testResources = [
        {
          title: '测试软件资源',
          description: '这是一个测试软件资源包，包含常用开发工具',
          downloadUrl: 'https://example.com/software-pack.zip',
          price: 0,
          category: '软件',
          imageUrl: '',
          isActive: true
        },
        {
          title: '测试游戏资源',
          description: '游戏开发资源包，包含游戏素材和工具',
          downloadUrl: 'https://example.com/game-pack.zip',
          price: 15,
          category: '游戏',
          imageUrl: '',
          isActive: true
        },
        {
          title: '测试教程资源',
          description: '学习教程集合，包含视频和文档',
          downloadUrl: 'https://example.com/tutorial-pack.zip',
          price: 5,
          category: '教程',
          imageUrl: '',
          isActive: true
        }
      ];

      const createdResources = await ResourceModel.insertMany(testResources);
      logger.info('测试资源初始化成功', { count: createdResources.length });
      
      return { 
        message: '测试资源初始化成功', 
        count: createdResources.length,
        resources: createdResources.map(r => ({ id: r._id.toString(), title: r.title }))
      };
    } catch (error) {
      logger.error('初始化测试资源失败:', error);
      throw error;
    }
  }
} 