#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// 检查文件权限的脚本
function checkFilePermissions() {
    console.log('=== 文件权限检查 ===');
    
    const dataDir = path.join(process.cwd(), 'data');
    const usersFile = path.join(dataDir, 'users.json');
    
    console.log(`当前工作目录: ${process.cwd()}`);
    console.log(`数据目录: ${dataDir}`);
    console.log(`用户文件: ${usersFile}`);
    
    // 检查数据目录
    try {
        if (fs.existsSync(dataDir)) {
            console.log('✅ 数据目录存在');
            
            // 检查目录权限
            try {
                fs.accessSync(dataDir, fs.constants.R_OK | fs.constants.W_OK);
                console.log('✅ 数据目录有读写权限');
            } catch (error) {
                console.log('❌ 数据目录权限不足:', error.message);
            }
            
            // 列出目录内容
            const files = fs.readdirSync(dataDir);
            console.log('📁 数据目录内容:', files);
        } else {
            console.log('❌ 数据目录不存在');
            
            // 尝试创建目录
            try {
                fs.mkdirSync(dataDir, { recursive: true });
                console.log('✅ 已创建数据目录');
            } catch (error) {
                console.log('❌ 创建数据目录失败:', error.message);
            }
        }
    } catch (error) {
        console.log('❌ 检查数据目录时出错:', error.message);
    }
    
    // 检查用户文件
    try {
        if (fs.existsSync(usersFile)) {
            console.log('✅ 用户文件存在');
            
            // 检查文件权限
            try {
                fs.accessSync(usersFile, fs.constants.R_OK | fs.constants.W_OK);
                console.log('✅ 用户文件有读写权限');
            } catch (error) {
                console.log('❌ 用户文件权限不足:', error.message);
            }
            
            // 检查文件大小
            const stats = fs.statSync(usersFile);
            console.log(`📊 文件大小: ${stats.size} 字节`);
            
            // 尝试读取文件内容
            try {
                const content = fs.readFileSync(usersFile, 'utf-8');
                console.log('✅ 文件可读取');
                
                if (content.trim() === '') {
                    console.log('⚠️  文件内容为空');
                } else {
                    try {
                        const parsed = JSON.parse(content);
                        if (Array.isArray(parsed)) {
                            console.log(`✅ 文件格式正确，包含 ${parsed.length} 个用户`);
                        } else {
                            console.log('❌ 文件内容不是数组格式');
                        }
                    } catch (parseError) {
                        console.log('❌ 文件内容不是有效的JSON:', parseError.message);
                    }
                }
            } catch (readError) {
                console.log('❌ 读取文件失败:', readError.message);
            }
        } else {
            console.log('❌ 用户文件不存在');
        }
    } catch (error) {
        console.log('❌ 检查用户文件时出错:', error.message);
    }
    
    // 检查进程权限
    console.log('\n=== 进程信息 ===');
    console.log(`进程ID: ${process.pid}`);
    console.log(`用户ID: ${process.getuid ? process.getuid() : 'N/A'}`);
    console.log(`组ID: ${process.getgid ? process.getgid() : 'N/A'}`);
    console.log(`Node.js版本: ${process.version}`);
    console.log(`平台: ${process.platform}`);
    console.log(`架构: ${process.arch}`);
    
    // 检查环境变量
    console.log('\n=== 环境变量 ===');
    console.log(`NODE_ENV: ${process.env.NODE_ENV || '未设置'}`);
    console.log(`PWD: ${process.env.PWD || '未设置'}`);
    
    console.log('\n=== 检查完成 ===');
}

// 如果直接运行此脚本
if (require.main === module) {
    checkFilePermissions();
}

module.exports = { checkFilePermissions }; 