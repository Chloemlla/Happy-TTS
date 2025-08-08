import { Router } from 'express';
import { authenticateAdmin } from '../middleware/auth';
import { authenticateToken } from '../middleware/authenticateToken';
import { 
  getResources, 
  getResourceById, 
  createResource, 
  updateResource, 
  deleteResource,
  getCategories,
  getResourceStats,
  initializeTestResources
} from '../controllers/resourceController';

const router = Router();

// 公共API - 不需要认证
router.get('/resources', getResources);
router.get('/categories', getCategories);

// 管理员API - 需要认证（具体路由必须在参数路由之前）
router.get('/resources/stats', authenticateToken, authenticateAdmin, getResourceStats);
router.post('/resources', authenticateToken, authenticateAdmin, createResource);
router.post('/resources/init-test', authenticateToken, authenticateAdmin, initializeTestResources);

// 参数路由放在最后
router.get('/resources/:id', getResourceById);
router.put('/resources/:id', authenticateToken, authenticateAdmin, updateResource);
router.delete('/resources/:id', authenticateToken, authenticateAdmin, deleteResource);

export default router; 