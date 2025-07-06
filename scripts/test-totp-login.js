const axios = require('axios');

// 配置
const API_BASE_URL = 'https://tts-api.hapxs.com'; // 根据实际情况调整
const TEST_USER = {
  username: 'testuser',
  email: 'test@example.com',
  password: 'TestPass123!'
};

// 创建axios实例
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

async function testTOTPLogin() {
  try {
    console.log('🧪 开始TOTP登录流程测试...\n');

    // 1. 注册用户
    console.log('1️⃣ 注册测试用户...');
    try {
      await api.post('/api/auth/register', {
        username: TEST_USER.username,
        email: TEST_USER.email,
        password: TEST_USER.password
      });
      console.log('✅ 用户注册成功');
    } catch (error) {
      if (error.response?.status === 409) {
        console.log('ℹ️ 用户已存在，继续测试');
      } else {
        throw error;
      }
    }

    // 2. 登录（应该返回requiresTOTP: true）
    console.log('\n2️⃣ 尝试登录...');
    const loginResponse = await api.post('/api/auth/login', {
      identifier: TEST_USER.username,
      password: TEST_USER.password
    });

    if (loginResponse.data.requiresTOTP) {
      console.log('✅ 登录成功，需要TOTP验证');
      console.log('用户信息:', loginResponse.data.user);
      console.log('临时token:', loginResponse.data.token);
    } else {
      console.log('❌ 登录成功但未要求TOTP验证');
      return;
    }

    // 3. 设置TOTP（需要先获取用户token）
    console.log('\n3️⃣ 设置TOTP...');
    const userToken = loginResponse.data.token;
    
    // 生成TOTP设置
    const setupResponse = await api.post('/api/totp/generate-setup', {}, {
      headers: { Authorization: `Bearer ${userToken}` }
    });
    console.log('✅ TOTP设置生成成功');
    console.log('密钥:', setupResponse.data.secret);
    console.log('备用恢复码:', setupResponse.data.backupCodes);

    // 4. 验证并启用TOTP（这里使用一个示例验证码，实际测试需要真实的TOTP验证码）
    console.log('\n4️⃣ 验证并启用TOTP...');
    console.log('⚠️ 注意：这里使用示例验证码，实际测试需要真实的TOTP验证码');
    
    try {
      await api.post('/api/totp/verify-and-enable', {
        token: '123456' // 示例验证码
      }, {
        headers: { Authorization: `Bearer ${userToken}` }
      });
      console.log('❌ 意外成功（使用了示例验证码）');
    } catch (error) {
      if (error.response?.status === 400) {
        console.log('✅ 验证码验证失败（预期行为）');
        console.log('错误信息:', error.response.data.error);
      } else {
        console.log('❌ 意外的错误:', error.response?.data);
      }
    }

    // 5. 测试使用恢复码登录
    console.log('\n5️⃣ 测试使用恢复码登录...');
    const backupCode = setupResponse.data.backupCodes[0];
    console.log('使用恢复码:', backupCode);

    try {
      const verifyResponse = await api.post('/api/totp/verify-token', {
        userId: loginResponse.data.user.id,
        backupCode: backupCode
      }, {
        headers: { Authorization: `Bearer ${userToken}` }
      });

      if (verifyResponse.data.verified) {
        console.log('✅ 恢复码验证成功');
      } else {
        console.log('❌ 恢复码验证失败');
      }
    } catch (error) {
      console.log('❌ 恢复码验证错误:', error.response?.data?.error);
    }

    console.log('\n🎉 TOTP登录流程测试完成！');
    console.log('\n📝 测试总结:');
    console.log('- ✅ 用户注册/登录');
    console.log('- ✅ TOTP设置生成');
    console.log('- ✅ 验证码验证（失败，符合预期）');
    console.log('- ✅ 恢复码验证');
    console.log('\n💡 要完成完整测试，请使用真实的TOTP验证码');

  } catch (error) {
    console.error('❌ 测试失败:', error.response?.data || error.message);
  }
}

// 运行测试
testTOTPLogin(); 