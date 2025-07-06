import { Router } from 'express';
import { MediaController } from '../controllers/mediaController';

const router = Router();

/**
 * @route GET /api/media/music163
 * @desc 网抑云音乐解析
 * @access Public
 * @param {string} id - 歌曲ID
 */
router.get('/music163', MediaController.music163);

/**
 * @route GET /api/media/pipixia
 * @desc 皮皮虾视频解析
 * @access Public
 * @param {string} url - 视频链接
 */
router.get('/pipixia', MediaController.pipixia);

export default router; 