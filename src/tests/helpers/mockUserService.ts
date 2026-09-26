type MockUser = Record<string, any>;

const mockUsers = new Map<string, MockUser>();
let mockUserSequence = 10;

const mockCloneUser = (user: MockUser | null | undefined): MockUser | null => (user ? { ...user } : null);
const mockFindByUsername = (username: string): MockUser | null =>
  Array.from(mockUsers.values()).find((user) => user.username === username) || null;
const mockFindByEmail = (email: string): MockUser | null =>
  Array.from(mockUsers.values()).find((user) => user.email === email) || null;

const mockSeedUser = (user: MockUser): void => {
  mockUsers.set(user.id, { ...user });
};

const mockNow = new Date().toISOString();
mockSeedUser({
  id: "1",
  username: "admin",
  email: "admin@example.com",
  password: "admin123",
  role: "admin",
  dailyUsage: 0,
  lastUsageDate: mockNow,
  createdAt: mockNow,
  totpEnabled: false,
  backupCodes: [],
  passkeyEnabled: false,
  passkeyCredentials: [],
});
mockSeedUser({
  id: "2",
  username: "testuser",
  email: "test@example.com",
  password: "TestPass123!",
  role: "user",
  dailyUsage: 0,
  lastUsageDate: mockNow,
  createdAt: mockNow,
  totpEnabled: false,
  backupCodes: [],
  passkeyEnabled: false,
  passkeyCredentials: [],
});

const mockUserService = {
  getAllUsers: jest.fn(async () => Array.from(mockUsers.values()).map((user) => mockCloneUser(user))),
  getAdminUserList: jest.fn(async () => Array.from(mockUsers.values()).map((user) => mockCloneUser(user))),
  getAdminUserListPage: jest.fn(async (query: any, _includeFingerprints: boolean) => {
    const all = Array.from(mockUsers.values()).map((user) => mockCloneUser(user));
    const page = Math.max(1, Number(query?.page) || 1);
    const pageSize = Math.max(1, Math.min(100, Number(query?.pageSize) || 20));
    const start = (page - 1) * pageSize;
    const total = all.length;
    const emptyStats = {
      total: 0, users: 0, admins: 0, superadmins: 0, trusted: 0, active: 0, suspended: 0,
      totpEnabled: 0, passkeyEnabled: 0, fingerprintRequired: 0, withFingerprints: 0,
      ticketViolated: 0, ticketBanned: 0, translationDisabled: 0, translationLimited: 0, totalDailyUsage: 0,
    };
    return {
      users: all.slice(start, start + pageSize),
      total,
      stats: { ...emptyStats, total },
      filteredStats: { ...emptyStats, total },
    };
  }),
  getAllUsersAuth: jest.fn(async () => Array.from(mockUsers.values()).map((user) => mockCloneUser(user))),
  /**
   * 与 userService.getPrimaryAdminAuthUser 同义：按 createdAt 升序取最早的管理员。
   *
   * 这个导出不能缺：`src/utils/userRepository.ts:118` 直接调它，而
   * `logShare/store.ts:checkAdminPassword` 在口令不匹配 adminOperationPassword 时会走到
   * 这一步。替身里没有它 ⇒ 整套件抱 ``getPrimaryAdminAuthUser is not a function``，
   * logRoutes 的「管理员密码错误时应返回 403」会变成 500。
   */
  getPrimaryAdminAuthUser: jest.fn(async () => {
    const admins = Array.from(mockUsers.values())
      .filter((user) => user.role === "admin" || user.role === "superadmin")
      .sort((left, right) => String(left.createdAt || "").localeCompare(String(right.createdAt || "")));
    return mockCloneUser(admins[0] || null);
  }),
  getUserById: jest.fn(async (id: string) => mockCloneUser(mockUsers.get(id))),
  getUserAuthById: jest.fn(async (id: string) => mockCloneUser(mockUsers.get(id))),
  /**
   * 下面四个是 G2-22 / G2-13 加到真服务上的，替身始终没跟上：
   * mongoUserStorageProvider 会把调用转发给 userService，缺函数就是 TypeError（passkey 套件），
   * 而 totp 的备份码读取走 getUserSecretsById，缺它就是一句 500（backupCodes 套件）。
   * 语义跟真实现对齐，而不是只把它“补上”：
   */
  // 真实现会拒绝非法 id，这条契约也被上位调用方依赖，这里保留。
  getUserSecretsById: jest.fn(async (id: string) => {
    if (typeof id !== "string" || !/^[a-zA-Z0-9_-]+$/.test(id)) {
      throw new Error("非法的用户ID");
    }
    return mockCloneUser(mockUsers.get(id));
  }),
  // 只有 pendingChallenge 与期望值对得上才消费（并摸掉两个字段），否则回 null。
  consumePendingChallenge: jest.fn(async (id: string, expectedChallenge: string) => {
    const user = mockUsers.get(id);
    if (!user || !expectedChallenge || user.pendingChallenge !== expectedChallenge) {
      return null;
    }
    delete user.pendingChallenge;
    delete user.pendingChallengeExpiresAt;
    return mockCloneUser(user);
  }),
  // 原子消费：counter 必须严格大于已记录值，否则视为重放，返回 false。
  consumeTotpCounter: jest.fn(async (id: string, counter: number) => {
    const user = mockUsers.get(id);
    if (!user) return false;
    const last = Number(user.lastTotpCounter);
    if (Number.isFinite(last) && last >= counter) return false;
    user.lastTotpCounter = counter;
    return true;
  }),
  getUsersByIds: jest.fn(async (ids: string[]) =>
    (Array.isArray(ids) ? ids : [])
      .map((id) => mockCloneUser(mockUsers.get(id)))
      .filter((user): user is MockUser => Boolean(user)),
  ),
  bulkUpdateUsers: jest.fn(async (ops: Array<{ updateOne: { filter: { id?: string }; update: MockUser } }>) => {
    for (const op of Array.isArray(ops) ? ops : []) {
      const id = op?.updateOne?.filter?.id;
      if (!id) continue;
      const existing = mockUsers.get(id);
      if (!existing) continue;
      mockUsers.set(id, { ...existing, ...(op.updateOne.update || {}) });
    }
  }),
  getUserByUsername: jest.fn(async (username: string) => mockCloneUser(mockFindByUsername(username))),
  getUserAuthByUsername: jest.fn(async (username: string) => mockCloneUser(mockFindByUsername(username))),
  getUserByEmail: jest.fn(async (email: string) => mockCloneUser(mockFindByEmail(email))),
  getUserByEmailCaseInsensitive: jest.fn(async (email: string) => {
    const normalized = String(email).trim().toLowerCase();
    return mockCloneUser(
      Array.from(mockUsers.values()).find(
        (user) => typeof user.email === "string" && user.email.trim().toLowerCase() === normalized,
      ),
    );
  }),
  getUserByToken: jest.fn(async (token: string) =>
    mockCloneUser(Array.from(mockUsers.values()).find((user) => user.token === token)),
  ),
  getUserAuthByEmail: jest.fn(async (email: string) => mockCloneUser(mockFindByEmail(email))),
  getUserByLinuxDoId: jest.fn(async (linuxdoId: string) =>
    mockCloneUser(Array.from(mockUsers.values()).find((user) => user.linuxdoId === linuxdoId)),
  ),
  createUser: jest.fn(async (user: MockUser) => {
    if (mockFindByUsername(user.username) || mockFindByEmail(user.email)) {
      return null;
    }
    const created = {
      role: "user",
      dailyUsage: 0,
      lastUsageDate: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      totpEnabled: false,
      backupCodes: [],
      passkeyEnabled: false,
      passkeyCredentials: [],
      ...user,
      id: user.id || `mock-user-${++mockUserSequence}`,
    };
    mockUsers.set(created.id, created);
    return mockCloneUser(created);
  }),
  updateUser: jest.fn(async (id: string, updates: MockUser) => {
    const existing = mockUsers.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...updates };
    mockUsers.set(id, updated);
    return mockCloneUser(updated);
  }),
  deleteUser: jest.fn(async (id: string) => {
    mockUsers.delete(id);
  }),
  verifyAndMigrateUserPassword: jest.fn(async (user: MockUser, password: string) => ({
    valid: Boolean(user && user.password === password),
    user: mockCloneUser(user),
  })),
  incrementUserDailyUsageAtomic: jest.fn(async (id: string, dailyLimit: number) => {
    const user = mockUsers.get(id);
    if (!user || user.dailyUsage >= dailyLimit) {
      return { success: false, user: mockCloneUser(user) };
    }
    user.dailyUsage += 1;
    return { success: true, user: mockCloneUser(user) };
  }),
};

jest.mock("../../services/userService", () => ({
  __esModule: true,
  ...mockUserService,
}));

export { mockUserService };
