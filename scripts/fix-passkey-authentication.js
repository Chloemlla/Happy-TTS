const fs = require('fs');
const path = require('path');

// 用户数据文件路径
const USERS_FILE = path.join(process.cwd(), 'data', 'users.json');

/**
 * 读取用户数据
 */
function readUsers() {
    try {
        if (!fs.existsSync(USERS_FILE)) {
            console.log('用户数据文件不存在');
            return [];
        }
        const data = fs.readFileSync(USERS_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        console.error('读取用户数据失败:', error);
        return [];
    }
}

/**
 * 写入用户数据
 */
function writeUsers(users) {
    try {
        const tempFile = `${USERS_FILE}.tmp`;
        fs.writeFileSync(tempFile, JSON.stringify(users, null, 2));
        fs.renameSync(tempFile, USERS_FILE);
        console.log('用户数据已保存');
    } catch (error) {
        console.error('写入用户数据失败:', error);
    }
}

/**
 * 检查用户Passkey状态
 */
function checkUserPasskeyStatus(username) {
    const users = readUsers();
    const user = users.find(u => u.username === username);
    
    if (!user) {
        console.log(`用户 ${username} 不存在`);
        return null;
    }
    
    console.log(`\n=== 用户 ${username} 的Passkey状态 ===`);
    console.log(`用户ID: ${user.id}`);
    console.log(`Passkey启用: ${user.passkeyEnabled || false}`);
    console.log(`凭证数量: ${user.passkeyCredentials?.length || 0}`);
    
    if (user.passkeyCredentials && user.passkeyCredentials.length > 0) {
        console.log('\n存储的凭证:');
        user.passkeyCredentials.forEach((cred, index) => {
            console.log(`  凭证 ${index + 1}:`);
            console.log(`    ID: ${cred.id}`);
            console.log(`    名称: ${cred.name}`);
            console.log(`    CredentialID: ${cred.credentialID?.substring(0, 20)}...`);
            console.log(`    计数器: ${cred.counter}`);
            console.log(`    创建时间: ${cred.createdAt}`);
        });
    } else {
        console.log('\n没有存储的Passkey凭证');
    }
    
    return user;
}

/**
 * 修复用户Passkey数据
 */
function fixUserPasskeyData(username) {
    const users = readUsers();
    const userIndex = users.findIndex(u => u.username === username);
    
    if (userIndex === -1) {
        console.log(`用户 ${username} 不存在`);
        return false;
    }
    
    const user = users[userIndex];
    let hasChanges = false;
    
    console.log(`\n=== 修复用户 ${username} 的Passkey数据 ===`);
    
    // 确保passkeyEnabled字段存在
    if (user.passkeyEnabled === undefined) {
        user.passkeyEnabled = false;
        hasChanges = true;
        console.log('设置 passkeyEnabled 为 false');
    }
    
    // 确保passkeyCredentials字段存在
    if (!user.passkeyCredentials) {
        user.passkeyCredentials = [];
        hasChanges = true;
        console.log('初始化 passkeyCredentials 为空数组');
    }
    
    // 修复credentialID格式
    if (user.passkeyCredentials && user.passkeyCredentials.length > 0) {
        console.log('\n检查并修复credentialID格式...');
        
        for (let i = 0; i < user.passkeyCredentials.length; i++) {
            const cred = user.passkeyCredentials[i];
            if (!cred || typeof cred !== 'object') {
                console.log(`  凭证 ${i + 1}: 无效对象，将被移除`);
                user.passkeyCredentials[i] = null;
                hasChanges = true;
                continue;
            }
            
            const originalCredentialId = cred.credentialID;
            const fixedCredentialId = fixCredentialId(originalCredentialId);
            
            if (fixedCredentialId !== originalCredentialId) {
                console.log(`  凭证 ${i + 1}: 修复credentialID`);
                console.log(`    原值: ${originalCredentialId?.substring(0, 20)}...`);
                console.log(`    修复: ${fixedCredentialId.substring(0, 20)}...`);
                cred.credentialID = fixedCredentialId;
                hasChanges = true;
            }
        }
        
        // 移除无效的凭证
        const beforeCount = user.passkeyCredentials.length;
        user.passkeyCredentials = user.passkeyCredentials.filter(c => 
            c && typeof c === 'object' && typeof c.credentialID === 'string' && c.credentialID.length > 0
        );
        const afterCount = user.passkeyCredentials.length;
        
        if (beforeCount !== afterCount) {
            console.log(`移除 ${beforeCount - afterCount} 个无效凭证`);
            hasChanges = true;
        }
    }
    
    // 更新passkeyEnabled状态
    const shouldBeEnabled = user.passkeyCredentials && user.passkeyCredentials.length > 0;
    if (user.passkeyEnabled !== shouldBeEnabled) {
        user.passkeyEnabled = shouldBeEnabled;
        hasChanges = true;
        console.log(`更新 passkeyEnabled 为 ${shouldBeEnabled}`);
    }
    
    if (hasChanges) {
        writeUsers(users);
        console.log('\n用户数据已修复并保存');
    } else {
        console.log('\n用户数据无需修复');
    }
    
    return hasChanges;
}

/**
 * 修复单个credentialID
 */
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

/**
 * 重置用户Passkey数据
 */
function resetUserPasskeyData(username) {
    const users = readUsers();
    const userIndex = users.findIndex(u => u.username === username);
    
    if (userIndex === -1) {
        console.log(`用户 ${username} 不存在`);
        return false;
    }
    
    const user = users[userIndex];
    
    console.log(`\n=== 重置用户 ${username} 的Passkey数据 ===`);
    
    user.passkeyEnabled = false;
    user.passkeyCredentials = [];
    user.pendingChallenge = undefined;
    user.currentChallenge = undefined;
    
    writeUsers(users);
    console.log('用户Passkey数据已重置');
    
    return true;
}

/**
 * 主函数
 */
function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    const username = args[1] || 'admin';
    
    console.log('Passkey数据修复工具');
    console.log('==================');
    
    switch (command) {
        case 'check':
            checkUserPasskeyStatus(username);
            break;
            
        case 'fix':
            fixUserPasskeyData(username);
            break;
            
        case 'reset':
            resetUserPasskeyData(username);
            break;
            
        case 'help':
        default:
            console.log('\n使用方法:');
            console.log('  node fix-passkey-authentication.js check [username]  - 检查用户Passkey状态');
            console.log('  node fix-passkey-authentication.js fix [username]   - 修复用户Passkey数据');
            console.log('  node fix-passkey-authentication.js reset [username] - 重置用户Passkey数据');
            console.log('\n示例:');
            console.log('  node fix-passkey-authentication.js check admin');
            console.log('  node fix-passkey-authentication.js fix admin');
            console.log('  node fix-passkey-authentication.js reset admin');
            break;
    }
}

// 运行主函数
if (require.main === module) {
    main();
}

module.exports = {
    checkUserPasskeyStatus,
    fixUserPasskeyData,
    resetUserPasskeyData,
    fixCredentialId
}; 