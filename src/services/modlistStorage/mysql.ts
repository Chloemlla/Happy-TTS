import mysql from 'mysql2/promise';

const MYSQL_URI = process.env.MYSQL_URI || 'mysql://root:password@localhost:3306/tts';
const TABLE = 'modlist';

async function getConn() {
  const conn = await mysql.createConnection(MYSQL_URI);
  await conn.execute(`CREATE TABLE IF NOT EXISTS ${TABLE} (
    id VARCHAR(32) PRIMARY KEY,
    name VARCHAR(128) UNIQUE
  )`);
  return conn;
}

export async function getAllMods() {
  const conn = await getConn();
  const [rows] = await conn.execute(`SELECT * FROM ${TABLE}`);
  await conn.end();
  return rows as any[];
}

export async function addMod(mod: { name: string }) {
  const conn = await getConn();
  const [rows] = await conn.execute(`SELECT * FROM ${TABLE} WHERE name=?`, [mod.name]);
  if ((rows as any[]).length > 0) {
    await conn.end();
    throw new Error('MOD名已存在');
  }
  const id = Date.now().toString();
  await conn.execute(`INSERT INTO ${TABLE} (id, name) VALUES (?, ?)`, [id, mod.name]);
  await conn.end();
  return { id, name: mod.name };
}

export async function updateMod(id: string, name: string) {
  const conn = await getConn();
  const [rows] = await conn.execute(`SELECT * FROM ${TABLE} WHERE id=?`, [id]);
  if ((rows as any[]).length === 0) {
    await conn.end();
    throw new Error('未找到MOD');
  }
  await conn.execute(`UPDATE ${TABLE} SET name=? WHERE id=?`, [name, id]);
  await conn.end();
  return { id, name };
} 