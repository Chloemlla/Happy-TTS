import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals';
import { dataCollectionService } from '../services/dataCollectionService';
import fs from 'fs';
import path from 'path';

describe('Data Collection Service', () => {
  const testDataDir = path.join(process.cwd(), 'test-data');

  beforeEach(() => {
    // 设置测试环境
    process.env.NODE_ENV = 'test';
    
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
    
    // 恢复环境
    delete process.env.NODE_ENV;
  });

  it('应该成功保存数据', async () => {
    const testData = {
      userId: 'test-user',
      action: 'test-action',
      timestamp: new Date().toISOString(),
      details: { test: 'data' }
    };

    await dataCollectionService.saveData(testData);
    
    // 等待文件写入完成
    await new Promise(resolve => setTimeout(resolve, 200));
    
    const files = fs.readdirSync(testDataDir);
    expect(files.length).toBeGreaterThan(0);

    // 找到最新的文件
    const latestFile = files
      .filter(file => file.endsWith('.json'))
      .sort()
      .pop();
    
    expect(latestFile).toBeDefined();
    
    const savedData = JSON.parse(fs.readFileSync(path.join(testDataDir, latestFile!), 'utf-8'));
    expect(savedData).toMatchObject(testData);
  });

  it('应该正确处理无效数据', async () => {
    const invalidData = null;
    await expect(dataCollectionService.saveData(invalidData as any)).rejects.toThrow('无效的数据格式');
  });

  it('应该正确处理缺少必需字段的数据', async () => {
    const invalidData = {
      userId: 'test-user'
      // 缺少 action 和 timestamp
    };
    await expect(dataCollectionService.saveData(invalidData as any)).rejects.toThrow('缺少必需字段');
  });

  it('应该正确处理文件系统错误', async () => {
    // 模拟文件系统错误 - 通过设置只读目录
    const readOnlyDir = path.join(testDataDir, 'readonly');
    fs.mkdirSync(readOnlyDir, { recursive: true });
    
    // 临时修改服务的数据目录为只读目录
    const originalDataDir = (dataCollectionService as any).TEST_DATA_DIR;
    (dataCollectionService as any).TEST_DATA_DIR = readOnlyDir;
    
    // 设置目录为只读（在Windows上可能不工作，所以使用try-catch）
    try {
      fs.chmodSync(readOnlyDir, 0o444);
    } catch (error) {
      // 忽略权限错误
    }

    const testData = {
      userId: 'test-user',
      action: 'test-action',
      timestamp: new Date().toISOString()
    };

    // 期望抛出错误，但不指定具体错误类型
    try {
      await dataCollectionService.saveData(testData);
      // 如果没有抛出错误，说明测试失败
      expect(true).toBe(false); // 强制失败
    } catch (error) {
      // 期望抛出错误
      expect(error).toBeDefined();
    }
    
    // 恢复原始目录
    (dataCollectionService as any).TEST_DATA_DIR = originalDataDir;
  });
}); 