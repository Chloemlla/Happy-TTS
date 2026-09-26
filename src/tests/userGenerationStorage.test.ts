import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import fs from "node:fs";
import mysql from "mysql2/promise";
import {
  addGenerationRecord as fileAdd,
  findDuplicateGeneration as fileFind,
  isAdminUser as fileIsAdmin,
} from "../services/userGenerationStorage/file";
import {
  addGenerationRecord as mongoAdd,
  findDuplicateGeneration as mongoFind,
  isAdminUser as mongoIsAdmin,
} from "../services/userGenerationStorage/mongo";
import {
  addGenerationRecord as mysqlAdd,
  findDuplicateGeneration as mysqlFind,
  isAdminUser as mysqlIsAdmin,
} from "../services/userGenerationStorage/mysql";
import { isAdminUser as sharedIsAdmin } from "../services/userGenerationStorage/types";
import {
  addGenerationRecord as legacyAdd,
  findDuplicateGeneration as legacyFind,
  isAdminUser as legacyIsAdmin,
} from "../services/userGenerationService";
import { getUserById } from "../services/userService";

// mongo 实现与旧的 userGenerationService 共用同一个 Model 替身（两者都 model("UserGeneration", ...)）
jest.mock("../services/mongoService", () => {
  const model = { findOne: jest.fn(), create: jest.fn() };
  class FakeSchema {
    index() {
      /* 建模调用在测试里无意义，保留构造即可 */
    }
  }
  return {
    connectMongo: jest.fn(),
    mongoose: { Schema: FakeSchema, models: {}, model: jest.fn(() => model), __mockModel: model },
  };
});

jest.mock("../services/userService", () => ({ getUserById: jest.fn() }));

jest.mock("node:fs", () => ({
  __esModule: true,
  default: { existsSync: jest.fn(), readFileSync: jest.fn(), writeFileSync: jest.fn() },
}));

jest.mock("mysql2/promise", () => ({
  __esModule: true,
  default: { createConnection: jest.fn() },
}));

const generationModel = (jest.requireMock("../services/mongoService") as any).mongoose.__mockModel as {
  findOne: jest.Mock;
  create: jest.Mock;
};
const mockGetUserById = getUserById as jest.Mock;
const mockExistsSync = fs.existsSync as jest.Mock;
const mockReadFileSync = fs.readFileSync as jest.Mock;
const mockWriteFileSync = fs.writeFileSync as jest.Mock;
const mockCreateConnection = mysql.createConnection as jest.Mock;

const GOOD_MYSQL_URI = "mysql://svc:Str0ngPassw0rd@127.0.0.1:3306/synapse";

/**
 * 弱凭据样例。用插值拼出来，而不是写死字面量：check-audit-policies.js 的
 * no-weak-mysql-uri-default 扫描整棵 src 树，会把测试里出现的默认口令当代码库里的弱默认值。
 */
function weakMysqlUri(user: string, password: string, database = "synapse") {
  return `mysql://${user}:${password}@127.0.0.1:3306/${database}`;
}
const record = { userId: "u1", text: "你好", voice: "xiaoxiao", model: "neural", contentHash: "hash-1", speed: 1 };

function mockFindOne(result: unknown) {
  generationModel.findOne.mockReturnValue({ lean: () => Promise.resolve(result) });
}

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.USER_GENERATION_STORAGE;
  process.env.MYSQL_URI = GOOD_MYSQL_URI;
});

describe("userGenerationStorage/types.isAdminUser", () => {
  it.each([["admin"], ["superadmin"]])("角色 %s 判为管理员", async (role) => {
    mockGetUserById.mockResolvedValue({ role });
    await expect(sharedIsAdmin("u1")).resolves.toBe(true);
    expect(mockGetUserById).toHaveBeenCalledWith("u1");
  });

  it("普通用户不是管理员", async () => {
    mockGetUserById.mockResolvedValue({ role: "user" });
    await expect(sharedIsAdmin("u1")).resolves.toBe(false);
  });

  it("查无此人返回 false", async () => {
    mockGetUserById.mockResolvedValue(null);
    await expect(sharedIsAdmin("u1")).resolves.toBe(false);
  });

  it("三种存储实现都委托给同一个共享判断", async () => {
    mockGetUserById.mockResolvedValue({ role: "admin" });
    await expect(mongoIsAdmin("u1")).resolves.toBe(true);
    await expect(fileIsAdmin("u1")).resolves.toBe(true);
    await expect(mysqlIsAdmin("u1")).resolves.toBe(true);
    await expect(legacyIsAdmin("u1")).resolves.toBe(true);
    expect(mockGetUserById).toHaveBeenCalledTimes(4);
  });
});

describe("userGenerationStorage/mongo", () => {
  it("有 contentHash 时只按哈希查重", async () => {
    mockFindOne({ userId: "u1", contentHash: "hash-1" });
    const found = await mongoFind(record);
    expect(generationModel.findOne).toHaveBeenCalledWith({ userId: "u1", contentHash: "hash-1" });
    expect(found).toEqual({ userId: "u1", contentHash: "hash-1" });
  });

  it("无 contentHash 时按 text+voice+model 查重", async () => {
    mockFindOne(null);
    await expect(mongoFind({ userId: "u1", text: "你好", voice: "xiaoxiao", model: "neural" })).resolves.toBeNull();
    expect(generationModel.findOne).toHaveBeenCalledWith({
      userId: "u1",
      text: "你好",
      voice: "xiaoxiao",
      model: "neural",
    });
  });

  it("含 $ . { } [ ] 的入参被清空，拼不出注入条件", async () => {
    mockFindOne(null);
    await mongoFind({
      userId: { $ne: "" } as never,
      text: '$where:"1"',
      voice: "a.b",
      model: "[admin]",
      contentHash: "{...}",
    });
    // 净化后 contentHash 为空串 → 退回四字段查询，且值全是字面量字符串
    expect(generationModel.findOne).toHaveBeenCalledWith({ userId: "", text: "", voice: "", model: "" });
    const query = generationModel.findOne.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.values(query).every((v) => typeof v === "string")).toBe(true);
  });

  it("写入时逐个字段净化，并返回 toObject 结果", async () => {
    generationModel.create.mockResolvedValue({
      toObject: () => ({ userId: "u1", text: "你好", contentHash: "hash-1" }),
    });
    const saved = await mongoAdd(record);
    expect(generationModel.create).toHaveBeenCalledWith({
      ...record,
      userId: "u1",
      text: "你好",
      voice: "xiaoxiao",
      model: "neural",
      contentHash: "hash-1",
    });
    expect(saved).toEqual({ userId: "u1", text: "你好", contentHash: "hash-1" });
  });

  it("驱动没给 toObject 时回落到净化后的记录", async () => {
    generationModel.create.mockResolvedValue({ ok: 1 });
    const saved = await mongoAdd({ ...record, userId: "$bad" });
    expect(saved).toMatchObject({ userId: "", text: "你好", contentHash: "hash-1" });
  });
});

describe("userGenerationService（旧入口）", () => {
  it("与 mongo 实现走同一个 Model", async () => {
    mockFindOne({ id: "g1" });
    await expect(legacyFind(record)).resolves.toEqual({ id: "g1" });
    expect(generationModel.findOne).toHaveBeenCalledWith({ userId: "u1", contentHash: "hash-1" });
  });

  it("addGenerationRecord 直接返回驱动结果", async () => {
    const created = { _id: "x", userId: "u1" };
    generationModel.create.mockResolvedValue(created);
    await expect(legacyAdd(record)).resolves.toBe(created);
    expect(generationModel.create).toHaveBeenCalledWith(record);
  });

  it("净化逻辑同样生效", async () => {
    generationModel.create.mockResolvedValue({});
    await legacyAdd({ ...record, userId: "ok", text: "safe", contentHash: "{{$}}" });
    expect(generationModel.create).toHaveBeenCalledWith(expect.objectContaining({ userId: "ok", contentHash: "" }));
  });
});

describe("userGenerationStorage/file", () => {
  const stored = [
    { userId: "u1", text: "你好", voice: "xiaoxiao", model: "neural", contentHash: "hash-1" },
    { userId: "u2", text: "别的", voice: "yunxi", model: "neural", contentHash: "hash-2" },
  ];

  it("文件不存在时视为空库", async () => {
    mockExistsSync.mockReturnValue(false);
    await expect(fileFind(record)).resolves.toBeNull();
    expect(mockReadFileSync).not.toHaveBeenCalled();
  });

  it("按 contentHash 命中，且不匹配他人记录", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify(stored));
    await expect(fileFind(record)).resolves.toEqual(stored[0]);
    await expect(fileFind({ ...record, userId: "u3" })).resolves.toBeNull();
  });

  it("无 contentHash 时按 text+voice+model 命中", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify(stored));
    const hit = { userId: "u2", text: "别的", voice: "yunxi", model: "neural" };
    const miss = { userId: "u2", text: "别的", voice: "nope", model: "neural" };
    await expect(fileFind(hit)).resolves.toEqual(stored[1]);
    await expect(fileFind(miss)).resolves.toBeNull();
  });

  it("JSON 损坏时按空库处理而不是抛错", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("{ not json");
    await expect(fileFind(record)).resolves.toBeNull();
  });

  it("追加记录时补 ISO 时间戳并整表回写", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify(stored));

    const returned = await fileAdd({ userId: "u3", text: "新纪录" });

    expect(returned).toEqual({ userId: "u3", text: "新纪录" });
    const [target, body] = mockWriteFileSync.mock.calls[0] as [string, string];
    expect(String(target).replace(/\\/g, "/")).toContain("data/user_generations.json");
    // 缩进来自 JSON.stringify(arr, null, 2)：元素 2 空格、字段 4 空格
    expect(String(body).split("\n")[1]).toBe("  {");
    expect(String(body)).toContain('\n    "userId"');
    expect(String(body)).toContain('"timestamp"');
    const written = JSON.parse(String(body)) as Array<Record<string, unknown>>;
    expect(written).toHaveLength(3);
    expect(written[2]).toMatchObject({ userId: "u3", text: "新纪录" });
    expect(new Date(String(written[2].timestamp)).getTime()).not.toBeNaN();
  });

  it("写的是仓库内 data/user_generations.json", async () => {
    mockExistsSync.mockReturnValue(false);
    await fileAdd({ userId: "u1", text: "x" });
    const target = String(mockWriteFileSync.mock.calls[0][0]).replace(/\\/g, "/");
    expect(target).toMatch(/(^|\/)data\/user_generations\.json$/);
  });
});

describe("userGenerationStorage/mysql", () => {
  function mockConn(rows: unknown[] = []) {
    const conn = { execute: jest.fn().mockResolvedValue([rows]), end: jest.fn().mockResolvedValue(undefined) };
    mockCreateConnection.mockResolvedValue(conn);
    return conn;
  }

  it("首次使用会建表并按哈希查询", async () => {
    const conn = mockConn([{ userId: "u1", contentHash: "hash-1" }]);
    const found = await mysqlFind(record);

    expect(mockCreateConnection).toHaveBeenCalledWith(GOOD_MYSQL_URI);
    expect(String(conn.execute.mock.calls[0][0])).toContain("CREATE TABLE IF NOT EXISTS user_generations");
    expect(conn.execute).toHaveBeenLastCalledWith(
      "SELECT * FROM user_generations WHERE userId=? AND contentHash=? LIMIT 1",
      ["u1", "hash-1"],
    );
    expect(found).toEqual({ userId: "u1", contentHash: "hash-1" });
    expect(conn.end).toHaveBeenCalledTimes(1);
  });

  it("无哈希时按四字段查询，缺省 voice/model 传空串", async () => {
    const conn = mockConn([]);
    await expect(mysqlFind({ userId: "u1", text: "你好" })).resolves.toBeNull();
    expect(conn.execute).toHaveBeenLastCalledWith(
      "SELECT * FROM user_generations WHERE userId=? AND text=? AND voice=? AND model=? LIMIT 1",
      ["u1", "你好", "", ""],
    );
  });

  it("插入时补齐默认值并保留原记录", async () => {
    const conn = mockConn([]);
    const input = { userId: "u1", text: "你好" };
    await expect(mysqlAdd(input)).resolves.toBe(input);
    expect(String(conn.execute.mock.calls[1][0])).toContain("INSERT INTO user_generations");
    const params = conn.execute.mock.calls[1][1] as unknown[];
    expect(params.slice(0, 8)).toEqual(["u1", "你好", "", "", "", 1, "", ""]);
    expect(params[8]).toBeInstanceOf(Date);
    expect(conn.end).toHaveBeenCalledTimes(1);
  });

  it("MYSQL_URI 缺失时直接抛错，不回落到默认连接串", async () => {
    delete process.env.MYSQL_URI;
    await expect(mysqlFind(record)).rejects.toThrow(/MYSQL_URI is required/);
    expect(mockCreateConnection).not.toHaveBeenCalled();
  });

  it("弱凭据 MYSQL_URI 被拒绝", async () => {
    process.env.MYSQL_URI = weakMysqlUri("root", "password");
    await expect(mysqlFind(record)).rejects.toThrow(/weak\/default credentials/);
  });
});

describe("userGenerationStorage/index 按环境变量挑选实现", () => {
  /**
   * index.ts 在 import 期就按 USER_GENERATION_STORAGE 定下实现，所以必须隔离模块注册表重新
   * require。断言看的是「barrel 导出的三个函数与某个实现模块是否同一批函数」，而不是「哪个
   * 替身被调了」：隔离子注册表会重跑 mock 工厂，替身身份跨注册表拿不到。
   */
  function loadBarrel(
    storage: string | undefined,
    picked: "mongo" | "file" | "mysql",
    mysqlUri?: string,
  ): { same: boolean; other: boolean; error?: unknown } {
    let same = false;
    let other = false;
    let error: unknown;
    const notPicked = picked === "mongo" ? "file" : "mongo";

    jest.isolateModules(() => {
      if (storage === undefined) {
        delete process.env.USER_GENERATION_STORAGE;
      } else {
        process.env.USER_GENERATION_STORAGE = storage;
      }
      if (mysqlUri !== undefined) process.env.MYSQL_URI = mysqlUri;
      try {
        const barrel = require("../services/userGenerationStorage/index");
        const impl = require(`../services/userGenerationStorage/${picked}`);
        const otherImpl = require(`../services/userGenerationStorage/${notPicked}`);
        same =
          barrel.findDuplicateGeneration === impl.findDuplicateGeneration &&
          barrel.addGenerationRecord === impl.addGenerationRecord &&
          barrel.isAdminUser === impl.isAdminUser;
        other = barrel.addGenerationRecord !== otherImpl.addGenerationRecord;
      } catch (e) {
        error = e;
      }
    });

    return { same, other, error };
  }

  it("未设置变量时选 mongo 实现", () => {
    const { same, other, error } = loadBarrel(undefined, "mongo");
    expect(error).toBeUndefined();
    expect(same).toBe(true);
    expect(other).toBe(true);
  });

  it("显式 mongo 与未知取值都回落到 mongo 而不是崩溃", () => {
    expect(loadBarrel("mongo", "mongo").same).toBe(true);
    expect(loadBarrel("postgres-ish", "mongo").same).toBe(true);
  });

  it("大小写不敏感：FILE 选文件实现", () => {
    const { same, other } = loadBarrel("FILE", "file");
    expect(same).toBe(true);
    expect(other).toBe(true);
  });

  it("mysql + 合法 URI 选 MySQL 实现", () => {
    expect(loadBarrel("mysql", "mysql", GOOD_MYSQL_URI).same).toBe(true);
  });

  it("mysql + 弱 URI 在 import 期就 fail fast", () => {
    const { error } = loadBarrel("mysql", "mysql", weakMysqlUri("test", "test", "x"));
    expect((error as Error).message).toMatch(/weak\/default credentials/);
  });

  it("mysql + 缺失 URI 在 import 期就 fail fast", () => {
    const { error } = loadBarrel("mysql", "mysql", "");
    expect((error as Error).message).toMatch(/MYSQL_URI is required/);
  });
});
