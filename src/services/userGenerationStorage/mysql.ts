import type { RowDataPacket } from "mysql2/promise";
import mysql from "mysql2/promise";
import { type GenerationRecord, isAdminUser as sharedIsAdminUser } from "./types";

const MYSQL_URI = process.env.MYSQL_URI || "mysql://root:password@localhost:3306/tts";
const TABLE = "user_generations";

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

export async function findDuplicateGeneration({
  userId,
  text,
  voice,
  model,
  contentHash,
}: GenerationRecord): Promise<GenerationRecord | null> {
  const conn = await getConn();

  if (contentHash) {
    const sql = `SELECT * FROM ${TABLE} WHERE userId=? AND contentHash=? LIMIT 1`;
    const [rows] = await conn.execute<RowDataPacket[]>(sql, [userId, contentHash]);
    await conn.end();
    return rows?.[0] ? (rows[0] as GenerationRecord) : null;
  } else {
    const sql = `SELECT * FROM ${TABLE} WHERE userId=? AND text=? AND voice=? AND model=? LIMIT 1`;
    const [rows] = await conn.execute<RowDataPacket[]>(sql, [
      userId,
      text,
      voice || "",
      model || "",
    ]);
    await conn.end();
    return rows?.[0] ? (rows[0] as GenerationRecord) : null;
  }
}

export async function addGenerationRecord(record: GenerationRecord): Promise<GenerationRecord> {
  const conn = await getConn();
  const sql = `INSERT INTO ${TABLE} (userId, text, voice, model, outputFormat, speed, fileName, contentHash, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  await conn.execute(sql, [
    record.userId,
    record.text,
    record.voice || "",
    record.model || "",
    record.outputFormat || "",
    record.speed || 1.0,
    record.fileName || "",
    record.contentHash || "",
    new Date(),
  ]);

  await conn.end();
  return record;
}

export async function isAdminUser(userId: string): Promise<boolean> {
  return sharedIsAdminUser(userId);
}

// 重新导出类型
export type { GenerationRecord };
