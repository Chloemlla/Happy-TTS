const fs = require('fs');
const path = require('path');

// 用户数据文件路径
const USERS_FILE = path.join(process.cwd(), 'data', 'users.json');

/**
 * 模拟Passkey认证错误场景
 */
function simulatePasskeyError() {
    console.log('=== 模拟Passkey认证错误场景 ===');
    
    // 读取当前用户数据
    const users = readUsers();
    const adminUser = users.find(u => u.username === 'admin');
    
    if (!adminUser) {
        console.log('未找到admin用户');
        return;
    }
    
    console.log('当前admin用户状态:');
    console.log(`  Passkey启用: ${adminUser.passkeyEnabled || false}`);
    console.log(`  凭证数量: ${adminUser.passkeyCredentials?.length || 0}`);
    
    // 模拟一个错误的credentialID
    const invalidCredential = {
        id: 'test-credential-1',
        name: '测试凭证',
        credentialID: 'invalid-credential-id-with-special-chars+/=', // 包含非base64url字符
        credentialPublicKey: 'test-public-key',
        counter: 0,
        createdAt: new Date().toISOString()
    };
    
    // 添加错误的凭证
    if (!adminUser.passkeyCredentials) {
        adminUser.passkeyCredentials = [];
    }
    adminUser.passkeyCredentials.push(invalidCredential);
    adminUser.passkeyEnabled = true;
    
    // 保存修改
    writeUsers(users);
    
    console.log('已添加错误的credentialID，现在用户状态:');
    console.log(`  Passkey启用: ${adminUser.passkeyEnabled}`);
    console.log(`  凭证数量: ${adminUser.passkeyCredentials.length}`);
    console.log(`  错误凭证ID: ${invalidCredential.credentialID}`);
}

/**
 * 测试自动修复功能
 */
async function testAutoFix() {
    console.log('\n=== 测试自动修复功能 ===');
    
    // 模拟错误场景
    simulatePasskeyError();
    
    // 导入PasskeyService（需要编译后的版本）
    try {
        const { PasskeyService } = require('../dist/services/passkeyService');
        const { UserStorage } = require('../dist/utils/userStorage');
        
        // 获取用户数据
        const user = await UserStorage.getUserByUsername('admin');
        if (!user) {
            console.log('未找到admin用户');
            return;
        }
        
        console.log('修复前的用户状态:');
        console.log(`  Passkey启用: ${user.passkeyEnabled}`);
        console.log(`  凭证数量: ${user.passkeyCredentials?.length || 0}`);
        if (user.passkeyCredentials && user.passkeyCredentials.length > 0) {
            user.passkeyCredentials.forEach((cred, index) => {
                console.log(`  凭证 ${index + 1}: ${cred.credentialID?.substring(0, 20)}...`);
            });
        }
        
        // 执行自动修复
        console.log('\n执行自动修复...');
        await PasskeyService.autoFixUserPasskeyData(user);
        
        // 重新获取用户数据
        const fixedUser = await UserStorage.getUserByUsername('admin');
        
        console.log('\n修复后的用户状态:');
        console.log(`  Passkey启用: ${fixedUser.passkeyEnabled}`);
        console.log(`  凭证数量: ${fixedUser.passkeyCredentials?.length || 0}`);
        if (fixedUser.passkeyCredentials && fixedUser.passkeyCredentials.length > 0) {
            fixedUser.passkeyCredentials.forEach((cred, index) => {
                console.log(`  凭证 ${index + 1}: ${cred.credentialID?.substring(0, 20)}...`);
            });
        }
        
        console.log('\n自动修复测试完成！');
        
    } catch (error) {
        console.error('测试自动修复功能失败:', error);
        console.log('请确保已编译TypeScript代码 (npm run build)');
    }
}

/**
 * 测试中间件功能
 */
function testMiddleware() {
    console.log('\n=== 测试中间件功能 ===');
    
    // 模拟Express请求对象
    const mockRequest = {
        path: '/api/passkey/authenticate/finish',
        method: 'POST',
        body: {
            username: 'admin',
            response: {
                id: 'test-credential-id',
                type: 'public-key',
                response: {}
            }
        }
    };
    
    const mockResponse = {
        status: (code) => ({ json: (data) => console.log('Response:', code, data) })
    };
    
    const mockNext = () => console.log('Next middleware called');
    
    console.log('模拟请求:', {
        path: mockRequest.path,
        method: mockRequest.method,
        username: mockRequest.body.username
    });
    
    // 这里可以测试中间件逻辑
    console.log('中间件会检查用户数据并进行自动修复');
}

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
 * 恢复用户数据
 */
function restoreUserData() {
    console.log('\n=== 恢复用户数据 ===');
    
    const users = readUsers();
    const adminUser = users.find(u => u.username === 'admin');
    
    if (adminUser) {
        // 恢复到原始状态
        adminUser.passkeyEnabled = false;
        adminUser.passkeyCredentials = [];
        delete adminUser.pendingChallenge;
        delete adminUser.currentChallenge;
        
        writeUsers(users);
        console.log('用户数据已恢复到原始状态');
    }
}

/**
 * 主函数
 */
function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    
    console.log('Passkey自动修复功能测试');
    console.log('========================');
    
    switch (command) {
        case 'simulate':
            simulatePasskeyError();
            break;
            
        case 'test':
            testAutoFix();
            break;
            
        case 'middleware':
            testMiddleware();
            break;
            
        case 'restore':
            restoreUserData();
            break;
            
        case 'full':
            console.log('执行完整测试流程...');
            simulatePasskeyError();
            setTimeout(() => {
                testAutoFix();
                setTimeout(() => {
                    restoreUserData();
                }, 1000);
            }, 1000);
            break;
            
        case 'help':
        default:
            console.log('\n使用方法:');
            console.log('  node test-passkey-auto-fix.js simulate  - 模拟错误场景');
            console.log('  node test-passkey-auto-fix.js test      - 测试自动修复功能');
            console.log('  node test-passkey-auto-fix.js middleware - 测试中间件功能');
            console.log('  node test-passkey-auto-fix.js restore   - 恢复用户数据');
            console.log('  node test-passkey-auto-fix.js full      - 执行完整测试流程');
            console.log('\n注意: 测试自动修复功能前请先编译TypeScript代码 (npm run build)');
            break;
    }
}

// 运行主函数
if (require.main === module) {
    main();
}

module.exports = {
    simulatePasskeyError,
    testAutoFix,
    testMiddleware,
    restoreUserData
}; 