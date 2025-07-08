import { Router } from 'express';
import { generateSpeech } from '../controllers/miniapiController';

const router = Router();

router.post('/v1/audio/speech', generateSpeech);

export default router; 