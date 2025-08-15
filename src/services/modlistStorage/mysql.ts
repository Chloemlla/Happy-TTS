import mysql from 'mysql2/promise';

const MYSQL_URI = process.env.MYSQL_URI || 'mysql://root:password@localhost:3306/tts';
const TABLE = 'modlist';

async function getConn() {
  const conn = await mysql.createConnection(MYSQL_URI);
  await conn.execute(`CREATE TABLE IF NOT EXISTS ${TABLE} (
    id VARCHAR(32) PRIMARY KEY,
    name VARCHAR(128) UNIQUE,
    hash VARCHAR(128),
    md5 VARCHAR(64)
  )`);
  return conn;
}

export async function getAllMods({ withHash, withMd5 }: { withHash?: boolean, withMd5?: boolean } = {}) {
  const conn = await getConn();
  const [rows] = await conn.execute(`SELECT * FROM ${TABLE}`);
  await conn.end();
  return (rows as any[]).map((mod: any) => {
    const result: any = { id: mod.id, name: mod.name };
    if (withHash && mod.hash) result.hash = mod.hash;
    if (withMd5 && mod.md5) result.md5 = mod.md5;
    return result;
  });
}

export async function addMod(mod: { name: string, hash?: string, md5?: string }) {
  const conn = await getConn();
  const [rows] = await conn.execute(`SELECT * FROM ${TABLE} WHERE name=?`, [mod.name]);
  if ((rows as any[]).length > 0) {
    await conn.end();
    throw new Error('MOD名已存在');
  }
  const id = Date.now().toString();
  await conn.execute(`INSERT INTO ${TABLE} (id, name, hash, md5) VALUES (?, ?, ?, ?)`, [id, mod.name, mod.hash || null, mod.md5 || null]);
  await conn.end();
  return { id, name: mod.name, hash: mod.hash, md5: mod.md5 };
}

export async function updateMod(id: string, name: string, hash?: string, md5?: string) {
  const conn = await getConn();
  const [rows] = await conn.execute(`SELECT * FROM ${TABLE} WHERE id=?`, [id]);
  if ((rows as any[]).length === 0) {
    await conn.end();
    throw new Error('未找到MOD');
  }
  await conn.execute(`UPDATE ${TABLE} SET name=?, hash=?, md5=? WHERE id=?`, [name, hash || null, md5 || null, id]);
  const [after] = await conn.execute(`SELECT * FROM ${TABLE} WHERE id=?`, [id]);
  await conn.end();
  const mod = (after as any[])[0];
  return { id: mod.id, name: mod.name, hash: mod.hash || undefined, md5: mod.md5 || undefined };
}