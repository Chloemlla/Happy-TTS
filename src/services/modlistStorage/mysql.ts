import crypto from "node:crypto";
import mysql from "mysql2/promise";
import { requireMysqlUri } from "../../utils/mysqlUriPolicy";
import { formatModForOutput } from "./shared";

const TABLE = "modlist";

// G7-40: shared pool instead of a fresh connection + DDL per call.
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
      await conn.query(`CREATE TABLE IF NOT EXISTS ${TABLE} (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(128) UNIQUE,
        hash VARCHAR(128),
        md5 VARCHAR(64)
      )`);
    })().catch((err) => {
      tablesReady = null;
      throw err;
    });
  }
  return tablesReady;
}

export async function getAllMods({ withHash, withMd5 }: { withHash?: boolean; withMd5?: boolean } = {}) {
  const conn = getPool();
  await ensureTables();
  const [rows] = await conn.query(`SELECT * FROM ${TABLE}`);
  return (rows as any[]).map((mod: any) => formatModForOutput(mod, { withHash, withMd5 }));
}

export async function addMod(mod: { name: string; hash?: string; md5?: string }) {
  const conn = getPool();
  await ensureTables();
  const [rows] = await conn.query(`SELECT * FROM ${TABLE} WHERE name=?`, [mod.name]);
  if ((rows as any[]).length > 0) {
    throw new Error("MOD名已存在");
  }
  const id = `mod_${crypto.randomUUID()}`;
  await conn.query(`INSERT INTO ${TABLE} (id, name, hash, md5) VALUES (?, ?, ?, ?)`, [
    id,
    mod.name,
    mod.hash || null,
    mod.md5 || null,
  ]);
  return { id, name: mod.name, hash: mod.hash, md5: mod.md5 };
}

export async function updateMod(id: string, name: string, hash?: string, md5?: string) {
  const conn = getPool();
  await ensureTables();
  const [rows] = await conn.query(`SELECT * FROM ${TABLE} WHERE id=?`, [id]);
  if ((rows as any[]).length === 0) {
    throw new Error("未找到MOD");
  }
  await conn.query(`UPDATE ${TABLE} SET name=?, hash=?, md5=? WHERE id=?`, [name, hash || null, md5 || null, id]);
  const [after] = await conn.query(`SELECT * FROM ${TABLE} WHERE id=?`, [id]);
  const mod = (after as any[])[0];
  return formatModForOutput(mod, { withHash: true, withMd5: true });
}

export async function deleteMod(id: string) {
  const conn = getPool();
  await ensureTables();
  const [rows] = await conn.query(`SELECT * FROM ${TABLE} WHERE id=?`, [id]);
  if ((rows as any[]).length === 0) {
    throw new Error("未找到MOD");
  }
  await conn.query(`DELETE FROM ${TABLE} WHERE id=?`, [id]);
  return { success: true };
}

export async function batchAddMods(mods: Array<{ name: string; hash?: string; md5?: string }>) {
  const conn = getPool();
  await ensureTables();
  const added: any[] = [];
  for (const mod of mods) {
    if (!mod.name) continue;
    const [rows] = await conn.query(`SELECT * FROM ${TABLE} WHERE name=?`, [mod.name]);
    if ((rows as any[]).length > 0) continue;
    const id = `mod_${crypto.randomUUID()}`;
    await conn.query(`INSERT INTO ${TABLE} (id, name, hash, md5) VALUES (?, ?, ?, ?)`, [
      id,
      mod.name,
      mod.hash || null,
      mod.md5 || null,
    ]);
    added.push({ id, name: mod.name, hash: mod.hash, md5: mod.md5 });
  }
  return added;
}

export async function batchDeleteMods(ids: string[]) {
  const conn = getPool();
  await ensureTables();
  let count = 0;
  for (const id of ids) {
    const [rows] = await conn.query(`SELECT * FROM ${TABLE} WHERE id=?`, [id]);
    if ((rows as any[]).length === 0) continue;
    await conn.query(`DELETE FROM ${TABLE} WHERE id=?`, [id]);
    count++;
  }
  return { deleted: count };
}
