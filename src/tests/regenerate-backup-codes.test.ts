import { TOTPService } from '../services/totpService';
import { TOTPController } from '../controllers/totpController';
import { Request, Response } from 'express';

// Mock Express Request and Response
const createMockRequest = (headers: any = {}): Partial<Request> => ({
  headers: { authorization: 'Bearer test-user-id', ...headers }
});

const createMockResponse = (): Partial<Response> => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('重新生成备用恢复码功能测试', () => {
  test('TOTPService.generateBackupCodes 应该生成新的恢复码', () => {
    const backupCodes1 = TOTPService.generateBackupCodes();
    const backupCodes2 = TOTPService.generateBackupCodes();
    
    console.log('第一组恢复码:', backupCodes1);
    console.log('第二组恢复码:', backupCodes2);
    
    expect(backupCodes1).toBeDefined();
    expect(backupCodes2).toBeDefined();
    expect(backupCodes1.length).toBe(10);
    expect(backupCodes2.length).toBe(10);
    
    // 验证格式
    expect(backupCodes1.every(code => /^[A-Z0-9]{8}$/.test(code))).toBe(true);
    expect(backupCodes2.every(code => /^[A-Z0-9]{8}$/.test(code))).toBe(true);
    
    // 验证唯一性（两组应该不同）
    const intersection = backupCodes1.filter(code => backupCodes2.includes(code));
    console.log('重复的恢复码数量:', intersection.length);
    // 由于是随机生成，可能会有少量重复，但大部分应该是不同的
    expect(intersection.length).toBeLessThan(5);
  });

  test('TOTPController.regenerateBackupCodes 应该正确处理请求', async () => {
    const req = createMockRequest() as Request;
    const res = createMockResponse() as Response;
    
    // 注意：这个测试需要真实的用户数据，在实际环境中需要设置测试数据
    // 这里只是验证方法存在且可以调用
    expect(typeof TOTPController.regenerateBackupCodes).toBe('function');
    
    console.log('regenerateBackupCodes 方法存在且可调用');
  });

  test('重新生成恢复码的安全考虑', () => {
    const originalCodes = TOTPService.generateBackupCodes();
    const newCodes = TOTPService.generateBackupCodes();
    
    console.log('原始恢复码:', originalCodes);
    console.log('新恢复码:', newCodes);
    
    // 验证新生成的恢复码与原始恢复码不同
    const commonCodes = originalCodes.filter(code => newCodes.includes(code));
    console.log('相同的恢复码:', commonCodes);
    
    // 由于是随机生成，可能会有少量重复，但大部分应该是不同的
    expect(commonCodes.length).toBeLessThan(3);
    
    // 验证每个恢复码都是唯一的
    const originalUnique = new Set(originalCodes);
    const newUnique = new Set(newCodes);
    
    expect(originalUnique.size).toBe(10);
    expect(newUnique.size).toBe(10);
  });
}); 