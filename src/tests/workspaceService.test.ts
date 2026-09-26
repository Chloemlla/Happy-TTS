import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import InvitationModel from "../models/invitationModel";
import WorkspaceModel from "../models/workspaceModel";
import { WorkspaceError, WorkspaceErrorCodes, WorkspaceService } from "../services/workspaceService";
import logger from "../utils/logger";
import { userRepository } from "../utils/userRepository";

jest.mock("../models/workspaceModel", () => ({
  __esModule: true,
  default: { create: jest.fn(), findOne: jest.fn(), find: jest.fn(), updateOne: jest.fn() },
}));

jest.mock("../models/invitationModel", () => ({
  __esModule: true,
  default: {
    create: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    findOneAndUpdate: jest.fn(),
    updateOne: jest.fn(),
    updateMany: jest.fn(),
  },
}));

jest.mock("../utils/userRepository", () => ({
  userRepository: { getUserById: jest.fn() },
}));

jest.mock("../utils/logger", () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

const service = new WorkspaceService();

/** mongoose 查询既要能 .lean() 也要能直接 await（updateSettings 用的是非 lean 分支）。 */
function chain(value: unknown) {
  const settled = Promise.resolve(value);
  return {
    lean: () => settled,
    then: (onFulfilled?: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
      settled.then(onFulfilled, onRejected),
  };
}

function workspaceDoc(over: Record<string, unknown> = {}) {
  const now = new Date("2026-01-01T00:00:00.000Z");
  return {
    id: "ws-1",
    name: "团队空间",
    description: "desc",
    creatorId: "owner",
    members: [
      { userId: "owner", role: "admin", joinedAt: now, invitedBy: "owner" },
      { userId: "bob", role: "editor", joinedAt: now, invitedBy: "owner" },
    ],
    settings: { allowPublicSharing: false, defaultPermission: "viewer", notificationsEnabled: true },
    memberLimit: 10,
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}

function invitationDoc(over: Record<string, unknown> = {}) {
  return {
    id: "inv-1",
    workspaceId: "ws-1",
    inviteeEmail: "alice@example.com",
    role: "editor",
    status: "pending",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    ...over,
  };
}

function mockWorkspaceFindOne(doc: unknown) {
  (WorkspaceModel.findOne as jest.Mock).mockReturnValue(chain(doc));
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("workspaceService.createWorkspace", () => {
  it("创建者自动成为管理员并带上默认设置", async () => {
    (WorkspaceModel.create as jest.Mock).mockImplementation(async (data: unknown) => data);

    const ws = await service.createWorkspace("owner", "团队空间", "desc");

    const payload = (WorkspaceModel.create as jest.Mock).mock.calls[0][0];
    expect(payload.id).toMatch(/^ws-[0-9a-z]+-/);
    expect(payload.members).toHaveLength(1);
    expect(payload.members[0]).toMatchObject({ userId: "owner", role: "admin", invitedBy: "owner" });
    expect(payload.settings).toEqual({
      allowPublicSharing: false,
      defaultPermission: "viewer",
      notificationsEnabled: true,
    });
    expect(payload.memberLimit).toBe(10);
    expect(ws.name).toBe("团队空间");
    expect(ws.description).toBe("desc");
  });

  it("描述可省略，落库为空串", async () => {
    (WorkspaceModel.create as jest.Mock).mockImplementation(async (data: unknown) => data);
    const ws = await service.createWorkspace("owner", "只给名字");
    expect(ws.description).toBe("");
  });

  it("ID 由密码学随机源生成，连续两次不相同", async () => {
    (WorkspaceModel.create as jest.Mock).mockImplementation(async (data: unknown) => data);
    const a = await service.createWorkspace("owner", "A");
    const b = await service.createWorkspace("owner", "B");
    expect(a.id).not.toBe(b.id);
  });

  it("落库失败时原样抛出并记日志", async () => {
    (WorkspaceModel.create as jest.Mock).mockRejectedValue(new Error("dup key"));
    await expect(service.createWorkspace("owner", "A")).rejects.toThrow("dup key");
    expect(logger.error).toHaveBeenCalled();
  });
});

describe("workspaceService.getWorkspaceMembers / getWorkspace", () => {
  it("返回成员列表", async () => {
    mockWorkspaceFindOne(workspaceDoc());
    const members = await service.getWorkspaceMembers("ws-1");
    expect(members.map((m) => m.userId)).toEqual(["owner", "bob"]);
    expect(WorkspaceModel.findOne).toHaveBeenCalledWith({ id: "ws-1" });
  });

  it("工作空间不存在抛 WS_001", async () => {
    mockWorkspaceFindOne(null);
    await expect(service.getWorkspaceMembers("missing")).rejects.toThrow(
      expect.objectContaining({ code: WorkspaceErrorCodes.WORKSPACE_NOT_FOUND, name: "WorkspaceError" }),
    );
    await expect(service.getWorkspace("missing")).rejects.toBeInstanceOf(WorkspaceError);
  });

  it("getWorkspace 只映射白名单字段", async () => {
    mockWorkspaceFindOne(workspaceDoc({ internalFlag: "should-not-leak" }));
    const ws = await service.getWorkspace("ws-1");
    expect(Object.keys(ws).sort()).toEqual(
      ["createdAt", "creatorId", "description", "id", "memberLimit", "members", "name", "settings", "updatedAt"],
    );
  });

  it("数据层错误原样抛出", async () => {
    (WorkspaceModel.findOne as jest.Mock).mockReturnValue(chain(Promise.reject(new Error("mongo down"))));
    await expect(service.getWorkspace("ws-1")).rejects.toThrow("mongo down");
  });
});

describe("workspaceService.inviteMember", () => {
  it("管理员可邀请，有效期 7 天", async () => {
    mockWorkspaceFindOne(workspaceDoc());
    (InvitationModel.create as jest.Mock).mockImplementation(async (data: unknown) => data);

    const inv = await service.inviteMember("ws-1", "owner", "alice@example.com", "editor");

    const payload = (InvitationModel.create as jest.Mock).mock.calls[0][0];
    expect(payload.id).toMatch(/^inv-/);
    expect(payload.status).toBe("pending");
    const ttlDays = (new Date(payload.expiresAt).getTime() - new Date(payload.createdAt).getTime()) / 86_400_000;
    expect(ttlDays).toBeCloseTo(7, 5);
    expect(inv).toMatchObject({ workspaceId: "ws-1", role: "editor", inviteeEmail: "alice@example.com" });
  });

  it("非管理员邀请被拒（WS_003）", async () => {
    mockWorkspaceFindOne(workspaceDoc());
    await expect(service.inviteMember("ws-1", "bob", "a@b.c", "viewer")).rejects.toMatchObject({
      code: WorkspaceErrorCodes.PERMISSION_DENIED,
    });
    expect(InvitationModel.create).not.toHaveBeenCalled();
  });

  it("成员已满不再发邀请（WS_002）", async () => {
    mockWorkspaceFindOne(workspaceDoc({ memberLimit: 2 }));
    await expect(service.inviteMember("ws-1", "owner", "a@b.c", "viewer")).rejects.toMatchObject({
      code: WorkspaceErrorCodes.MEMBER_LIMIT_REACHED,
    });
  });

  it("未知角色被拒（WS_007）", async () => {
    const adminOnly = [{ userId: "owner", role: "admin", joinedAt: new Date(), invitedBy: "owner" }];
    mockWorkspaceFindOne(workspaceDoc({ members: adminOnly }));
    await expect(service.inviteMember("ws-1", "owner", "a@b.c", "superadmin" as never)).rejects.toMatchObject({
      code: WorkspaceErrorCodes.INVALID_ROLE,
    });
  });
  it("工作空间不存在（WS_001）", async () => {
    mockWorkspaceFindOne(null);
    await expect(service.inviteMember("nope", "owner", "a@b.c", "viewer")).rejects.toMatchObject({
      code: WorkspaceErrorCodes.WORKSPACE_NOT_FOUND,
    });
  });
});

describe("workspaceService.acceptInvitation", () => {
  it("邮箱匹配则按邀请角色入组，且入组写法是原子的", async () => {
    mockWorkspaceFindOne(workspaceDoc());
    const invitation = invitationDoc({ inviteeEmail: " Alice@Example.com " });
    (InvitationModel.findOne as jest.Mock).mockReturnValue(chain(invitation));
    (InvitationModel.findOneAndUpdate as jest.Mock).mockResolvedValue(invitationDoc({ status: "accepted" }));
    (WorkspaceModel.updateOne as jest.Mock).mockResolvedValue({ modifiedCount: 1, matchedCount: 1 });
    (userRepository.getUserById as jest.Mock).mockResolvedValue({ id: "carol", email: "alice@example.com" });

    const member = await service.acceptInvitation("inv-1", "carol");

    expect(member).toMatchObject({ userId: "carol", role: "editor", invitedBy: "owner" });
    expect(member.joinedAt).toBeInstanceOf(Date);

    const [filter, update] = (WorkspaceModel.updateOne as jest.Mock).mock.calls[0];
    expect(filter.id).toBe("ws-1");
    expect(filter["members.userId"]).toEqual({ $ne: "carol" });
    expect(filter.$expr.$lt[0]).toEqual({ $size: { $ifNull: ["$members", []] } });
    expect(update.$push.members).toMatchObject({ userId: "carol", role: "editor" });
    // 只有仍为 pending 的邀请会被消费，避免并发重复接受
    expect(InvitationModel.findOneAndUpdate).toHaveBeenCalledWith(
      { id: "inv-1", status: "pending" },
      { status: "accepted" },
      { returnDocument: "after" },
    );
  });

  it("邀请不存在（WS_005）", async () => {
    (InvitationModel.findOne as jest.Mock).mockReturnValue(chain(null));
    await expect(service.acceptInvitation("missing", "carol")).rejects.toMatchObject({
      code: WorkspaceErrorCodes.INVITATION_NOT_FOUND,
    });
  });

  it.each([
    ["accepted", "已被接受"],
    ["declined", "已被拒绝"],
    ["expired", "已过期"],
  ])("状态 %s 的邀请不能再接受（WS_004）", async (status, fragment) => {
    (InvitationModel.findOne as jest.Mock).mockReturnValue(chain(invitationDoc({ status })));
    await expect(service.acceptInvitation("inv-1", "carol")).rejects.toMatchObject({
      code: WorkspaceErrorCodes.INVITATION_EXPIRED,
      message: expect.stringContaining(fragment),
    });
  });

  it("持有邀请 ID 但邮箱不符也不能入组（WS_003）", async () => {
    (InvitationModel.findOne as jest.Mock).mockReturnValue(chain(invitationDoc()));
    (userRepository.getUserById as jest.Mock).mockResolvedValue({ email: "mallory@example.com" });
    await expect(service.acceptInvitation("inv-1", "mallory")).rejects.toMatchObject({
      code: WorkspaceErrorCodes.PERMISSION_DENIED,
    });
    expect(InvitationModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("当前用户查不到邮箱同样拒绝", async () => {
    (InvitationModel.findOne as jest.Mock).mockReturnValue(chain(invitationDoc()));
    (userRepository.getUserById as jest.Mock).mockResolvedValue(null);
    await expect(service.acceptInvitation("inv-1", "ghost")).rejects.toMatchObject({
      code: WorkspaceErrorCodes.PERMISSION_DENIED,
    });
  });

  it("邀请未指定邮箱时跳过身份比对", async () => {
    (InvitationModel.findOne as jest.Mock).mockReturnValue(chain(invitationDoc({ inviteeEmail: "" })));
    mockWorkspaceFindOne(workspaceDoc());
    (InvitationModel.findOneAndUpdate as jest.Mock).mockResolvedValue(invitationDoc({ inviteeEmail: "" }));
    (WorkspaceModel.updateOne as jest.Mock).mockResolvedValue({ modifiedCount: 1 });

    await expect(service.acceptInvitation("inv-1", "carol")).resolves.toMatchObject({ userId: "carol" });
    expect(userRepository.getUserById).not.toHaveBeenCalled();
  });

  it("已是成员则拒绝（WS_006）", async () => {
    (InvitationModel.findOne as jest.Mock).mockReturnValue(chain(invitationDoc({ inviteeEmail: "" })));
    mockWorkspaceFindOne(workspaceDoc());
    await expect(service.acceptInvitation("inv-1", "bob")).rejects.toMatchObject({
      code: WorkspaceErrorCodes.ALREADY_MEMBER,
    });
  });

  it("目标空间已满（WS_002）", async () => {
    (InvitationModel.findOne as jest.Mock).mockReturnValue(chain(invitationDoc({ inviteeEmail: "" })));
    mockWorkspaceFindOne(workspaceDoc({ memberLimit: 2 }));
    await expect(service.acceptInvitation("inv-1", "carol")).rejects.toMatchObject({
      code: WorkspaceErrorCodes.MEMBER_LIMIT_REACHED,
    });
  });

  it("并发消费失败（返回 null）报 WS_004", async () => {
    (InvitationModel.findOne as jest.Mock).mockReturnValue(chain(invitationDoc({ inviteeEmail: "" })));
    mockWorkspaceFindOne(workspaceDoc());
    (InvitationModel.findOneAndUpdate as jest.Mock).mockResolvedValue(null);
    await expect(service.acceptInvitation("inv-1", "carol")).rejects.toMatchObject({
      code: WorkspaceErrorCodes.INVITATION_EXPIRED,
    });
  });

  it("消费瞬间已过期则回滚 expired 并报 WS_004", async () => {
    (InvitationModel.findOne as jest.Mock).mockReturnValue(chain(invitationDoc({ inviteeEmail: "" })));
    mockWorkspaceFindOne(workspaceDoc());
    (InvitationModel.findOneAndUpdate as jest.Mock).mockResolvedValue(
      invitationDoc({ expiresAt: new Date(Date.now() - 1000) }),
    );
    (InvitationModel.updateOne as jest.Mock).mockResolvedValue({ modifiedCount: 1 });

    await expect(service.acceptInvitation("inv-1", "carol")).rejects.toMatchObject({
      code: WorkspaceErrorCodes.INVITATION_EXPIRED,
      message: expect.stringContaining("已过期"),
    });
    expect(InvitationModel.updateOne).toHaveBeenCalledWith({ id: "inv-1" }, { status: "expired" });
  });

  it("原子入组未命中（modifiedCount=0）报 WS_002", async () => {
    (InvitationModel.findOne as jest.Mock).mockReturnValue(chain(invitationDoc({ inviteeEmail: "" })));
    mockWorkspaceFindOne(workspaceDoc());
    (InvitationModel.findOneAndUpdate as jest.Mock).mockResolvedValue(invitationDoc());
    (WorkspaceModel.updateOne as jest.Mock).mockResolvedValue({ modifiedCount: 0 });

    await expect(service.acceptInvitation("inv-1", "carol")).rejects.toMatchObject({
      code: WorkspaceErrorCodes.MEMBER_LIMIT_REACHED,
    });
  });

  it("目标空间被删除（WS_001）", async () => {
    (InvitationModel.findOne as jest.Mock).mockReturnValue(chain(invitationDoc({ inviteeEmail: "" })));
    mockWorkspaceFindOne(null);
    await expect(service.acceptInvitation("inv-1", "carol")).rejects.toMatchObject({
      code: WorkspaceErrorCodes.WORKSPACE_NOT_FOUND,
    });
  });
});

describe("workspaceService.updateSettings", () => {
  it("管理员改设置走合并语义", async () => {
    const before = workspaceDoc();
    (WorkspaceModel.findOne as jest.Mock)
      .mockReturnValueOnce(chain(before))
      .mockReturnValueOnce(chain({ ...before, settings: { ...before.settings, allowPublicSharing: true } }));
    (WorkspaceModel.updateOne as jest.Mock).mockResolvedValue({ modifiedCount: 1 });

    const ws = await service.updateSettings("ws-1", "owner", { allowPublicSharing: true });

    const [filter, update] = (WorkspaceModel.updateOne as jest.Mock).mock.calls[0];
    expect(filter).toEqual({ id: "ws-1" });
    expect(update.$set.settings).toEqual({
      allowPublicSharing: true,
      defaultPermission: "viewer",
      notificationsEnabled: true,
    });
    expect(update.$set.updatedAt).toBeInstanceOf(Date);
    expect(ws.settings.allowPublicSharing).toBe(true);
  });

  it("非管理员改设置被拒（WS_003）", async () => {
    mockWorkspaceFindOne(workspaceDoc());
    await expect(service.updateSettings("ws-1", "bob", { notificationsEnabled: false })).rejects.toMatchObject({
      code: WorkspaceErrorCodes.PERMISSION_DENIED,
    });
    expect(WorkspaceModel.updateOne).not.toHaveBeenCalled();
  });

  it("viewer 成员也不能改设置", async () => {
    mockWorkspaceFindOne(workspaceDoc({ members: [{ userId: "x", role: "viewer" }] }));
    await expect(service.updateSettings("ws-1", "x", { notificationsEnabled: false })).rejects.toMatchObject({
      code: WorkspaceErrorCodes.PERMISSION_DENIED,
    });
  });

  it("空间不存在（WS_001）", async () => {
    mockWorkspaceFindOne(null);
    await expect(service.updateSettings("nope", "owner", {})).rejects.toMatchObject({
      code: WorkspaceErrorCodes.WORKSPACE_NOT_FOUND,
    });
  });
});

describe("workspaceService 查询类方法", () => {
  it("getUserWorkspaces 按成员映射为白名单结构", async () => {
    (WorkspaceModel.find as jest.Mock).mockReturnValue(chain([workspaceDoc({ id: "a" }), workspaceDoc({ id: "b" })]));
    const list = await service.getUserWorkspaces("owner");
    expect(WorkspaceModel.find).toHaveBeenCalledWith({ "members.userId": "owner" });
    expect(list.map((w) => w.id)).toEqual(["a", "b"]);
    expect(list[0]).not.toHaveProperty("internalFlag");
  });

  it("getPendingInvitations 先把过期邀请批量置为 expired 再查", async () => {
    (InvitationModel.updateMany as jest.Mock).mockResolvedValue({ modifiedCount: 1 });
    (InvitationModel.find as jest.Mock).mockReturnValue(chain([invitationDoc(), invitationDoc({ id: "inv-2" })]));

    const list = await service.getPendingInvitations("alice@example.com");

    const [filter, change] = (InvitationModel.updateMany as jest.Mock).mock.calls[0];
    expect(filter).toMatchObject({ inviteeEmail: "alice@example.com", status: "pending" });
    expect(filter.expiresAt.$lt).toBeInstanceOf(Date);
    expect(change).toEqual({ status: "expired" });
    expect(InvitationModel.find).toHaveBeenCalledWith({ inviteeEmail: "alice@example.com", status: "pending" });
    expect(list.map((i) => i.id)).toEqual(["inv-1", "inv-2"]);
  });

  it("isMember 命中返回 true，未命中返回 false", async () => {
    mockWorkspaceFindOne(workspaceDoc());
    await expect(service.isMember("ws-1", "owner")).resolves.toBe(true);
    mockWorkspaceFindOne(null);
    await expect(service.isMember("ws-1", "nobody")).resolves.toBe(false);
    expect(WorkspaceModel.findOne).toHaveBeenLastCalledWith({ id: "ws-1", "members.userId": "nobody" });
  });

  it("isMember 查询失败按 false 兜底（不放开访问）", async () => {
    (WorkspaceModel.findOne as jest.Mock).mockReturnValue(chain(Promise.reject(new Error("mongo down"))));
    await expect(service.isMember("ws-1", "owner")).resolves.toBe(false);
  });

  it("getMemberRole 返回角色，非成员/空间缺失返回 null", async () => {
    mockWorkspaceFindOne(workspaceDoc());
    await expect(service.getMemberRole("ws-1", "bob")).resolves.toBe("editor");
    await expect(service.getMemberRole("ws-1", "ghost")).resolves.toBeNull();
    mockWorkspaceFindOne(null);
    await expect(service.getMemberRole("missing", "bob")).resolves.toBeNull();
  });

  it("getMemberRole 查询失败返回 null", async () => {
    (WorkspaceModel.findOne as jest.Mock).mockReturnValue(chain(Promise.reject(new Error("mongo down"))));
    await expect(service.getMemberRole("ws-1", "bob")).resolves.toBeNull();
    expect(logger.error).toHaveBeenCalled();
  });
});

describe("WorkspaceError", () => {
  it("携带业务错误码", () => {
    const err = new WorkspaceError("boom", WorkspaceErrorCodes.ALREADY_MEMBER);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("WorkspaceError");
    expect(err.code).toBe("WS_006");
  });

  it("错误码常量与设计文档一致", () => {
    expect(WorkspaceErrorCodes).toEqual({
      WORKSPACE_NOT_FOUND: "WS_001",
      MEMBER_LIMIT_REACHED: "WS_002",
      PERMISSION_DENIED: "WS_003",
      INVITATION_EXPIRED: "WS_004",
      INVITATION_NOT_FOUND: "WS_005",
      ALREADY_MEMBER: "WS_006",
      INVALID_ROLE: "WS_007",
    });
  });
});
