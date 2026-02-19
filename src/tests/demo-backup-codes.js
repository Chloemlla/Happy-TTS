#!/usr/bin/env node

/**
 * 备用恢复码功能演示脚本
 * 
 * 这个脚本演示了如何使用新的备用恢复码功能
 */

const axios = require('axios');

// 配置
const API_BASE_URL = 'https://api.951100.xyz';
const TEST_USER_TOKEN = 'demo-user-token'; // 在实际使用中，这应该是真实的用户令牌

// 创建API客户端
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${TEST_USER_TOKEN}`
  }
});

/**
 * 演示获取备用恢复码
 */
function demonstrateBackupCodes() {
  console.log('🔐 备用恢复码功能演示\n');
  
  console.log('1. 获取TOTP状态...');
  api.get('/api/totp/status')
    .then(statusResponse => {
      console.log('   ✅ TOTP状态:', statusResponse.data);
      
      if (statusResponse.data.enabled && statusResponse.data.hasBackupCodes) {
        console.log('\n2. 获取备用恢复码...');
        return api.get('/api/totp/backup-codes');
      } else {
        console.log('   ⚠️  用户未启用TOTP或没有备用恢复码');
        console.log('   💡 请先设置二次验证以体验完整功能');
        return null;
      }
    })
    .then(backupCodesResponse => {
      if (backupCodesResponse) {
        console.log('   ✅ 备用恢复码获取成功');
        console.log('   📊 剩余数量:', backupCodesResponse.data.remainingCount);
        console.log('   🔑 恢复码:', backupCodesResponse.data.backupCodes);
        
        console.log('\n3. 功能特性:');
        console.log('   • 查看恢复码: 用户可以在TOTP管理页面查看所有可用的恢复码');
        console.log('   • 下载功能: 支持将恢复码下载为文本文件');
        console.log('   • 打印功能: 支持直接打印恢复码');
        console.log('   • 安全保护: 恢复码默认隐藏，需要用户主动显示');
      }
    })
    .catch(error => {
      const errorMessage = error.response && error.response.data && error.response.data.error 
        ? error.response.data.error 
        : error.message;
      console.error('   ❌ 演示失败:', errorMessage);
    });
}

/**
 * 演示前端功能
 */
function demonstrateFrontendFeatures() {
  console.log('\n🎨 前端功能演示\n');
  
  console.log('1. TOTPManager组件更新:');
  console.log('   • 添加了"查看备用恢复码"按钮');
  console.log('   • 集成BackupCodesModal组件');
  console.log('   • 优化了用户界面布局');
  
  console.log('\n2. BackupCodesModal组件特性:');
  console.log('   • 响应式设计，适配移动端');
  console.log('   • 支持显示/隐藏恢复码');
  console.log('   • 下载功能：生成包含安全提示的文本文件');
  console.log('   • 打印功能：优化的打印布局');
  console.log('   • 错误处理和加载状态');
  
  console.log('\n3. 用户体验改进:');
  console.log('   • 现代化的UI设计');
  console.log('   • 清晰的视觉层次');
  console.log('   • 直观的操作流程');
  console.log('   • 完善的错误提示');
}

/**
 * 演示安全特性
 */
function demonstrateSecurityFeatures() {
  console.log('\n🔒 安全特性演示\n');
  
  console.log('1. 访问控制:');
  console.log('   • 只有已启用TOTP的用户才能访问');
  console.log('   • 需要有效的认证令牌');
  console.log('   • 验证用户身份');
  
  console.log('\n2. 数据保护:');
  console.log('   • 恢复码默认隐藏，需要用户主动显示');
  console.log('   • 下载和打印功能包含安全提示');
  console.log('   • 建议用户妥善保管恢复码');
  
  console.log('\n3. 使用限制:');
  console.log('   • 每个恢复码只能使用一次');
  console.log('   • 使用后自动从用户账户中移除');
  console.log('   • 防止重复使用');
}

/**
 * 演示API端点
 */
function demonstrateAPIEndpoints() {
  console.log('\n🌐 API端点演示\n');
  
  console.log('1. 新增端点:');
  console.log('   GET /api/totp/backup-codes');
  console.log('   • 获取用户的备用恢复码');
  console.log('   • 需要认证令牌');
  console.log('   • 返回恢复码列表和剩余数量');
  
  console.log('\n2. 响应格式:');
  console.log('   {');
  console.log('     "backupCodes": ["ABC12345", "DEF67890", ...],');
  console.log('     "remainingCount": 10,');
  console.log('     "message": "备用恢复码获取成功"');
  console.log('   }');
  
  console.log('\n3. 错误处理:');
  console.log('   • 401: 未授权访问');
  console.log('   • 400: TOTP未启用');
  console.log('   • 404: 没有可用的备用恢复码');
  console.log('   • 500: 服务器内部错误');
}

/**
 * 主函数
 */
async function main() {
  console.log('🚀 Happy TTS 备用恢复码功能演示\n');
  console.log('=' .repeat(50));
  
  await demonstrateBackupCodes();
  demonstrateFrontendFeatures();
  demonstrateSecurityFeatures();
  demonstrateAPIEndpoints();
  
  console.log('\n' + '=' .repeat(50));
  console.log('✅ 演示完成！');
  console.log('\n📝 使用说明:');
  console.log('1. 确保用户已启用二次验证');
  console.log('2. 在TOTP管理页面点击"查看备用恢复码"');
  console.log('3. 选择下载或打印功能');
  console.log('4. 妥善保管恢复码以备不时之需');
}

// 运行演示
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  demonstrateBackupCodes,
  demonstrateFrontendFeatures,
  demonstrateSecurityFeatures,
  demonstrateAPIEndpoints
}; 