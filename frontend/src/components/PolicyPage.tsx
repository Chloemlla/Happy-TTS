import React from 'react';
import { motion } from 'framer-motion';
import {
  FaAddressBook,
  FaBalanceScale,
  FaBan,
  FaCheckCircle,
  FaCopyright,
  FaEnvelope,
  FaExclamationTriangle,
  FaFileAlt,
  FaFileAudio,
  FaGavel,
  FaGlobe,
  FaInfoCircle,
  FaLock,
  FaServer,
  FaShieldAlt,
  FaUserSecret,
  FaUserShield,
  FaVolumeUp,
} from 'react-icons/fa';
import type { IconType } from 'react-icons';
import {
  InfoBadge,
  InfoPanel,
  InfoQueryHero,
  InfoQueryShell,
  InfoSectionTitle,
} from './InfoQueryScaffold';

const getErrorMessage = (error: any) => {
  if (!error) return null;
  let msg = '加载失败，请刷新页面或重新登录。';
  if (typeof error === 'string') msg += `\n详细信息：${error}`;
  else if (error && error.message) msg += `\n详细信息：${error.message}`;
  return msg;
};

interface PolicySection {
  title: string;
  icon: IconType;
  tone: 'sky' | 'emerald' | 'amber' | 'violet' | 'slate' | 'rose';
  summary: string;
  items: string[];
}

const policySections: PolicySection[] = [
  {
    title: '服务简介',
    icon: FaInfoCircle,
    tone: 'sky',
    summary: 'Happy 文本转语音服务用于将文字快速转换为语音，并提供基础的账户、资源与安全能力。',
    items: [
      '用户应在合法范围内使用文本转语音、资源下载、翻译与相关工具。',
      '平台会按照业务需要处理必要的账户、使用与系统信息。',
      '平台将尽合理努力保护用户信息与服务稳定性。',
    ],
  },
  {
    title: '服务内容',
    icon: FaFileAudio,
    tone: 'emerald',
    summary: '服务包含文本输入、语音生成、个性化参数、文件下载与多语言支持。',
    items: [
      '支持粘贴或键入文本，选择声音、语速、音调等参数。',
      '支持生成语音文件并下载，用于合法、合规的个人使用场景。',
      '高级功能、资源商店与第三方集成可能受账户状态、配置或权限限制。',
    ],
  },
  {
    title: '法律合规与权利声明',
    icon: FaBalanceScale,
    tone: 'amber',
    summary: '平台遵循适用的网络安全、个人信息保护、数据保护与儿童隐私相关规则。',
    items: [
      '用户的个人信息会在业务目的范围内处理，未经授权不会用于无关用途。',
      '用户有权了解、访问、更正或删除其个人信息，具体以平台支持能力和法律要求为准。',
      '13 岁以下儿童不得注册或使用本服务。',
    ],
  },
  {
    title: '用户权利与义务',
    icon: FaUserShield,
    tone: 'violet',
    summary: '用户可以在遵守协议的前提下使用服务，同时需要承担账户、内容与安全责任。',
    items: [
      '用户应保证上传、转换或分享的内容不违反法律法规或侵犯他人权益。',
      '不得利用服务生成恶意、侵权、色情暴力、恐怖主义、虚假误导或其他不当内容。',
      '不得攻击服务器、绕过安全策略、恶意刷量或干扰服务正常运行。',
      '用户应妥善保管账户凭据，发现异常应及时联系支持渠道。',
    ],
  },
  {
    title: '服务器托管与数据跨境',
    icon: FaServer,
    tone: 'slate',
    summary: '服务可能使用中国大陆、美国或其他地区的云服务与边缘节点。',
    items: [
      '部分数据可能因服务部署、日志、备份或网络加速在不同地区处理。',
      '平台会采取加密、访问控制、日志审计等措施降低数据安全风险。',
      '第三方服务的可用性、合法性和安全性由第三方承担相应责任。',
    ],
  },
  {
    title: '版权声明',
    icon: FaCopyright,
    tone: 'slate',
    summary: '平台内音频、文本、资源、界面与附加材料受相应权利保护。',
    items: [
      '未经授权不得复制、分发、改编或用于侵犯权利人的行为。',
      '用户生成内容的使用应遵守适用法律和第三方授权规则。',
      '平台仅接受技术问题反馈，不保证接受对政策或服务管理的评论。',
    ],
  },
  {
    title: '隐私政策',
    icon: FaUserSecret,
    tone: 'sky',
    summary: '平台会收集必要的使用数据、反馈、系统信息和安全风控信息。',
    items: [
      '收集信息用于提供服务、排查故障、改进体验、安全防护与合规审计。',
      '平台不会在未经授权的情况下将个人信息用于无关目的。',
      '在法律法规要求、执法协助或安全事件处理场景下，平台可能依法披露必要信息。',
    ],
  },
  {
    title: '账户管理与数据所有权声明',
    icon: FaLock,
    tone: 'amber',
    summary: '账户由用户持有，但平台保留为维护服务、安全与合规而管理账户数据的必要权限。',
    items: [
      '平台可基于安全、违规、系统负载或管理需要限制、暂停或终止部分服务。',
      '用户应自行备份重要数据，平台不承诺对所有数据提供永久保存。',
      '如用户联系客服处理账户问题，平台可能要求身份核验或采取账户处置措施。',
    ],
  },
  {
    title: '使用须知与违规处理',
    icon: FaBan,
    tone: 'rose',
    summary: '违规使用会导致服务限制、账号封禁、数据归档或依法配合调查。',
    items: [
      '禁止生成政治敏感、民族歧视、色情、暴力、恐怖主义、侵权或虚假误导内容。',
      '发现违法违规行为，平台可立即停止服务、封禁账号并保留追究责任的权利。',
      '因用户违规造成的后果由用户自行承担。',
    ],
  },
];

const warningSections = [
  {
    title: '重要授权撤销声明',
    icon: FaExclamationTriangle,
    body: '如需撤销对服务条款与隐私政策的授权，请通过官方联系方式联系平台。撤销授权可能导致账户删除、数据归档或其他不可逆处理。',
  },
  {
    title: '用户评论与法律风险声明',
    icon: FaGavel,
    body: '用户应通过官方渠道反馈技术问题。任何可能对平台造成舆论、合规或法律风险的行为，可能需要承担相应后果。',
  },
];

const PolicyPage: React.FC<{ error?: any }> = ({ error }) => {
  const errorMsg = getErrorMessage(error);

  return (
    <InfoQueryShell>
      <div className="space-y-6">
        <InfoQueryHero
          eyebrow="Terms And Privacy"
          title="服务条款与隐私政策"
          description="Happy 文本转语音服务的使用规则、隐私处理、用户义务、安全限制与联系方式集中说明。"
          icon={FaVolumeUp}
          tone="slate"
          meta={(
            <>
              <InfoBadge tone="slate">条款说明</InfoBadge>
              <InfoBadge tone="sky">隐私政策</InfoBadge>
              <InfoBadge tone="rose">风险提示</InfoBadge>
            </>
          )}
        />

        {errorMsg && (
          <InfoPanel compact className="border-rose-200 bg-rose-50/85">
            <div className="flex items-start gap-3 text-rose-800">
              <FaExclamationTriangle className="mt-1 shrink-0" />
              <div className="whitespace-pre-line text-sm leading-6">{errorMsg}</div>
            </div>
          </InfoPanel>
        )}

        <InfoPanel>
          <InfoSectionTitle
            title="阅读摘要"
            description="以下摘要帮助快速定位条款主题，完整内容请按章节阅读。"
            icon={FaFileAlt}
            tone="slate"
          />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-[24px] border border-slate-200 bg-white/80 p-4">
              <FaShieldAlt className="text-sky-600" />
              <h3 className="mt-3 font-semibold text-slate-950">安全与合规</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">平台会进行必要的安全防护、风控、日志记录与违规处理。</p>
            </div>
            <div className="rounded-[24px] border border-slate-200 bg-white/80 p-4">
              <FaCheckCircle className="text-emerald-600" />
              <h3 className="mt-3 font-semibold text-slate-950">用户权益</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">用户可依法管理个人信息，并在合规范围内使用服务。</p>
            </div>
            <div className="rounded-[24px] border border-slate-200 bg-white/80 p-4">
              <FaExclamationTriangle className="text-rose-600" />
              <h3 className="mt-3 font-semibold text-slate-950">责任边界</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">违规内容、账户泄露、第三方服务与不可抗力风险由相应责任方承担。</p>
            </div>
          </div>
        </InfoPanel>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {policySections.map((section, index) => {
            const Icon = section.icon;
            return (
              <motion.section
                key={section.title}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22, delay: index * 0.03 }}
              >
                <InfoPanel className="h-full">
                  <InfoSectionTitle
                    title={section.title}
                    description={section.summary}
                    icon={Icon}
                    tone={section.tone}
                  />
                  <ul className="space-y-3 text-sm leading-6 text-slate-600">
                    {section.items.map((item) => (
                      <li key={item} className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-white/65 p-3 text-slate-600">
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </InfoPanel>
              </motion.section>
            );
          })}
        </div>

        <InfoPanel className="border-rose-100">
          <InfoSectionTitle
            title="重点风险提示"
            description="以下条款涉及账户、授权和平台责任边界，请重点阅读。"
            icon={FaExclamationTriangle}
            tone="rose"
          />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {warningSections.map((section) => {
              const Icon = section.icon;
              return (
                <div key={section.title} className="rounded-[26px] border border-rose-200 bg-rose-50/75 p-5 text-rose-800">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[20px] bg-white text-rose-700 ring-1 ring-rose-100">
                      <Icon />
                    </div>
                    <div>
                      <h3 className="font-semibold">{section.title}</h3>
                      <p className="mt-2 text-sm leading-7">{section.body}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </InfoPanel>

        <InfoPanel>
          <InfoSectionTitle
            title="联系方式"
            description="如需咨询、反馈技术问题或处理授权撤销，请使用官方邮件。"
            icon={FaAddressBook}
            tone="sky"
          />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <a
              href="mailto:support@chloemlla.com"
              className="rounded-[24px] border border-slate-200 bg-white/80 p-4 transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="flex items-center gap-3">
                <FaEnvelope className="text-sky-600" />
                <div>
                  <div className="font-semibold text-slate-950">用户支持</div>
                  <div className="text-sm text-slate-600">support@chloemlla.com</div>
                </div>
              </div>
            </a>
            <a
              href="mailto:admin@chloemlla.com"
              className="rounded-[24px] border border-slate-200 bg-white/80 p-4 transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="flex items-center gap-3">
                <FaGlobe className="text-slate-600" />
                <div>
                  <div className="font-semibold text-slate-950">平台管理</div>
                  <div className="text-sm text-slate-600">admin@chloemlla.com</div>
                </div>
              </div>
            </a>
          </div>
        </InfoPanel>
      </div>
    </InfoQueryShell>
  );
};

export default PolicyPage;
