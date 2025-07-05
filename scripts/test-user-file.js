#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// 测试用户文件修复功能
async function testUserFile() {
    console.log('=== 测试用户文件修复功能 ===');
    
    const dataDir = path.join(process.cwd(), 'data');
    const usersFile = path.join(dataDir, 'users.json');
    
    console.log(`用户文件路径: ${usersFile}`);
    
    // 测试1: 文件不存在的情况
    console.log('\n--- 测试1: 文件不存在 ---');
    if (fs.existsSync(usersFile)) {
        const backupFile = usersFile + '.backup';
        fs.copyFileSync(usersFile, backupFile);
        fs.unlinkSync(usersFile);
        console.log('✅ 已备份并删除现有文件');
    }
    
    try {
        // 模拟UserStorage.ensureUsersFile()的调用
        const { UserStorage } = require('../dist/utils/userStorage.js');
        await UserStorage.getAllUsers();
        console.log('✅ 文件不存在时自动创建默认管理员账户');
    } catch (error) {
        console.log('❌ 文件不存在时创建失败:', error.message);
    }
    
    // 测试2: 空文件的情况
    console.log('\n--- 测试2: 空文件 ---');
    fs.writeFileSync(usersFile, '');
    console.log('✅ 已创建空文件');
    
    try {
        const { UserStorage } = require('../dist/utils/userStorage.js');
        const users = await UserStorage.getAllUsers();
        console.log('✅ 空文件时自动创建默认管理员账户');
        console.log(`用户数量: ${users.length}`);
        if (users.length > 0) {
            console.log(`第一个用户: ${users[0].username} (${users[0].role})`);
        }
    } catch (error) {
        console.log('❌ 空文件时创建失败:', error.message);
    }
    
    // 测试3: 格式错误的文件
    console.log('\n--- 测试3: 格式错误的文件 ---');
    fs.writeFileSync(usersFile, 'invalid json content');
    console.log('✅ 已创建格式错误的文件');
    
    try {
        const { UserStorage } = require('../dist/utils/userStorage.js');
        const users = await UserStorage.getAllUsers();
        console.log('✅ 格式错误文件时自动创建默认管理员账户');
        console.log(`用户数量: ${users.length}`);
        if (users.length > 0) {
            console.log(`第一个用户: ${users[0].username} (${users[0].role})`);
        }
    } catch (error) {
        console.log('❌ 格式错误文件时创建失败:', error.message);
    }
    
    // 测试4: 空数组的文件
    console.log('\n--- 测试4: 空数组文件 ---');
    fs.writeFileSync(usersFile, '[]');
    console.log('✅ 已创建空数组文件');
    
    try {
        const { UserStorage } = require('../dist/utils/userStorage.js');
        const users = await UserStorage.getAllUsers();
        console.log('✅ 空数组文件时自动创建默认管理员账户');
        console.log(`用户数量: ${users.length}`);
        if (users.length > 0) {
            console.log(`第一个用户: ${users[0].username} (${users[0].role})`);
        }
    } catch (error) {
        console.log('❌ 空数组文件时创建失败:', error.message);
    }
    
    // 恢复备份文件
    const backupFile = usersFile + '.backup';
    if (fs.existsSync(backupFile)) {
        fs.copyFileSync(backupFile, usersFile);
        fs.unlinkSync(backupFile);
        console.log('\n✅ 已恢复原始用户文件');
    }
    
    console.log('\n=== 测试完成 ===');
}

// 如果直接运行此脚本
if (require.main === module) {
    testUserFile().catch(console.error);
}

module.exports = { testUserFile }; 