import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FiMail, FiMessageSquare, FiSend, FiX, FiLogIn } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import { ticketApi } from "../api/ticketApi";
import { useAuth } from "../hooks/useAuth";
import { cn } from "../utils/cn";
import { useNotification } from "./Notification";
import {
  studioDisplayFont,
  studioEyebrowClassName,
  studioFieldClassName,
  studioGhostButtonClassName,
  studioModalCardClassName,
  studioModalOverlayClassName,
  studioPrimaryButtonClassName,
  studioTextareaClassName,
} from "./studioTheme";

export const SUPPORT_EMAIL = "support@chloemlla.com";

export type PenaltyAppealKind =
  | "ip_ban"
  | "abuse_ban"
  | "ticket_moderation"
  | "ticket_permission_ban"
  | "account_suspended"
  | "generic";

export interface PenaltyAppealActionsProps {
  kind?: PenaltyAppealKind;
  reason?: string;
  details?: string;
  remainingText?: string;
  className?: string;
  compact?: boolean;
  defaultTicketTitle?: string;
  defaultTicketDescription?: string;
  /** false when ticket creation is blocked for this user */
  ticketChannelEnabled?: boolean;
  autoOpen?: boolean;
}

function buildDefaultTitle(kind: PenaltyAppealKind): string {
  switch (kind) {
    case "ip_ban":
      return "申诉：IP 访问限制";
    case "abuse_ban":
      return "申诉：人机验证临时封禁";
    case "ticket_moderation":
      return "申诉：工单内容审核处罚";
    case "ticket_permission_ban":
      return "申诉：工单权限封禁";
    case "account_suspended":
      return "申诉：账户已暂停";
    default:
      return "申诉：服务处罚/限制";
  }
}

function buildDefaultDescription(input: {
  kind: PenaltyAppealKind;
  reason?: string;
  details?: string;
  remainingText?: string;
}): string {
  const lines = [
    "【申诉说明】我认为本次处罚/限制可能存在误判，请人工复核。",
    "",
    `处罚类型: ${buildDefaultTitle(input.kind)}`,
  ];
  if (input.reason) lines.push(`原因: ${input.reason}`);
  if (input.remainingText) lines.push(`剩余/期限: ${input.remainingText}`);
  if (input.details) {
    lines.push("", "详情:", input.details);
  }
  lines.push("", "补充信息:", "1. 发生时间：", "2. 相关用户名/邮箱：", "3. 我认为误判的理由：");
  return lines.join("\n");
}

export const PenaltyAppealActions: React.FC<PenaltyAppealActionsProps> = ({
  kind = "generic",
  reason,
  details,
  remainingText,
  className,
  compact = false,
  defaultTicketTitle,
  defaultTicketDescription,
  ticketChannelEnabled = true,
  autoOpen = false,
}) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { setNotification } = useNotification();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const mailHref = useMemo(() => {
    const subject = encodeURIComponent(defaultTicketTitle || buildDefaultTitle(kind));
    const body = encodeURIComponent(
      defaultTicketDescription ||
        buildDefaultDescription({ kind, reason, details, remainingText }),
    );
    return `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
  }, [defaultTicketDescription, defaultTicketTitle, details, kind, reason, remainingText]);

  const openModal = () => {
    setTitle(defaultTicketTitle || buildDefaultTitle(kind));
    setDescription(
      defaultTicketDescription ||
        buildDefaultDescription({ kind, reason, details, remainingText }),
    );
    setOpen(true);
  };

  useEffect(() => {
    if (autoOpen) openModal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpen]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) {
      setNotification({
        type: "warning",
        title: "需要登录",
        message: "提交工单申诉需要先登录。你也可以先发送邮件申诉。",
        duration: 5000,
      });
      navigate("/login");
      return;
    }

    if (!title.trim() || !description.trim()) {
      setNotification({ type: "error", message: "请填写申诉标题和详细说明" });
      return;
    }

    setSubmitting(true);
    try {
      await ticketApi.createTicket({
        title: title.trim(),
        description: description.trim(),
        priority: "high",
      });
      setNotification({
        type: "success",
        title: "申诉工单已提交",
        message: "我们会尽快人工处理。你也可以同时发送邮件到 support@chloemlla.com。",
        duration: 5000,
      });
      setOpen(false);
      navigate("/support");
    } catch (error: unknown) {
      const response =
        error && typeof error === "object" && "response" in error
          ? (error as { response?: { status?: number; data?: Record<string, unknown> } }).response
          : undefined;
      const data = response?.data || {};
      const errorText =
        typeof data.error === "string"
          ? data.error
          : typeof data.message === "string"
            ? data.message
            : "提交申诉工单失败";
      const punishment = typeof data.punishment === "string" ? data.punishment : undefined;
      const detailText = typeof data.details === "string" ? data.details : undefined;

      setNotification({
        type: "error",
        title: errorText,
        message:
          punishment ||
          detailText ||
          "若工单通道暂不可用，请改用邮件 support@chloemlla.com 申诉。",
        details: detailText ? detailText.split("\n") : undefined,
        duration: 7000,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div
        className={cn(
          compact
            ? "rounded-xl border border-rose-200/80 bg-rose-50/80 px-3 py-2"
            : "rounded-[22px] border border-rose-200 bg-rose-50/70 p-4",
          className,
        )}
      >
        <div className={cn(studioEyebrowClassName, compact ? "mb-1 text-[10px]" : "mb-2")}>
          Appeal Options
        </div>
        <p className={cn(compact ? "text-[11px] leading-4 text-rose-800" : "text-sm leading-6 text-rose-900")}>
          {kind === "ticket_permission_ban"
            ? "如对本次处罚有异议，请优先发送邮件申诉；工单权限被封时系统可能暂时拒绝新建工单。"
            : "如对本次处罚有异议，可通过邮件或工单申诉。"}
        </p>
        <div className={cn("mt-3 flex flex-wrap gap-2", compact && "mt-2")}>
          <a
            href={mailHref}
            className={cn(
              studioGhostButtonClassName,
              compact ? "px-3 py-2 text-xs" : "px-4 py-2.5 text-sm",
              "border-rose-200 bg-white text-rose-700 hover:border-rose-300",
            )}
          >
            <FiMail />
            {SUPPORT_EMAIL}
          </a>
          {ticketChannelEnabled && kind !== "ticket_permission_ban" ? (
            <button
              type="button"
              onClick={openModal}
              className={cn(
                studioPrimaryButtonClassName,
                compact ? "px-3 py-2 text-xs" : "px-4 py-2.5 text-sm",
              )}
            >
              <FiMessageSquare />
              提交工单申诉
            </button>
          ) : (
            <span className={cn(compact ? "text-[11px] text-rose-700" : "text-sm text-rose-700")}>
              工单通道不可用，请使用邮箱申诉
            </span>
          )}
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            className={studioModalOverlayClassName}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => !submitting && setOpen(false)}
          >
            <motion.div
              className={cn(studioModalCardClassName, "max-w-xl")}
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-5 flex items-start justify-between gap-3">
                <div>
                  <div className={studioEyebrowClassName}>Support Appeal</div>
                  <h3
                    className="mt-1 text-xl font-semibold text-slate-900"
                    style={{ fontFamily: studioDisplayFont }}
                  >
                    提交工单申诉
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    也可直接邮件联系 {SUPPORT_EMAIL}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => !submitting && setOpen(false)}
                  className="rounded-xl border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50"
                  aria-label="关闭"
                >
                  <FiX />
                </button>
              </div>

              {!user ? (
                <div className="space-y-4">
                  <div className="rounded-[20px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
                    提交工单需要登录。你可先登录后再申诉，或直接发送邮件。
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => navigate("/login")}
                      className={cn(studioPrimaryButtonClassName, "flex-1")}
                    >
                      <FiLogIn />
                      去登录
                    </button>
                    <a
                      href={mailHref}
                      className={cn(studioGhostButtonClassName, "flex-1 justify-center px-4 py-3")}
                    >
                      <FiMail />
                      发送邮件
                    </a>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  {kind === "ticket_permission_ban" && (
                    <div className="rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
                      当前工单权限可能已被限制。若提交失败，请直接邮件联系 {SUPPORT_EMAIL}。
                    </div>
                  )}
                  <div>
                    <label className={cn(studioEyebrowClassName, "mb-2 block")}>申诉标题</label>
                    <input
                      type="text"
                      required
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      className={studioFieldClassName}
                      disabled={submitting}
                    />
                  </div>
                  <div>
                    <label className={cn(studioEyebrowClassName, "mb-2 block")}>详细说明</label>
                    <textarea
                      required
                      rows={8}
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      className={studioTextareaClassName}
                      disabled={submitting}
                    />
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <button
                      type="submit"
                      disabled={submitting}
                      className={cn(studioPrimaryButtonClassName, "flex-1")}
                    >
                      <FiSend />
                      {submitting ? "提交中..." : "提交工单"}
                    </button>
                    <a
                      href={mailHref}
                      className={cn(studioGhostButtonClassName, "justify-center px-5 py-3.5")}
                    >
                      <FiMail />
                      邮件申诉
                    </a>
                  </div>
                </form>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default PenaltyAppealActions;
