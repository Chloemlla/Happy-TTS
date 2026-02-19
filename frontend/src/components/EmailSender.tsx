import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-toastify';
import MarkdownPreview from './MarkdownPreview'; // Added MarkdownPreview import
import DOMPurify from 'dompurify';
import { useNotification } from './Notification';
import { FaEnvelope } from 'react-icons/fa';

export interface EmailSenderProps {
  to: string;
  subject: string;
  content: string;
  code: string;
  setTo: (v: string) => void;
  setSubject: (v: string) => void;
  setContent: (v: string) => void;
  setCode: (v: string) => void;
  loading: boolean;
  success: string;
  error: string;
  handleSend: () => void;
  isOutEmail?: boolean;
}

interface EmailForm {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text?: string;
}

interface ServiceStatus {
  available: boolean;
  error?: string;
}

interface EmailQuota {
  used: number;
  total: number;
  resetAt: string; // ISO 时间
}

const EmailSender: React.FC<EmailSenderProps> = React.memo((props) => {
  const [form, setForm] = useState<EmailForm>({
    from: `noreply@${import.meta.env.VITE_RESEND_DOMAIN || 'hapxs.com'}`,
    to: [''],
    subject: '',
    html: '<h1>Hello World</h1><p>这是一封测试邮件。</p>',
    text: ''
  });
  const [loading, setLoading] = useState(false);
  const [serviceStatus, setServiceStatus] = useState<ServiceStatus | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [emailMode, setEmailMode] = useState<'html' | 'simple' | 'markdown'>('html');
  const [simpleContent, setSimpleContent] = useState('');
  const [markdownContent, setMarkdownContent] = useState('');
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const htmlEditorRef = useRef<HTMLTextAreaElement>(null);
  const { setNotification } = useNotification();
  const [quota, setQuota] = useState<EmailQuota>({ used: 0, total: 100, resetAt: '' });
  const [senderDomains, setSenderDomains] = useState<string[]>([]);
  const [domainExemptionStatus, setDomainExemptionStatus] = useState<{ exempted: boolean; message?: string; isInternal?: boolean; isExempted?: boolean } | null>(null);
  const [checkingExemption, setCheckingExemption] = useState(false);
  const [recipientWhitelistStatus, setRecipientWhitelistStatus] = useState<{ whitelisted: boolean; message?: string; isWhitelisted?: boolean } | null>(null);
  const [checkingRecipientWhitelist, setCheckingRecipientWhitelist] = useState(false);
  const [skipWhitelistCheck, setSkipWhitelistCheck] = useState(false);

  // 获取API基础URL
  const getApiBaseUrl = () => {
    if (import.meta.env.DEV) return 'http://localhost:3000';
    if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
    return 'https://api.951100.xyz';
  };

  const api = axios.create({
    baseURL: getApiBaseUrl(),
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem('token')}`
    }
  });

  // 获取发件人域名（自动适配后端环境变量）
  const getResendDomain = () => {
    return import.meta.env.VITE_RESEND_DOMAIN || 'hapxs.com';
  };
  const resendDomain = getResendDomain();

  // 获取发件人域名
  useEffect(() => {
    (async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get('/api/email/domains', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.data.domains) setSenderDomains(res.data.domains);
      } catch { }
    })();
  }, []);

  // 查询配额
  const fetchQuota = async (domain?: string) => {
    try {
      const response = await api.get('/api/email/quota' + (domain ? `?domain=${domain}` : ''));
      setQuota({
        used: response.data.used,
        total: response.data.quotaTotal || response.data.total,
        resetAt: response.data.resetAt
      });
    } catch { }
  };

  // 监听发件人域名变化自动刷新配额
  useEffect(() => {
    const domain = form.from.split('@')[1] || senderDomains[0] || '';
    if (domain) fetchQuota(domain);
    // eslint-disable-next-line
  }, [form.from, senderDomains.length]);

  useEffect(() => {
    checkServiceStatus();
    fetchQuota();
  }, []);

  const checkServiceStatus = async () => {
    try {
      const response = await api.get('/api/email/status');
      setServiceStatus(response.data);
    } catch (error) {
      console.error('检查邮件服务状态失败:', error);
      setServiceStatus({ available: false, error: '无法连接邮件服务' });
    }
  };

  // 检查域名豁免状态
  const checkDomainExemption = async () => {
    const currentDomain = form.from.split('@')[1];
    if (!currentDomain) {
      setNotification({ message: '请先选择发件人域名', type: 'warning' });
      return;
    }

    setCheckingExemption(true);
    try {
      const response = await api.post('/api/email/check-domain-exemption', {
        domain: currentDomain
      });

      if (response.data.success) {
        setDomainExemptionStatus({
          exempted: response.data.exempted,
          message: response.data.message,
          isInternal: response.data.isInternal,
          isExempted: response.data.isExempted
        });
        setNotification({
          message: response.data.exempted ? '域名已豁免检查' : '域名需要安全检查',
          type: response.data.exempted ? 'success' : 'info'
        });
      } else {
        setDomainExemptionStatus({
          exempted: false,
          message: response.data.error || '检查失败'
        });
        setNotification({ message: response.data.error || '检查失败', type: 'error' });
      }
    } catch (error: any) {
      console.error('域名豁免检查失败:', error);
      setDomainExemptionStatus({
        exempted: false,
        message: '网络错误，请重试'
      });
      setNotification({ message: '网络错误，请重试', type: 'error' });
    } finally {
      setCheckingExemption(false);
    }
  };

  // 检查收件人域名白名单状态
  const checkRecipientWhitelist = async () => {
    // 获取第一个收件人邮箱的域名
    const firstRecipient = form.to.find(email => email.trim());
    if (!firstRecipient) {
      setNotification({ message: '请先添加收件人邮箱', type: 'warning' });
      return;
    }

    const recipientDomain = firstRecipient.split('@')[1];
    if (!recipientDomain) {
      setNotification({ message: '收件人邮箱格式无效', type: 'warning' });
      return;
    }

    setCheckingRecipientWhitelist(true);
    try {
      const response = await api.post('/api/email/check-recipient-whitelist', {
        domain: recipientDomain
      });

      if (response.data.success) {
        setRecipientWhitelistStatus({
          whitelisted: response.data.whitelisted,
          message: response.data.message,
          isWhitelisted: response.data.isWhitelisted
        });
        setNotification({
          message: response.data.whitelisted ? '收件人域名在白名单中' : '收件人域名需要检查',
          type: response.data.whitelisted ? 'success' : 'info'
        });
      } else {
        setRecipientWhitelistStatus({
          whitelisted: false,
          message: response.data.error || '检查失败'
        });
        setNotification({ message: response.data.error || '检查失败', type: 'error' });
      }
    } catch (error: any) {
      console.error('收件人域名白名单检查失败:', error);
      setRecipientWhitelistStatus({
        whitelisted: false,
        message: '网络错误，请重试'
      });
      setNotification({ message: '网络错误，请重试', type: 'error' });
    } finally {
      setCheckingRecipientWhitelist(false);
    }
  };

  const validateEmails = async (emails: string[]) => {
    try {
      const response = await api.post('/api/email/validate', { emails });
      return response.data;
    } catch (error) {
      console.error('邮箱验证失败:', error);
      return { valid: [], invalid: emails };
    }
  };

  const handleToChange = (index: number, value: string) => {
    const newTo = [...form.to];
    newTo[index] = value;
    setForm({ ...form, to: newTo });
  };

  const addRecipient = () => {
    if (form.to.length < 10) {
      setForm({ ...form, to: [...form.to, ''] });
    }
  };

  const removeRecipient = (index: number) => {
    if (form.to.length > 1) {
      const newTo = form.to.filter((_, i) => i !== index);
      setForm({ ...form, to: newTo });
    }
  };

  const validateForm = async (): Promise<boolean> => {
    const errors: string[] = [];

    // 验证发件人
    if (!form.from.trim()) {
      errors.push('请填写发件人邮箱');
    }

    // 验证收件人
    const validRecipients = form.to.filter(email => email.trim());
    if (validRecipients.length === 0) {
      errors.push('请至少填写一个收件人邮箱');
    }

    // 验证主题
    if (!form.subject.trim()) {
      errors.push('请填写邮件主题');
    }

    // 验证内容
    if (emailMode === 'html' && !form.html.trim()) {
      errors.push('请填写邮件内容');
    } else if (emailMode === 'simple' && !simpleContent.trim()) {
      errors.push('请填写邮件内容');
    } else if (emailMode === 'markdown' && !markdownContent.trim()) {
      errors.push('请填写邮件内容');
    }

    setValidationErrors(errors);

    if (errors.length > 0) {
      return false;
    }

    // 验证邮箱格式
    const allEmails = [...validRecipients]; // 发件人邮箱固定为hapxs.com，无需验证
    const validation = await validateEmails(allEmails);

    if (validation.invalid.length > 0) {
      setValidationErrors([`以下邮箱格式无效: ${validation.invalid.join(', ')}`]);
      return false;
    }

    return true;
  };

  const handleSendEmail = async () => {
    if (!(await validateForm())) {
      return;
    }

    setLoading(true);
    try {
      const validRecipients = form.to.filter(email => email.trim());

      if (emailMode === 'html') {
        const response = await api.post('/api/email/send', {
          from: form.from,
          to: validRecipients,
          subject: form.subject,
          html: form.html,
          text: form.text,
          skipWhitelist: skipWhitelistCheck
        });

        if (response.data.success) {
          setNotification({ message: '邮件发送成功！', type: 'success' });
          // 重置表单
          setForm({
            from: `noreply@${resendDomain}`,
            to: [''],
            subject: '',
            html: '<h1>Hello World</h1><p>这是一封测试邮件。</p>',
            text: ''
          });
          setSimpleContent('');
        }
      } else if (emailMode === 'simple') {
        const response = await api.post('/api/email/send-simple', {
          from: form.from,
          to: validRecipients,
          subject: form.subject,
          content: simpleContent,
          skipWhitelist: skipWhitelistCheck
        });

        if (response.data.success) {
          setNotification({ message: '邮件发送成功！', type: 'success' });
          // 重置表单
          setForm({
            from: `noreply@${resendDomain}`,
            to: [''],
            subject: '',
            html: '<h1>Hello World</h1><p>这是一封测试邮件。</p>',
            text: ''
          });
          setSimpleContent('');
        }
      } else if (emailMode === 'markdown') {
        const response = await api.post('/api/email/send-markdown', {
          from: form.from,
          to: validRecipients,
          subject: form.subject,
          markdown: markdownContent,
          skipWhitelist: skipWhitelistCheck
        });
        if (response.data.success) {
          setNotification({ message: '邮件发送成功！', type: 'success' });
          setForm({
            from: `noreply@${resendDomain}`,
            to: [''],
            subject: '',
            html: '<h1>Hello World</h1><p>这是一封测试邮件。</p>',
            text: ''
          });
          setSimpleContent('');
          setMarkdownContent('');
        }
      }
    } catch (error: any) {
      console.error('邮件发送失败:', error);
      const errorMessage = error.response?.data?.error || error.message || '邮件发送失败';
      setNotification({ message: errorMessage, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handlePreview = () => {
    setShowPreview(!showPreview);
  };

  const insertHtmlTemplate = (template: string) => {
    if (htmlEditorRef.current) {
      const textarea = htmlEditorRef.current;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = textarea.value;
      const before = text.substring(0, start);
      const after = text.substring(end);

      setForm({
        ...form,
        html: before + template + after
      });

      // 设置光标位置
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + template.length, start + template.length);
      }, 0);
    }
  };

  const htmlTemplates = [
    // Happy-TTS 风格：验证类（与站内 UI 一致）
    {
      name: '验证-现代卡片',
      code: `<div style="max-width:560px;margin:0 auto;padding:0;background:#f6f7fb;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
  <div style="background:linear-gradient(90deg,#3b82f6,#8b5cf6);padding:24px 20px;color:#fff;text-align:center;">
    <div style="font-size:22px;font-weight:700;letter-spacing:0.5px;">Happy TTS</div>
    <div style="opacity:.9;font-size:13px;margin-top:4px;">语音合成服务 · 邮件验证</div>
  </div>
  <div style="background:#ffffffcc;backdrop-filter:blur(4px);margin:16px;border-radius:16px;box-shadow:0 8px 30px rgba(36,40,72,.08);border:1px solid rgba(255,255,255,.4);padding:24px 20px;">
    <div style="font-size:20px;font-weight:700;color:#111827;margin-bottom:12px;">您的验证码</div>
    <div style="font-size:28px;letter-spacing:6px;font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;background:#f3f4f6;padding:14px 12px;border-radius:12px;color:#111827;font-weight:700;box-shadow:inset 0 1px 0 rgba(255,255,255,.6);text-align:center;">12345678</div>
    <p style="color:#4b5563;font-size:14px;line-height:22px;margin:14px 0 0;">请在页面输入上方验证码完成验证。验证码有效期10分钟，请勿泄露。</p>
    <div style="text-align:center;margin-top:16px;">
      <a href="https://tts-new.951100.xyz" style="display:inline-block;padding:10px 20px;background:linear-gradient(90deg,#6366f1,#8b5cf6);color:#fff;border-radius:999px;text-decoration:none;font-weight:600;box-shadow:0 6px 16px rgba(99,102,241,.25);">前往 Happy TTS</a>
    </div>
    <p style="color:#9ca3af;font-size:12px;margin-top:18px;text-align:center;">如果不是您本人操作，请忽略本邮件。</p>
  </div>
  <div style="text-align:center;color:#9ca3af;font-size:12px;padding:6px 0 16px;">© ${new Date().getFullYear()} Happy TTS</div>
</div>`
    },

    // 欢迎/入职
    {
      name: '欢迎-入门指南',
      code: `<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:16px;box-shadow:0 10px 30px rgba(99,102,241,.15);overflow:hidden;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
  <div style="background:linear-gradient(90deg,#6366f1,#8b5cf6);color:#fff;padding:20px 24px;font-weight:700;font-size:18px;">欢迎加入 Happy TTS</div>
  <div style="padding:24px 22px;color:#374151;">
    <p style="margin:0 0 12px;">您好，欢迎使用 <strong>Happy TTS</strong>！以下是快速入门指南：</p>
    <ol style="margin:0 0 16px;padding-left:18px;line-height:1.7;">
      <li>注册并完成邮箱验证</li>
      <li>前往控制台创建您的第一个语音项目</li>
      <li>参考文档集成 API 或使用网页端合成</li>
    </ol>
    <a href="https://tts-new.951100.xyz" style="display:inline-block;padding:10px 18px;background:#111827;color:#fff;border-radius:10px;text-decoration:none;font-weight:600;">立即开始</a>
  </div>
  <div style="background:#f9fafb;color:#6b7280;padding:12px 22px;font-size:12px;">如需帮助，请回复此邮件。</div>
</div>`
    },

    // 重置密码
    {
      name: '安全-重置密码',
      code: `<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;box-shadow:0 10px 28px rgba(17,24,39,.08);font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;overflow:hidden;">
  <div style="padding:18px 22px;background:#111827;color:#fff;font-weight:700;">密码重置请求</div>
  <div style="padding:20px 22px;color:#374151;">
    <p>我们收到了您的密码重置请求。如果是您本人操作，请点击以下按钮继续：</p>
    <p style="text-align:center;margin:16px 0;">
      <a href="#" style="display:inline-block;padding:10px 18px;background:#ef4444;color:#fff;border-radius:10px;text-decoration:none;font-weight:600;">重置密码</a>
    </p>
    <p style="color:#6b7280;font-size:13px;">如果不是您本人操作，请忽略本邮件。该链接将在 30 分钟后失效。</p>
  </div>
  <div style="background:#f9fafb;color:#6b7280;padding:12px 22px;font-size:12px;">安全提示：不要将此邮件转发给他人。</div>
</div>`
    },

    // 资讯类 Newsletter
    {
      name: '资讯-Newsletter',
      code: `<div style="max-width:680px;margin:0 auto;background:#fff;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,.08);font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;overflow:hidden;">
  <div style="padding:22px 24px;background:linear-gradient(90deg,#3b82f6,#8b5cf6);color:#fff;font-weight:700;">Happy TTS 每周更新</div>
  <div style="padding:22px 24px;color:#374151;">
    <h2 style="margin:0 0 10px;font-size:18px;color:#111827;">本周亮点</h2>
    <ul style="margin:0;padding-left:18px;line-height:1.8;">
      <li>新增多语言支持与更自然的音色</li>
      <li>API 请求延迟降低 20%</li>
      <li>管理后台新增批量导出功能</li>
    </ul>
  </div>
  <div style="background:#f9fafb;color:#6b7280;padding:14px 24px;font-size:12px;">感谢订阅我们的更新！</div>
</div>`
    },

    // 促销/活动
    {
      name: '促销-限时活动',
      code: `<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:16px;box-shadow:0 8px 28px rgba(99,102,241,.2);font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;overflow:hidden;text-align:center;">
  <div style="padding:26px 20px;background:linear-gradient(90deg,#6366f1,#8b5cf6);color:#fff;">
    <div style="font-size:22px;font-weight:800;">限时优惠</div>
    <div style="opacity:.95;margin-top:4px;">年费订阅立减 30%</div>
  </div>
  <div style="padding:20px 22px;color:#374151;">
    <p>立即升级至专业版，享受更高并发与更稳定的合成能力。</p>
    <a href="#" style="display:inline-block;margin-top:8px;padding:10px 18px;background:#10b981;color:#fff;border-radius:10px;text-decoration:none;font-weight:700;">立即升级</a>
  </div>
  <div style="background:#f9fafb;color:#6b7280;padding:12px 22px;font-size:12px;">活动有效期至本月底</div>
</div>`
    },

    // 系统告警/通知
    {
      name: '通知-系统告警',
      code: `<div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #fee2e2;border-radius:14px;box-shadow:0 8px 24px rgba(239,68,68,.12);font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;overflow:hidden;">
  <div style="padding:16px 20px;background:#fef2f2;color:#b91c1c;font-weight:700;">系统告警</div>
  <div style="padding:18px 20px;color:#374151;">
    <p>您的服务请求达到配额上限，请升级套餐或等待配额重置。</p>
    <p style="color:#6b7280;font-size:13px;">重置时间：<strong>今日 24:00</strong></p>
  </div>
  <div style="background:#fff7ed;color:#9a3412;padding:12px 20px;font-size:12px;border-top:1px dashed #fde68a;">提示：您可以在设置中开启用量提醒。</div>
</div>`
    },

    // 订单/收据
    {
      name: '交易-收据',
      code: `<div style="max-width:640px;margin:0 auto;background:#fff;border-radius:12px;box-shadow:0 8px 20px rgba(0,0,0,.06);font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;overflow:hidden;">
  <div style="padding:18px 22px;background:#111827;color:#fff;font-weight:700;">付款收据</div>
  <div style="padding:18px 22px;color:#111827;">
    <table style="width:100%;border-collapse:collapse;">
      <tbody>
        <tr>
          <td style="padding:8px 0;color:#6b7280;">订单号</td>
          <td style="text-align:right;font-weight:600;">#A12345678</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#6b7280;">产品</td>
          <td style="text-align:right;">Happy TTS 专业版（年付）</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#6b7280;">金额</td>
          <td style="text-align:right;">¥ 699.00</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#6b7280;">时间</td>
          <td style="text-align:right;">2025-01-01 10:00</td>
        </tr>
      </tbody>
    </table>
    <p style="margin-top:12px;color:#4b5563;font-size:13px;">如需发票，请回复此邮件。</p>
  </div>
  <div style="background:#f9fafb;color:#6b7280;padding:12px 22px;font-size:12px;">感谢您的支持！</div>
</div>`
    },

    // 简洁/占位
    { name: '标题', code: '<h1>标题</h1>' },
    { name: '段落', code: '<p>段落内容</p>' },
    { name: '粗体', code: '<strong>粗体文本</strong>' },
    { name: '斜体', code: '<em>斜体文本</em>' },
    { name: '链接', code: '<a href="https://example.com">链接文本</a>' },
    { name: '图片', code: '<img src="https://example.com/image.jpg" alt="图片描述" />' },
    { name: '列表', code: '<ul><li>列表项1</li><li>列表项2</li></ul>' },
    { name: '表格', code: '<table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%"><tr><th>字段</th><th>值</th></tr><tr><td>示例</td><td>内容</td></tr></table>' }
  ];

  const [selectedTemplate, setSelectedTemplate] = useState<string>(htmlTemplates[0].name);

  // 默认内容美化
  useEffect(() => {
    if (!form.html || form.html === '<h1>Hello World</h1><p>这是一封测试邮件。</p>') {
      setForm(f => ({ ...f, html: htmlTemplates[0].code }));
    }
    // eslint-disable-next-line
  }, []);

  return (
    <motion.div
      className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 py-8 px-4 rounded-lg"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      <div className="max-w-7xl mx-auto px-4 space-y-8">
        {/* 统一的标题和使用说明卡片 */}
        <motion.div
          className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 overflow-hidden"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-4 sm:p-6">
            <div className="text-center">
              <motion.div
                className="flex items-center justify-center gap-2 sm:gap-3 mb-2"
                initial={{ scale: 0.95 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.5, delay: 0.2 }}
              >
                <FaEnvelope className="text-3xl sm:text-4xl" />
                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold">邮件发送</h1>
              </motion.div>
              <motion.p
                className="text-blue-100 text-sm sm:text-base"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.4 }}
              >
                <span className="hidden sm:inline">发送 HTML、纯文本或 Markdown 邮件（支持多收件人与预览）</span>
                <span className="sm:hidden">发送 HTML、纯文本或 Markdown 邮件</span>
              </motion.p>
            </div>
          </div>
        </motion.div>

        {/* 邮件配额进度条 */}
        <div className="max-w-2xl mx-auto pt-2 px-4 sm:px-0">
          <div className="mb-4">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 sm:gap-0 mb-1">
              <span className="text-sm text-gray-700 font-medium">今日邮件配额</span>
              <span className="text-xs text-gray-500">
                <span className="sm:hidden">{quota.used} / {quota.total} 封</span>
                <span className="hidden sm:inline">{quota.used} / {quota.total} 封 &nbsp;|&nbsp; {quota.resetAt ? `重置时间：${new Date(quota.resetAt).toLocaleString('zh-CN')}` : ''}</span>
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2 sm:h-3">
              <div
                className="bg-gradient-to-r from-indigo-500 to-purple-500 h-2 sm:h-3 rounded-full transition-all duration-300"
                style={{ width: `${Math.min(100, (quota.used / quota.total) * 100)}%` }}
              ></div>
            </div>
          </div>
        </div>
        {/* 顶部导航栏 */}
        <motion.div
          className="bg-white shadow-sm border-b border-gray-100"
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-14 sm:h-16">
              <motion.div
                className="flex items-center space-x-2 sm:space-x-4"
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.2 }}
              >
                <Link
                  to="/"
                  className="flex items-center space-x-1 sm:space-x-2 text-gray-600 hover:text-indigo-600 transition-colors duration-200"
                >
                  <motion.svg
                    className="w-4 h-4 sm:w-5 sm:h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    whileHover={{ scale: 1.1, rotate: -5 }}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </motion.svg>
                  <span className="text-sm sm:text-base font-medium">返回主页</span>
                </Link>
              </motion.div>

              <motion.div
                className="flex items-center space-x-1 sm:space-x-2"
                initial={{ x: 20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.3 }}
              >
                <motion.svg
                  className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  animate={{ rotate: [0, 5, -5, 0] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </motion.svg>
                <h1 className="text-lg sm:text-xl font-bold text-gray-900">邮件发送</h1>
              </motion.div>
            </div>
          </div>
        </motion.div>

        {/* 主要内容 */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8"
          >
            {/* 左侧表单 */}
            <div className="lg:col-span-2 order-1 lg:order-1">
              <motion.div
                className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden"
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.5 }}
              >
                {/* 表单头部 */}
                <div className="bg-gradient-to-r from-indigo-500 to-purple-600 px-4 sm:px-6 py-3 sm:py-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0">
                    <div className="flex items-center justify-center sm:justify-end gap-1 sm:gap-2">
                      <motion.button
                        onClick={() => setEmailMode('simple')}
                        className={`px-2 sm:px-3 py-1 rounded-lg text-xs sm:text-sm font-medium transition-all duration-200 ${emailMode === 'simple'
                          ? 'bg-white text-indigo-600 shadow-md'
                          : 'text-white/80 hover:text-white hover:bg-white/10'
                          }`}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        <span className="hidden sm:inline">简单模式</span>
                        <span className="sm:hidden">简单</span>
                      </motion.button>
                      <motion.button
                        onClick={() => setEmailMode('html')}
                        className={`px-2 sm:px-3 py-1 rounded-lg text-xs sm:text-sm font-medium transition-all duration-200 ${emailMode === 'html'
                          ? 'bg-white text-indigo-600 shadow-md'
                          : 'text-white/80 hover:text-white hover:bg-white/10'
                          }`}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        HTML
                      </motion.button>
                      <motion.button
                        onClick={() => setEmailMode('markdown')}
                        className={`px-2 sm:px-3 py-1 rounded-lg text-xs sm:text-sm font-medium transition-all duration-200 ${emailMode === 'markdown'
                          ? 'bg-white text-indigo-600 shadow-md'
                          : 'text-white/80 hover:text-white hover:bg-white/10'
                          }`}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        <span className="hidden sm:inline">Markdown模式</span>
                        <span className="sm:hidden">MD</span>
                      </motion.button>
                    </div>
                  </div>
                </div>

                {/* 表单内容 */}
                <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
                  {/* 服务状态 */}
                  {serviceStatus && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`p-3 rounded-lg border ${serviceStatus.available
                        ? 'bg-green-50 border-green-200 text-green-800'
                        : 'bg-red-50 border-red-200 text-red-800'
                        }`}
                    >
                      <div className="flex items-start space-x-2">
                        <motion.svg
                          className={`w-5 h-5 flex-shrink-0 mt-0.5 ${serviceStatus.available ? 'text-green-500' : 'text-red-500'}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          animate={{ scale: [1, 1.1, 1] }}
                          transition={{ duration: 2, repeat: Infinity }}
                        >
                          {serviceStatus.available ? (
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          ) : (
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          )}
                        </motion.svg>
                        <div className="min-w-0 flex-1">
                          <span className="font-medium">
                            {serviceStatus.available ? '邮件服务正常' : '邮件服务异常'}
                          </span>
                          {serviceStatus.error && (
                            <p className="text-sm mt-1 leading-relaxed">{serviceStatus.error}</p>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* 验证错误 */}
                  <AnimatePresence>
                    {validationErrors.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="bg-red-50 border border-red-200 rounded-lg p-3 sm:p-4"
                      >
                        <div className="flex items-start space-x-2 mb-2">
                          <motion.svg
                            className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            animate={{ rotate: [0, 10, -10, 0] }}
                            transition={{ duration: 0.5 }}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </motion.svg>
                          <span className="font-medium text-red-800">验证错误</span>
                        </div>
                        <ul className="text-sm text-red-700 space-y-1 ml-7">
                          {validationErrors.map((error, index) => (
                            <li key={index} className="leading-relaxed">• {error}</li>
                          ))}
                        </ul>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* 发件人 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      发件人邮箱 *
                    </label>
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
                      <div className="flex-1 flex">
                        <input
                          type="text"
                          value={form.from.split('@')[0]}
                          onChange={(e) => {
                            const username = e.target.value;
                            setForm({ ...form, from: `${username}@${form.from.split('@')[1] || senderDomains[0] || ''}` });
                          }}
                          className="flex-1 px-3 sm:px-4 py-2 sm:py-3 border border-gray-300 rounded-l-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200 rounded-r-none text-sm sm:text-base"
                          placeholder="noreply"
                        />
                        {senderDomains.length === 1 && (
                          <span className="inline-flex items-center px-2 sm:px-3 py-2 sm:py-3 border border-l-0 border-gray-300 bg-gray-50 text-gray-600 text-sm sm:text-base rounded-r-lg select-none">@{senderDomains[0]}</span>
                        )}
                        {senderDomains.length > 1 && (
                          <select
                            value={form.from.split('@')[1] || senderDomains[0] || ''}
                            onChange={e => {
                              setForm({ ...form, from: `${form.from.split('@')[0]}@${e.target.value}` });
                            }}
                            className="px-2 sm:px-3 py-2 sm:py-3 border border-l-0 border-gray-300 rounded-r-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200 bg-white text-sm sm:text-base"
                          >
                            {senderDomains.map(domain => (
                              <option key={domain} value={domain}>@{domain}</option>
                            ))}
                          </select>
                        )}
                      </div>
                      <motion.button
                        onClick={checkDomainExemption}
                        disabled={checkingExemption}
                        className={`w-full sm:w-auto px-3 sm:px-4 py-2 sm:py-3 rounded-lg font-medium text-sm transition-all duration-200 ${checkingExemption
                          ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                          : 'bg-blue-500 hover:bg-blue-600 text-white shadow-md hover:shadow-lg'
                          }`}
                        whileHover={!checkingExemption ? { scale: 1.02 } : {}}
                        whileTap={!checkingExemption ? { scale: 0.98 } : {}}
                      >
                        {checkingExemption ? (
                          <div className="flex items-center justify-center space-x-2">
                            <motion.div
                              className="w-4 h-4 border-2 border-white border-t-transparent rounded-full"
                              animate={{ rotate: 360 }}
                              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                            />
                            <span className="hidden sm:inline">检查中...</span>
                            <span className="sm:hidden">检查中</span>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center space-x-2">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span className="hidden sm:inline">豁免检查</span>
                            <span className="sm:hidden">豁免</span>
                          </div>
                        )}
                      </motion.button>
                    </div>

                    {/* 域名豁免状态显示 */}
                    <AnimatePresence>
                      {domainExemptionStatus && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className={`mt-3 p-3 rounded-lg border ${domainExemptionStatus.exempted
                            ? 'bg-green-50 border-green-200 text-green-800'
                            : 'bg-yellow-50 border-yellow-200 text-yellow-800'
                            }`}
                        >
                          <div className="flex items-start space-x-2">
                            <motion.svg
                              className={`w-5 h-5 flex-shrink-0 mt-0.5 ${domainExemptionStatus.exempted ? 'text-green-500' : 'text-yellow-500'
                                }`}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                              animate={{ scale: [1, 1.1, 1] }}
                              transition={{ duration: 2, repeat: Infinity }}
                            >
                              {domainExemptionStatus.exempted ? (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                              ) : (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                              )}
                            </motion.svg>
                            <div className="min-w-0 flex-1">
                              <div className="font-medium">
                                {domainExemptionStatus.exempted ? '域名已豁免' : '域名需要检查'}
                              </div>
                              <div className="text-sm opacity-90 leading-relaxed">
                                {domainExemptionStatus.message}
                                {domainExemptionStatus.isInternal && ' (内部域名)'}
                                {domainExemptionStatus.isExempted && ' (豁免域名)'}
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* 收件人 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      收件人邮箱 * (最多10个)
                    </label>
                    <div className="space-y-2">
                      {form.to.map((email, index) => (
                        <div key={index} className="flex items-center space-x-2">
                          <input
                            type="email"
                            value={email}
                            onChange={(e) => handleToChange(index, e.target.value)}
                            className="flex-1 px-3 sm:px-4 py-2 sm:py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200 text-sm sm:text-base"
                            placeholder={`收件人${index + 1}@example.com`}
                          />
                          {form.to.length > 1 && (
                            <motion.button
                              onClick={() => removeRecipient(index)}
                              className="p-2 sm:p-3 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-all duration-200"
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.9 }}
                            >
                              <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </motion.button>
                          )}
                        </div>
                      ))}
                      {form.to.length < 10 && (
                        <motion.button
                          onClick={addRecipient}
                          className="w-full py-2 sm:py-3 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg border-2 border-dashed border-indigo-300 transition-all duration-200"
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                        >
                          <div className="flex items-center justify-center space-x-2">
                            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                            </svg>
                            <span className="text-sm sm:text-base">添加收件人</span>
                          </div>
                        </motion.button>
                      )}
                    </div>

                    {/* 收件人域名白名单检查按钮 */}
                    <div className="mt-3">
                      <motion.button
                        onClick={checkRecipientWhitelist}
                        disabled={checkingRecipientWhitelist || !form.to.find(email => email.trim())}
                        className={`w-full sm:w-auto px-3 sm:px-4 py-2 sm:py-3 rounded-lg font-medium text-sm transition-all duration-200 ${checkingRecipientWhitelist || !form.to.find(email => email.trim())
                          ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                          : 'bg-green-500 hover:bg-green-600 text-white shadow-md hover:shadow-lg'
                          }`}
                        whileHover={!checkingRecipientWhitelist && form.to.find(email => email.trim()) ? { scale: 1.02 } : {}}
                        whileTap={!checkingRecipientWhitelist && form.to.find(email => email.trim()) ? { scale: 0.98 } : {}}
                      >
                        {checkingRecipientWhitelist ? (
                          <div className="flex items-center justify-center space-x-2">
                            <motion.div
                              className="w-4 h-4 border-2 border-white border-t-transparent rounded-full"
                              animate={{ rotate: 360 }}
                              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                            />
                            <span className="hidden sm:inline">检查中...</span>
                            <span className="sm:hidden">检查中</span>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center space-x-2">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                            </svg>
                            <span className="hidden sm:inline">白名单检查</span>
                            <span className="sm:hidden">白名单</span>
                          </div>
                        )}
                      </motion.button>
                    </div>

                    {/* 收件人域名白名单状态显示 */}
                    <AnimatePresence>
                      {recipientWhitelistStatus && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className={`mt-3 p-3 rounded-lg border ${recipientWhitelistStatus.whitelisted
                            ? 'bg-green-50 border-green-200 text-green-800'
                            : 'bg-orange-50 border-orange-200 text-orange-800'
                            }`}
                        >
                          <div className="flex items-start space-x-2">
                            <motion.svg
                              className={`w-5 h-5 flex-shrink-0 mt-0.5 ${recipientWhitelistStatus.whitelisted ? 'text-green-500' : 'text-orange-500'
                                }`}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                              animate={{ scale: [1, 1.1, 1] }}
                              transition={{ duration: 2, repeat: Infinity }}
                            >
                              {recipientWhitelistStatus.whitelisted ? (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                              ) : (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                              )}
                            </motion.svg>
                            <div className="min-w-0 flex-1">
                              <div className="font-medium">
                                {recipientWhitelistStatus.whitelisted ? '收件人域名在白名单中' : '收件人域名需要检查'}
                              </div>
                              <div className="text-sm opacity-90 leading-relaxed">
                                {recipientWhitelistStatus.message}
                                {recipientWhitelistStatus.isWhitelisted && ' (白名单域名)'}
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* 邮件主题 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      邮件主题 *
                    </label>
                    <input
                      type="text"
                      value={form.subject}
                      onChange={(e) => setForm({ ...form, subject: e.target.value })}
                      className="w-full px-3 sm:px-4 py-2 sm:py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200 text-sm sm:text-base"
                      placeholder="请输入邮件主题"
                    />
                  </div>

                  {/* 邮件内容 */}
                  <div>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0 mb-2">
                      <label className="block text-sm font-medium text-gray-700">
                        邮件内容 *
                      </label>
                      {emailMode === 'html' && (
                        <motion.button
                          onClick={handlePreview}
                          className="text-sm text-indigo-600 hover:text-indigo-700 font-medium self-end sm:self-auto"
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                        >
                          {showPreview ? '隐藏预览' : '预览'}
                        </motion.button>
                      )}
                    </div>

                    {emailMode === 'html' ? (
                      <div className="space-y-4">
                        {/* HTML模板选择/插入工具栏 */}
                        <div className="flex flex-col gap-2">
                          <div className="flex flex-col sm:flex-row gap-2">
                            <select
                              value={selectedTemplate}
                              onChange={(e) => setSelectedTemplate(e.target.value)}
                              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm bg-white"
                            >
                              {htmlTemplates.map(t => (
                                <option key={t.name} value={t.name}>{t.name}</option>
                              ))}
                            </select>
                            <div className="flex items-center gap-2">
                              <motion.button
                                onClick={() => {
                                  const t = htmlTemplates.find(x => x.name === selectedTemplate);
                                  if (t) insertHtmlTemplate(t.code);
                                }}
                                className="flex-1 sm:flex-none px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium shadow"
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                              >
                                <span className="hidden sm:inline">插入模板</span>
                                <span className="sm:hidden">插入</span>
                              </motion.button>
                              <motion.button
                                onClick={() => setForm({ ...form, html: '' })}
                                className="flex-1 sm:flex-none px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm"
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                              >
                                清空
                              </motion.button>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {htmlTemplates.slice(-8).map((template) => (
                              <motion.button
                                key={template.name}
                                onClick={() => insertHtmlTemplate(template.code)}
                                className="px-2 sm:px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md transition-all duration-200"
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                              >
                                <span className="hidden sm:inline">{template.name}</span>
                                <span className="sm:hidden">{template.name.length > 4 ? template.name.substring(0, 4) + '...' : template.name}</span>
                              </motion.button>
                            ))}
                          </div>
                        </div>

                        {/* HTML编辑器 */}
                        <textarea
                          ref={htmlEditorRef}
                          value={form.html}
                          onChange={(e) => setForm({ ...form, html: e.target.value })}
                          className="w-full h-64 px-3 sm:px-4 py-2 sm:py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200 font-mono text-sm"
                          placeholder="请输入HTML格式的邮件内容"
                        />

                        {/* 预览 */}
                        <AnimatePresence>
                          {showPreview && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              className="border border-gray-300 rounded-lg p-3 sm:p-4 bg-gray-50"
                            >
                              <h4 className="text-sm font-medium text-gray-700 mb-2">预览效果：</h4>
                              <div
                                className="prose prose-sm max-w-none overflow-x-auto"
                                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(form.html) }}
                              />
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    ) : emailMode === 'simple' ? (
                      <textarea
                        value={simpleContent}
                        onChange={(e) => setSimpleContent(e.target.value)}
                        className="w-full h-64 px-3 sm:px-4 py-2 sm:py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200 text-sm sm:text-base"
                        placeholder="请输入邮件内容"
                      />
                    ) : (
                      <div className="space-y-4">
                        <textarea
                          value={markdownContent}
                          onChange={(e) => setMarkdownContent(e.target.value)}
                          className="w-full h-64 px-3 sm:px-4 py-2 sm:py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200 font-mono text-sm"
                          placeholder="请输入Markdown格式的邮件内容"
                        />
                        <div className="border border-gray-300 rounded-lg p-3 sm:p-4 bg-gray-50">
                          <h4 className="text-sm font-medium text-gray-700 mb-2">预览效果：</h4>
                          <div className="overflow-x-auto">
                            <MarkdownPreview markdown={markdownContent} />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 跳过白名单检查选项 */}
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 sm:p-4">
                    <div className="flex items-start space-x-2 sm:space-x-3">
                      <motion.svg
                        className="w-5 h-5 sm:w-6 sm:h-6 text-yellow-600 flex-shrink-0 mt-0.5 sm:mt-0"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        animate={{ scale: [1, 1.1, 1] }}
                        transition={{ duration: 2, repeat: Infinity }}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                      </motion.svg>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start space-x-2 sm:space-x-3">
                          <label className="flex items-start space-x-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={skipWhitelistCheck}
                              onChange={(e) => setSkipWhitelistCheck(e.target.checked)}
                              className="w-4 h-4 text-yellow-600 border-yellow-300 rounded focus:ring-yellow-500 focus:ring-2 mt-0.5 flex-shrink-0"
                            />
                            <span className="text-sm font-medium text-yellow-800 leading-relaxed">
                              <span className="hidden sm:inline">跳过收件人域名白名单检查</span>
                              <span className="sm:hidden">跳过白名单检查</span>
                            </span>
                          </label>
                        </div>
                        <p className="text-xs text-yellow-700 mt-1 leading-relaxed">
                          <span className="hidden sm:inline">启用此选项将跳过收件人域名的白名单验证和邮箱格式验证，直接发送邮件。仅管理员可用。</span>
                          <span className="sm:hidden">跳过白名单验证和邮箱格式验证，直接发送邮件。仅管理员可用。</span>
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* 发送按钮 */}
                  <motion.button
                    onClick={handleSendEmail}
                    disabled={loading || !serviceStatus?.available}
                    className={`w-full py-3 sm:py-4 px-4 sm:px-6 rounded-lg font-semibold text-white transition-all duration-200 ${loading || !serviceStatus?.available
                      ? 'bg-gray-400 cursor-not-allowed'
                      : 'bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 shadow-lg hover:shadow-xl'
                      }`}
                    whileHover={!loading && serviceStatus?.available ? { scale: 1.02 } : {}}
                    whileTap={!loading && serviceStatus?.available ? { scale: 0.98 } : {}}
                  >
                    {loading ? (
                      <div className="flex items-center justify-center space-x-2">
                        <motion.div
                          className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-white border-t-transparent rounded-full"
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        />
                        <span className="text-sm sm:text-base">发送中...</span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center space-x-2">
                        <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                        </svg>
                        <span className="text-sm sm:text-base">发送邮件</span>
                      </div>
                    )}
                  </motion.button>
                </div>
              </motion.div>
            </div>

            {/* 右侧帮助面板 */}
            <div className="lg:col-span-1 order-2 lg:order-2">
              <motion.div
                className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden"
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.6 }}
              >
                {/* 面板头部 */}
                <div className="bg-gradient-to-r from-green-500 to-teal-600 px-4 sm:px-6 py-3 sm:py-4">
                  <h3 className="text-base sm:text-lg font-bold text-white">使用帮助</h3>
                </div>

                {/* 面板内容 */}
                <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
                  {/* 功能说明 */}
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 mb-2 sm:mb-3">功能说明</h4>
                    <div className="space-y-2 text-sm text-gray-600">
                      <div className="flex items-start space-x-2">
                        <div className="w-2 h-2 bg-indigo-500 rounded-full mt-2 flex-shrink-0"></div>
                        <p className="leading-relaxed">支持HTML、简单文本和Markdown三种邮件格式</p>
                      </div>
                      <div className="flex items-start space-x-2">
                        <div className="w-2 h-2 bg-indigo-500 rounded-full mt-2 flex-shrink-0"></div>
                        <p className="leading-relaxed">最多可同时发送给10个收件人</p>
                      </div>
                      <div className="flex items-start space-x-2">
                        <div className="w-2 h-2 bg-indigo-500 rounded-full mt-2 flex-shrink-0"></div>
                        <p className="leading-relaxed">自动验证邮箱格式</p>
                      </div>
                      <div className="flex items-start space-x-2">
                        <div className="w-2 h-2 bg-indigo-500 rounded-full mt-2 flex-shrink-0"></div>
                        <p className="leading-relaxed">实时预览邮件效果</p>
                      </div>
                    </div>
                  </div>

                  {/* 使用提示 */}
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 mb-2 sm:mb-3">使用提示</h4>
                    <div className="space-y-2 text-sm text-gray-600">
                      <div className="flex items-start space-x-2">
                        <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0"></div>
                        <p className="leading-relaxed">发件人邮箱固定为 @{resendDomain} 域名</p>
                      </div>
                      <div className="flex items-start space-x-2">
                        <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0"></div>
                        <p className="leading-relaxed">HTML模式下可使用模板快速插入标签</p>
                      </div>
                      <div className="flex items-start space-x-2">
                        <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0"></div>
                        <p className="leading-relaxed">发送前建议先预览邮件效果</p>
                      </div>
                      <div className="flex items-start space-x-2">
                        <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0"></div>
                        <p className="leading-relaxed">每分钟最多发送5封邮件</p>
                      </div>
                      <div className="flex items-start space-x-2">
                        <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                        <p className="leading-relaxed">点击"豁免检查"按钮可检查域名安全状态</p>
                      </div>
                      <div className="flex items-start space-x-2">
                        <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0"></div>
                        <p className="leading-relaxed">点击"白名单检查"按钮可检查收件人域名安全状态</p>
                      </div>
                      <div className="flex items-start space-x-2">
                        <div className="w-2 h-2 bg-yellow-500 rounded-full mt-2 flex-shrink-0"></div>
                        <p className="leading-relaxed">可勾选"跳过白名单检查"选项直接发送邮件</p>
                      </div>
                      <div className="flex items-start space-x-2">
                        <div className="w-2 h-2 bg-red-500 rounded-full mt-2 flex-shrink-0"></div>
                        <p className="leading-relaxed">跳过白名单检查时将绕过收件人邮箱格式验证</p>
                      </div>
                    </div>
                  </div>

                  {/* 安全提醒 */}
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 mb-2 sm:mb-3">安全提醒</h4>
                    <div className="space-y-2 text-sm text-gray-600">
                      <div className="flex items-start space-x-2">
                        <div className="w-2 h-2 bg-yellow-500 rounded-full mt-2 flex-shrink-0"></div>
                        <p className="leading-relaxed">请勿发送垃圾邮件或恶意内容</p>
                      </div>
                      <div className="flex items-start space-x-2">
                        <div className="w-2 h-2 bg-yellow-500 rounded-full mt-2 flex-shrink-0"></div>
                        <p className="leading-relaxed">注意保护收件人隐私</p>
                      </div>
                      <div className="flex items-start space-x-2">
                        <div className="w-2 h-2 bg-yellow-500 rounded-full mt-2 flex-shrink-0"></div>
                        <p className="leading-relaxed">仅管理员可使用此功能</p>
                      </div>
                    </div>
                  </div>

                  {/* 服务状态 */}
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 mb-2 sm:mb-3">服务状态</h4>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">邮件服务</span>
                        <div className="flex items-center space-x-2">
                          <div className={`w-2 h-2 rounded-full ${serviceStatus?.available ? 'bg-green-500' : 'bg-red-500'}`}></div>
                          <span className="text-sm font-medium">
                            {serviceStatus?.available ? '正常' : '异常'}
                          </span>
                        </div>
                      </div>
                      <motion.button
                        onClick={checkServiceStatus}
                        className="w-full py-2 text-sm text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-all duration-200"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        刷新状态
                      </motion.button>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
});
export default EmailSender;