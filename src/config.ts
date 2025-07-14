import dotenv from 'dotenv';
import { join } from 'path';

dotenv.config();

interface Config {
  port: string | number;
  openai: {
    apiKey: string | undefined;
    baseUrl: string | undefined;
  };
  server: {
    password: string;
  };
  email: {
    code: string;
  };
  paths: {
    ipData: string;
    lcData: string;
    logs: string;
    finish: string;
    data: string;
  };
  limits: {
    maxRequestsPerMinute: number;
    maxRequestsPerHour: number;
    maxRequestsPerDay: number;
  };
  ip: {
    whitelist: string[];
  };
}

const config: Config = {
  port: process.env.PORT || 3000,
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    baseUrl: process.env.OPENAI_BASE_URL,
  },
  server: {
    password: process.env.SERVER_PASSWORD || 'admin',
  },
  email: {
    code: process.env.EMAIL_CODE || '',
  },
  paths: {
    ipData: join(__dirname, '../data/ip_data.json'),
    lcData: join(__dirname, '../data/lc_data.json'),
    logs: join(__dirname, '../data/logs'),
    finish: join(__dirname, '../data/finish'),
    data: join(__dirname, '../data'),
  },
  limits: {
    maxRequestsPerMinute: 60,
    maxRequestsPerHour: 1000,
    maxRequestsPerDay: 10000,
  },
  ip: {
    whitelist: (process.env.IP_WHITELIST || '').split(',').filter(Boolean),
  },
};

// 默认关闭人机验证，只有明确设置为 'true' 时才启用
export const enableTurnstile = process.env.VITE_ENABLE_TURNSTILE === 'true';

export default config; 