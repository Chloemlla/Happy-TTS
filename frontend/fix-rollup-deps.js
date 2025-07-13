#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔧 修复 Rollup 依赖问题...');

// 检查是否在 Linux 环境下
const isLinux = process.platform === 'linux';

if (isLinux) {
    console.log('📋 检测到 Linux 环境，正在修复 Rollup 依赖...');
    
    try {
        // 检查 node_modules 是否存在
        const nodeModulesPath = path.join(__dirname, 'node_modules');
        const packageLockPath = path.join(__dirname, 'package-lock.json');
        
        if (fs.existsSync(nodeModulesPath)) {
            console.log('🗑️  删除 node_modules...');
            fs.rmSync(nodeModulesPath, { recursive: true, force: true });
        }
        
        if (fs.existsSync(packageLockPath)) {
            console.log('🗑️  删除 package-lock.json...');
            fs.unlinkSync(packageLockPath);
        }
        
        // 清理 npm 缓存
        console.log('🧹 清理 npm 缓存...');
        execSync('npm cache clean --force', { stdio: 'inherit' });
        
        // 重新安装依赖
        console.log('📦 重新安装依赖...');
        execSync('npm install', { stdio: 'inherit' });
        
        console.log('✅ 修复完成！');
    } catch (error) {
        console.error('❌ 修复失败:', error.message);
        process.exit(1);
    }
} else {
    console.log('ℹ️  非 Linux 环境，跳过修复...');
} 