#!/usr/bin/env node

/**
 * 修复credentialID不匹配问题
 * 使用方法: node scripts/fix-credential-id-mismatch.js
 */

const fs = require('fs');
const path = require('path');

// 用户数据文件路径
const USERS_FILE = path.join(__dirname, '..', 'data', 'users.json');

// 备份文件路径
const BACKUP_FILE = path.join(__dirname, '..', 'data', 'users.json.backup.mismatch.' + Date.now());

console.log('=== CredentialID 不匹配修复工具 ===\n');

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
            console.log(`  [检查] 凭证 ${i} (${cred.name}):`);
            console.log(`    当前credentialID: ${credentialId}`);
            console.log(`    长度: ${credentialId?.length || 0}`);
            
            // 检查是否为base64url格式
            const isBase64Url = credentialId && /^[A-Za-z0-9_-]+$/.test(credentialId);
            console.log(`    是否为base64url格式: ${isBase64Url ? '是' : '否'}`);

            if (!isBase64Url) {
                console.log(`    [警告] credentialID格式不正确`);
                
                // 尝试修复
                try {
                    // 如果是base64格式，转换为base64url
                    if (credentialId && /^[A-Za-z0-9+/]+=*$/.test(credentialId)) {
                        const buffer = Buffer.from(credentialId, 'base64');
                        const fixedId = buffer.toString('base64url');
                        console.log(`    从base64转换: ${fixedId}`);
                        cred.credentialID = fixedId;
                        hasChanges = true;
                    } else {
                        console.log(`    [错误] 无法修复credentialID格式`);
                    }
                } catch (error) {
                    console.log(`    [错误] 修复失败: ${error.message}`);
                }
            }

            // 检查id字段是否与credentialID一致
            if (cred.id && cred.id !== cred.credentialID) {
                console.log(`    [修复] id字段与credentialID不一致:`);
                console.log(`      id: ${cred.id}`);
                console.log(`      credentialID: ${cred.credentialID}`);
                console.log(`      统一为credentialID的值`);
                cred.id = cred.credentialID;
                hasChanges = true;
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
        console.log('所有用户的credentialID都是正确的');
    }

} catch (error) {
    console.error('\n=== 错误 ===');
    console.error('修复过程中发生错误:', error.message);
    console.error('请检查备份文件:', BACKUP_FILE);
    process.exit(1);
} 