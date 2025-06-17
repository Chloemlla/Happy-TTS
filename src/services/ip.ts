import axios, { AxiosResponse } from 'axios';
import config from '../config';
import { logger } from './logger';

interface IPInfo {
  ip: string;
  country: string;
  region: string;
  city: string;
  isp: string;
}

export async function getIPInfo(ip: string): Promise<IPInfo> {
  try {
    const response = await axios.get(`http://ip-api.com/json/${ip}`);
    const data = response.data;

    if (!data || data.status === 'fail') {
      logger.error('IP API returned error', data);
      throw new Error('IP 查询失败');
    }

    return {
      ip: data.query,
      country: data.country || '未知',
      region: data.regionName || '未知',
      city: data.city || '未知',
      isp: data.isp || '未知',
    };
  } catch (error) {
    logger.error('IP info error:', error);
    throw new Error('获取 IP 信息失败');
  }
}

export function isIPAllowed(ip: string): boolean {
  const whitelist = (config as any).ip?.whitelist || [];
  if (!whitelist.length) return true;
  return whitelist.includes(ip);
} 