import express from 'express';
import { ttsHandler } from '../controllers/ttsController';

const router = express.Router();

router.post('/', ttsHandler);

export default router; 