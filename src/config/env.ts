import dotenv from 'dotenv';
import path from 'path';

// 加载环境变量
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// 设置默认值
export const env = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
  PORT: process.env.PORT || '3000',
  // Passkey 相关配置
  RP_ID: process.env.RP_ID || 'tts.hapx.one',
  RP_ORIGIN: process.env.RP_ORIGIN || 'https://tts.hapx.one'
}; 