import mysql from 'mysql2/promise';

const MYSQL_URI = process.env.MYSQL_URI || 'mysql://root:password@localhost:3306/tts';
const TABLE = 'user_generations';

async function getConn() {
  const conn = await mysql.createConnection(MYSQL_URI);
  await conn.execute(`CREATE TABLE IF NOT EXISTS ${TABLE} (
    id INT AUTO_INCREMENT PRIMARY KEY,
    userId VARCHAR(64),
    text TEXT,
    voice VARCHAR(64),
    model VARCHAR(64),
    outputFormat VARCHAR(32),
    speed FLOAT,
    fileName VARCHAR(128),
    contentHash VARCHAR(128),
    timestamp DATETIME
  )`);
  return conn;
}

export async function findDuplicateGeneration({ userId, text, voice, model, contentHash }: any): Promise<any | null> {
  const conn = await getConn();
  let [rows]: any = [null];
  if (contentHash) {
    [rows] = await conn.execute(`SELECT * FROM ${TABLE} WHERE userId=? AND contentHash=? LIMIT 1`, [userId, contentHash]);
  } else {
    [rows] = await conn.execute(`SELECT * FROM ${TABLE} WHERE userId=? AND text=? AND voice=? AND model=? LIMIT 1`, [userId, text, voice, model]);
  }
  await conn.end();
  return rows && rows[0] ? rows[0] : null;
}

export async function addGenerationRecord(record: any): Promise<any> {
  const conn = await getConn();
  await conn.execute(
    `INSERT INTO ${TABLE} (userId, text, voice, model, outputFormat, speed, fileName, contentHash, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [record.userId, record.text, record.voice, record.model, record.outputFormat, record.speed, record.fileName, record.contentHash, new Date()]
  );
  await conn.end();
  return record;
}

export async function isAdminUser(userId: string): Promise<boolean> {
  // 需结合用户表，这里默认 false
  return false;
} 