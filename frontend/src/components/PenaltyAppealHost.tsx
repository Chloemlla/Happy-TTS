import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { FiMail, FiMessageSquare, FiX } from 'react-icons/fi';
import { PenaltyAppealActions, SUPPORT_EMAIL, type PenaltyAppealKind } from './PenaltyAppealActions';
import {
  onPenaltyAppealRequired,
  type PenaltyAppealPayload,
} from '../utils/penaltyAppeal';
import { cn } from '../utils/cn';
import {
  studioDisplayFont,
  studioEyebrowClassName,
  studioGhostButtonClassName,
  studioModalCardClassName,
  studioModalOverlayClassName,
  studioPrimaryButtonClassName,
} from './studioTheme';

function buildMailHref(payload: PenaltyAppealPayload): string {
  const subject = encodeURIComponent(payload.title || '申诉：服务处罚/限制');
  const bodyLines = [
    '【申诉说明】我认为本次处罚/限制可能存在误判，请人工复核。',
    '',
    `处罚类型: ${payload.title || payload.kind}`,
  ];
  if (payload.reason) bodyLines.push(`原因: ${payload.reason}`);
  if (payload.remainingText) bodyLines.push(`剩余/期限: ${payload.remainingText}`);
  if (payload.details) {
    bodyLines.push('', '详情:', payload.details);
  }
  bodyLines.push('', '补充信息:', '1. 发生时间：', '2. 相关用户名/邮箱：', '3. 我认为误判的理由：');
  const body = encodeURIComponent(bodyLines.join('\n'));
  const email = payload.supportEmail || SUPPORT_EMAIL;
  return `mailto:${email}?subject=${subject}&body=${body}`;
}

export const PenaltyAppealHost: React.FC = () => {
  const [payload, setPayload] = useState<PenaltyAppealPayload | null>(null);
  const [showTicketForm, setShowTicketForm] = useState(false);

  useEffect(() => {
    return onPenaltyAppealRequired((next) => {
      setPayload(next);
      setShowTicketForm(false);
    });
  }, []);

  const ticketEnabled = payload?.ticketChannelEnabled !== false && payload?.kind !== 'ticket_permission_ban';
  const mailHref = useMemo(() => (payload ? buildMailHref(payload) : `mailto:${SUPPORT_EMAIL}`), [payload]);
  const supportEmail = payload?.supportEmail || SUPPORT_EMAIL;

  if (!payload) return null;

  return (
    <AnimatePresence>
      {payload && (
        <motion.div
          className={studioModalOverlayClassName}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setPayload(null)}
        >
          <motion.div
            className={cn(studioModalCardClassName, 'max-w-xl')}
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <div className={studioEyebrowClassName}>Penalty Appeal</div>
                <h3
                  className="mt-1 text-xl font-semibold text-slate-900"
                  style={{ fontFamily: studioDisplayFont }}
                >
                  {payload.title || '需要申诉'}
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {payload.reason || '当前权限受限，请通过下方方式联系支持。'}
                </p>
                {payload.details && (
                  <div className="mt-3 whitespace-pre-line rounded-[18px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-900">
                    {payload.details}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setPayload(null)}
                className="rounded-xl border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50"
                aria-label="关闭"
              >
                <FiX />
              </button>
            </div>

            {!ticketEnabled ? (
              <div className="space-y-4">
                <div className="rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
                  工单权限当前不可用，请通过支持邮箱申诉。
                </div>
                <a
                  href={mailHref}
                  className={cn(studioPrimaryButtonClassName, 'w-full justify-center')}
                >
                  <FiMail />
                  发送邮件到 {supportEmail}
                </a>
                <button
                  type="button"
                  onClick={() => setPayload(null)}
                  className={cn(studioGhostButtonClassName, 'w-full justify-center')}
                >
                  我知道了
                </button>
              </div>
            ) : showTicketForm ? (
              <div className="space-y-4">
                <PenaltyAppealActions
                  kind={(payload.kind || 'account_suspended') as PenaltyAppealKind}
                  reason={payload.reason}
                  details={payload.details}
                  remainingText={payload.remainingText}
                  defaultTicketTitle={payload.title}
                />
                <button
                  type="button"
                  onClick={() => setShowTicketForm(false)}
                  className={cn(studioGhostButtonClassName, 'w-full justify-center')}
                >
                  返回申诉选项
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm leading-6 text-slate-600">
                  你可以通过支持邮箱或提交工单进行申诉。
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <a
                    href={mailHref}
                    className={cn(studioGhostButtonClassName, 'flex-1 justify-center border-rose-200 bg-white text-rose-700 hover:border-rose-300')}
                  >
                    <FiMail />
                    {supportEmail}
                  </a>
                  <button
                    type="button"
                    onClick={() => setShowTicketForm(true)}
                    className={cn(studioPrimaryButtonClassName, 'flex-1 justify-center')}
                  >
                    <FiMessageSquare />
                    提交工单申诉
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setPayload(null)}
                  className={cn(studioGhostButtonClassName, 'w-full justify-center')}
                >
                  稍后再说
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default PenaltyAppealHost;
