import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import logger from './logger';

interface GenerationRecord {
    id: string;
    ip: string;
    fingerprint: string;
    text: string;
    fileName: string;
    timestamp: string;
}

export class StorageManager {
    private static readonly RECORDS_FILE = path.join(__dirname, '../../data/generation_records.json');
    private static readonly MAX_RECORDS = 1000;
    private static readonly DUPLICATE_WINDOW = 24 * 60 * 60 * 1000; // 24小时

    private static ensureRecordsFile() {
        const dir = path.dirname(this.RECORDS_FILE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        if (!fs.existsSync(this.RECORDS_FILE)) {
            fs.writeFileSync(this.RECORDS_FILE, JSON.stringify([]));
        }
    }

    private static readRecords(): GenerationRecord[] {
        this.ensureRecordsFile();
        try {
            const data = fs.readFileSync(this.RECORDS_FILE, 'utf-8');
            return JSON.parse(data);
        } catch (error) {
            logger.error('读取生成记录失败:', error);
            return [];
        }
    }

    private static writeRecords(records: GenerationRecord[]) {
        try {
            fs.writeFileSync(this.RECORDS_FILE, JSON.stringify(records, null, 2));
        } catch (error) {
            logger.error('写入生成记录失败:', error);
        }
    }

    public static async addRecord(ip: string, fingerprint: string, text: string, fileName: string): Promise<void> {
        const records = this.readRecords();
        const newRecord: GenerationRecord = {
            id: uuidv4(),
            ip,
            fingerprint,
            text,
            fileName,
            timestamp: new Date().toISOString()
        };

        records.push(newRecord);

        // 如果记录数超过最大值，删除最旧的记录
        if (records.length > this.MAX_RECORDS) {
            records.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
            records.splice(this.MAX_RECORDS);
        }

        this.writeRecords(records);
    }

    public static async checkDuplicate(ip: string, fingerprint: string, text: string): Promise<boolean> {
        const records = this.readRecords();
        const now = new Date().getTime();
        const windowStart = now - this.DUPLICATE_WINDOW;

        return records.some(record => {
            const recordTime = new Date(record.timestamp).getTime();
            return recordTime > windowStart &&
                   record.text === text &&
                   (record.ip === ip || record.fingerprint === fingerprint);
        });
    }

    public static async getRecentRecords(ip: string, fingerprint: string): Promise<GenerationRecord[]> {
        const records = this.readRecords();
        return records
            .filter(record => record.ip === ip || record.fingerprint === fingerprint)
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            .slice(0, 10);
    }
} 