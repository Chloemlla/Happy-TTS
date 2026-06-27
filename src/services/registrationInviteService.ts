import crypto from "node:crypto";
import { RegistrationInviteModel, type RegistrationInviteDoc } from "../models/registrationInviteModel";

const CODE_PATTERN = /^[A-Z0-9_-]{4,32}$/;

export interface RegistrationInviteSummary {
  id: string;
  code: string;
  note: string;
  active: boolean;
  maxUses: number;
  usedCount: number;
  remainingUses: number;
  createdBy?: string;
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

export interface InviteActor {
  id?: string;
  username?: string;
}

export interface ConsumeInviteUser {
  id: string;
  username: string;
  email: string;
}

export function normalizeInviteCode(input: unknown): string {
  return typeof input === "string" ? input.trim().toUpperCase() : "";
}

export function isRegistrationInviteRequired(): boolean {
  return process.env.REGISTRATION_INVITE_REQUIRED === "true";
}

function generateInviteCode(): string {
  return crypto.randomBytes(9).toString("base64url").replace(/-/g, "").replace(/_/g, "").slice(0, 12).toUpperCase();
}

function parsePositiveInteger(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(10000, Math.floor(parsed)));
}

function parseExpiry(value: unknown): Date | null {
  if (value === undefined || value === null || value === "") return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    throw new Error("过期时间格式不正确");
  }
  if (date.getTime() <= Date.now()) {
    throw new Error("过期时间必须晚于当前时间");
  }
  return date;
}

function isExpired(invite: Pick<RegistrationInviteDoc, "expiresAt">): boolean {
  return Boolean(invite.expiresAt && invite.expiresAt.getTime() <= Date.now());
}

function toSummary(invite: RegistrationInviteDoc & { _id?: any }): RegistrationInviteSummary {
  const expired = isExpired(invite);
  const remainingUses = Math.max(0, invite.maxUses - invite.usedCount);
  return {
    id: String((invite as any)._id),
    code: invite.code,
    note: invite.note || "",
    active: invite.active,
    maxUses: invite.maxUses,
    usedCount: invite.usedCount,
    remainingUses,
    createdBy: invite.createdBy,
    createdByUsername: invite.createdByUsername,
    createdAt: invite.createdAt.toISOString(),
    updatedAt: invite.updatedAt.toISOString(),
    expiresAt: invite.expiresAt ? invite.expiresAt.toISOString() : null,
    expired,
    usedBy: (invite.usedBy || []).map((item) => ({
      userId: item.userId,
      username: item.username,
      email: item.email,
      usedAt: item.usedAt.toISOString(),
    })),
  };
}

export async function listRegistrationInvites(): Promise<RegistrationInviteSummary[]> {
  const invites = await RegistrationInviteModel.find({}).sort({ createdAt: -1 }).lean(false).exec();
  return invites.map((invite) => toSummary(invite as any));
}

export async function createRegistrationInvite(
  input: { code?: unknown; note?: unknown; maxUses?: unknown; active?: unknown; expiresAt?: unknown },
  actor: InviteActor,
): Promise<RegistrationInviteSummary> {
  const code = normalizeInviteCode(input.code) || generateInviteCode();
  if (!CODE_PATTERN.test(code)) {
    throw new Error("邀请码只能包含 4-32 位大写字母、数字、下划线或短横线");
  }

  const existing = await RegistrationInviteModel.findOne({ code: { $eq: code } }).lean().exec();
  if (existing) {
    throw new Error("邀请码已存在");
  }

  const invite = await RegistrationInviteModel.create({
    code,
    note: typeof input.note === "string" ? input.note.trim().slice(0, 200) : "",
    active: input.active === undefined ? true : Boolean(input.active),
    maxUses: parsePositiveInteger(input.maxUses, 1),
    usedCount: 0,
    usedBy: [],
    createdBy: actor.id,
    createdByUsername: actor.username,
    expiresAt: parseExpiry(input.expiresAt),
  });

  return toSummary(invite as any);
}

export async function updateRegistrationInvite(
  id: string,
  input: { note?: unknown; maxUses?: unknown; active?: unknown; expiresAt?: unknown },
): Promise<RegistrationInviteSummary | null> {
  const invite = await RegistrationInviteModel.findById(id).exec();
  if (!invite) return null;

  if (input.note !== undefined) {
    invite.note = typeof input.note === "string" ? input.note.trim().slice(0, 200) : "";
  }
  if (input.active !== undefined) {
    invite.active = Boolean(input.active);
  }
  if (input.maxUses !== undefined) {
    const nextMaxUses = parsePositiveInteger(input.maxUses, invite.maxUses);
    if (nextMaxUses < invite.usedCount) {
      throw new Error("最大使用次数不能小于已使用次数");
    }
    invite.maxUses = nextMaxUses;
  }
  if (Object.prototype.hasOwnProperty.call(input, "expiresAt")) {
    invite.expiresAt = parseExpiry(input.expiresAt);
  }

  await invite.save();
  return toSummary(invite as any);
}

export async function deleteRegistrationInvite(id: string): Promise<boolean> {
  const result = await RegistrationInviteModel.deleteOne({ _id: id }).exec();
  return result.deletedCount === 1;
}

export async function validateRegistrationInviteForRegistration(codeInput: unknown): Promise<{
  ok: boolean;
  code?: string;
  error?: string;
}> {
  const code = normalizeInviteCode(codeInput);
  if (!code) {
    return isRegistrationInviteRequired() ? { ok: false, error: "请填写邀请码" } : { ok: true };
  }
  if (!CODE_PATTERN.test(code)) {
    return { ok: false, error: "邀请码格式不正确" };
  }

  const invite = await RegistrationInviteModel.findOne({ code: { $eq: code } }).lean().exec();
  if (!invite) return { ok: false, error: "邀请码不存在或已失效" };
  if (!invite.active) return { ok: false, error: "邀请码已停用" };
  if (isExpired(invite as any)) return { ok: false, error: "邀请码已过期" };
  if (invite.usedCount >= invite.maxUses) return { ok: false, error: "邀请码使用次数已用完" };

  return { ok: true, code };
}

export async function consumeRegistrationInvite(
  codeInput: unknown,
  user: ConsumeInviteUser,
): Promise<{ ok: boolean; error?: string }> {
  const validation = await validateRegistrationInviteForRegistration(codeInput);
  if (!validation.ok || !validation.code) {
    return { ok: validation.ok, error: validation.error };
  }

  const now = new Date();
  const result = await RegistrationInviteModel.updateOne(
    {
      code: { $eq: validation.code },
      active: true,
      $expr: { $lt: ["$usedCount", "$maxUses"] },
      $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }, { expiresAt: { $exists: false } }],
    },
    {
      $inc: { usedCount: 1 },
      $push: {
        usedBy: {
          userId: user.id,
          username: user.username,
          email: user.email,
          usedAt: now,
        },
      },
    },
  ).exec();

  if (result.modifiedCount !== 1) {
    return { ok: false, error: "邀请码已失效或使用次数已用完" };
  }

  return { ok: true };
}
