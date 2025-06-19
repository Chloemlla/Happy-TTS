import { Router } from 'express';
import { libreChatService } from '../services/libreChatService';

const router = Router();

// 获取最新的镜像信息
router.get('/lc', (req, res) => {
  const record = libreChatService.getLatestRecord();
  if (record) {
    return res.json({
      update_time: record.updateTime,
      image_name: record.imageUrl
    });
  }
  return res.status(404).json({ error: 'No data available.' });
});

// 兼容旧版 API
router.get('/librechat-image', (req, res) => {
  const record = libreChatService.getLatestRecord();
  if (record) {
    return res.json({
      update_time: record.updateTime,
      image_url: record.imageUrl
    });
  }
  return res.status(404).json({ error: 'No data available.' });
});

export default router; 