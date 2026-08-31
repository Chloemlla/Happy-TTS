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
  getUserById: jest.fn(async (id: string) => mockCloneUser(mockUsers.get(id))),
  getUserAuthById: jest.fn(async (id: string) => mockCloneUser(mockUsers.get(id))),
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
