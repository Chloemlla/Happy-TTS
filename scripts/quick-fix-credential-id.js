#!/usr/bin/env node

/**
 * 快速修复credentialID问题
 * 专门用于解决当前的Passkey认证问题
 * 使用方法: node scripts/quick-fix-credential-id.js
 */

const fs = require('fs');
const path = require('path');

// 用户数据文件路径
const USERS_FILE = path.join(__dirname, '..', 'data', 'users.json');

// 备份文件路径
const BACKUP_FILE = path.join(__dirname, '..', 'data', 'users.json.backup.quick.' + Date.now());

console.log('=== Passkey CredentialID 快速修复 ===\n');

try {
    // 检查文件是否存在
    if (!fs.existsSync(USERS_FILE)) {
        console.error(`错误: 用户数据文件不存在: ${USERS_FILE}`);
        process.exit(1);
    }

    // 读取用户数据
    console.log('读取用户数据...');
    const usersData = fs.readFileSync(USERS_FILE, 'utf8');
    const users = JSON.parse(usersData);

    console.log(`找到 ${users.length} 个用户`);

    // 创建备份
    console.log('创建备份文件...');
    fs.writeFileSync(BACKUP_FILE, usersData);
    console.log(`备份已创建: ${BACKUP_FILE}`);

    let hasChanges = false;

    // 处理每个用户
    for (const user of users) {
        if (!user.passkeyEnabled || !user.passkeyCredentials || user.passkeyCredentials.length === 0) {
            continue;
        }

        console.log(`\n检查用户: ${user.username} (ID: ${user.id})`);
        console.log(`  凭证数量: ${user.passkeyCredentials.length}`);

        // 检查每个credential
        for (let i = 0; i < user.passkeyCredentials.length; i++) {
            const cred = user.passkeyCredentials[i];
            if (!cred || typeof cred !== 'object') {
                console.log(`  [警告] 凭证 ${i} 无效，将被剔除`);
                user.passkeyCredentials[i] = null;
                hasChanges = true;
                continue;
            }

            const credentialId = cred.credentialID;
            
            // 检查credentialID是否有效
            if (!credentialId || typeof credentialId !== 'string' || credentialId.length === 0) {
                console.log(`  [错误] 凭证 ${i} (${cred.name}): credentialID无效`);
                console.log(`    值: ${credentialId}`);
                console.log(`    类型: ${typeof credentialId}`);
                user.passkeyCredentials[i] = null;
                hasChanges = true;
                continue;
            }

            // 检查格式
            if (!/^[A-Za-z0-9_-]+$/.test(credentialId)) {
                console.log(`  [警告] 凭证 ${i} (${cred.name}): credentialID格式不正确`);
                console.log(`    当前: ${credentialId}`);
                
                // 尝试修复
                try {
                    let fixedId = credentialId;
                    
                    // 如果是base64格式，转换为base64url
                    if (/^[A-Za-z0-9+/]+=*$/.test(credentialId)) {
                        const buffer = Buffer.from(credentialId, 'base64');
                        fixedId = buffer.toString('base64url');
                        console.log(`    修复为: ${fixedId}`);
                    } else {
                        // 其他格式，尝试直接转换
                        fixedId = Buffer.from(credentialId).toString('base64url');
                        console.log(`    强制修复为: ${fixedId}`);
                    }
                    
                    cred.credentialID = fixedId;
                    hasChanges = true;
                } catch (error) {
                    console.log(`    [错误] 修复失败: ${error.message}，凭证将被剔除`);
                    user.passkeyCredentials[i] = null;
                    hasChanges = true;
                }
            } else {
                console.log(`  [正常] 凭证 ${i} (${cred.name}): 格式正确`);
            }
        }

        // 剔除无效的credential
        const beforeFilter = user.passkeyCredentials.length;
        user.passkeyCredentials = user.passkeyCredentials.filter(c => 
            c && 
            typeof c === 'object' && 
            typeof c.credentialID === 'string' && 
            c.credentialID.length > 0
        );
        const afterFilter = user.passkeyCredentials.length;

        if (beforeFilter !== afterFilter) {
            hasChanges = true;
            console.log(`  [清理] 剔除无效凭证: ${beforeFilter} -> ${afterFilter}`);
        }

        // 更新passkeyEnabled状态
        if (user.passkeyCredentials.length === 0) {
            user.passkeyEnabled = false;
            hasChanges = true;
            console.log(`  [更新] 用户无有效凭证，禁用Passkey`);
        }

        console.log(`  [完成] 剩余 ${afterFilter} 个有效凭证`);
    }

    if (hasChanges) {
        // 保存修复后的数据
        console.log('\n保存修复后的数据...');
        const updatedData = JSON.stringify(users, null, 2);
        fs.writeFileSync(USERS_FILE, updatedData);

        console.log('\n=== 修复完成 ===');
        console.log(`数据已保存到: ${USERS_FILE}`);
        console.log(`备份文件: ${BACKUP_FILE}`);
        console.log('\n建议重启服务器并测试Passkey认证功能');
    } else {
        console.log('\n=== 无需修复 ===');
        console.log('所有用户的credentialID都是有效的');
    }

} catch (error) {
    console.error('\n=== 错误 ===');
    console.error('修复过程中发生错误:', error.message);
    console.error('请检查备份文件:', BACKUP_FILE);
    process.exit(1);
} 