#!/usr/bin/env node

/**
 * 容器初始化脚本
 * 在Docker容器启动时按顺序执行各种检查和修复脚本
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// 日志函数
function log(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${level}] ${message}`);
}

// 执行脚本的函数
function runScript(scriptName, description) {
    return new Promise((resolve, reject) => {
        log(`开始执行: ${description} (${scriptName})`);
        
        const scriptPath = path.join(__dirname, scriptName);
        
        // 检查脚本是否存在
        if (!fs.existsSync(scriptPath)) {
            log(`脚本不存在: ${scriptPath}`, 'WARN');
            resolve();
            return;
        }
        
        const child = spawn('node', [scriptPath], {
            stdio: 'pipe',
            cwd: __dirname
        });
        
        let output = '';
        let errorOutput = '';
        
        child.stdout.on('data', (data) => {
            const message = data.toString();
            output += message;
            log(`[${scriptName}] ${message.trim()}`, 'DEBUG');
        });
        
        child.stderr.on('data', (data) => {
            const message = data.toString();
            errorOutput += message;
            log(`[${scriptName}] ${message.trim()}`, 'ERROR');
        });
        
        child.on('close', (code) => {
            if (code === 0) {
                log(`完成执行: ${description} (${scriptName}) - 退出码: ${code}`);
                resolve();
            } else {
                log(`执行失败: ${description} (${scriptName}) - 退出码: ${code}`, 'ERROR');
                if (errorOutput) {
                    log(`错误输出: ${errorOutput}`, 'ERROR');
                }
                // 对于非关键脚本，不阻止启动
                resolve();
            }
        });
        
        child.on('error', (error) => {
            log(`执行错误: ${description} (${scriptName}) - ${error.message}`, 'ERROR');
            // 对于非关键脚本，不阻止启动
            resolve();
        });
    });
}

// 主初始化函数
async function initializeContainer() {
    log('开始容器初始化...');
    
    try {
        // 第一阶段：基础检查和修复（关键脚本）
        log('=== 第一阶段：基础检查和修复 ===');
        
        // 1. 检查文件权限
        await runScript('check-file-permissions.js', '检查文件权限');
        
        // 2. 检查用户文件
        await runScript('test-user-file.js', '检查用户文件');
        
        // 3. 修复空用户文件（如果需要）
        await runScript('fix-empty-users-file.js', '修复空用户文件');
        
        // 第二阶段：Passkey相关修复（重要脚本）
        log('=== 第二阶段：Passkey相关修复 ===');
        
        // 4. 修复credentialID格式
        await runScript('fix-credential-ids.js', '修复credentialID格式');
        
        // 5. 快速修复credentialID
        await runScript('quick-fix-credential-id.js', '快速修复credentialID');
        
        // 6. 修复credentialID不匹配
        await runScript('fix-credential-id-mismatch.js', '修复credentialID不匹配');
        
        // 第三阶段：API文档检查（可选脚本）
        log('=== 第三阶段：API文档检查 ===');
        
        // 7. 检查API文档
        await runScript('check-api-docs.js', '检查API文档');
        
        // 8. 检查OpenAPI JSON
        await runScript('check-openapi-json.js', '检查OpenAPI JSON');
        
        // 第四阶段：测试脚本（调试模式）
        if (process.env.NODE_ENV === 'development' || process.env.DEBUG === 'true') {
            log('=== 第四阶段：调试测试 ===');
            
            // 9. 测试credentialID格式
            await runScript('test-credential-id-format.js', '测试credentialID格式');
            
            // 10. 测试credentialID修复
            await runScript('test-credential-id-fix.js', '测试credentialID修复');
            
            // 11. 测试credentialID填充
            await runScript('test-credential-id-padding.js', '测试credentialID填充');
            
            // 12. 简单credentialID测试
            await runScript('test-simple-credential-id.js', '简单credentialID测试');
            
            // 13. 实际credentialID测试
            await runScript('test-actual-credential-id.js', '实际credentialID测试');
            
            // 14. 调试credentialID
            await runScript('debug-credential-id.js', '调试credentialID');
            
            // 15. 测试credentialID格式修复
            await runScript('test-credential-id-format-fix.js', '测试credentialID格式修复');
        }
        
        log('容器初始化完成！');
        
    } catch (error) {
        log(`容器初始化失败: ${error.message}`, 'ERROR');
        log(`错误堆栈: ${error.stack}`, 'ERROR');
        
        // 在开发环境中，允许启动继续
        if (process.env.NODE_ENV === 'development') {
            log('开发环境：允许启动继续', 'WARN');
        } else {
            // 在生产环境中，如果关键脚本失败，可能需要退出
            log('生产环境：关键脚本失败，但允许启动继续', 'WARN');
        }
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    initializeContainer().then(() => {
        log('初始化脚本执行完成');
        process.exit(0);
    }).catch((error) => {
        log(`初始化脚本执行失败: ${error.message}`, 'ERROR');
        process.exit(1);
    });
}

module.exports = { initializeContainer }; 