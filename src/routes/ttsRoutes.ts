import express from 'express';
import { TtsController } from '../controllers/ttsController';

const router = express.Router();

router.post('/', TtsController.generateSpeech);
router.get('/history', TtsController.getRecentGenerations);

export default router; 