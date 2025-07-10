#!/usr/bin/env node

const { UserStorage } = require('../dist/utils/userStorage');

async function testDatabaseInit() {
    console.log('=== 测试数据库初始化功能 ===');
    
    try {
        // 测试数据库初始化
        console.log('开始测试数据库初始化...');
        const result = await UserStorage.initializeDatabase();
        
        console.log('初始化结果:', {
            initialized: result.initialized,
            message: result.message
        });
        
        if (result.initialized) {
            console.log('✅ 数据库初始化成功');
            
            // 测试获取所有用户
            console.log('\n测试获取所有用户...');
            const users = await UserStorage.getAllUsers();
            console.log(`用户总数: ${users.length}`);
            
            // 显示用户信息
            users.forEach((user, index) => {
                console.log(`用户 ${index + 1}:`, {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    role: user.role,
                    createdAt: user.createdAt
                });
            });
            
            // 检查是否有管理员账户
            const adminUser = users.find(u => u.role === 'admin');
            if (adminUser) {
                console.log('\n✅ 找到管理员账户:', adminUser.username);
            } else {
                console.log('\n❌ 未找到管理员账户');
            }
            
        } else {
            console.log('❌ 数据库初始化失败:', result.message);
        }
        
    } catch (error) {
        console.error('测试过程中发生错误:', error);
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    testDatabaseInit();
}

module.exports = { testDatabaseInit }; 