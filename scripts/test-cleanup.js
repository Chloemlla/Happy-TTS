#!/usr/bin/env node

/**
 * 测试清理脚本
 * 用于验证异步操作清理是否正常工作
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('🧪 开始测试异步操作清理...');

// 运行测试并监控进程
const testProcess = spawn('npm', ['test'], {
  stdio: 'pipe',
  cwd: process.cwd(),
  env: {
    ...process.env,
    NODE_ENV: 'test',
    // 设置较短的超时时间
    JEST_TIMEOUT: '10000'
  }
});

let output = '';
let errorOutput = '';

testProcess.stdout.on('data', (data) => {
  const text = data.toString();
  output += text;
  process.stdout.write(text);
});

testProcess.stderr.on('data', (data) => {
  const text = data.toString();
  errorOutput += text;
  process.stderr.write(text);
});

testProcess.on('close', (code) => {
  console.log('\n📊 测试完成，退出码:', code);
  
  // 检查是否有异步操作警告
  if (output.includes('Jest did not exit') || output.includes('asynchronous operations')) {
    console.log('❌ 检测到异步操作问题');
    console.log('建议检查以下内容:');
    console.log('1. 定时器 (setTimeout, setInterval)');
    console.log('2. 数据库连接');
    console.log('3. 文件监听器');
    console.log('4. HTTP 服务器');
    console.log('5. WebSocket 连接');
    
    // 显示相关输出
    const lines = output.split('\n');
    const relevantLines = lines.filter(line => 
      line.includes('Jest did not exit') || 
      line.includes('asynchronous operations') ||
      line.includes('detectOpenHandles')
    );
    
    if (relevantLines.length > 0) {
      console.log('\n相关输出:');
      relevantLines.forEach(line => console.log('  ' + line));
    }
    
    process.exit(1);
  } else {
    console.log('✅ 异步操作清理正常');
    process.exit(0);
  }
});

testProcess.on('error', (error) => {
  console.error('❌ 测试进程启动失败:', error);
  process.exit(1);
});

// 设置超时
setTimeout(() => {
  console.log('⏰ 测试超时，强制终止进程');
  testProcess.kill('SIGTERM');
  process.exit(1);
}, 60000); // 60秒超时 