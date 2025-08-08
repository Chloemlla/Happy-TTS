import { Router } from 'express';
import { authenticateAdmin } from '../middleware/auth';
import { 
  getResources, 
  getResourceById, 
  createResource, 
  updateResource, 
  deleteResource,
  getCategories,
  getResourceStats
} from '../controllers/resourceController';

const router = Router();

// 公共API
router.get('/resources', getResources);
router.get('/resources/:id', getResourceById);
router.get('/categories', getCategories);

// 管理员API
router.get('/resources/stats', authenticateAdmin, getResourceStats);
router.post('/resources', authenticateAdmin, createResource);
router.put('/resources/:id', authenticateAdmin, updateResource);
router.delete('/resources/:id', authenticateAdmin, deleteResource);

export default router; 