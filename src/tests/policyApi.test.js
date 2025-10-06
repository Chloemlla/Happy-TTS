/**
 * 隐私政策API测试脚本
 * 用于验证policy-verify接口的功能
 */

const crypto = require('crypto');

// 测试配置
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const POLICY_VERSION = '2.0';
const SECRET_SALT = 'hapxtts_secret_salt';

// 生成简单哈希
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

// 生成校验和
function generateChecksum(consent) {
  const data = `${consent.timestamp}|${consent.version}|${consent.fingerprint}`;
  return simpleHash(data + SECRET_SALT);
}

// 生成测试数据
function generateTestConsent() {
  const timestamp = Date.now();
  const fingerprint = `test_${Math.random().toString(36).substring(7)}`;
  
  const consent = {
    timestamp,
    version: POLICY_VERSION,
    fingerprint
  };
  
  const checksum = generateChecksum(consent);
  
  return { ...consent, checksum };
}

// 测试记录同意
async function testRecordConsent() {
  console.log('\n🧪 测试记录隐私政策同意...');
  
  const testConsent = generateTestConsent();
  
  try {
    const response = await fetch(`${API_BASE_URL}/api/policy/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        consent: testConsent,
        userAgent: 'PolicyTest/1.0',
        timestamp: Date.now()
      })
    });
    
    const result = await response.json();
    
    if (response.ok && result.success) {
      console.log('✅ 记录同意成功:', {
        consentId: result.consentId,
        expiresAt: result.expiresAt
      });
      return testConsent;
    } else {
      console.error('❌ 记录同意失败:', result);
      return null;
    }
  } catch (error) {
    console.error('❌ 记录同意请求失败:', error.message);
    return null;
  }
}

// 测试验证同意状态
async function testVerifyConsent(consent) {
  console.log('\n🧪 测试验证同意状态...');
  
  if (!consent) {
    console.log('⏭️ 跳过验证测试（没有有效的同意记录）');
    return;
  }
  
  try {
    const url = `${API_BASE_URL}/api/policy/check?fingerprint=${encodeURIComponent(consent.fingerprint)}&version=${encodeURIComponent(consent.version)}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    const result = await response.json();
    
    if (response.ok && result.success && result.hasValidConsent) {
      console.log('✅ 验证同意成功:', {
        consentId: result.consentId,
        version: result.version,
        expiresAt: result.expiresAt
      });
    } else {
      console.log('ℹ️ 验证结果:', result);
    }
  } catch (error) {
    console.error('❌ 验证同意请求失败:', error.message);
  }
}

// 测试撤销同意
async function testRevokeConsent(consent) {
  console.log('\n🧪 测试撤销同意...');
  
  if (!consent) {
    console.log('⏭️ 跳过撤销测试（没有有效的同意记录）');
    return;
  }
  
  try {
    const response = await fetch(`${API_BASE_URL}/api/policy/revoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fingerprint: consent.fingerprint,
        version: consent.version
      })
    });
    
    const result = await response.json();
    
    if (response.ok && result.success) {
      console.log('✅ 撤销同意成功:', {
        revokedCount: result.revokedCount
      });
    } else {
      console.error('❌ 撤销同意失败:', result);
    }
  } catch (error) {
    console.error('❌ 撤销同意请求失败:', error.message);
  }
}

// 测试获取政策版本
async function testGetPolicyVersion() {
  console.log('\n🧪 测试获取政策版本...');
  
  try {
    const response = await fetch(`${API_BASE_URL}/api/policy/version`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    const result = await response.json();
    
    if (response.ok && result.success) {
      console.log('✅ 获取版本成功:', {
        version: result.version,
        validityDays: result.validityDays
      });
    } else {
      console.error('❌ 获取版本失败:', result);
    }
  } catch (error) {
    console.error('❌ 获取版本请求失败:', error.message);
  }
}

// 测试无效数据
async function testInvalidData() {
  console.log('\n🧪 测试无效数据处理...');
  
  const testCases = [
    {
      name: '缺少必需字段',
      data: {
        consent: {
          timestamp: Date.now(),
          version: POLICY_VERSION
          // 缺少 fingerprint 和 checksum
        }
      }
    },
    {
      name: '无效校验和',
      data: {
        consent: {
          timestamp: Date.now(),
          version: POLICY_VERSION,
          fingerprint: 'test_fingerprint',
          checksum: 'invalid_checksum'
        }
      }
    },
    {
      name: '过期时间戳',
      data: {
        consent: {
          timestamp: Date.now() - (30 * 1000), // 30秒前（超出20秒限制）
          version: POLICY_VERSION,
          fingerprint: 'test_fingerprint',
          checksum: 'will_be_invalid'
        }
      }
    },
    {
      name: '未来时间戳',
      data: {
        consent: {
          timestamp: Date.now() + (30 * 1000), // 30秒后（超出20秒限制）
          version: POLICY_VERSION,
          fingerprint: 'test_fingerprint',
          checksum: 'will_be_invalid'
        }
      }
    }
  ];
  
  for (const testCase of testCases) {
    try {
      console.log(`\n  测试: ${testCase.name}`);
      
      const response = await fetch(`${API_BASE_URL}/api/policy/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(testCase.data)
      });
      
      const result = await response.json();
      
      if (!response.ok || !result.success) {
        console.log(`  ✅ 正确拒绝无效数据: ${result.error} (${result.code})`);
      } else {
        console.log(`  ❌ 意外接受了无效数据:`, result);
      }
    } catch (error) {
      console.log(`  ✅ 正确处理错误: ${error.message}`);
    }
  }
}

// 主测试函数
async function runTests() {
  console.log('🚀 开始隐私政策API测试');
  console.log(`📍 API地址: ${API_BASE_URL}`);
  console.log(`📋 政策版本: ${POLICY_VERSION}`);
  
  try {
    // 1. 测试获取政策版本
    await testGetPolicyVersion();
    
    // 2. 测试记录同意
    const testConsent = await testRecordConsent();
    
    // 3. 测试验证同意状态
    await testVerifyConsent(testConsent);
    
    // 4. 测试无效数据处理
    await testInvalidData();
    
    // 5. 测试撤销同意
    await testRevokeConsent(testConsent);
    
    // 6. 再次验证（应该失败）
    console.log('\n🧪 测试撤销后的验证...');
    await testVerifyConsent(testConsent);
    
    console.log('\n🎉 所有测试完成！');
    
  } catch (error) {
    console.error('\n💥 测试过程中发生错误:', error);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = {
  runTests,
  testRecordConsent,
  testVerifyConsent,
  testRevokeConsent,
  testGetPolicyVersion,
  testInvalidData,
  generateTestConsent,
  generateChecksum
};
