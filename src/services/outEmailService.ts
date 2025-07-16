import { Resend } from 'resend';
import mongoose from './mongoService';
import dayjs from 'dayjs';
import { logger } from './logger';

const OUTEMAIL_API_KEY = process.env.RESEND_API_OUT || '';
const OUTEMAIL_DOMAIN = process.env.RESEND_DOMAIN_OUT || '';
const OUTEMAIL_CODE = process.env.OUTEMAIL_CODE || '';

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

const resend = new Resend(OUTEMAIL_API_KEY);

export async function sendOutEmail({ to, subject, content, code, ip }: { to: string, subject: string, content: string, code: string, ip: string }) {
  if (typeof to !== 'string') {
    throw new Error('to 必须为字符串');
  }
  // 校验码
  if (!OUTEMAIL_CODE || code !== OUTEMAIL_CODE) {
    return { success: false, error: '校验码错误' };
  }
  // 限流检查
  const now = dayjs();
  const date = now.format('YYYY-MM-DD');
  const minute = now.format('YYYY-MM-DD-HH-mm');
  let quota = await OutEmailQuota.findOne({ date });
  if (!quota) quota = await OutEmailQuota.create({ date, minute, countDay: 0, countMinute: 0 });
  // 检查每日限额
  if (quota.countDay >= 100) {
    return { success: false, error: '今日发送已达上限（100封）' };
  }
  // 检查每分钟限额
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
    const from = `noreply@${OUTEMAIL_DOMAIN}`;
    const { data, error } = await resend.emails.send({
      from,
      to: [to],
      subject,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#333;">${content.replace(/\n/g, '<br>')}</div>`
    });
    if (error) {
      logger.error('对外邮件发送失败', { error: error.message, to, subject });
      return { success: false, error: error.message };
    }
    await OutEmailRecord.create({ to, subject, content, ip });
    return { success: true, messageId: data?.id };
  } catch (e: any) {
    logger.error('对外邮件发送异常', { error: e.message, to, subject });
    return { success: false, error: e.message };
  }
} 