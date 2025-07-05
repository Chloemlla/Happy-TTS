#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// 快速修复空用户文件
function fixEmptyUsersFile() {
    console.log('=== 快速修复空用户文件 ===');
    
    const dataDir = path.join(process.cwd(), 'data');
    const usersFile = path.join(dataDir, 'users.json');
    
    console.log(`用户文件路径: ${usersFile}`);
    
    // 检查文件是否存在
    if (!fs.existsSync(usersFile)) {
        console.log('❌ 用户文件不存在');
        return false;
    }
    
    // 检查文件内容
    try {
        const content = fs.readFileSync(usersFile, 'utf-8');
        console.log(`文件大小: ${content.length} 字符`);
        
        if (!content || content.trim() === '') {
            console.log('⚠️  检测到空文件，正在修复...');
        } else {
            try {
                const parsed = JSON.parse(content);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    console.log('✅ 文件内容正常，无需修复');
                    console.log(`包含 ${parsed.length} 个用户`);
                    return true;
                } else {
                    console.log('⚠️  检测到空数组或格式问题，正在修复...');
                }
            } catch (parseError) {
                console.log('⚠️  检测到JSON格式错误，正在修复...');
            }
        }
    } catch (readError) {
        console.log('❌ 读取文件失败:', readError.message);
        return false;
    }
    
    // 备份原文件
    const backupFile = usersFile + '.backup.' + Date.now();
    try {
        fs.copyFileSync(usersFile, backupFile);
        console.log(`✅ 已备份原文件到: ${backupFile}`);
    } catch (backupError) {
        console.log('❌ 备份失败:', backupError.message);
        return false;
    }
    
    // 创建默认管理员账户
    const defaultAdmin = {
        id: '1',
        username: 'admin',
        email: 'admin@example.com',
        password: 'happyclo1145',
        role: 'admin',
        dailyUsage: 0,
        lastUsageDate: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        passkeyEnabled: false,
        passkeyCredentials: []
    };
    
    try {
        fs.writeFileSync(usersFile, JSON.stringify([defaultAdmin], null, 2));
        console.log('✅ 已创建默认管理员账户');
        console.log('用户名: admin');
        console.log('密码: happyclo1145');
        console.log('角色: admin');
        
        // 验证修复结果
        const newContent = fs.readFileSync(usersFile, 'utf-8');
        const newParsed = JSON.parse(newContent);
        console.log(`✅ 修复完成，文件现在包含 ${newParsed.length} 个用户`);
        
        return true;
    } catch (writeError) {
        console.log('❌ 写入文件失败:', writeError.message);
        
        // 尝试恢复备份
        try {
            fs.copyFileSync(backupFile, usersFile);
            console.log('✅ 已恢复备份文件');
        } catch (restoreError) {
            console.log('❌ 恢复备份失败:', restoreError.message);
        }
        
        return false;
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    const success = fixEmptyUsersFile();
    process.exit(success ? 0 : 1);
}

module.exports = { fixEmptyUsersFile }; 