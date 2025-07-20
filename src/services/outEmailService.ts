import { Resend } from 'resend';
import { mongoose } from './mongoService';
import dayjs from 'dayjs';
import { logger } from './logger';
import config from '../config';

// MongoDB Schema
const OutEmailRecordSchema = new mongoose.Schema({
  to: String,
  subject: String,
  content: String,
  sentAt: { type: Date, default: Date.now },
  ip: String
}, { collection: 'outemail_records' });
const OutEmailRecord = mongoose.models.OutEmailRecord || mongoose.model('OutEmailRecord', OutEmailRecordSchema);

const OutEmailQuotaSchema = new mongoose.Schema({
  date: String, // yyyy-MM-dd
  minute: String, // yyyy-MM-dd-HH-mm
  countDay: Number,
  countMinute: Number
}, { collection: 'outemail_quotas' });
const OutEmailQuota = mongoose.models.OutEmailQuota || mongoose.model('OutEmailQuota', OutEmailQuotaSchema);

// 多域名多API key支持
const domainApiKeyMap: Record<string, string> = {};
(function loadDomainApiKeys() {
  let idx = 0;
  while (true) {
    const domain = process.env[`OUTEMAIL_DOMAIN${idx ? '_' + idx : ''}`] || process.env[`RESEND_DOMAIN${idx ? '_' + idx : ''}`] || (idx === 0 ? (process.env.OUTEMAIL_DOMAIN || process.env.RESEND_DOMAIN) : undefined);
    const key = process.env[`OUTEMAIL_API_KEY${idx ? '_' + idx : ''}`] || process.env[`RESEND_API_KEY${idx ? '_' + idx : ''}`] || (idx === 0 ? (process.env.OUTEMAIL_API_KEY || process.env.RESEND_API_KEY) : undefined);
    if (!domain || !key) break;
    domainApiKeyMap[domain] = key;
    idx++;
  }
})();

function getResendInstanceByDomain(domain: string) {
  const key = domainApiKeyMap[domain];
  if (!key) throw new Error(`未配置该域名(${domain})的API key`);
  return new Resend(key);
}

// Resend官方建议：from字段仅用邮箱，显示名可尝试用headers['X-From-Name']或reply_to
function parseSender(fromPrefix: string, displayName: string | undefined, domain: string) {
  const prefix = (fromPrefix || 'noreply').replace(/[^a-zA-Z0-9._-]/g, '');
  const name = displayName || prefix;
  return {
    email: `${prefix}@${domain}`,
    name,
  };
}

export async function sendOutEmail({ to, subject, content, code, ip, from: fromUser, displayName, domain }: { to: string, subject: string, content: string, code: string, ip: string, from?: string, displayName?: string, domain?: string }) {
  // 检查对外邮件服务状态
  const outemailStatus = (globalThis as any).OUTEMAIL_SERVICE_STATUS;
  if (outemailStatus && !outemailStatus.available) {
    return { success: false, error: outemailStatus.error || '对外邮件服务不可用' };
  }
  
  // 选择域名
  const OUTEMAIL_DOMAIN = domain || require('../config').default.email.outemail.domain;
  if (!OUTEMAIL_DOMAIN) {
    return { success: false, error: '域名未配置' };
  }
  if (!domainApiKeyMap[OUTEMAIL_DOMAIN]) {
    return { success: false, error: 'API密钥未配置' };
  }
  const resend = getResendInstanceByDomain(OUTEMAIL_DOMAIN);
  if (typeof to !== 'string') {
    throw new Error('to 必须为字符串');
  }
  // 校验码
  if (!config.email.outemail.code || code !== config.email.outemail.code) {
    return { success: false, error: '校验码错误' };
  }
  // 限流检查
  const now = dayjs();
  const date = now.format('YYYY-MM-DD');
  const minute = now.format('YYYY-MM-DD-HH-mm');
  let quota = await OutEmailQuota.findOne({ date });
  if (!quota) quota = await OutEmailQuota.create({ date, minute, countDay: 0, countMinute: 0 });
  if (quota.countDay >= 100) {
    return { success: false, error: '今日发送已达上限（100封）' };
  }
  if (quota.minute === minute) {
    if (quota.countMinute >= 20) {
      return { success: false, error: '当前一分钟内发送已达上限（20封）' };
    }
    quota.countMinute++;
  } else {
    quota.minute = minute;
    quota.countMinute = 1;
  }
  quota.countDay++;
  await quota.save();
  // 发送邮件
  try {
    const sender = parseSender(fromUser || '', displayName, OUTEMAIL_DOMAIN);
    const mailOptions: any = {
      from: sender.email, // 只用邮箱
      to,
      subject,
      html: content,
    };
    // 兼容部分服务商，尝试用headers或reply_to传递显示名
    if (sender.name && sender.name !== fromUser) {
      mailOptions.reply_to = `${sender.name} <${sender.email}>`;
      mailOptions.headers = { 'X-From-Name': sender.name };
    }
    const { data, error } = await resend.emails.send(mailOptions);
    if (error) {
      logger.error('对外邮件发送失败', { error });
      return { success: false, error: error.message || error.toString() };
    }
    await OutEmailRecord.create({ to, subject, content, ip });
    return { success: true, messageId: data?.id };
  } catch (e: any) {
    logger.error('对外邮件发送异常', { error: e, stack: e?.stack });
    return { success: false, error: e?.message || e?.toString() };
  }
} 