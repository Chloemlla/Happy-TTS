import dotenv from 'dotenv';
import path from 'path';

// 加载环境变量
dotenv.config();

export const config = {
  port: process.env.PORT || 3000,
  openaiApiKey: process.env.OPENAI_API_KEY,
  openaiModel: process.env.OPENAI_MODEL || 'tts-1',
  openaiVoice: process.env.OPENAI_VOICE || 'alloy',
  openaiResponseFormat: process.env.OPENAI_RESPONSE_FORMAT || 'mp3',
  openaiSpeed: process.env.OPENAI_SPEED || '1.0',
  audioDir: process.env.AUDIO_DIR || path.join(__dirname, '../../finish'),
  adminUsername: process.env.ADMIN_USERNAME || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || 'happyclo&',
  // 添加本地 IP 配置
  localIps: (process.env.LOCAL_IPS || '127.0.0.1,::1,::ffff:127.0.0.1').split(','),
  // 添加基础URL配置
  baseUrl: process.env.BASE_URL || 'https://tts-api.hapxs.com'
}; 