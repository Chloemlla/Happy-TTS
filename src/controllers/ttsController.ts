import { Request, Response } from 'express';
import { generateSpeech } from '../services/ttsService';
import logger from '../utils/logger';

export const ttsHandler = async (req: Request, res: Response) => {
  try {
    const { text, model, voice, outputFormat, speed } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    const fileName = await generateSpeech(text, model, voice, outputFormat, speed);
    
    res.json({
      success: true,
      audioUrl: `/static/audio/${fileName}`
    });
  } catch (error) {
    logger.error('TTS controller error:', error);
    res.status(500).json({ error: 'Failed to generate speech' });
  }
}; 