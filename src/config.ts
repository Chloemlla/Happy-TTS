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
    outemail: {
      enabled: boolean;
      domain: string;
      apiKey: string;
      code: string;
    };
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
    outemail: {
      enabled: (process.env.OUTEMAIL_ENABLED || process.env.VITE_OUTEMAIL_ENABLED || process.env.RESEND_OUTEMAIL_ENABLED) === 'true',
      domain: process.env.OUTEMAIL_DOMAIN || process.env.RESEND_DOMAIN_OUT || process.env.RESEND_DOMAIN || '',
      apiKey: process.env.OUTEMAIL_API_KEY || process.env.RESEND_API_OUT || process.env.RESEND_API_KEY || '',
      code: process.env.OUTEMAIL_CODE || '',
    },
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



export default config; 