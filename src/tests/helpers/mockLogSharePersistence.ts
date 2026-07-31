type MockLogShare = Record<string, any>;

const mockLogShares: MockLogShare[] = [];

function mockLogShareQuery<T>(initialValue: T) {
  let value = initialValue;
  const query = {
    sort: jest.fn((sortSpec?: Record<string, 1 | -1>) => {
      if (Array.isArray(value) && sortSpec) {
        const [field, direction] = Object.entries(sortSpec)[0] || [];
        if (field) {
          value = [...value].sort((left, right) => {
            const comparison = left[field] > right[field] ? 1 : left[field] < right[field] ? -1 : 0;
            return direction === -1 ? -comparison : comparison;
          }) as T;
        }
      }
      return query;
    }),
    lean: jest.fn(() => Promise.resolve(value)),
    exec: jest.fn(() => Promise.resolve(value)),
    then: (onFulfilled?: any, onRejected?: any) =>
      Promise.resolve(value).then(onFulfilled, onRejected),
  };
  return query;
}

const mockLogShareModel = {
  create: jest.fn(async (document: MockLogShare) => {
    const stored = { createdAt: new Date(), ...document };
    mockLogShares.push(stored);
    return { ...stored };
  }),
  find: jest.fn((filter: MockLogShare = {}) =>
    mockLogShareQuery(
      mockLogShares.filter((document) =>
        Object.entries(filter).every(([key, expected]) => document[key] === expected),
      ),
    ),
  ),
  findOne: jest.fn((filter: MockLogShare = {}) =>
    mockLogShareQuery(
      mockLogShares.find((document) =>
        Object.entries(filter).every(([key, expected]) => document[key] === expected),
      ) || null,
    ),
  ),
  deleteOne: jest.fn(async (filter: MockLogShare = {}) => {
    const index = mockLogShares.findIndex((document) =>
      Object.entries(filter).every(([key, expected]) => document[key] === expected),
    );
    if (index === -1) return { deletedCount: 0 };
    mockLogShares.splice(index, 1);
    return { deletedCount: 1 };
  }),
  deleteMany: jest.fn(async () => {
    const deletedCount = mockLogShares.length;
    mockLogShares.splice(0);
    return { deletedCount };
  }),
  findOneAndUpdate: jest.fn((filter: MockLogShare, update: MockLogShare) => {
    const document = mockLogShares.find((candidate) =>
      Object.entries(filter).every(([key, expected]) => candidate[key] === expected),
    );
    if (document) Object.assign(document, update.$set || update);
    return mockLogShareQuery(document || null);
  }),
};

jest.mock("../../services/mongoService", () => {
  const actualModule = jest.requireActual<typeof import("mongoose")>("mongoose");
  const actualMongoose: any = actualModule.default || actualModule;
  const models = new Proxy(actualMongoose.models, {
    get(target, property, receiver) {
      if (property === "LogShareFile") return mockLogShareModel;
      return Reflect.get(target, property, receiver);
    },
  });
  const mongoose = new Proxy(actualMongoose, {
    get(target, property, receiver) {
      if (property === "models") return models;
      if (property === "model") {
        return (name: string, schema?: unknown) =>
          name === "LogShareFile" ? mockLogShareModel : actualMongoose.model(name, schema);
      }
      return Reflect.get(target, property, receiver);
    },
  });

  return {
    __esModule: true,
    mongoose,
    connectMongo: jest.fn().mockResolvedValue(undefined),
    isConnected: jest.fn().mockReturnValue(false),
    waitForConnection: jest.fn().mockResolvedValue(false),
    ensureConnection: jest.fn(async (operation: () => Promise<unknown>) => operation()),
    getConnectionInfo: jest.fn().mockReturnValue({ readyState: 0, stateName: "未连接" }),
    getPoolStats: jest.fn().mockReturnValue({}),
    checkPoolHealth: jest.fn().mockReturnValue({ healthy: true, warnings: [] }),
    testConnection: jest.fn().mockResolvedValue({ success: true }),
    startPoolMonitoring: jest.fn(),
    stopPoolMonitoring: jest.fn(),
    getPoolMonitoringStatus: jest.fn().mockReturnValue({ isRunning: false }),
  };
});
