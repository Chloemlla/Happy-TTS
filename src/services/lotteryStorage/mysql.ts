import mysql from "mysql2/promise";
import { requireMysqlUri } from "../../utils/mysqlUriPolicy";

const ROUNDS_TABLE = "lottery_rounds";
const USERS_TABLE = "lottery_users";

// G7-40: a single shared pool instead of a fresh connection + DDL per call.
let pool: mysql.Pool | null = null;
let tablesReady: Promise<void> | null = null;

function getPool(): mysql.Pool {
  if (!pool) {
    pool = mysql.createPool({
      uri: requireMysqlUri(),
      connectionLimit: 10,
      waitForConnections: true,
      queueLimit: 0,
    });
  }
  return pool;
}

function ensureTables(): Promise<void> {
  if (!tablesReady) {
    tablesReady = (async () => {
      const conn = getPool();
      await conn.query(`CREATE TABLE IF NOT EXISTS ${ROUNDS_TABLE} (
        id VARCHAR(64) PRIMARY KEY,
        data JSON
      )`);
      await conn.query(`CREATE TABLE IF NOT EXISTS ${USERS_TABLE} (
        userId VARCHAR(64) PRIMARY KEY,
        data JSON
      )`);
    })().catch((err) => {
      tablesReady = null; // allow retry on transient failure
      throw err;
    });
  }
  return tablesReady;
}

// G7-40: mysql2 parses JSON columns into JS objects by default. `JSON.parse`
// on an object coerces to "[object Object]" and throws. Handle both shapes.
function parseData(value: unknown): any {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      throw new Error("存储数据损坏（非 JSON）");
    }
  }
  return value;
}

export async function getAllRounds() {
  const conn = getPool();
  await ensureTables();
  const [rows] = await conn.query(`SELECT * FROM ${ROUNDS_TABLE}`);
  return (rows as any[]).map((r) => ({ ...parseData(r.data), id: r.id }));
}

export async function addRound(round: any) {
  const conn = getPool();
  await ensureTables();
  const [rows] = await conn.query(`SELECT * FROM ${ROUNDS_TABLE} WHERE id=?`, [round.id]);
  if ((rows as any[]).length > 0) {
    throw new Error("轮次已存在");
  }
  await conn.query(`INSERT INTO ${ROUNDS_TABLE} (id, data) VALUES (?, ?)`, [round.id, JSON.stringify(round)]);
  return round;
}

export async function updateRound(id: string, data: any) {
  const conn = getPool();
  await ensureTables();
  const [rows] = await conn.query(`SELECT * FROM ${ROUNDS_TABLE} WHERE id=?`, [id]);
  if ((rows as any[]).length === 0) {
    throw new Error("未找到轮次");
  }
  const old = parseData((rows as any[])[0].data);
  const merged = { ...old, ...data };
  await conn.query(`UPDATE ${ROUNDS_TABLE} SET data=? WHERE id=?`, [JSON.stringify(merged), id]);
  return merged;
}

export async function deleteAllRounds() {
  const conn = getPool();
  await ensureTables();
  await conn.query(`DELETE FROM ${ROUNDS_TABLE}`);
}

export async function getUserRecord(userId: string) {
  const conn = getPool();
  await ensureTables();
  const [rows] = await conn.query(`SELECT * FROM ${USERS_TABLE} WHERE userId=?`, [userId]);
  if ((rows as any[]).length === 0) return null;
  return parseData((rows as any[])[0].data);
}

export async function updateUserRecord(userId: string, data: any) {
  const conn = getPool();
  await ensureTables();
  const [rows] = await conn.query(`SELECT * FROM ${USERS_TABLE} WHERE userId=?`, [userId]);
  let merged = data;
  if ((rows as any[]).length > 0) {
    const old = parseData((rows as any[])[0].data);
    merged = { ...old, ...data };
    await conn.query(`UPDATE ${USERS_TABLE} SET data=? WHERE userId=?`, [JSON.stringify(merged), userId]);
  } else {
    await conn.query(`INSERT INTO ${USERS_TABLE} (userId, data) VALUES (?, ?)`, [userId, JSON.stringify(data)]);
  }
  return merged;
}
