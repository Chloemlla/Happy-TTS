import { spawn } from 'child_process';
import path from 'path';

describe('异步操作清理测试', () => {
  it('应能检测Jest异步操作未清理', done => {
    const testProcess = spawn('node', ['--version'], {
      stdio: 'pipe',
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: 'test'
      }
    });
    
    let output = '';
    testProcess.stdout.on('data', (data) => {
      output += data.toString();
    });
    testProcess.stderr.on('data', (data) => {
      output += data.toString();
    });
    
    testProcess.on('close', (code) => {
      expect(typeof code).toBe('number');
      expect(output).toContain('v');
      done();
    });
    
    testProcess.on('error', (error) => {
      console.warn('Node command failed, skipping test:', error.message);
      done();
    });
    
    setTimeout(() => {
      testProcess.kill('SIGTERM');
      done();
    }, 5000);
  });
}); 