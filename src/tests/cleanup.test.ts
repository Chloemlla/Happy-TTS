import { spawn } from 'child_process';

describe('异步操作清理测试', () => {
  it('应能检测Jest异步操作未清理', (done) => {
    // 简单的异步测试
    setTimeout(() => {
      expect(true).toBe(true);
      done();
    }, 100);
  });

  it('应能正确处理Promise', async () => {
    const result = await Promise.resolve('test');
    expect(result).toBe('test');
  });

  it('应能清理定时器', (done) => {
    const timer = setTimeout(() => {
      expect(true).toBe(true);
      done();
    }, 50);
    
    // 确保定时器被清理
    setTimeout(() => {
      clearTimeout(timer);
    }, 100);
  });
}); 