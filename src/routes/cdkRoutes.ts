import { Router } from 'express';
import { authenticateAdmin } from '../middleware/auth';
import { replayProtection } from '../middleware/replayProtection';
import { auditLog } from '../middleware/auditLog';
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

// 防重放保护实例
const replayGuard = replayProtection();

// 公共API — CDK 兑换加防重放
router.post('/redeem', replayGuard, redeemCDK);
router.get('/redeemed', getUserRedeemedResources);

// 管理员API
router.get('/', authenticateAdmin, getCDKs);
router.get('/stats', authenticateAdmin, getCDKStats);
router.get('/total-count', authenticateAdmin, getTotalCDKCount);
router.post('/generate', authenticateAdmin, auditLog({ module: 'cdk', action: 'cdk.generate', extractDetail: (req) => ({ resourceId: req.body.resourceId, count: req.body.count }) }), generateCDKs);
router.put('/:id', authenticateAdmin, auditLog({ module: 'cdk', action: 'cdk.update', extractTarget: (req) => ({ targetId: req.params.id }) }), updateCDK);
router.delete('/all', authenticateAdmin, auditLog({ module: 'cdk', action: 'cdk.deleteAll' }), deleteAllCDKs);
router.delete('/unused', authenticateAdmin, auditLog({ module: 'cdk', action: 'cdk.deleteUnused' }), deleteUnusedCDKs);
router.delete('/:id', authenticateAdmin, auditLog({ module: 'cdk', action: 'cdk.delete', extractTarget: (req) => ({ targetId: req.params.id }) }), deleteCDK);
router.post('/batch-delete', authenticateAdmin, auditLog({ module: 'cdk', action: 'cdk.batchDelete', extractDetail: (req) => ({ count: req.body.ids?.length }) }), batchDeleteCDKs);
router.post('/ks/import', authenticateAdmin, auditLog({ module: 'cdk', action: 'cdk.import' }), importCDKs);
router.get('/export', authenticateAdmin, exportCDKs);

export default router;
