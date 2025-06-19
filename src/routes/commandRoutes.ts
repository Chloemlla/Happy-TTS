import { Router } from 'express';
import { commandService } from '../services/commandService';

const router = Router();

// 添加命令
router.get('/y', (req, res) => {
  const { command, password } = req.query;
  const result = commandService.addCommand(command as string, password as string);
  
  if (result.status === 'error') {
    return res.status(403).json(result);
  }
  
  return res.json(result);
});

// 获取下一个命令
router.get('/q', (req, res) => {
  const result = commandService.getNextCommand();
  return res.json(result);
});

// 移除命令
router.post('/p', (req, res) => {
  const { command } = req.body;
  const result = commandService.removeCommand(command);
  return res.json(result);
});

export default router; 