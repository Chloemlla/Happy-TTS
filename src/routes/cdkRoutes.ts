import { Router } from 'express';
import { authenticateAdmin } from '../middleware/auth';
import { 
  redeemCDK,
  generateCDKs,
  updateCDK,
  deleteCDK,
  batchDeleteCDKs,
  deleteAllCDKs,
  deleteUnusedCDKs,
  getTotalCDKCount,
  getCDKs,
  getCDKStats,
  getUserRedeemedResources,
  importCDKs,
  exportCDKs
} from '../controllers/cdkController';

const router = Router();

// 公共API
router.post('/redeem', redeemCDK);
router.get('/redeemed', getUserRedeemedResources);

// 管理员API
router.get('/cdks', authenticateAdmin, getCDKs);
router.get('/cdks/stats', authenticateAdmin, getCDKStats);
router.get('/cdks/total-count', authenticateAdmin, getTotalCDKCount);
router.post('/cdks/generate', authenticateAdmin, generateCDKs);
router.put('/cdks/:id', authenticateAdmin, updateCDK);
router.delete('/cdks/all', authenticateAdmin, deleteAllCDKs);
router.delete('/cdks/unused', authenticateAdmin, deleteUnusedCDKs);
router.delete('/cdks/:id', authenticateAdmin, deleteCDK);
router.post('/cdks/batch-delete', authenticateAdmin, batchDeleteCDKs);
router.post('/cdks/import', authenticateAdmin, importCDKs);
router.get('/cdks/export', authenticateAdmin, exportCDKs);

export default router; 