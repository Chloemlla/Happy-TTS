/**
 * TTS 路由 - /api/tts
 * 核心 TTS 生成功能
 */
import { Hono } from 'hono';
import type { Env } from '../types';
import { authenticateToken } from '../middleware/auth';
import { MongoClient } from '../lib/mongo';
import logger from '../lib/logger';

const tts = new Hono<{ Bindings: Env }>();

// TTS 生成
tts.post('/generate', authenticateToken, async (c) => {
  try {
    const payload = c.get('user');
    const { text, voice, model, speed, format } = await c.req.json();

    if (!text || text.trim().length === 0) {
      return c.json({ error: '文本不能为空' }, 400);
    }
    if (text.length > 4096) {
      return c.json({ error: '文本长度不能超过4096字符' }, 400);
    }

    const ttsModel = model || c.env.OPENAI_MODEL || 'tts-1';
    const ttsVoice = voice || c.env.OPENAI_VOICE || 'alloy';
    const ttsSpeed = speed || c.env.OPENAI_SPEED || '1.0';
    const ttsFormat = format || c.env.OPENAI_RESPONSE_FORMAT || 'mp3';

    // 调用 OpenAI TTS API
    const response = await fetch(`${c.env.OPENAI_BASE_URL || 'https://api.openai.com'}/v1/audio/speech`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${c.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: ttsModel,
        input: text,
        voice: ttsVoice,
        speed: parseFloat(ttsSpeed),
        response_format: ttsFormat,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      logger.error('OpenAI TTS API 错误', { status: response.status, body: errText });
      return c.json({ error: 'TTS 生成失败', detail: errText }, 502);
    }

    // 获取音频数据
    const audioBuffer = await response.arrayBuffer();
    const fileName = `${crypto.randomUUID()}.${ttsFormat}`;

    // 存储到 R2
    await c.env.AUDIO_BUCKET.put(fileName, audioBuffer, {
      httpMetadata: {
        contentType: ttsFormat === 'mp3' ? 'audio/mpeg' : `audio/${ttsFormat}`,
      },
    });

    // 记录到 MongoDB
    const mongo = new MongoClient(c.env);
    const records = mongo.collection('generation_records');
    c.executionCtx.waitUntil(
      records.insertOne({
        userId: payload.userId,
        text: text.substring(0, 200),
        fileName,
        voice: ttsVoice,
        model: ttsModel,
        format: ttsFormat,
        ip: c.req.header('CF-Connecting-IP') || 'unknown',
        createdAt: new Date().toISOString(),
      })
    );

    const audioUrl = `${c.env.BASE_URL || ''}/static/audio/${fileName}`;

    return c.json({
      success: true,
      fileName,
      url: audioUrl,
      format: ttsFormat,
    });
  } catch (error) {
    logger.error('TTS 生成异常', { error: String(error) });
    return c.json({ error: 'TTS 生成失败' }, 500);
  }
});

// 获取音频文件 (从 R2)
tts.get('/audio/:fileName', async (c) => {
  const fileName = c.req.param('fileName');
  const object = await c.env.AUDIO_BUCKET.get(fileName);

  if (!object) {
    return c.json({ error: '文件不存在' }, 404);
  }

  const headers = new Headers();
  headers.set('Content-Type', object.httpMetadata?.contentType || 'audio/mpeg');
  headers.set('Cache-Control', 'public, max-age=86400');
  headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
  headers.set('Access-Control-Allow-Origin', '*');

  return new Response(object.body, { headers });
});

// 历史记录
tts.get('/history', authenticateToken, async (c) => {
  try {
    const payload = c.get('user');
    const mongo = new MongoClient(c.env);
    const records = mongo.collection('generation_records');

    const page = parseInt(c.req.query('page') || '1');
    const limit = Math.min(parseInt(c.req.query('limit') || '20'), 100);

    const history = await records.find(
      { userId: payload.userId },
      { sort: { createdAt: -1 }, limit, skip: (page - 1) * limit }
    );

    return c.json({ records: history, page, limit });
  } catch (error) {
    return c.json({ error: '获取历史记录失败' }, 500);
  }
});

export default tts;
