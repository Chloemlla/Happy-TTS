import { Router, Request, Response } from 'express';
import { logger } from '@/utils/logger';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// 模拟资源数据（实际项目中应该使用数据库）
let resources = [
  {
    id: '1',
    title: '示例资源1',
    description: '这是一个示例资源',
    downloadUrl: 'https://example.com/resource1.zip',
    price: 9.99,
    category: '软件',
    imageUrl: 'https://example.com/image1.jpg',
    isActive: true,
    tags: ['软件', '工具'],
    downloads: 0,
    rating: 0,
    createdAt: new Date(),
    updatedAt: new Date()
  }
];

// 获取资源列表
router.get('/', (req: Request, res: Response) => {
  try {
    const { page = 1, limit = 10, category, search, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
    
    let filteredResources = [...resources];

    // 分类筛选
    if (category) {
      filteredResources = filteredResources.filter(resource => resource.category === category);
    }

    // 搜索
    if (search) {
      const searchTerm = search.toString().toLowerCase();
      filteredResources = filteredResources.filter(resource =>
        resource.title.toLowerCase().includes(searchTerm) ||
        resource.description.toLowerCase().includes(searchTerm) ||
        resource.tags.some(tag => tag.toLowerCase().includes(searchTerm))
      );
    }

    // 排序
    filteredResources.sort((a, b) => {
      const aValue = a[sortBy as keyof typeof a];
      const bValue = b[sortBy as keyof typeof b];
      
      if (sortOrder === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    // 分页
    const pageNum = parseInt(page.toString());
    const limitNum = parseInt(limit.toString());
    const startIndex = (pageNum - 1) * limitNum;
    const endIndex = startIndex + limitNum;
    const paginatedResources = filteredResources.slice(startIndex, endIndex);

    res.json({
      success: true,
      data: paginatedResources,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: filteredResources.length,
        totalPages: Math.ceil(filteredResources.length / limitNum)
      }
    });
  } catch (error) {
    logger.error('Get resources error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: '获取资源列表时发生错误'
    });
  }
});

// 获取资源详情
router.get('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const resource = resources.find(r => r.id === id);

    if (!resource) {
      return res.status(404).json({
        success: false,
        error: 'Resource not found',
        message: '资源不存在'
      });
    }

    res.json({
      success: true,
      data: resource
    });
  } catch (error) {
    logger.error('Get resource error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: '获取资源详情时发生错误'
    });
  }
});

// 创建资源
router.post('/', (req: Request, res: Response) => {
  try {
    const { title, description, downloadUrl, price, category, imageUrl, tags } = req.body;

    // 验证必填字段
    if (!title || !description || !downloadUrl || !price || !category) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: '缺少必填字段'
      });
    }

    const newResource = {
      id: uuidv4(),
      title,
      description,
      downloadUrl,
      price: parseFloat(price),
      category,
      imageUrl: imageUrl || '',
      isActive: true,
      tags: tags || [],
      downloads: 0,
      rating: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    resources.push(newResource);

    logger.info(`Resource created: ${newResource.title}`);

    res.status(201).json({
      success: true,
      message: '资源创建成功',
      data: newResource
    });
  } catch (error) {
    logger.error('Create resource error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: '创建资源时发生错误'
    });
  }
});

// 更新资源
router.put('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const resourceIndex = resources.findIndex(r => r.id === id);
    if (resourceIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Resource not found',
        message: '资源不存在'
      });
    }

    const updatedResource = {
      ...resources[resourceIndex],
      ...updateData,
      id, // 确保ID不被修改
      updatedAt: new Date()
    };

    resources[resourceIndex] = updatedResource;

    logger.info(`Resource updated: ${updatedResource.title}`);

    res.json({
      success: true,
      message: '资源更新成功',
      data: updatedResource
    });
  } catch (error) {
    logger.error('Update resource error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: '更新资源时发生错误'
    });
  }
});

// 删除资源
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const resourceIndex = resources.findIndex(r => r.id === id);

    if (resourceIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Resource not found',
        message: '资源不存在'
      });
    }

    const deletedResource = resources[resourceIndex];
    resources.splice(resourceIndex, 1);

    logger.info(`Resource deleted: ${deletedResource.title}`);

    res.json({
      success: true,
      message: '资源删除成功',
      data: deletedResource
    });
  } catch (error) {
    logger.error('Delete resource error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: '删除资源时发生错误'
    });
  }
});

// 获取资源分类
router.get('/categories/list', (req: Request, res: Response) => {
  try {
    const categories = [...new Set(resources.map(r => r.category))];
    
    res.json({
      success: true,
      data: categories
    });
  } catch (error) {
    logger.error('Get categories error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: '获取分类列表时发生错误'
    });
  }
});

export default router; 