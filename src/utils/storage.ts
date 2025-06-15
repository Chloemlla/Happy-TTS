import fs from 'fs';
import path from 'path';
import logger from './logger';

interface GenerationRecord {
    ip: string;
    text: string;
    timestamp: number;
    fileName: string;
}

export class StorageManager {
    private static readonly STORAGE_FILE = path.join(__dirname, '../../data/generation_records.json');
    private static readonly DUPLICATE_WINDOW = 24 * 60 * 60 * 1000; // 24小时

    private static ensureStorageFile() {
        const dir = path.dirname(this.STORAGE_FILE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        if (!fs.existsSync(this.STORAGE_FILE)) {
            fs.writeFileSync(this.STORAGE_FILE, JSON.stringify([]));
        }
    }

    private static readRecords(): GenerationRecord[] {
        this.ensureStorageFile();
        try {
            const data = fs.readFileSync(this.STORAGE_FILE, 'utf-8');
            return JSON.parse(data);
        } catch (error) {
            logger.error('读取生成记录失败:', error);
            return [];
        }
    }

    private static writeRecords(records: GenerationRecord[]) {
        try {
            fs.writeFileSync(this.STORAGE_FILE, JSON.stringify(records, null, 2));
        } catch (error) {
            logger.error('写入生成记录失败:', error);
        }
    }

    public static async addRecord(ip: string, text: string, fileName: string): Promise<void> {
        const records = this.readRecords();
        records.push({
            ip,
            text,
            timestamp: Date.now(),
            fileName
        });
        this.writeRecords(records);
    }

    public static async checkDuplicate(ip: string, text: string): Promise<boolean> {
        const records = this.readRecords();
        const now = Date.now();

        // 清理过期记录
        const validRecords = records.filter(record => 
            now - record.timestamp < this.DUPLICATE_WINDOW
        );

        // 检查是否有重复
        const hasDuplicate = validRecords.some(record => 
            record.ip === ip && record.text === text
        );

        // 如果发现过期记录，更新存储
        if (validRecords.length !== records.length) {
            this.writeRecords(validRecords);
        }

        return hasDuplicate;
    }

    public static async getRecentRecords(ip: string): Promise<GenerationRecord[]> {
        const records = this.readRecords();
        const now = Date.now();

        return records
            .filter(record => 
                record.ip === ip && 
                now - record.timestamp < this.DUPLICATE_WINDOW
            )
            .sort((a, b) => b.timestamp - a.timestamp);
    }
} 