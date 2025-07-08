// 调试认证流程的脚本
const axios = require('axios');

async function testAuth() {
    try {
        console.log('开始测试认证流程...');
        
        // 1. 登录
        console.log('\n1. 尝试登录...');
        const loginResponse = await axios.post('http://localhost:3000/api/auth/login', {
            identifier: 'admin',
            password: 'happyclo1145'
        });
        
        console.log('登录响应:', {
            status: loginResponse.status,
            data: loginResponse.data
        });
        
        const token = loginResponse.data.token;
        console.log('获取到的token:', token);
        
        // 2. 使用token获取用户信息
        console.log('\n2. 使用token获取用户信息...');
        const userResponse = await axios.get('http://localhost:3000/api/auth/me', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        console.log('用户信息响应:', {
            status: userResponse.status,
            data: userResponse.data
        });
        
        console.log('\n认证流程测试完成！');
        
    } catch (error) {
        console.error('测试失败:', {
            status: error.response?.status,
            data: error.response?.data,
            message: error.message
        });
    }
}

testAuth(); 