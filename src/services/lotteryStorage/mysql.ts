import mysql from 'mysql2/promise';

const MYSQL_URI = process.env.MYSQL_URI || 'mysql://root:password@localhost:3306/tts';
const ROUNDS_TABLE = 'lottery_rounds';
const USERS_TABLE = 'lottery_users';

async function getConn() {
  const conn = await mysql.createConnection(MYSQL_URI);
  await conn.execute(`CREATE TABLE IF NOT EXISTS ${ROUNDS_TABLE} (
    id VARCHAR(64) PRIMARY KEY,
    data JSON
  )`);
  await conn.execute(`CREATE TABLE IF NOT EXISTS ${USERS_TABLE} (
    userId VARCHAR(64) PRIMARY KEY,
    data JSON
  )`);
  return conn;
}

export async function getAllRounds() {
  const conn = await getConn();
  const [rows] = await conn.execute(`SELECT * FROM ${ROUNDS_TABLE}`);
  await conn.end();
  return (rows as any[]).map(r => ({ ...JSON.parse(r.data), id: r.id }));
}

export async function addRound(round: any) {
  const conn = await getConn();
  const [rows] = await conn.execute(`SELECT * FROM ${ROUNDS_TABLE} WHERE id=?`, [round.id]);
  if ((rows as any[]).length > 0) {
    await conn.end();
    throw new Error('轮次已存在');
  }
  await conn.execute(`INSERT INTO ${ROUNDS_TABLE} (id, data) VALUES (?, ?)`, [round.id, JSON.stringify(round)]);
  await conn.end();
  return round;
}

export async function updateRound(id: string, data: any) {
  const conn = await getConn();
  const [rows] = await conn.execute(`SELECT * FROM ${ROUNDS_TABLE} WHERE id=?`, [id]);
  if ((rows as any[]).length === 0) {
    await conn.end();
    throw new Error('未找到轮次');
  }
  const old = JSON.parse((rows as any[])[0].data);
  const merged = { ...old, ...data };
  await conn.execute(`UPDATE ${ROUNDS_TABLE} SET data=? WHERE id=?`, [JSON.stringify(merged), id]);
  await conn.end();
  return merged;
}

export async function deleteAllRounds() {
  const conn = await getConn();
  await conn.execute(`DELETE FROM ${ROUNDS_TABLE}`);
  await conn.end();
}

export async function getUserRecord(userId: string) {
  const conn = await getConn();
  const [rows] = await conn.execute(`SELECT * FROM ${USERS_TABLE} WHERE userId=?`, [userId]);
  await conn.end();
  if ((rows as any[]).length === 0) return null;
  return JSON.parse((rows as any[])[0].data);
}

export async function updateUserRecord(userId: string, data: any) {
  const conn = await getConn();
  const [rows] = await conn.execute(`SELECT * FROM ${USERS_TABLE} WHERE userId=?`, [userId]);
  let merged = data;
  if ((rows as any[]).length > 0) {
    const old = JSON.parse((rows as any[])[0].data);
    merged = { ...old, ...data };
    await conn.execute(`UPDATE ${USERS_TABLE} SET data=? WHERE userId=?`, [JSON.stringify(merged), userId]);
  } else {
    await conn.execute(`INSERT INTO ${USERS_TABLE} (userId, data) VALUES (?, ?)`, [userId, JSON.stringify(data)]);
  }
  await conn.end();
  return merged;
} 