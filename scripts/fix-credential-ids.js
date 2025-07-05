#!/usr/bin/env node

/**
 * 修复用户数据中的credentialID问题
 * 使用方法: node scripts/fix-credential-ids.js
 */

const fs = require('fs');
const path = require('path');

// 用户数据文件路径
const USERS_FILE = path.join(__dirname, '..', 'data', 'users.json');

// 备份文件路径
const BACKUP_FILE = path.join(__dirname, '..', 'data', 'users.json.backup.' + Date.now());

// 修复单个credentialID
function fixCredentialId(credentialId) {
    if (!credentialId) {
        throw new Error('credentialID为空');
    }

    // 如果已经是正确的base64url格式，直接返回
    if (typeof credentialId === 'string' && /^[A-Za-z0-9_-]+$/.test(credentialId)) {
        return credentialId;
    }

    // 尝试转换为base64url格式
    try {
        if (Buffer.isBuffer(credentialId)) {
            return credentialId.toString('base64url');
        }
        
        if (typeof credentialId === 'string') {
            // 尝试从base64解码再重新编码为base64url
            try {
                const buffer = Buffer.from(credentialId, 'base64');
                return buffer.toString('base64url');
            } catch {
                // 如果解码失败，直接转换为base64url
                return Buffer.from(credentialId).toString('base64url');
            }
        }
        
        // 其他类型，强制转换为字符串再转base64url
        return Buffer.from(String(credentialId)).toString('base64url');
        
    } catch (error) {
        throw new Error(`无法修复credentialID: ${credentialId} - ${error.message}`);
    }
}

// 检查credentialID是否有效
function isValidCredentialId(credentialId) {
    return credentialId && 
           typeof credentialId === 'string' && 
           /^[A-Za-z0-9_-]+$/.test(credentialId) && 
           credentialId.length > 0;
}

// 获取credentialID的详细信息
function getCredentialIdInfo(credentialId) {
    const issues = [];
    let isValid = false;
    let format = 'unknown';

    if (!credentialId) {
        issues.push('credentialID为空');
    } else if (typeof credentialId !== 'string') {
        issues.push(`credentialID类型错误: ${typeof credentialId}`);
    } else if (credentialId.length === 0) {
        issues.push('credentialID长度为0');
    } else if (!/^[A-Za-z0-9_-]+$/.test(credentialId)) {
        issues.push('credentialID格式不是有效的base64url');
        // 尝试检测格式
        if (/^[A-Za-z0-9+/]+=*$/.test(credentialId)) {
            format = 'base64';
        } else if (/^[A-Za-z0-9_-]+$/.test(credentialId)) {
            format = 'base64url';
        } else {
            format = 'unknown';
        }
    } else {
        isValid = true;
        format = 'base64url';
    }

    return {
        isValid,
        type: typeof credentialId,
        length: credentialId?.length || 0,
        format,
        issues
    };
}

// 修复用户数据
function fixUserData(users) {
    let totalFixed = 0;
    let totalUsers = 0;
    let hasChanges = false;

    for (const user of users) {
        if (!user.passkeyEnabled || !user.passkeyCredentials || user.passkeyCredentials.length === 0) {
            continue;
        }

        totalUsers++;
        let userFixed = 0;
        let userHasChanges = false;

        console.log(`\n检查用户: ${user.username} (ID: ${user.id})`);
        console.log(`  凭证数量: ${user.passkeyCredentials.length}`);

        // 修复每个credential的credentialID
        for (let i = 0; i < user.passkeyCredentials.length; i++) {
            const cred = user.passkeyCredentials[i];
            if (!cred || typeof cred !== 'object') {
                console.log(`  [警告] 凭证 ${i} 无效，将被剔除`);
                user.passkeyCredentials[i] = null;
                userHasChanges = true;
                continue;
            }

            const originalCredentialId = cred.credentialID;
            const info = getCredentialIdInfo(originalCredentialId);

            if (!info.isValid) {
                console.log(`  [修复] 凭证 ${i} (${cred.name}):`);
                console.log(`    原始: ${originalCredentialId}`);
                console.log(`    问题: ${info.issues.join(', ')}`);

                try {
                    const fixedCredentialId = fixCredentialId(originalCredentialId);
                    const fixedInfo = getCredentialIdInfo(fixedCredentialId);

                    if (fixedInfo.isValid) {
                        cred.credentialID = fixedCredentialId;
                        userFixed++;
                        userHasChanges = true;
                        console.log(`    修复后: ${fixedCredentialId}`);
                        console.log(`    状态: 有效`);
                    } else {
                        console.log(`    [错误] 修复失败，凭证将被剔除`);
                        user.passkeyCredentials[i] = null;
                        userHasChanges = true;
                    }
                } catch (error) {
                    console.log(`    [错误] 修复失败: ${error.message}，凭证将被剔除`);
                    user.passkeyCredentials[i] = null;
                    userHasChanges = true;
                }
            } else {
                console.log(`  [正常] 凭证 ${i} (${cred.name}): 有效`);
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
            userHasChanges = true;
            console.log(`  [清理] 剔除无效凭证: ${beforeFilter} -> ${afterFilter}`);
        }

        // 更新passkeyEnabled状态
        if (user.passkeyCredentials.length === 0) {
            user.passkeyEnabled = false;
            userHasChanges = true;
            console.log(`  [更新] 用户无有效凭证，禁用Passkey`);
        }

        if (userHasChanges) {
            hasChanges = true;
            totalFixed += userFixed;
            console.log(`  [完成] 修复了 ${userFixed} 个credentialID，剩余 ${afterFilter} 个有效凭证`);
        } else {
            console.log(`  [完成] 无需修复`);
        }
    }

    return {
        hasChanges,
        totalUsers,
        totalFixed
    };
}

// 主函数
async function main() {
    try {
        console.log('=== Passkey CredentialID 修复工具 ===\n');

        // 检查文件是否存在
        if (!fs.existsSync(USERS_FILE)) {
            console.error(`错误: 用户数据文件不存在: ${USERS_FILE}`);
            process.exit(1);
        }

        // 读取用户数据
        console.log('读取用户数据...');
        const usersData = fs.readFileSync(USERS_FILE, 'utf8');
        const users = JSON.parse(usersData);

        console.log(`找到 ${users.length} 个用户\n`);

        // 创建备份
        console.log('创建备份文件...');
        fs.writeFileSync(BACKUP_FILE, usersData);
        console.log(`备份已创建: ${BACKUP_FILE}\n`);

        // 修复数据
        const result = fixUserData(users);

        if (result.hasChanges) {
            // 保存修复后的数据
            console.log('\n保存修复后的数据...');
            const updatedData = JSON.stringify(users, null, 2);
            fs.writeFileSync(USERS_FILE, updatedData);

            console.log('\n=== 修复完成 ===');
            console.log(`检查了 ${result.totalUsers} 个启用Passkey的用户`);
            console.log(`修复了 ${result.totalFixed} 个credentialID`);
            console.log(`数据已保存到: ${USERS_FILE}`);
            console.log(`备份文件: ${BACKUP_FILE}`);
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
}

// 运行主函数
main(); 