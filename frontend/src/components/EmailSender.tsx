import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Link } from "react-router-dom";
import DOMPurify from "dompurify";
import {
  FaArrowRight,
  FaCheckCircle,
  FaEnvelope,
  FaExclamationTriangle,
  FaGlobe,
  FaInfoCircle,
  FaLink,
  FaPlus,
  FaRedo,
  FaShieldAlt,
  FaTrash,
} from "react-icons/fa";
import MarkdownPreview from "./MarkdownPreview";
import { useNotification } from "./Notification";
import { api, getApiBaseUrl } from "../api/api";

interface EmailForm {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text: string;
}

interface ServiceStatus {
  available: boolean;
  error?: string;
}

interface QuotaInfo {
  used: number;
  total: number;
  resetAt: string;
}

interface OutemailSettingItem {
  domain: string;
  code: string;
  updatedAt?: string;
}

type EmailMode = "html" | "simple" | "markdown";
type AdminTab =
  | "overview"
  | "internal"
  | "governance"
  | "risk"
  | "templates";

const DEFAULT_HTML = "<h1>Hello World</h1><p>这是一封测试邮件。</p>";

const htmlTemplates = [
  {
    name: "验证邮件",
    category: "账号通知",
    code: `<div style="max-width:560px;margin:0 auto;padding:24px;background:#f8fafc;font-family:'Segoe UI',Tahoma,sans-serif;color:#1f2937;">
  <div style="background:linear-gradient(135deg,#0f766e,#14b8a6);padding:24px;border-radius:20px 20px 0 0;color:#fff;">
    <div style="font-size:24px;font-weight:700;">Synapse</div>
    <div style="font-size:13px;opacity:.9;margin-top:6px;">账户安全验证通知</div>
  </div>
  <div style="background:#fff;padding:28px;border:1px solid #dbeafe;border-top:none;border-radius:0 0 20px 20px;">
    <h2 style="margin:0 0 14px;font-size:22px;">您的验证码</h2>
    <div style="font-size:30px;font-weight:800;letter-spacing:8px;background:#ecfeff;color:#0f766e;padding:18px;border-radius:16px;text-align:center;">123456</div>
    <p style="margin:18px 0 0;line-height:1.7;color:#475569;">验证码有效期 10 分钟，请在同一设备与网络环境中完成操作。如果不是您本人请求，请忽略本邮件。</p>
  </div>
</div>`,
  },
  {
    name: "欢迎邮件",
    category: "运营触达",
    code: `<div style="max-width:620px;margin:0 auto;background:#fff5f5;border:1px solid #fecaca;border-radius:24px;overflow:hidden;font-family:'Segoe UI',Tahoma,sans-serif;">
  <div style="background:linear-gradient(135deg,#b91c1c,#ef4444);padding:28px;color:#fff;">
    <div style="font-size:26px;font-weight:800;">欢迎加入 Synapse</div>
    <div style="margin-top:8px;font-size:14px;opacity:.92;">文本转语音、管理面板与自动化能力一体化平台</div>
  </div>
  <div style="padding:28px;color:#334155;background:#fff;">
    <p style="line-height:1.8;margin-top:0;">很高兴你开始使用 Synapse。下面是建议的首日操作：</p>
    <ol style="padding-left:18px;line-height:1.8;">
      <li>完成邮箱验证与安全设置</li>
      <li>创建第一个项目并测试语音参数</li>
      <li>阅读 API 文档并生成首个集成 Token</li>
    </ol>
    <a href="https://tts.chloemlla.com" style="display:inline-block;margin-top:16px;padding:12px 18px;background:#111827;color:#fff;border-radius:999px;text-decoration:none;font-weight:700;">进入控制台</a>
  </div>
</div>`,
  },
  {
    name: "安全告警",
    category: "账号通知",
    code: `<div style="max-width:580px;margin:0 auto;background:#fff;border:1px solid #fde68a;border-radius:18px;font-family:'Segoe UI',Tahoma,sans-serif;overflow:hidden;">
  <div style="background:#f59e0b;color:#fff;padding:20px 24px;font-size:20px;font-weight:800;">安全提醒</div>
  <div style="padding:24px;color:#374151;">
    <p style="margin-top:0;line-height:1.8;">检测到您的账户发生了新的敏感操作，请尽快核实：</p>
    <ul style="padding-left:18px;line-height:1.8;">
      <li>登录 IP 发生变化</li>
      <li>设备指纹不同于上次记录</li>
      <li>建议立即检查密码与 MFA 设置</li>
    </ul>
    <p style="margin-bottom:0;color:#6b7280;">如果不是您本人操作，请立刻重置密码并联系管理员。</p>
  </div>
</div>`,
  },
  {
    name: "运营公告",
    category: "营销通知",
    code: `<div style="max-width:680px;margin:0 auto;background:#f0f9ff;border:1px solid #bae6fd;border-radius:24px;font-family:'Segoe UI',Tahoma,sans-serif;overflow:hidden;">
  <div style="padding:24px;background:linear-gradient(135deg,#0369a1,#38bdf8);color:#fff;">
    <div style="font-size:24px;font-weight:800;">产品更新简报</div>
    <div style="margin-top:6px;opacity:.92;">本周版本更新、功能公告与重点修复</div>
  </div>
  <div style="padding:28px;background:#fff;color:#334155;">
    <h3 style="margin-top:0;">亮点更新</h3>
    <ul style="padding-left:18px;line-height:1.8;">
      <li>新增公开外发域名治理与验证码设置</li>
      <li>发信内核收敛为统一传输层</li>
      <li>管理员邮件台支持模板、预览与风控联查</li>
    </ul>
  </div>
</div>`,
  },
];

function formatDateTime(value?: string) {
  if (!value) return "未提供";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN");
}

function buildDefaultFrom(domain?: string) {
  return `noreply@${domain || "chloemlla.com"}`;
}

const EmailSender: React.FC = () => {
  const { setNotification } = useNotification();
  const htmlEditorRef = useRef<HTMLTextAreaElement>(null);

  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const [emailMode, setEmailMode] = useState<EmailMode>("html");
  const [loading, setLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const [senderDomains, setSenderDomains] = useState<string[]>([]);
  const [serviceStatus, setServiceStatus] = useState<ServiceStatus | null>(null);
  const [quota, setQuota] = useState<QuotaInfo>({
    used: 0,
    total: 100,
    resetAt: "",
  });

  const [outemailStatus, setOutemailStatus] = useState<ServiceStatus | null>(
    null
  );
  const [outemailQuota, setOutemailQuota] = useState<QuotaInfo>({
    used: 0,
    total: 100,
    resetAt: "",
  });
  const [outemailDomain, setOutemailDomain] = useState("");
  const [outemailSettings, setOutemailSettings] = useState<OutemailSettingItem[]>(
    []
  );
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsDeletingDomain, setSettingsDeletingDomain] = useState<
    string | null
  >(null);
  const [settingDomain, setSettingDomain] = useState("");
  const [settingCode, setSettingCode] = useState("");

  const [domainExemptionStatus, setDomainExemptionStatus] = useState<{
    exempted: boolean;
    message?: string;
    isInternal?: boolean;
    isExempted?: boolean;
  } | null>(null);
  const [checkingExemption, setCheckingExemption] = useState(false);
  const [recipientWhitelistStatus, setRecipientWhitelistStatus] = useState<{
    whitelisted: boolean;
    message?: string;
    isWhitelisted?: boolean;
  } | null>(null);
  const [checkingRecipientWhitelist, setCheckingRecipientWhitelist] =
    useState(false);
  const [skipWhitelistCheck, setSkipWhitelistCheck] = useState(false);

  const [simpleContent, setSimpleContent] = useState("");
  const [markdownContent, setMarkdownContent] = useState("");
  const [form, setForm] = useState<EmailForm>({
    from: buildDefaultFrom(),
    to: [""],
    subject: "",
    html: DEFAULT_HTML,
    text: "",
  });

  const apiBaseUrl = getApiBaseUrl();

  const syncDefaultSender = (domains: string[]) => {
    const currentDomain = form.from.split("@")[1];
    const fallback = domains[0];
    if (!fallback) return;
    if (!currentDomain || !domains.includes(currentDomain)) {
      setForm((prev) => ({ ...prev, from: buildDefaultFrom(fallback) }));
    }
  };

  const fetchSenderDomains = async () => {
    try {
      const response = await api.get("/api/email/domains");
      const domains = Array.isArray(response.data?.domains)
        ? response.data.domains
        : [];
      setSenderDomains(domains);
      syncDefaultSender(domains);
    } catch (error) {
      console.error("获取发件域名失败", error);
    }
  };

  const fetchQuota = async (domain?: string) => {
    try {
      const response = await api.get(
        `/api/email/quota${domain ? `?domain=${encodeURIComponent(domain)}` : ""}`
      );
      setQuota({
        used: Number(response.data?.used) || 0,
        total: Number(response.data?.quotaTotal || response.data?.total) || 0,
        resetAt: String(response.data?.resetAt || ""),
      });
    } catch (error) {
      console.error("获取内部邮件配额失败", error);
    }
  };

  const checkServiceStatus = async () => {
    try {
      const response = await api.get("/api/email/status");
      setServiceStatus({
        available: Boolean(response.data?.available),
        error: response.data?.error,
      });
    } catch (error) {
      console.error("检查邮件服务状态失败", error);
      setServiceStatus({ available: false, error: "无法连接内部邮件服务" });
    }
  };

  const fetchOutemailStatus = async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/api/outemail/status`);
      const data = await response.json();
      setOutemailStatus({
        available: Boolean(data?.available),
        error: data?.error,
      });
      if (typeof data?.domain === "string") {
        setOutemailDomain(data.domain);
      }
    } catch (error) {
      console.error("获取公开外发服务状态失败", error);
      setOutemailStatus({
        available: false,
        error: "无法连接公开外发服务",
      });
    }
  };

  const fetchOutemailQuota = async () => {
    try {
      const response = await api.get("/api/outemail/quota");
      setOutemailQuota({
        used: Number(response.data?.used) || 0,
        total: Number(response.data?.total) || 0,
        resetAt: String(response.data?.resetAt || ""),
      });
    } catch (error) {
      console.error("获取公开外发配额失败", error);
    }
  };

  const fetchOutemailSettings = async () => {
    setSettingsLoading(true);
    try {
      const response = await api.get("/api/admin/outemail/settings");
      if (response.data?.success && Array.isArray(response.data?.settings)) {
        setOutemailSettings(response.data.settings as OutemailSettingItem[]);
      } else {
        setOutemailSettings([]);
      }
    } catch (error: any) {
      setNotification({
        message:
          error?.response?.data?.error ||
          error?.message ||
          "获取公开外发验证码设置失败",
        type: "error",
      });
    } finally {
      setSettingsLoading(false);
    }
  };

  useEffect(() => {
    fetchSenderDomains();
    fetchQuota();
    checkServiceStatus();
    fetchOutemailStatus();
    fetchOutemailQuota();
    fetchOutemailSettings();
  }, []);

  useEffect(() => {
    const domain = form.from.split("@")[1];
    if (domain) {
      fetchQuota(domain);
    }
  }, [form.from]);

  const validateEmails = async (emails: string[]) => {
    try {
      const response = await api.post("/api/email/validate", { emails });
      return response.data;
    } catch (error) {
      console.error("邮箱验证失败", error);
      return { valid: [], invalid: emails };
    }
  };

  const handleToChange = (index: number, value: string) => {
    setForm((prev) => {
      const next = [...prev.to];
      next[index] = value;
      return { ...prev, to: next };
    });
  };

  const addRecipient = () => {
    setForm((prev) =>
      prev.to.length >= 100 ? prev : { ...prev, to: [...prev.to, ""] }
    );
  };

  const removeRecipient = (index: number) => {
    setForm((prev) => {
      if (prev.to.length <= 1) return prev;
      return { ...prev, to: prev.to.filter((_, i) => i !== index) };
    });
  };

  const validateForm = async () => {
    const errors: string[] = [];
    const validRecipients = form.to.map((item) => item.trim()).filter(Boolean);

    if (!form.from.trim()) errors.push("请填写发件人邮箱");
    if (validRecipients.length === 0) errors.push("请至少填写一个收件人邮箱");
    if (!form.subject.trim()) errors.push("请填写邮件主题");
    if (emailMode === "html" && !form.html.trim()) errors.push("请填写 HTML 内容");
    if (emailMode === "simple" && !simpleContent.trim()) errors.push("请填写纯文本内容");
    if (emailMode === "markdown" && !markdownContent.trim()) errors.push("请填写 Markdown 内容");

    const recipientLimit = emailMode === "html" ? 10 : emailMode === "simple" ? 10 : 10;
    if (validRecipients.length > recipientLimit) {
      errors.push(`当前模式最多支持 ${recipientLimit} 个收件人`);
    }

    if (errors.length > 0) {
      setValidationErrors(errors);
      return false;
    }

    const emailsToValidate = skipWhitelistCheck
      ? [form.from]
      : [form.from, ...validRecipients];
    const validation = await validateEmails(emailsToValidate);
    if (Array.isArray(validation?.invalid) && validation.invalid.length > 0) {
      setValidationErrors([
        `以下邮箱格式无效：${validation.invalid.join("、")}`,
      ]);
      return false;
    }

    setValidationErrors([]);
    return true;
  };

  const handleSendEmail = async () => {
    if (!(await validateForm())) return;
    setLoading(true);

    try {
      const validRecipients = form.to.map((item) => item.trim()).filter(Boolean);
      let response;

      if (emailMode === "html") {
        if (validRecipients.length > 1) {
          response = await api.post("/api/email/batch-send", {
            from: form.from,
            to: validRecipients,
            subject: form.subject,
            html: form.html,
            text: form.text,
          });
        } else {
          response = await api.post("/api/email/send", {
            from: form.from,
            to: validRecipients,
            subject: form.subject,
            html: form.html,
            text: form.text,
            skipWhitelist: skipWhitelistCheck,
          });
        }
      } else if (emailMode === "simple") {
        response = await api.post("/api/email/send-simple", {
          from: form.from,
          to: validRecipients,
          subject: form.subject,
          content: simpleContent,
          skipWhitelist: skipWhitelistCheck,
        });
      } else {
        response = await api.post("/api/email/send-markdown", {
          from: form.from,
          to: validRecipients,
          subject: form.subject,
          markdown: markdownContent,
          skipWhitelist: skipWhitelistCheck,
        });
      }

      if (response.data?.success) {
        setNotification({ message: "邮件发送成功", type: "success" });
        const defaultDomain = form.from.split("@")[1] || senderDomains[0];
        setForm({
          from: buildDefaultFrom(defaultDomain),
          to: [""],
          subject: "",
          html: DEFAULT_HTML,
          text: "",
        });
        setSimpleContent("");
        setMarkdownContent("");
        await fetchQuota(defaultDomain);
      }
    } catch (error: any) {
      setNotification({
        message:
          error?.response?.data?.error || error?.message || "邮件发送失败",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCheckDomainExemption = async () => {
    const currentDomain = form.from.split("@")[1];
    if (!currentDomain) {
      setNotification({ message: "当前没有可检查的发件域名", type: "warning" });
      return;
    }

    setCheckingExemption(true);
    try {
      const response = await api.post("/api/email/check-domain-exemption", {
        domain: currentDomain,
      });
      setDomainExemptionStatus(response.data);
      setNotification({
        message: response.data?.message || "域名检查完成",
        type: response.data?.exempted ? "success" : "info",
      });
    } catch (error: any) {
      setDomainExemptionStatus({
        exempted: false,
        message: error?.response?.data?.error || "域名检查失败",
      });
      setNotification({
        message:
          error?.response?.data?.error || error?.message || "域名检查失败",
        type: "error",
      });
    } finally {
      setCheckingExemption(false);
    }
  };

  const handleCheckRecipientWhitelist = async () => {
    const firstRecipient = form.to.find((item) => item.trim());
    if (!firstRecipient) {
      setNotification({ message: "请先填写至少一个收件人", type: "warning" });
      return;
    }

    const domain = firstRecipient.split("@")[1];
    if (!domain) {
      setNotification({ message: "收件人邮箱格式无效", type: "warning" });
      return;
    }

    setCheckingRecipientWhitelist(true);
    try {
      const response = await api.post("/api/email/check-recipient-whitelist", {
        domain,
      });
      setRecipientWhitelistStatus(response.data);
      setNotification({
        message: response.data?.message || "白名单检查完成",
        type: response.data?.whitelisted ? "success" : "info",
      });
    } catch (error: any) {
      setRecipientWhitelistStatus({
        whitelisted: false,
        message: error?.response?.data?.error || "白名单检查失败",
      });
      setNotification({
        message:
          error?.response?.data?.error ||
          error?.message ||
          "白名单检查失败",
        type: "error",
      });
    } finally {
      setCheckingRecipientWhitelist(false);
    }
  };

  const handleSaveSetting = async () => {
    if (!settingCode.trim()) {
      setNotification({ message: "请填写公开外发验证码", type: "warning" });
      return;
    }

    setSettingsSaving(true);
    try {
      const response = await api.post("/api/admin/outemail/settings", {
        domain: settingDomain.trim(),
        code: settingCode.trim(),
      });
      if (response.data?.success) {
        setNotification({ message: "公开外发验证码已保存", type: "success" });
        setSettingCode("");
        await fetchOutemailSettings();
      }
    } catch (error: any) {
      setNotification({
        message:
          error?.response?.data?.error || error?.message || "保存公开外发验证码失败",
        type: "error",
      });
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleDeleteSetting = async (domain: string) => {
    setSettingsDeletingDomain(domain);
    try {
      const response = await api.delete("/api/admin/outemail/settings", {
        data: { domain },
      });
      if (response.data?.success) {
        setNotification({ message: "公开外发验证码已删除", type: "success" });
        await fetchOutemailSettings();
      }
    } catch (error: any) {
      setNotification({
        message:
          error?.response?.data?.error || error?.message || "删除公开外发验证码失败",
        type: "error",
      });
    } finally {
      setSettingsDeletingDomain(null);
    }
  };

  const insertHtmlTemplate = (template: string) => {
    const textarea = htmlEditorRef.current;
    if (!textarea) {
      setForm((prev) => ({ ...prev, html: `${prev.html}${template}` }));
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const before = form.html.slice(0, start);
    const after = form.html.slice(end);
    setForm((prev) => ({
      ...prev,
      html: `${before}${template}${after}`,
    }));

    setTimeout(() => {
      textarea.focus();
      const cursor = start + template.length;
      textarea.setSelectionRange(cursor, cursor);
    }, 0);
  };

  const internalQuotaPercent =
    quota.total > 0 ? Math.min((quota.used / quota.total) * 100, 100) : 0;
  const publicQuotaPercent =
    outemailQuota.total > 0
      ? Math.min((outemailQuota.used / outemailQuota.total) * 100, 100)
      : 0;

  const tabs: Array<{ key: AdminTab; label: string }> = [
    { key: "overview", label: "总览" },
    { key: "internal", label: "站内发信" },
    { key: "governance", label: "公开外发治理" },
    { key: "risk", label: "域名与风控" },
    { key: "templates", label: "模板与说明" },
  ];

  return (
    <div className="min-h-0 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.18),_transparent_32%),linear-gradient(180deg,#f8fafc_0%,#eef6ff_48%,#ffffff_100%)]">
      <div className="mx-auto w-full max-w-none px-0 py-0">
        <div className="mb-6 rounded-[28px] border border-sky-100 bg-white/90 p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold tracking-[0.18em] text-sky-700">
                <FaEnvelope />
                ADMIN MAIL CONSOLE
              </div>
              <h1 className="text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
                管理员邮件系统控制台
              </h1>
              <p className="mt-3 text-sm leading-7 text-slate-600 sm:text-base">
                这是邮件发送、公开外发治理、风控联查和验证码管理的一体化页面。管理员不需要再在发信页、公开页、
                环境页之间来回切换。
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:min-w-[420px]">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                  内部发信
                </div>
                <div className="mt-2 flex items-center gap-2 text-lg font-bold text-slate-900">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      serviceStatus?.available ? "bg-emerald-500" : "bg-rose-500"
                    }`}
                  />
                  {serviceStatus?.available ? "正常" : "异常"}
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  {serviceStatus?.error || "管理员站内邮件服务可用"}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                  公开外发
                </div>
                <div className="mt-2 flex items-center gap-2 text-lg font-bold text-slate-900">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      outemailStatus?.available ? "bg-emerald-500" : "bg-rose-500"
                    }`}
                  />
                  {outemailStatus?.available ? "正常" : "异常"}
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  {outemailDomain || "未返回公开外发域名"}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                  发信域名
                </div>
                <div className="mt-2 text-2xl font-black text-slate-900">
                  {senderDomains.length}
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  已配置域名可用于管理员站内邮件
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-6 flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                activeTab === tab.key
                  ? "bg-slate-900 text-white shadow-lg"
                  : "bg-white text-slate-600 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {activeTab === "overview" && (
            <motion.div
              key="overview"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -18 }}
              className="grid gap-6 xl:grid-cols-[1.3fr_1fr]"
            >
              <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                          站内邮件配额
                        </div>
                        <div className="mt-2 text-3xl font-black text-slate-900">
                          {quota.used} / {quota.total}
                        </div>
                      </div>
                      <FaEnvelope className="text-2xl text-sky-500" />
                    </div>
                    <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-sky-500 to-cyan-400"
                        style={{ width: `${internalQuotaPercent}%` }}
                      />
                    </div>
                    <div className="mt-3 text-xs text-slate-500">
                      重置时间：{formatDateTime(quota.resetAt)}
                    </div>
                  </div>

                  <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                          公开外发配额
                        </div>
                        <div className="mt-2 text-3xl font-black text-slate-900">
                          {outemailQuota.used} / {outemailQuota.total}
                        </div>
                      </div>
                      <FaGlobe className="text-2xl text-teal-500" />
                    </div>
                    <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-400"
                        style={{ width: `${publicQuotaPercent}%` }}
                      />
                    </div>
                    <div className="mt-3 text-xs text-slate-500">
                      重置时间：{formatDateTime(outemailQuota.resetAt)}
                    </div>
                  </div>
                </div>

                <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h2 className="text-xl font-black text-slate-900">
                        运行态总览
                      </h2>
                      <p className="mt-1 text-sm text-slate-500">
                        快速核对站内发信与公开外发的可用性、域名与验证码治理状态。
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        checkServiceStatus();
                        fetchQuota(form.from.split("@")[1]);
                        fetchOutemailStatus();
                        fetchOutemailQuota();
                        fetchOutemailSettings();
                      }}
                      className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                    >
                      <FaRedo />
                      刷新全部
                    </button>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <div className="text-sm font-semibold text-slate-900">
                        内部发信服务
                      </div>
                      <div className="mt-3 flex items-center gap-2 text-sm">
                        <span
                          className={`h-2.5 w-2.5 rounded-full ${
                            serviceStatus?.available
                              ? "bg-emerald-500"
                              : "bg-rose-500"
                          }`}
                        />
                        <span className="text-slate-700">
                          {serviceStatus?.available ? "可发送" : "不可发送"}
                        </span>
                      </div>
                      <div className="mt-2 text-xs leading-6 text-slate-500">
                        {serviceStatus?.error || "当前管理员站内邮件链路正常。"}
                      </div>
                    </div>

                    <div className="rounded-2xl bg-slate-50 p-4">
                      <div className="text-sm font-semibold text-slate-900">
                        公开外发服务
                      </div>
                      <div className="mt-3 flex items-center gap-2 text-sm">
                        <span
                          className={`h-2.5 w-2.5 rounded-full ${
                            outemailStatus?.available
                              ? "bg-emerald-500"
                              : "bg-rose-500"
                          }`}
                        />
                        <span className="text-slate-700">
                          {outemailStatus?.available ? "可发送" : "不可发送"}
                        </span>
                      </div>
                      <div className="mt-2 text-xs leading-6 text-slate-500">
                        {outemailStatus?.error || outemailDomain || "当前公开外发链路正常。"}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
                  <h2 className="text-xl font-black text-slate-900">
                    管理动作入口
                  </h2>
                  <div className="mt-4 space-y-3">
                    <button
                      type="button"
                      onClick={() => setActiveTab("internal")}
                      className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-left"
                    >
                      <div>
                        <div className="font-semibold text-slate-900">
                          进入站内发信台
                        </div>
                        <div className="text-xs text-slate-500">
                          发送 HTML、纯文本或 Markdown 邮件
                        </div>
                      </div>
                      <FaArrowRight className="text-slate-400" />
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveTab("governance")}
                      className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-left"
                    >
                      <div>
                        <div className="font-semibold text-slate-900">
                          公开外发治理
                        </div>
                        <div className="text-xs text-slate-500">
                          管理验证码设置、公开外发域名与配额
                        </div>
                      </div>
                      <FaArrowRight className="text-slate-400" />
                    </button>

                    <Link
                      to="/outemail"
                      className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-left"
                    >
                      <div>
                        <div className="font-semibold text-slate-900">
                          前往公开外发发送页
                        </div>
                        <div className="text-xs text-slate-500">
                          使用公开接口验证码发送对外邮件
                        </div>
                      </div>
                      <FaLink className="text-slate-400" />
                    </Link>
                  </div>
                </div>

                <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
                  <h2 className="text-xl font-black text-slate-900">
                    当前治理状态
                  </h2>
                  <div className="mt-4 space-y-4">
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                        公开外发验证码配置
                      </div>
                      <div className="mt-2 text-2xl font-black text-slate-900">
                        {outemailSettings.length}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        MongoDB 中当前存在的域名级验证码记录数
                      </div>
                    </div>

                    <div className="rounded-2xl bg-slate-50 p-4">
                      <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                        可用发信域名
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {senderDomains.length > 0 ? (
                          senderDomains.map((domain) => (
                            <span
                              key={domain}
                              className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200"
                            >
                              {domain}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-slate-500">
                            暂未获取到已配置域名
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === "internal" && (
            <motion.div
              key="internal"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -18 }}
              className="grid gap-6 xl:grid-cols-[1.6fr_1fr]"
            >
              <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
                <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h2 className="text-xl font-black text-slate-900">
                      站内邮件发送
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      统一管理员发信入口，支持 HTML、纯文本与 Markdown。HTML 多收件人时会自动走批量发送接口。
                    </p>
                  </div>
                  <div className="inline-flex rounded-full bg-slate-100 p-1">
                    {(["html", "simple", "markdown"] as EmailMode[]).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setEmailMode(mode)}
                        className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                          emailMode === mode
                            ? "bg-white text-slate-900 shadow"
                            : "text-slate-500"
                        }`}
                      >
                        {mode === "html"
                          ? "HTML"
                          : mode === "simple"
                            ? "纯文本"
                            : "Markdown"}
                      </button>
                    ))}
                  </div>
                </div>

                {validationErrors.length > 0 && (
                  <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 p-4">
                    <div className="mb-2 flex items-center gap-2 text-sm font-bold text-rose-700">
                      <FaExclamationTriangle />
                      表单校验失败
                    </div>
                    <div className="space-y-1 text-sm text-rose-600">
                      {validationErrors.map((error) => (
                        <div key={error}>{error}</div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid gap-5 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">
                      发件人邮箱
                    </label>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                      <select
                        value={form.from.split("@")[1] || ""}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            from: buildDefaultFrom(e.target.value),
                          }))
                        }
                        className="mb-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                      >
                        {senderDomains.length > 0 ? (
                          senderDomains.map((domain) => (
                            <option key={domain} value={domain}>
                              {domain}
                            </option>
                          ))
                        ) : (
                          <option value="">暂无域名</option>
                        )}
                      </select>
                      <input
                        value={form.from}
                        onChange={(e) =>
                          setForm((prev) => ({ ...prev, from: e.target.value }))
                        }
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                        placeholder="请输入完整发件人邮箱"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">
                      邮件主题
                    </label>
                    <input
                      value={form.subject}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, subject: e.target.value }))
                      }
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
                      placeholder="请输入邮件主题"
                    />
                  </div>
                </div>

                <div className="mt-5">
                  <div className="mb-2 flex items-center justify-between">
                    <label className="block text-sm font-semibold text-slate-700">
                      收件人列表
                    </label>
                    <button
                      type="button"
                      onClick={addRecipient}
                      className="inline-flex items-center gap-2 rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-700"
                    >
                      <FaPlus />
                      添加收件人
                    </button>
                  </div>
                  <div className="space-y-3">
                    {form.to.map((recipient, index) => (
                      <div key={`${index}-${form.to.length}`} className="flex gap-3">
                        <input
                          value={recipient}
                          onChange={(e) => handleToChange(index, e.target.value)}
                          className="flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
                          placeholder={`收件人 ${index + 1}`}
                        />
                        <button
                          type="button"
                          disabled={form.to.length <= 1}
                          onClick={() => removeRecipient(index)}
                          className="inline-flex items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 px-4 text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <FaTrash />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <label className="flex items-start gap-3 text-sm">
                    <input
                      type="checkbox"
                      checked={skipWhitelistCheck}
                      onChange={(e) => setSkipWhitelistCheck(e.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-amber-300"
                    />
                    <span className="leading-6 text-amber-800">
                      跳过收件人白名单检查。启用后，后端将跳过收件人域名白名单校验；仅管理员可用，建议只用于明确受控的临时发送。
                    </span>
                  </label>
                </div>

                <div className="mt-6">
                  <div className="mb-3 flex items-center justify-between">
                    <label className="block text-sm font-semibold text-slate-700">
                      邮件内容
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowPreview((prev) => !prev)}
                      className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700"
                    >
                      {showPreview ? "隐藏预览" : "显示预览"}
                    </button>
                  </div>

                  {emailMode === "html" && (
                    <div className="space-y-4">
                      <div className="flex flex-wrap gap-2">
                        {htmlTemplates.map((template) => (
                          <button
                            key={template.name}
                            type="button"
                            onClick={() => insertHtmlTemplate(template.code)}
                            className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700"
                          >
                            {template.name}
                          </button>
                        ))}
                      </div>
                      <textarea
                        ref={htmlEditorRef}
                        value={form.html}
                        onChange={(e) =>
                          setForm((prev) => ({ ...prev, html: e.target.value }))
                        }
                        className="h-72 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-sm"
                        placeholder="请输入 HTML 内容"
                      />
                    </div>
                  )}

                  {emailMode === "simple" && (
                    <textarea
                      value={simpleContent}
                      onChange={(e) => setSimpleContent(e.target.value)}
                      className="h-72 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
                      placeholder="请输入纯文本内容"
                    />
                  )}

                  {emailMode === "markdown" && (
                    <textarea
                      value={markdownContent}
                      onChange={(e) => setMarkdownContent(e.target.value)}
                      className="h-72 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-sm"
                      placeholder="请输入 Markdown 内容"
                    />
                  )}
                </div>

                <div className="mt-6">
                  <button
                    type="button"
                    disabled={loading || !serviceStatus?.available}
                    onClick={handleSendEmail}
                    className={`w-full rounded-2xl px-5 py-4 text-sm font-bold text-white transition ${
                      loading || !serviceStatus?.available
                        ? "cursor-not-allowed bg-slate-300"
                        : "bg-gradient-to-r from-sky-600 to-cyan-500 shadow-lg shadow-sky-200"
                    }`}
                  >
                    {loading ? "发送中..." : "发送站内邮件"}
                  </button>
                </div>
              </div>

              <div className="space-y-6">
                <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
                  <h3 className="text-lg font-black text-slate-900">
                    实时预览
                  </h3>
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    {emailMode === "html" && showPreview && (
                      <div
                        className="prose prose-sm max-w-none overflow-x-auto"
                        dangerouslySetInnerHTML={{
                          __html: DOMPurify.sanitize(form.html),
                        }}
                      />
                    )}
                    {emailMode === "simple" && (
                      <div className="whitespace-pre-wrap text-sm leading-7 text-slate-700">
                        {simpleContent || "纯文本预览会显示在这里。"}
                      </div>
                    )}
                    {emailMode === "markdown" && (
                      <MarkdownPreview markdown={markdownContent} />
                    )}
                  </div>
                </div>

                <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
                  <h3 className="text-lg font-black text-slate-900">
                    发送侧说明
                  </h3>
                  <div className="mt-4 space-y-3 text-sm leading-7 text-slate-600">
                    <p>1. HTML 模式多收件人会走 `/api/email/batch-send`。</p>
                    <p>2. 纯文本与 Markdown 目前沿用单封管理员接口。</p>
                    <p>3. 站内邮件受管理员限流、域名校验与配额统计约束。</p>
                    <p>4. 发件人域名必须来自后端已配置域名列表。</p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === "governance" && (
            <motion.div
              key="governance"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -18 }}
              className="grid gap-6 xl:grid-cols-[1.05fr_1.2fr]"
            >
              <div className="space-y-6">
                <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
                  <h2 className="text-xl font-black text-slate-900">
                    公开外发运行状态
                  </h2>
                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                        服务状态
                      </div>
                      <div className="mt-2 flex items-center gap-2 text-lg font-bold text-slate-900">
                        <span
                          className={`h-2.5 w-2.5 rounded-full ${
                            outemailStatus?.available
                              ? "bg-emerald-500"
                              : "bg-rose-500"
                          }`}
                        />
                        {outemailStatus?.available ? "正常" : "异常"}
                      </div>
                      <div className="mt-2 text-xs text-slate-500">
                        {outemailStatus?.error || "对外邮件服务可用"}
                      </div>
                    </div>

                    <div className="rounded-2xl bg-slate-50 p-4">
                      <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                        当前公开域名
                      </div>
                      <div className="mt-2 text-lg font-bold text-slate-900">
                        {outemailDomain || "未返回"}
                      </div>
                      <div className="mt-2 text-xs text-slate-500">
                        `/api/outemail/status` 返回的运行域名
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 rounded-2xl bg-slate-50 p-4">
                    <div className="flex items-center justify-between text-sm font-semibold text-slate-700">
                      <span>公开外发每日配额</span>
                      <span>
                        {outemailQuota.used} / {outemailQuota.total}
                      </span>
                    </div>
                    <div className="mt-3 h-3 overflow-hidden rounded-full bg-white">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400"
                        style={{ width: `${publicQuotaPercent}%` }}
                      />
                    </div>
                    <div className="mt-3 text-xs text-slate-500">
                      重置时间：{formatDateTime(outemailQuota.resetAt)}
                    </div>
                  </div>

                  <div className="mt-5">
                    <Link
                      to="/outemail"
                      className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                    >
                      前往公开外发发送页
                      <FaArrowRight />
                    </Link>
                  </div>
                </div>

                <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
                  <h2 className="text-xl font-black text-slate-900">
                    公开外发治理原则
                  </h2>
                  <div className="mt-4 space-y-3 text-sm leading-7 text-slate-600">
                    <p>1. 公开外发验证码按域名存储，默认空域名记录可作为回退。</p>
                    <p>2. 公开外发的分钟级与日级限额由后端统一治理。</p>
                    <p>3. 这里管理的是治理配置，不是发送界面本身。</p>
                    <p>4. 若公开外发链路异常，应优先核查域名、API Key 与数据库连接状态。</p>
                  </div>
                </div>
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-black text-slate-900">
                      公开外发验证码设置
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      管理 `/api/outemail/*` 使用的域名级验证码。空域名表示默认配置。
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={fetchOutemailSettings}
                    className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700"
                  >
                    <FaRedo />
                    刷新
                  </button>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-[1fr_1.2fr_auto]">
                  <input
                    value={settingDomain}
                    onChange={(e) => setSettingDomain(e.target.value)}
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
                    placeholder="域名，可留空作为默认项"
                  />
                  <input
                    value={settingCode}
                    onChange={(e) => setSettingCode(e.target.value)}
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
                    placeholder="请输入新的公开外发验证码"
                  />
                  <button
                    type="button"
                    disabled={settingsSaving}
                    onClick={handleSaveSetting}
                    className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
                  >
                    {settingsSaving ? "保存中..." : "保存"}
                  </button>
                </div>

                <div className="mt-6">
                  {settingsLoading ? (
                    <div className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">
                      正在加载公开外发验证码设置...
                    </div>
                  ) : outemailSettings.length === 0 ? (
                    <div className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">
                      当前没有公开外发验证码设置。
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {outemailSettings.map((setting) => (
                        <div
                          key={`${setting.domain}-${setting.updatedAt || "no-date"}`}
                          className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:flex-row md:items-center md:justify-between"
                        >
                          <div>
                            <div className="text-sm font-bold text-slate-900">
                              {setting.domain || "默认域名配置"}
                            </div>
                            <div className="mt-1 font-mono text-xs text-slate-500">
                              code: {setting.code}
                            </div>
                            <div className="mt-1 text-xs text-slate-500">
                              更新时间：{formatDateTime(setting.updatedAt)}
                            </div>
                          </div>
                          <button
                            type="button"
                            disabled={settingsDeletingDomain === setting.domain}
                            onClick={() => handleDeleteSetting(setting.domain)}
                            className="rounded-full bg-rose-100 px-4 py-2 text-sm font-semibold text-rose-700 disabled:opacity-50"
                          >
                            {settingsDeletingDomain === setting.domain
                              ? "删除中..."
                              : "删除"}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === "risk" && (
            <motion.div
              key="risk"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -18 }}
              className="grid gap-6 xl:grid-cols-[1fr_1fr]"
            >
              <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-center gap-2">
                  <FaShieldAlt className="text-sky-500" />
                  <h2 className="text-xl font-black text-slate-900">
                    发件域名风控
                  </h2>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <div className="text-sm font-semibold text-slate-700">
                    当前发件邮箱
                  </div>
                  <div className="mt-2 break-all text-base font-bold text-slate-900">
                    {form.from}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleCheckDomainExemption}
                      disabled={checkingExemption}
                      className="rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {checkingExemption ? "检查中..." : "检查域名豁免"}
                    </button>
                  </div>
                </div>

                {domainExemptionStatus && (
                  <div
                    className={`mt-4 rounded-2xl p-4 text-sm ${
                      domainExemptionStatus.exempted
                        ? "bg-emerald-50 text-emerald-800"
                        : "bg-amber-50 text-amber-800"
                    }`}
                  >
                    <div className="font-bold">
                      {domainExemptionStatus.exempted ? "已豁免" : "未豁免"}
                    </div>
                    <div className="mt-1 leading-6">
                      {domainExemptionStatus.message || "无额外说明"}
                    </div>
                  </div>
                )}

                <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-sm font-semibold text-slate-700">
                    已配置发信域名
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {senderDomains.map((domain) => (
                      <span
                        key={domain}
                        className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200"
                      >
                        {domain}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-center gap-2">
                  <FaInfoCircle className="text-teal-500" />
                  <h2 className="text-xl font-black text-slate-900">
                    收件人域名检查
                  </h2>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <div className="text-sm font-semibold text-slate-700">
                    当前首个收件人
                  </div>
                  <div className="mt-2 break-all text-base font-bold text-slate-900">
                    {form.to.find((item) => item.trim()) || "尚未填写"}
                  </div>
                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={handleCheckRecipientWhitelist}
                      disabled={checkingRecipientWhitelist}
                      className="rounded-full bg-teal-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {checkingRecipientWhitelist
                        ? "检查中..."
                        : "检查收件人白名单"}
                    </button>
                  </div>
                </div>

                {recipientWhitelistStatus && (
                  <div
                    className={`mt-4 rounded-2xl p-4 text-sm ${
                      recipientWhitelistStatus.whitelisted
                        ? "bg-emerald-50 text-emerald-800"
                        : "bg-amber-50 text-amber-800"
                    }`}
                  >
                    <div className="font-bold">
                      {recipientWhitelistStatus.whitelisted
                        ? "白名单允许"
                        : "不在白名单"}
                    </div>
                    <div className="mt-1 leading-6">
                      {recipientWhitelistStatus.message || "无额外说明"}
                    </div>
                  </div>
                )}

                <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-sm font-semibold text-slate-700">
                    风险提示
                  </div>
                  <div className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
                    <p>1. 站内发信与公开外发的限流模型不同，不要混用理解。</p>
                    <p>2. 跳过白名单检查只能解决治理策略，不会绕过发件域名校验。</p>
                    <p>3. 公开外发的验证码错误优先检查域名对应记录，而不是默认环境变量。</p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === "templates" && (
            <motion.div
              key="templates"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -18 }}
              className="space-y-6"
            >
              <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-xl font-black text-slate-900">
                  常用邮件模板
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  可以在站内发信 HTML 模式直接插入这些模板。模板区保留在管理台，是为了让管理员在治理和发送之间少切页。
                </p>
                <div className="mt-6 grid gap-5 lg:grid-cols-2">
                  {htmlTemplates.map((template) => (
                    <div
                      key={template.name}
                      className="rounded-[24px] border border-slate-200 bg-slate-50 p-5"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-lg font-black text-slate-900">
                            {template.name}
                          </div>
                          <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                            {template.category}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveTab("internal");
                            setEmailMode("html");
                            insertHtmlTemplate(template.code);
                          }}
                          className="rounded-full bg-slate-900 px-4 py-2 text-xs font-bold text-white"
                        >
                          插入到发信台
                        </button>
                      </div>
                      <div
                        className="prose prose-sm mt-4 max-w-none overflow-hidden rounded-2xl bg-white p-4"
                        dangerouslySetInnerHTML={{
                          __html: DOMPurify.sanitize(template.code),
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-xl font-black text-slate-900">
                  管理台使用说明
                </h2>
                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <div className="mb-2 flex items-center gap-2 font-bold text-slate-900">
                      <FaCheckCircle className="text-emerald-500" />
                      站内发信
                    </div>
                    <div className="text-sm leading-6 text-slate-600">
                      管理员内部邮件统一走 `EmailService`，域名来源于已配置发信域名列表，适合账号通知、运营公告与定向触达。
                    </div>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <div className="mb-2 flex items-center gap-2 font-bold text-slate-900">
                      <FaGlobe className="text-teal-500" />
                      公开外发治理
                    </div>
                    <div className="text-sm leading-6 text-slate-600">
                      管理的是公开外发验证码、配额和公开链路状态。发送动作仍在 `/outemail` 页面完成，避免把策略管理和对外发送耦死。
                    </div>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <div className="mb-2 flex items-center gap-2 font-bold text-slate-900">
                      <FaShieldAlt className="text-sky-500" />
                      风控联查
                    </div>
                    <div className="text-sm leading-6 text-slate-600">
                      这里可以联查发件域名豁免、收件人白名单以及当前域名配置，便于定位“能不能发”和“为什么不能发”。
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default EmailSender;
