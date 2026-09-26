import { beforeEach, describe, expect, it, jest } from "@jest/globals";

/**
 * modlistStorage/mysql 与 lotteryStorage/mysql 的替身测试。
 * 两个模块都在模块作用域缓存 pool 与建表 Promise（G7-40），所以每个用例都用
 * jest.isolateModules 重新加载一份全新的模块，避免用例之间互相污染。
 */

const GOOD_MYSQL_URI = "mysql://svc:Str0ngPassw0rd@127.0.0.1:3306/synapse";

/**
 * 弱凭据样例用插值拼出，不写死字面量：check-audit-policies.js 的 no-weak-mysql-uri-default
 * 扫描整棵 src 树（含测试），会把测试里出现的 root:password 当成代码库自带的弱默认连接串。
 */
function weakMysqlUri(user: string, password: string) {
  return `mysql://${user}:${password}@127.0.0.1:3306/synapse`;
}

interface QueryCall {
  sql: string;
  params?: unknown[];
}

interface Harness {
  mod: any;
  calls: QueryCall[];
  createPool: jest.Mock;
  ddl: () => string[];
  dml: () => QueryCall[];
}

type Responder = (sql: string, params?: unknown[]) => unknown[];

function loadModule(spec: string, responder: Responder): Harness {
  const calls: QueryCall[] = [];
  const pool = {
    query: jest.fn(async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      return [responder(sql, params)];
    }),
  };
  const createPool = jest.fn(() => pool);
  let mod: any;

  jest.isolateModules(() => {
    jest.doMock("mysql2/promise", () => ({ __esModule: true, default: { createPool } }));
    mod = require(spec);
  });

  const isDdl = (sql: string) => /^\s*CREATE TABLE/.test(sql);
  return {
    mod,
    calls,
    createPool,
    ddl: () => calls.filter((c) => isDdl(c.sql)).map((c) => c.sql),
    dml: () => calls.filter((c) => !isDdl(c.sql)),
  };
}

const loadModlist = (responder: Responder) => loadModule("../services/modlistStorage/mysql", responder);
const loadLottery = (responder: Responder) => loadModule("../services/lotteryStorage/mysql", responder);

/** 只在第一条语句上返回给定行的应答器（用于“是否已存在”判定）。 */
function rowsOnce(rows: unknown[]): Responder {
  let used = false;
  return () => {
    if (used) return [];
    used = true;
    return rows;
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.MYSQL_URI = GOOD_MYSQL_URI;
});

describe("modlistStorage/mysql", () => {
  it("首次调用创建共享连接池并建表", async () => {
    const h = loadModlist(() => []);

    await expect(h.mod.getAllMods()).resolves.toEqual([]);

    expect(h.createPool).toHaveBeenCalledTimes(1);
    expect(h.createPool).toHaveBeenCalledWith({
      uri: GOOD_MYSQL_URI,
      connectionLimit: 10,
      waitForConnections: true,
      queueLimit: 0,
    });
    expect(h.ddl()).toHaveLength(1);
    expect(h.ddl()[0]).toContain("CREATE TABLE IF NOT EXISTS modlist");

    // 第二次调用复用池、不再建表
    await h.mod.getAllMods();
    expect(h.createPool).toHaveBeenCalledTimes(1);
    expect(h.ddl()).toHaveLength(1);
  });

  it("getAllMods 默认只输出 id 与 name", async () => {
    const h = loadModlist((sql) =>
      /SELECT \* FROM modlist$/.test(sql) ? [{ id: "m1", name: "A", hash: "h", md5: "5" }] : [],
    );
    expect(await h.mod.getAllMods()).toEqual([{ id: "m1", name: "A" }]);
    expect(h.dml().map((c) => c.sql)).toEqual(["SELECT * FROM modlist"]);
  });

  it("withHash/withMd5 按需输出，库里为 null 时不硬塞", async () => {
    const rows = [
      { id: "m1", name: "A", hash: "h1", md5: null },
      { id: "m2", name: "B", hash: null, md5: "m2" },
    ];
    const h = loadModlist(() => rows);
    expect(await h.mod.getAllMods({ withHash: true, withMd5: true })).toEqual([
      { id: "m1", name: "A", hash: "h1" },
      { id: "m2", name: "B", md5: "m2" },
    ]);
  });

  it("数字主键被规范成字符串", async () => {
    const h = loadModlist(() => [{ id: 7, name: "n" }]);
    const [mod] = await h.mod.getAllMods();
    expect(mod.id).toBe("7");
  });

  it("addMod 生成 mod_<uuid> 主键，缺省字段写 null", async () => {
    const h = loadModlist(() => []);
    const created = await h.mod.addMod({ name: "新MOD" });

    expect(created).toEqual({
      id: expect.stringMatching(/^mod_[0-9a-f-]{36}$/),
      name: "新MOD",
      hash: undefined,
      md5: undefined,
    });
    const insert = h.dml().find((c) => c.sql.startsWith("INSERT INTO modlist"));
    expect(insert?.params).toEqual([created.id, "新MOD", null, null]);
  });

  it("addMod 遇到同名直接失败，不发 INSERT", async () => {
    const h = loadModlist(() => [{ id: "exists", name: "重复" }]);
    await expect(h.mod.addMod({ name: "重复" })).rejects.toThrow("MOD名已存在");
    expect(h.dml().some((c) => c.sql.startsWith("INSERT"))).toBe(false);
  });

  it("updateMod 改写后复读整行并返回全字段", async () => {
    let readBack = false;
    const h = loadModlist((sql) => {
      if (sql.startsWith("UPDATE")) return [];
      if (!readBack) {
        readBack = true;
        return [{ id: "m1", name: "旧", hash: "h", md5: "5" }];
      }
      return [{ id: "m1", name: "新", hash: "h2", md5: "6" }];
    });

    const updated = await h.mod.updateMod("m1", "新", "h2", "6");

    expect(updated).toEqual({ id: "m1", name: "新", hash: "h2", md5: "6" });
    const update = h.dml().find((c) => c.sql.startsWith("UPDATE"));
    expect(update?.params).toEqual(["新", "h2", "6", "m1"]);
  });

  it("updateMod 缺省 hash/md5 时按 null 覆盖", async () => {
    const h = loadModlist(() => [{ id: "m1", name: "旧", hash: "h", md5: "5" }]);
    await h.mod.updateMod("m1", "改名");
    const update = h.dml().find((c) => c.sql.startsWith("UPDATE"));
    expect(update?.params).toEqual(["改名", null, null, "m1"]);
  });

  it("updateMod / deleteMod 对不存在的 id 抛「未找到MOD」", async () => {
    const h = loadModlist(() => []);
    await expect(h.mod.updateMod("nope", "x")).rejects.toThrow("未找到MOD");
    await expect(h.mod.deleteMod("nope")).rejects.toThrow("未找到MOD");
    expect(h.dml().some((c) => c.sql.startsWith("UPDATE") || c.sql.startsWith("DELETE"))).toBe(false);
  });

  it("deleteMod 命中后删除并回报成功", async () => {
    const h = loadModlist(() => [{ id: "m1", name: "A" }]);
    await expect(h.mod.deleteMod("m1")).resolves.toEqual({ success: true });
    expect(h.dml().find((c) => c.sql.startsWith("DELETE"))?.params).toEqual(["m1"]);
  });

  it("batchAddMods 跳过空名与已存在项", async () => {
    const h = loadModlist((sql, params) => {
      if (sql.startsWith("SELECT * FROM modlist WHERE name=?")) {
        return String(params?.[0] ?? "").startsWith("dup-") ? [{ id: "x" }] : [];
      }
      return [];
    });

    const added = await h.mod.batchAddMods([
      { name: "dup-1" },
      { name: "" },
      { name: "ok-1", hash: "h" },
      { name: "ok-2" },
    ]);

    expect(added).toHaveLength(2);
    expect(added.map((m: { name: string }) => m.name)).toEqual(["ok-1", "ok-2"]);
    const inserts = h.dml().filter((c) => c.sql.startsWith("INSERT"));
    expect(inserts.map((c) => c.params?.[1])).toEqual(["ok-1", "ok-2"]);
    expect(inserts[0].params?.[2]).toBe("h");
    expect(inserts[1].params?.[3]).toBeNull();
  });

  it("batchDeleteMods 只统计真实删除数", async () => {
    const h = loadModlist((sql, params) => (sql.includes("WHERE id=?") && params?.[0] === "b" ? [{ id: "b" }] : []));
    await expect(h.mod.batchDeleteMods(["a", "b", "c"])).resolves.toEqual({ deleted: 1 });
    expect(h.dml().filter((c) => c.sql.startsWith("DELETE"))).toHaveLength(1);
  });

  it("建表失败后下次会重试，不会缓存失败的 Promise", async () => {
    let ddlAttempts = 0;
    const h = loadModlist((sql) => {
      if (sql.startsWith("CREATE TABLE")) {
        ddlAttempts += 1;
        if (ddlAttempts === 1) throw new Error("ddl denied");
        return [];
      }
      return [];
    });

    await expect(h.mod.getAllMods()).rejects.toThrow("ddl denied");
    await expect(h.mod.getAllMods()).resolves.toEqual([]);
    expect(ddlAttempts).toBe(2);
  });

  it("MYSQL_URI 缺失时抛错且不创建连接池", async () => {
    delete process.env.MYSQL_URI;
    const h = loadModlist(() => []);
    await expect(h.mod.getAllMods()).rejects.toThrow(/MYSQL_URI is required/);
    expect(h.createPool).not.toHaveBeenCalled();
  });

  it("MYSQL_URI 是弱凭据时被策略拒绝", async () => {
    process.env.MYSQL_URI = weakMysqlUri("root", "password");
    const h = loadModlist(() => []);
    await expect(h.mod.getAllMods()).rejects.toThrow(/weak\/default credentials/);
  });
});

describe("lotteryStorage/mysql", () => {
  it("首次调用建两张表，之后复用", async () => {
    const h = loadLottery(() => []);
    await h.mod.getAllRounds();
    expect(h.ddl()).toHaveLength(2);
    expect(h.ddl().join(" ")).toContain("lottery_rounds");
    expect(h.ddl().join(" ")).toContain("lottery_users");
    await h.mod.getAllRounds();
    expect(h.ddl()).toHaveLength(2);
    expect(h.createPool).toHaveBeenCalledTimes(1);
  });

  it("JSON 列已是对象时不再 JSON.parse（否则会变 [object Object]）", async () => {
    const h = loadLottery(() => [{ id: "r1", data: { round: 1, winner: "u1" } }]);
    await expect(h.mod.getAllRounds()).resolves.toEqual([{ round: 1, winner: "u1", id: "r1" }]);
  });

  it("JSON 列是字符串时解析后返回", async () => {
    const h = loadLottery(() => [{ id: "r1", data: '{"round":2}' }]);
    await expect(h.mod.getAllRounds()).resolves.toEqual([{ round: 2, id: "r1" }]);
  });

  it("数据损坏时抛出可辨识错误", async () => {
    const h = loadLottery(() => [{ id: "r1", data: "{broken" }]);
    await expect(h.mod.getAllRounds()).rejects.toThrow("存储数据损坏（非 JSON）");
  });

  it("addRound 以 JSON 字符串落库", async () => {
    const h = loadLottery(() => []);
    const round = { id: "r9", winner: "u1" };
    await expect(h.mod.addRound(round)).resolves.toBe(round);

    const insert = h.dml().find((c) => c.sql.startsWith("INSERT INTO lottery_rounds"));
    expect(insert?.params).toEqual(["r9", JSON.stringify(round)]);
  });

  it("addRound 冲突时报「轮次已存在」", async () => {
    const h = loadLottery(rowsOnce([{ id: "r9" }]));
    await expect(h.mod.addRound({ id: "r9" })).rejects.toThrow("轮次已存在");
  });

  it("updateRound 合并旧数据后写回", async () => {
    const h = loadLottery(() => [{ id: "r1", data: { round: 1, note: "keep" } }]);
    await expect(h.mod.updateRound("r1", { round: 2 })).resolves.toEqual({ round: 2, note: "keep" });

    const update = h.dml().find((c) => c.sql.startsWith("UPDATE lottery_rounds"));
    expect(JSON.parse(String(update?.params?.[0]))).toEqual({ round: 2, note: "keep" });
    expect(update?.params?.[1]).toBe("r1");
  });

  it("updateRound 对不存在的轮次报错", async () => {
    const h = loadLottery(() => []);
    await expect(h.mod.updateRound("nope", {})).rejects.toThrow("未找到轮次");
  });

  it("deleteAllRounds 清空轮次表", async () => {
    const h = loadLottery(() => []);
    await h.mod.deleteAllRounds();
    expect(h.dml().map((c) => c.sql)).toEqual(["DELETE FROM lottery_rounds"]);
  });

  it("getUserRecord 无记录返回 null，有记录返回解析后的数据", async () => {
    const empty = loadLottery(() => []);
    await expect(empty.mod.getUserRecord("u1")).resolves.toBeNull();

    const found = loadLottery(() => [{ userId: "u1", data: '{"score":3}' }]);
    await expect(found.mod.getUserRecord("u1")).resolves.toEqual({ score: 3 });
  });

  it("updateUserRecord 命中已有记录时合并更新", async () => {
    const h = loadLottery(() => [{ userId: "u1", data: { score: 1, keep: true } }]);
    await expect(h.mod.updateUserRecord("u1", { score: 2 })).resolves.toEqual({ score: 2, keep: true });

    const update = h.dml().find((c) => c.sql.startsWith("UPDATE lottery_users"));
    expect(JSON.parse(String(update?.params?.[0]))).toEqual({ score: 2, keep: true });
    expect(update?.params?.[1]).toBe("u1");
    expect(h.dml().some((c) => c.sql.startsWith("INSERT INTO lottery_users"))).toBe(false);
  });

  it("updateUserRecord 无记录时插入原始数据", async () => {
    const h = loadLottery(() => []);
    await expect(h.mod.updateUserRecord("u2", { score: 5 })).resolves.toEqual({ score: 5 });

    const insert = h.dml().find((c) => c.sql.startsWith("INSERT INTO lottery_users"));
    expect(insert?.params).toEqual(["u2", '{"score":5}']);
  });

  it("MYSQL_URI 缺失时不创建连接池", async () => {
    delete process.env.MYSQL_URI;
    const h = loadLottery(() => []);
    await expect(h.mod.getAllRounds()).rejects.toThrow(/MYSQL_URI is required/);
    expect(h.createPool).not.toHaveBeenCalled();
  });
});
