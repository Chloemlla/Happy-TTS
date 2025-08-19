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

// 新增：对外邮件服务设置（含 OUTEMAIL_CODE），支持按域名覆盖
interface OutEmailSettingDoc { domain: string; code: string; updatedAt?: Date }
const OutEmailSettingSchema = new mongoose.Schema<OutEmailSettingDoc>({
  domain: { type: String, default: '' },
  code: { type: String, required: true },
  updatedAt: { type: Date, default: Date.now }
}, { collection: 'outemail_settings' });
const OutEmailSetting = (mongoose.models.OutEmailSetting as mongoose.Model<OutEmailSettingDoc>) || mongoose.model<OutEmailSettingDoc>('OutEmailSetting', OutEmailSettingSchema);

async function getOutEmailCodeFromDb(domain?: string): Promise<string | null> {
  try {
    const domainKey = typeof domain === 'string' ? domain : '';
    let doc = await OutEmailSetting.findOne({ domain: domainKey }).lean().exec() as OutEmailSettingDoc | null;
    if (!doc && domainKey) {
      // 回退到默认（空域名）配置
      doc = await OutEmailSetting.findOne({ domain: '' }).lean().exec() as OutEmailSettingDoc | null;
    }
    return (doc && typeof doc.code === 'string' && doc.code.length > 0) ? doc.code : null;
  } catch (e) {
    logger.error('读取 OUTEMAIL_CODE 失败', { error: (e as any)?.message });
    return null;
  }
}

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

// 配额总量（每日），可通过 OUTEMAIL_QUOTA_TOTAL 或 RESEND_QUOTA_TOTAL 配置，默认 100
const OUTEMAIL_QUOTA_TOTAL = Number(process.env.OUTEMAIL_QUOTA_TOTAL || process.env.RESEND_QUOTA_TOTAL || 100);

export interface OutEmailQuotaInfo {
  used: number;
  total: number;
  resetAt: string; // ISO
}

export async function getOutEmailQuota(): Promise<OutEmailQuotaInfo> {
  const now = dayjs();
  const date = now.format('YYYY-MM-DD');
  let quota = await OutEmailQuota.findOne({ date });
  if (!quota) quota = await OutEmailQuota.create({ date, minute: now.format('YYYY-MM-DD-HH-mm'), countDay: 0, countMinute: 0 });
  // resetAt 为次日 00:00
  const resetAt = now.add(1, 'day').startOf('day').toISOString();
  return { used: quota.countDay || 0, total: OUTEMAIL_QUOTA_TOTAL, resetAt };
}

// 批量发送（不支持附件，遵循 Resend 限制：最多 100 封/次）
export async function sendOutEmailBatch({
  messages,
  code,
  ip,
  from: fromUser,
  displayName,
  domain
}: {
  messages: Array<{ to: string | string[]; subject: string; content: string }>;
  code: string;
  ip: string;
  from?: string;
  displayName?: string;
  domain?: string;
}) {
  // 服务状态检查
  const outemailStatus = (globalThis as any).OUTEMAIL_SERVICE_STATUS;
  if (outemailStatus && !outemailStatus.available) {
    return { success: false, error: outemailStatus.error || '对外邮件服务不可用' };
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return { success: false, error: '消息列表不能为空' };
  }
  if (messages.length > 100) {
    return { success: false, error: '单次最多批量发送100封' };
  }

  // 选择域名（先确定域名，以便按域名读取校验码）
  const OUTEMAIL_DOMAIN = domain || require('../config').default.email.outemail.domain;
  if (!OUTEMAIL_DOMAIN) return { success: false, error: '域名未配置' };
  if (!domainApiKeyMap[OUTEMAIL_DOMAIN]) return { success: false, error: 'API密钥未配置' };
  const resend = getResendInstanceByDomain(OUTEMAIL_DOMAIN);

  // 校验码（改为从MongoDB读取，不再读取环境变量）
  const dbCode = await getOutEmailCodeFromDb(OUTEMAIL_DOMAIN);
  if (!dbCode || code !== dbCode) {
    return { success: false, error: '校验码错误' };
  }

  // 限流检查（将本次批量计入配额）
  const now = dayjs();
  const date = now.format('YYYY-MM-DD');
  const minute = now.format('YYYY-MM-DD-HH-mm');
  let quota = await OutEmailQuota.findOne({ date });
  if (!quota) quota = await OutEmailQuota.create({ date, minute, countDay: 0, countMinute: 0 });
  const n = messages.length;
  // 如果处于同一分钟，检查分钟剩余额度
  const currentMinuteCount = quota.minute === minute ? quota.countMinute : 0;
  if (currentMinuteCount + n > 20) {
    return { success: false, error: `当前一分钟可发送剩余额度不足（剩余 ${Math.max(0, 20 - currentMinuteCount)} 封）` };
  }
  if (quota.countDay + n > OUTEMAIL_QUOTA_TOTAL) {
    return { success: false, error: `今日可发送剩余额度不足（剩余 ${Math.max(0, OUTEMAIL_QUOTA_TOTAL - quota.countDay)} 封）` };
  }
  // 预占额
  if (quota.minute === minute) {
    quota.countMinute += n;
  } else {
    quota.minute = minute;
    quota.countMinute = n;
  }
  quota.countDay += n;
  await quota.save();

  try {
    const sender = parseSender(fromUser || '', displayName, OUTEMAIL_DOMAIN);
    // 构造 batch payload（无附件）
    const batch = messages.map((m) => {
      const toList = Array.isArray(m.to) ? m.to : [m.to];
      return {
        from: sender.email,
        to: toList,
        subject: m.subject,
        html: m.content,
        ...(sender.name && sender.name !== fromUser ? { reply_to: `${sender.name} <${sender.email}>`, headers: { 'X-From-Name': sender.name } } : {}),
      } as any;
    });

    const { data, error } = await resend.batch.send(batch);
    if (error) {
      logger.error('对外批量邮件发送失败', { error });
      return { success: false, error: error.message || error.toString() };
    }

    // 记录日志
    const records = messages.map((m) => ({ to: Array.isArray(m.to) ? m.to.join(',') : m.to, subject: m.subject, content: m.content, ip }));
    await OutEmailRecord.insertMany(records);
    return { success: true, ids: Array.isArray(data) ? data.map((x: any) => x?.id).filter(Boolean) : [] };
  } catch (e: any) {
    logger.error('对外批量邮件发送异常', { error: e, stack: e?.stack });
    return { success: false, error: e?.message || e?.toString() };
  }
}

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

export async function sendOutEmail({ to, subject, content, code, ip, from: fromUser, displayName, domain, attachments }: { to: string, subject: string, content: string, code: string, ip: string, from?: string, displayName?: string, domain?: string, attachments?: Array<{ path?: string; content?: string; filename: string; content_id?: string }> }) {
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
  // 校验码（改为从MongoDB读取）
  const dbCode = await getOutEmailCodeFromDb(OUTEMAIL_DOMAIN);
  if (!dbCode || code !== dbCode) {
    return { success: false, error: '校验码错误' };
  }
  // 限流检查
  const now = dayjs();
  const date = now.format('YYYY-MM-DD');
  const minute = now.format('YYYY-MM-DD-HH-mm');
  let quota = await OutEmailQuota.findOne({ date });
  if (!quota) quota = await OutEmailQuota.create({ date, minute, countDay: 0, countMinute: 0 });
  if (quota.countDay >= OUTEMAIL_QUOTA_TOTAL) {
    return { success: false, error: `今日发送已达上限（${OUTEMAIL_QUOTA_TOTAL}封）` };
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
    // 附件
    if (attachments && Array.isArray(attachments) && attachments.length) {
      // 基本校验与限制：最多 10 个附件
      const safeAttachments = attachments
        .filter(a => a && typeof a.filename === 'string' && (typeof a.path === 'string' || typeof a.content === 'string'))
        .slice(0, 10)
        .map(a => ({
          filename: a.filename,
          ...(a.path ? { path: a.path } : {}),
          ...(a.content ? { content: a.content } : {}),
          ...(a.content_id ? { content_id: a.content_id } : {}),
        }));
      if (safeAttachments.length) {
        mailOptions.attachments = safeAttachments;
      }
    }
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