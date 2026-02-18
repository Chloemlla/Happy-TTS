/**
 * 网络工具路由 - /api/network
 * IP 查询等
 */
import { Hono } from 'hono';
import type { Env } from '../types';

const network = new Hono<{ Bindings: Env }>();

// 获取客户端 IP 信息 (利用 CF 头)
network.get('/ip', async (c) => {
  const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Real-IP') || 'unknown';
  const country = c.req.header('CF-IPCountry') || 'unknown';
  const city = (c.req.raw as any).cf?.city || 'unknown';
  const region = (c.req.raw as any).cf?.region || 'unknown';
  const asn = (c.req.raw as any).cf?.asn || 'unknown';
  const asOrganization = (c.req.raw as any).cf?.asOrganization || 'unknown';

  return c.json({
    ip,
    country,
    city,
    region,
    asn,
    isp: asOrganization,
    source: 'cloudflare',
  });
});

// DNS 查询
network.get('/dns', async (c) => {
  const domain = c.req.query('domain');
  if (!domain) {
    return c.json({ error: '缺少 domain 参数' }, 400);
  }

  try {
    const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=A`, {
      headers: { Accept: 'application/dns-json' },
    });
    const data = await res.json();
    return c.json(data);
  } catch (error) {
    return c.json({ error: 'DNS 查询失败' }, 500);
  }
});

export default network;
