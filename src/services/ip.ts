import axios, { AxiosResponse } from 'axios';
import config from '../config';

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

    return {
      ip: data.query,
      country: data.country,
      region: data.regionName,
      city: data.city,
      isp: data.isp,
    };
  } catch (error) {
    console.error('IP info error:', error);
    throw new Error('获取 IP 信息失败');
  }
}

export function isIPAllowed(ip: string): boolean {
  const whitelist = (config as any).ip?.whitelist || [];
  if (!whitelist.length) return true;
  return whitelist.includes(ip);
} 