import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FaCopy, FaPlus, FaSyncAlt, FaTicketAlt, FaTrash } from "react-icons/fa";
import { api } from "../api/api";
import { useNotification } from "./Notification";

interface RegistrationInvite {
  id: string;
  code: string;
  note: string;
  active: boolean;
  maxUses: number;
  usedCount: number;
  remainingUses: number;
  createdByUsername?: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  expired: boolean;
  usedBy: {
    userId: string;
    username: string;
    email: string;
    usedAt: string;
  }[];
}

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200";
const buttonClass =
  "inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60";

function formatDate(value: string | null): string {
  if (!value) return "不限";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "不限";
  return date.toLocaleString("zh-CN", { hour12: false });
}

function toLocalDatetimeInput(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

type InviteEditDraft = {
  maxUses: string;
  expiresAt: string;
};

const buildInviteDraft = (invite: RegistrationInvite): InviteEditDraft => ({
  maxUses: String(invite.maxUses),
  expiresAt: toLocalDatetimeInput(invite.expiresAt),
});

const RegistrationInviteManager: React.FC = () => {
  const { setNotification } = useNotification();
  const [invites, setInvites] = useState<RegistrationInvite[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [editDrafts, setEditDrafts] = useState<Record<string, InviteEditDraft>>({});
  const [form, setForm] = useState({ code: "", note: "", maxUses: "1", expiresAt: "" });
  const activeCount = useMemo(
    () => invites.filter((invite) => invite.active && !invite.expired && invite.remainingUses > 0).length,
    [invites],
  );

  const loadInvites = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get("/api/admin/registration-invites");
      const nextInvites = response.data?.invites || [];
      setInvites(nextInvites);
      setEditDrafts(Object.fromEntries(nextInvites.map((invite: RegistrationInvite) => [invite.id, buildInviteDraft(invite)])));
    } catch (error: any) {
      setNotification({ type: "error", message: error?.response?.data?.error || "获取邀请码列表失败" });
    } finally {
      setLoading(false);
    }
  }, [setNotification]);

  useEffect(() => {
    void loadInvites();
  }, [loadInvites]);

  const createInvite = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = {
        code: form.code.trim() || undefined,
        note: form.note.trim(),
        maxUses: Number(form.maxUses) || 1,
        expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
      };
      const response = await api.post("/api/admin/registration-invites", payload);
      const invite = response.data.invite as RegistrationInvite;
      setInvites((current) => [invite, ...current]);
      setEditDrafts((current) => ({ ...current, [invite.id]: buildInviteDraft(invite) }));
      setForm({ code: "", note: "", maxUses: "1", expiresAt: "" });
      setNotification({ type: "success", message: "邀请码已创建" });
    } catch (error: any) {
      setNotification({ type: "error", message: error?.response?.data?.error || "创建邀请码失败" });
    } finally {
      setSaving(false);
    }
  };

  const updateInvite = async (invite: RegistrationInvite, updates: Partial<RegistrationInvite>) => {
    setUpdatingId(invite.id);
    try {
      const payload = {
        ...updates,
        expiresAt: Object.prototype.hasOwnProperty.call(updates, "expiresAt") ? updates.expiresAt : undefined,
      };
      const response = await api.patch(`/api/admin/registration-invites/${invite.id}`, payload);
      const nextInvite = response.data.invite as RegistrationInvite;
      setInvites((current) => current.map((item) => (item.id === invite.id ? nextInvite : item)));
      setEditDrafts((current) => ({ ...current, [invite.id]: buildInviteDraft(nextInvite) }));
      setNotification({ type: "success", message: "邀请码已更新" });
    } catch (error: any) {
      setNotification({ type: "error", message: error?.response?.data?.error || "更新邀请码失败" });
    } finally {
      setUpdatingId(null);
    }
  };

  const updateInviteDraft = (inviteId: string, patch: Partial<InviteEditDraft>) => {
    setEditDrafts((current) => ({
      ...current,
      [inviteId]: {
        ...(current[inviteId] || { maxUses: "1", expiresAt: "" }),
        ...patch,
      },
    }));
  };

  const saveInviteDraft = async (invite: RegistrationInvite) => {
    const draft = editDrafts[invite.id] || buildInviteDraft(invite);
    const nextMaxUses = Math.max(invite.usedCount || 1, Number(draft.maxUses) || 1);
    const nextExpiresAt = draft.expiresAt ? new Date(draft.expiresAt).toISOString() : null;
    const currentExpiresAt = invite.expiresAt ? new Date(invite.expiresAt).toISOString() : null;
    const maxUsesChanged = nextMaxUses !== invite.maxUses;
    const expiresChanged = nextExpiresAt !== currentExpiresAt;

    if (!maxUsesChanged && !expiresChanged) {
      setNotification({ type: "info", message: "没有需要保存的更改" });
      return;
    }

    await updateInvite(invite, {
      ...(maxUsesChanged ? { maxUses: nextMaxUses } : {}),
      ...(expiresChanged ? { expiresAt: nextExpiresAt } : {}),
    } as Partial<RegistrationInvite>);
  };

  const isInviteDraftDirty = (invite: RegistrationInvite) => {
    const draft = editDrafts[invite.id] || buildInviteDraft(invite);
    const nextMaxUses = Math.max(invite.usedCount || 1, Number(draft.maxUses) || 1);
    const nextExpiresAt = draft.expiresAt ? new Date(draft.expiresAt).toISOString() : null;
    const currentExpiresAt = invite.expiresAt ? new Date(invite.expiresAt).toISOString() : null;
    return nextMaxUses !== invite.maxUses || nextExpiresAt !== currentExpiresAt;
  };

  const deleteInvite = async (invite: RegistrationInvite) => {
    if (!window.confirm(`确认删除邀请码 ${invite.code}？`)) return;
    try {
      await api.delete(`/api/admin/registration-invites/${invite.id}`);
      setInvites((current) => current.filter((item) => item.id !== invite.id));
      setEditDrafts((current) => {
        const next = { ...current };
        delete next[invite.id];
        return next;
      });
      setNotification({ type: "success", message: "邀请码已删除" });
    } catch (error: any) {
      setNotification({ type: "error", message: error?.response?.data?.error || "删除邀请码失败" });
    }
  };

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setNotification({ type: "success", message: "邀请码已复制" });
    } catch {
      setNotification({ type: "warning", message: "复制失败，请手动复制" });
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
            <FaTicketAlt />
            Registration Invites
          </div>
          <h2 className="mt-2 text-xl font-semibold text-slate-900">注册邀请码</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            管理本地账号注册使用的邀请码；设置 `REGISTRATION_INVITE_REQUIRED=true` 后，注册必须提供有效邀请码。
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadInvites()}
          className={`${buttonClass} border border-slate-200 bg-white text-slate-700 hover:border-slate-300`}
          disabled={loading}
        >
          <FaSyncAlt className={loading ? "animate-spin" : ""} />
          刷新
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-xs font-semibold text-slate-500">总数</div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">{invites.length}</div>
        </div>
        <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-4">
          <div className="text-xs font-semibold text-emerald-700">可用</div>
          <div className="mt-2 text-2xl font-semibold text-emerald-800">{activeCount}</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-xs font-semibold text-slate-500">已使用</div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">
            {invites.reduce((sum, invite) => sum + invite.usedCount, 0)}
          </div>
        </div>
      </div>

      <form onSubmit={createInvite} className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_1.4fr_0.7fr_1fr_auto] lg:items-end">
          <label className="block">
            <span className="text-xs font-semibold text-slate-600">邀请码</span>
            <input
              className={`${inputClass} mt-1 font-mono uppercase`}
              value={form.code}
              maxLength={32}
              placeholder="留空自动生成"
              onChange={(event) => setForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))}
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-slate-600">备注</span>
            <input
              className={`${inputClass} mt-1`}
              value={form.note}
              maxLength={200}
              placeholder="用途或发放对象"
              onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-slate-600">次数</span>
            <input
              className={`${inputClass} mt-1`}
              type="number"
              min={1}
              max={10000}
              value={form.maxUses}
              onChange={(event) => setForm((current) => ({ ...current, maxUses: event.target.value }))}
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-slate-600">过期时间</span>
            <input
              className={`${inputClass} mt-1`}
              type="datetime-local"
              value={form.expiresAt}
              onChange={(event) => setForm((current) => ({ ...current, expiresAt: event.target.value }))}
            />
          </label>
          <button
            type="submit"
            disabled={saving}
            className={`${buttonClass} bg-slate-900 text-white hover:bg-slate-800`}
          >
            <FaPlus />
            创建
          </button>
        </div>
      </form>

      <div className="space-y-3">
        {loading && <div className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600">正在加载...</div>}
        {!loading && invites.length === 0 && (
          <div className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600">暂无邀请码。</div>
        )}
        {invites.map((invite) => (
          <div key={invite.id} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-sm font-semibold text-slate-900">
                    {invite.code}
                  </code>
                  <button
                    type="button"
                    onClick={() => void copyCode(invite.code)}
                    className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:text-slate-900"
                    aria-label="复制邀请码"
                  >
                    <FaCopy />
                  </button>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      invite.active && !invite.expired && invite.remainingUses > 0
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {invite.active ? (invite.expired ? "已过期" : "启用") : "停用"}
                  </span>
                </div>
                <div className="mt-2 text-sm text-slate-600">{invite.note || "无备注"}</div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                  <span>已用 {invite.usedCount}/{invite.maxUses}</span>
                  <span>剩余 {invite.remainingUses}</span>
                  <span>过期 {formatDate(invite.expiresAt)}</span>
                  <span>创建人 {invite.createdByUsername || "未知"}</span>
                </div>
              </div>

              {(() => {
                const draft = editDrafts[invite.id] || buildInviteDraft(invite);
                const isUpdating = updatingId === invite.id;
                const dirty = isInviteDraftDirty(invite);
                return (
                  <div className="grid gap-2 sm:grid-cols-[120px_190px_auto_auto_auto]">
                    <input
                      className={inputClass}
                      type="number"
                      min={Math.max(1, invite.usedCount)}
                      max={10000}
                      value={draft.maxUses}
                      onChange={(event) => updateInviteDraft(invite.id, { maxUses: event.target.value })}
                      disabled={isUpdating}
                      aria-label="最大使用次数"
                    />
                    <input
                      className={inputClass}
                      type="datetime-local"
                      value={draft.expiresAt}
                      onChange={(event) => updateInviteDraft(invite.id, { expiresAt: event.target.value })}
                      disabled={isUpdating}
                      aria-label="过期时间"
                    />
                    <button
                      type="button"
                      onClick={() => void saveInviteDraft(invite)}
                      disabled={isUpdating || !dirty}
                      className={`${buttonClass} border border-slate-200 bg-white text-slate-700 hover:border-slate-300`}
                    >
                      {isUpdating ? "保存中" : "保存"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void updateInvite(invite, { active: !invite.active })}
                      disabled={isUpdating}
                      className={`${buttonClass} border border-slate-200 bg-white text-slate-700 hover:border-slate-300`}
                    >
                      {invite.active ? "停用" : "启用"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteInvite(invite)}
                      disabled={isUpdating}
                      className={`${buttonClass} border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100`}
                    >
                      <FaTrash />
                      删除
                    </button>
                  </div>
                );
              })()}
            </div>

            {invite.usedBy.length > 0 && (
              <div className="mt-4 overflow-x-auto rounded-lg border border-slate-100">
                <table className="min-w-full divide-y divide-slate-100 text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-semibold">用户</th>
                      <th className="px-3 py-2 font-semibold">邮箱</th>
                      <th className="px-3 py-2 font-semibold">使用时间</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {invite.usedBy.map((item) => (
                      <tr key={`${invite.id}-${item.userId}-${item.usedAt}`}>
                        <td className="px-3 py-2 text-slate-700">{item.username}</td>
                        <td className="px-3 py-2 text-slate-500">{item.email}</td>
                        <td className="px-3 py-2 text-slate-500">{formatDate(item.usedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default RegistrationInviteManager;
