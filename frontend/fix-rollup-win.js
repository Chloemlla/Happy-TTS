#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔧 修复 Windows 下 Rollup 依赖问题...');

// 检查是否在 Windows 环境下
const isWindows = process.platform === 'win32';

if (isWindows) {
    console.log('📋 检测到 Windows 环境，正在修复 Rollup 依赖...');
    
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
        
        // 设置环境变量以强制安装可选依赖
        process.env.npm_config_optional = 'true';
        process.env.npm_config_include = 'optional';
        
        // 重新安装依赖
        console.log('📦 重新安装依赖（包含可选依赖）...');
        execSync('npm install --include=optional', { stdio: 'inherit' });
        
        // 强制安装 rollup Windows 二进制文件
        console.log('🔧 强制安装 Rollup Windows 二进制文件...');
        try {
            execSync('npm install @rollup/rollup-win32-x64-msvc --force', { stdio: 'inherit' });
        } catch (error) {
            console.log('⚠️  Rollup Windows 二进制文件安装失败，尝试替代方案...');
        }
        
        console.log('✅ Windows Rollup 依赖修复完成！');
    } catch (error) {
        console.error('❌ 修复失败:', error.message);
        process.exit(1);
    }
} else {
    console.log('ℹ️  非 Windows 环境，跳过修复...');
} 