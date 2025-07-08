import { Request, Response } from 'express';

export async function generateSpeech(req: Request, res: Response) {
  const { input, voice, speed, instructions } = req.body;
  if (!input || !voice) {
    return res.status(400).json({ error: '缺少必要参数 input 或 voice' });
  }
  // 这里后续实现 TTS 逻辑
  res.status(501).json({ error: 'miniapi 语音合成暂未实现' });
} 