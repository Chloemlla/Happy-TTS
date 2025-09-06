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
router.get('/', authenticateAdmin, getCDKs);
router.get('/stats', authenticateAdmin, getCDKStats);
router.get('/total-count', authenticateAdmin, getTotalCDKCount);
router.post('/generate', authenticateAdmin, generateCDKs);
router.put('/:id', authenticateAdmin, updateCDK);
router.delete('/all', authenticateAdmin, deleteAllCDKs);
router.delete('/unused', authenticateAdmin, deleteUnusedCDKs);
router.delete('/:id', authenticateAdmin, deleteCDK);
router.post('/batch-delete', authenticateAdmin, batchDeleteCDKs);
router.post('/ks/import', authenticateAdmin, importCDKs);
router.get('/export', authenticateAdmin, exportCDKs);

export default router; 