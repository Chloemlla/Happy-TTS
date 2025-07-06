import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals';
import { dataCollectionService } from '../services/dataCollectionService';
import fs from 'fs';
import path from 'path';

// Mock fs.promises
jest.mock('fs/promises', () => ({
  writeFile: jest.fn(),
  appendFile: jest.fn(),
  mkdir: jest.fn()
}));

describe('Data Collection Service', () => {
  const testDataDir = path.join(process.cwd(), 'test-data');

  beforeEach(() => {
    // 创建测试目录
    if (!fs.existsSync(testDataDir)) {
      fs.mkdirSync(testDataDir, { recursive: true });
    }
    
    // 清理mock
    jest.clearAllMocks();
  });

  afterEach(() => {
    // 清理测试数据
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  it('应该成功保存数据', async () => {
    const testData = {
      userId: 'test-user',
      action: 'test-action',
      timestamp: new Date().toISOString(),
      details: { test: 'data' }
    };

    await dataCollectionService.saveData(testData);
    const files = fs.readdirSync(testDataDir);
    expect(files.length).toBeGreaterThan(0);

    const savedData = JSON.parse(fs.readFileSync(path.join(testDataDir, files[0]), 'utf-8'));
    expect(savedData).toMatchObject(testData);
  });

  it('应该正确处理无效数据', async () => {
    const invalidData = null;
    await expect(dataCollectionService.saveData(invalidData as any)).rejects.toThrow('无效的数据格式');
  });

  it('应该正确处理文件系统错误', async () => {
    // 模拟文件系统错误
    const { writeFile } = require('fs/promises');
    writeFile.mockRejectedValue(new Error('文件系统错误'));

    const testData = {
      userId: 'test-user',
      action: 'test-action',
      timestamp: new Date().toISOString()
    };

    await expect(dataCollectionService.saveData(testData)).rejects.toThrow('文件系统错误');
  });
}); 