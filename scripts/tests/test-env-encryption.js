const axios = require('axios');
const crypto = require('crypto');
const CryptoJS = require('crypto-js');

const BASE_URL = 'http://localhost:3000';

// 测试用的管理员token（实际使用时需要真实的token）
const TEST_TOKEN = 'test-admin-token-123456';

// AES-256解密函数（模拟前端解密）
function decryptAES256(encryptedData, iv, key) {
  try {
    const keyBytes = CryptoJS.SHA256(key);
    const ivBytes = CryptoJS.enc.Hex.parse(iv);
    const encryptedBytes = CryptoJS.enc.Hex.parse(encryptedData);
    
    const decrypted = CryptoJS.AES.decrypt(
      { ciphertext: encryptedBytes },
      keyBytes,
      {
        iv: ivBytes,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
      }
    );
    
    return decrypted.toString(CryptoJS.enc.Utf8);
  } catch (error) {
    console.error('解密失败:', error);
    throw new Error('解密失败');
  }
}

// 模拟后端加密（用于测试）
function encryptAES256(data, key) {
  const algorithm = 'aes-256-cbc';
  const keyBytes = crypto.createHash('sha256').update(key).digest();
  const iv = crypto.randomBytes(16);
  
  const cipher = crypto.createCipheriv(algorithm, keyBytes, iv);
  let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  return {
    data: encrypted,
    iv: iv.toString('hex')
  };
}

async function testEnvEncryption() {
  console.log('🔐 开始测试环境变量加密解密功能...\n');

  try {
    // 1. 测试本地加密解密
    console.log('📝 测试本地加密解密:');
    const testData = [
      { key: 'TEST_KEY_1', value: 'test_value_1' },
      { key: 'TEST_KEY_2', value: 'test_value_2' },
      { key: 'SENSITIVE_DATA', value: 'very_secret_password_123' }
    ];
    
    console.log('   原始数据:', JSON.stringify(testData, null, 2));
    
    // 加密
    const encrypted = encryptAES256(testData, TEST_TOKEN);
    console.log('   加密后数据:', encrypted.data);
    console.log('   IV:', encrypted.iv);
    
    // 解密
    const decryptedJson = decryptAES256(encrypted.data, encrypted.iv, TEST_TOKEN);
    const decryptedData = JSON.parse(decryptedJson);
    console.log('   解密后数据:', JSON.stringify(decryptedData, null, 2));
    
    // 验证数据一致性
    const isMatch = JSON.stringify(testData) === JSON.stringify(decryptedData);
    console.log(`   ✅ 数据一致性验证: ${isMatch ? '通过' : '失败'}\n`);

    // 2. 测试API接口（需要真实的管理员token）
    console.log('🌐 测试API接口:');
    console.log('   注意: 需要真实的管理员token才能测试API接口');
    console.log('   请确保服务器正在运行并且有管理员账户登录\n');

    // 3. 测试错误情况
    console.log('❌ 测试错误情况:');
    
    // 测试错误的密钥
    try {
      const wrongKeyDecrypted = decryptAES256(encrypted.data, encrypted.iv, 'wrong-key');
      console.log('   使用错误密钥解密:', wrongKeyDecrypted);
    } catch (error) {
      console.log('   ✅ 错误密钥解密失败（预期行为）');
    }
    
    // 测试错误的IV
    try {
      const wrongIvDecrypted = decryptAES256(encrypted.data, 'wrong-iv', TEST_TOKEN);
      console.log('   使用错误IV解密:', wrongIvDecrypted);
    } catch (error) {
      console.log('   ✅ 错误IV解密失败（预期行为）');
    }

    console.log('\n🎉 测试完成！');
    console.log('\n📋 使用说明:');
    console.log('1. 后端使用管理员token作为AES-256加密密钥');
    console.log('2. 前端使用相同的token进行解密');
    console.log('3. 每次请求都会生成新的IV，确保安全性');
    console.log('4. 只有拥有正确token的管理员才能解密数据');

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
  }
}

// 运行测试
testEnvEncryption(); 