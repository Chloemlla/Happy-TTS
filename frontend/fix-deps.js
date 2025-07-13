const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔧 修复前端依赖问题...');

try {
  // 清理缓存和依赖
  console.log('清理缓存和依赖...');
  if (fs.existsSync('node_modules')) {
    execSync('rm -rf node_modules', { stdio: 'inherit' });
  }
  if (fs.existsSync('package-lock.json')) {
    execSync('rm -f package-lock.json', { stdio: 'inherit' });
  }
  
  execSync('npm cache clean --force', { stdio: 'inherit' });

  // 设置环境变量
  process.env.NODE_OPTIONS = '--max-old-space-size=4096';
  process.env.NPM_CONFIG_CACHE = '/tmp/.npm';

  // 安装依赖
  console.log('安装依赖...');
  execSync('npm install --no-optional --no-audit --no-fund', { stdio: 'inherit' });

  // 特别安装缺失的依赖
  console.log('安装缺失的依赖...');
  execSync('npm install @fingerprintjs/fingerprintjs@^4.2.0 crypto-js@^4.2.0 --save', { stdio: 'inherit' });
  execSync('npm install @testing-library/react@^14.2.1 --save-dev', { stdio: 'inherit' });

  // 安装 Rollup 依赖
  console.log('安装 Rollup 依赖...');
  try {
    execSync('npm install @rollup/rollup-linux-x64-gnu --save-dev', { stdio: 'inherit' });
  } catch (error) {
    console.log('Rollup Linux dependency installation failed, continuing...');
  }

  console.log('✅ 依赖修复完成！');
} catch (error) {
  console.error('❌ 修复失败:', error.message);
  process.exit(1);
} 