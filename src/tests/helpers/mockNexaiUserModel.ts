type MockNexaiUser = Record<string, any>;

const mockNexaiUsers: MockNexaiUser[] = [];

function mockGetPath(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, part) => {
    if (Array.isArray(current)) {
      return current.map((item) => (item && typeof item === "object" ? (item as MockNexaiUser)[part] : undefined));
    }
    return current && typeof current === "object" ? (current as MockNexaiUser)[part] : undefined;
  }, value);
}

function mockMatches(user: MockNexaiUser, filter: MockNexaiUser = {}): boolean {
  return Object.entries(filter).every(([key, expected]) => {
    if (key === "$or" && Array.isArray(expected)) {
      return expected.some((candidate) => mockMatches(user, candidate));
    }
    if (key === "$and" && Array.isArray(expected)) {
      return expected.every((candidate) => mockMatches(user, candidate));
    }

    const actual = mockGetPath(user, key);
    if (expected && typeof expected === "object" && !Array.isArray(expected)) {
      if ("$exists" in expected && (actual !== undefined) !== Boolean(expected.$exists)) return false;
      if ("$ne" in expected && actual === expected.$ne) return false;
      if ("$gt" in expected && !(Number(actual) > Number(expected.$gt))) return false;
      if ("$in" in expected && Array.isArray(expected.$in)) {
        return Array.isArray(actual)
          ? actual.some((value) => expected.$in.includes(value))
          : expected.$in.includes(actual);
      }
      return true;
    }
    return Array.isArray(actual) ? actual.includes(expected) : actual === expected;
  });
}

function mockSetPath(target: MockNexaiUser, path: string, value: unknown, filter: MockNexaiUser): void {
  if (path.includes(".$.")) {
    const [arrayPath, nestedPath] = path.split(".$.");
    const collection = mockGetPath(target, arrayPath);
    const matchValue = filter[`${arrayPath}.id`];
    if (Array.isArray(collection)) {
      const item = collection.find((candidate) => candidate?.id === matchValue);
      if (item) mockSetPath(item, nestedPath, value, {});
    }
    return;
  }

  const parts = path.split(".");
  const finalPart = parts.pop()!;
  let current = target;
  for (const part of parts) {
    current[part] ||= {};
    current = current[part];
  }
  current[finalPart] = value;
}

function mockApplyUpdate(user: MockNexaiUser, filter: MockNexaiUser, update: MockNexaiUser): void {
  for (const [path, value] of Object.entries(update.$set || {})) mockSetPath(user, path, value, filter);
  for (const path of Object.keys(update.$unset || {})) {
    const parts = path.split(".");
    const finalPart = parts.pop()!;
    const parent = parts.reduce<MockNexaiUser | undefined>((current, part) => current?.[part], user);
    if (parent) delete parent[finalPart];
  }
  for (const [path, value] of Object.entries(update.$push || {})) {
    const collection = mockGetPath(user, path);
    if (Array.isArray(collection)) collection.push(value);
  }
  for (const [path, value] of Object.entries(update.$inc || {})) {
    mockSetPath(user, path, Number(mockGetPath(user, path) || 0) + Number(value), filter);
  }
}

function mockNexaiQuery<T>(value: T) {
  const query = {
    select: jest.fn(() => query),
    lean: jest.fn(() => Promise.resolve(value)),
    exec: jest.fn(() => Promise.resolve(value)),
    then: (onFulfilled?: any, onRejected?: any) =>
      Promise.resolve(value).then(onFulfilled, onRejected),
  };
  return query;
}

const mockNexaiUserModel = {
  create: jest.fn(async (user: MockNexaiUser) => {
    const stored = {
      displayName: "",
      role: "user",
      loginCount: 0,
      passkeys: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      ...user,
    };
    mockNexaiUsers.push(stored);
    return { ...stored, toObject: () => ({ ...stored }) };
  }),
  deleteMany: jest.fn(async (filter: MockNexaiUser = {}) => {
    let deletedCount = 0;
    for (let index = mockNexaiUsers.length - 1; index >= 0; index -= 1) {
      if (mockMatches(mockNexaiUsers[index], filter)) {
        mockNexaiUsers.splice(index, 1);
        deletedCount += 1;
      }
    }
    return { deletedCount };
  }),
  findOne: jest.fn((filter: MockNexaiUser = {}) =>
    mockNexaiQuery(mockNexaiUsers.find((user) => mockMatches(user, filter)) || null),
  ),
  find: jest.fn((filter: MockNexaiUser = {}) =>
    mockNexaiQuery(mockNexaiUsers.filter((user) => mockMatches(user, filter))),
  ),
  updateOne: jest.fn(async (filter: MockNexaiUser, update: MockNexaiUser) => {
    const user = mockNexaiUsers.find((candidate) => mockMatches(candidate, filter));
    if (!user) return { matchedCount: 0, modifiedCount: 0 };
    mockApplyUpdate(user, filter, update);
    return { matchedCount: 1, modifiedCount: 1 };
  }),
  findOneAndUpdate: jest.fn((filter: MockNexaiUser, update: MockNexaiUser) => {
    const user = mockNexaiUsers.find((candidate) => mockMatches(candidate, filter));
    if (user) mockApplyUpdate(user, filter, update);
    return mockNexaiQuery(user || null);
  }),
};

jest.mock("../../models/nexaiUserModel", () => ({
  __esModule: true,
  NexaiUserModel: mockNexaiUserModel,
}));

export { mockNexaiUserModel };
