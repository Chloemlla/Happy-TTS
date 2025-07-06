#!/usr/bin/env node

/**
 * 无Git依赖的Docusaurus构建脚本
 * 用于在Docker环境中构建文档，避免Git相关警告
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 设置环境变量禁用Git功能
process.env.DISABLE_GIT_INFO = 'true';
process.env.GIT_DISABLED = 'true';
process.env.DOCUSAURUS_DISABLE_GIT_INFO = 'true';

console.log('🚀 开始构建文档（无Git依赖模式）...');
console.log('环境变量设置:');
console.log('  DISABLE_GIT_INFO:', process.env.DISABLE_GIT_INFO);
console.log('  GIT_DISABLED:', process.env.GIT_DISABLED);
console.log('  DOCUSAURUS_DISABLE_GIT_INFO:', process.env.DOCUSAURUS_DISABLE_GIT_INFO);

try {
  // 清理之前的构建
  console.log('🧹 清理之前的构建...');
  if (fs.existsSync('build')) {
    fs.rmSync('build', { recursive: true, force: true });
  }
  if (fs.existsSync('.docusaurus')) {
    fs.rmSync('.docusaurus', { recursive: true, force: true });
  }

  // 执行构建
  console.log('📦 执行Docusaurus构建...');
  execSync('npx docusaurus build', {
    stdio: 'inherit',
    env: {
      ...process.env,
      DISABLE_GIT_INFO: 'true',
      GIT_DISABLED: 'true',
      DOCUSAURUS_DISABLE_GIT_INFO: 'true',
      NODE_ENV: 'production'
    }
  });

  console.log('✅ 文档构建完成！');
  console.log('📁 构建输出目录: build/');

} catch (error) {
  console.error('❌ 构建失败:', error.message);
  process.exit(1);
} 