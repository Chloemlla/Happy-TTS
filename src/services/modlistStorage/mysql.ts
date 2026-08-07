import mysql from "mysql2/promise";
import { requireMysqlUri } from "../../utils/mysqlUriPolicy";
import { formatModForOutput } from "./shared";

const TABLE = "modlist";

async function getConn() {
  // MYSQL_URI is mandatory when MODLIST_STORAGE=mysql — no root/password default.
  const conn = await mysql.createConnection(requireMysqlUri());
  await conn.execute(`CREATE TABLE IF NOT EXISTS ${TABLE} (
    id VARCHAR(32) PRIMARY KEY,
    name VARCHAR(128) UNIQUE,
    hash VARCHAR(128),
    md5 VARCHAR(64)
  )`);
  return conn;
}

export async function getAllMods({ withHash, withMd5 }: { withHash?: boolean; withMd5?: boolean } = {}) {
  const conn = await getConn();
  const [rows] = await conn.execute(`SELECT * FROM ${TABLE}`);
  await conn.end();
  return (rows as any[]).map((mod: any) => formatModForOutput(mod, { withHash, withMd5 }));
}

export async function addMod(mod: { name: string; hash?: string; md5?: string }) {
  const conn = await getConn();
  const [rows] = await conn.execute(`SELECT * FROM ${TABLE} WHERE name=?`, [mod.name]);
  if ((rows as any[]).length > 0) {
    await conn.end();
    throw new Error("MOD名已存在");
  }
  const id = Date.now().toString();
  await conn.execute(`INSERT INTO ${TABLE} (id, name, hash, md5) VALUES (?, ?, ?, ?)`, [
    id,
    mod.name,
    mod.hash || null,
    mod.md5 || null,
  ]);
  await conn.end();
  return { id, name: mod.name, hash: mod.hash, md5: mod.md5 };
}

export async function updateMod(id: string, name: string, hash?: string, md5?: string) {
  const conn = await getConn();
  const [rows] = await conn.execute(`SELECT * FROM ${TABLE} WHERE id=?`, [id]);
  if ((rows as any[]).length === 0) {
    await conn.end();
    throw new Error("未找到MOD");
  }
  await conn.execute(`UPDATE ${TABLE} SET name=?, hash=?, md5=? WHERE id=?`, [name, hash || null, md5 || null, id]);
  const [after] = await conn.execute(`SELECT * FROM ${TABLE} WHERE id=?`, [id]);
  await conn.end();
  const mod = (after as any[])[0];
  return formatModForOutput(mod, { withHash: true, withMd5: true });
}

export async function deleteMod(id: string) {
  const conn = await getConn();
  const [rows] = await conn.execute(`SELECT * FROM ${TABLE} WHERE id=?`, [id]);
  if ((rows as any[]).length === 0) {
    await conn.end();
    throw new Error("未找到MOD");
  }
  await conn.execute(`DELETE FROM ${TABLE} WHERE id=?`, [id]);
  await conn.end();
  return { success: true };
}

export async function batchAddMods(mods: Array<{ name: string; hash?: string; md5?: string }>) {
  const conn = await getConn();
  const added: any[] = [];
  try {
    for (const mod of mods) {
      if (!mod.name) continue;
      const [rows] = await conn.execute(`SELECT * FROM ${TABLE} WHERE name=?`, [mod.name]);
      if ((rows as any[]).length > 0) continue;
      const id = Date.now().toString() + Math.floor(Math.random() * 10000);
      await conn.execute(`INSERT INTO ${TABLE} (id, name, hash, md5) VALUES (?, ?, ?, ?)`, [
        id,
        mod.name,
        mod.hash || null,
        mod.md5 || null,
      ]);
      added.push({ id, name: mod.name, hash: mod.hash, md5: mod.md5 });
    }
    return added;
  } finally {
    await conn.end();
  }
}

export async function batchDeleteMods(ids: string[]) {
  const conn = await getConn();
  let count = 0;
  try {
    for (const id of ids) {
      const [rows] = await conn.execute(`SELECT * FROM ${TABLE} WHERE id=?`, [id]);
      if ((rows as any[]).length === 0) continue;
      await conn.execute(`DELETE FROM ${TABLE} WHERE id=?`, [id]);
      count++;
    }
    return { deleted: count };
  } finally {
    await conn.end();
  }
}
