import { config } from 'dotenv';

config();

export default {
  port: process.env.PORT || 3000,
  openai: {
    apiKey: process.env.OPENAI_KEY,
    baseUrl: process.env.OPENAI_BASE_URL,
  },
  server: {
    password: process.env.SERVER_PASSWORD || 'wmy',
  },
  userStorageMode: process.env.USER_STORAGE_MODE || 'file',
  paths: {
    ipData: 'ip_data.txt',
    lcData: 'lc_data.txt',
    logs: 'logs',
    finish: 'finish',
    data: 'data',
  },
  limits: {
    maxLines: 200,
    tts: {
      maxCalls: 5,
      period: 30000, // 30 seconds
    },
  },
}; 