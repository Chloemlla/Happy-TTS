const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

// 测试数据
const testCases = [
    { type: 'md5', text: '123456', expectedLength: 32 },
    { type: 'sha1', text: '123456', expectedLength: 40 },
    { type: 'sha256', text: '123456', expectedLength: 64 },
    { type: 'sha512', text: '123456', expectedLength: 128 },
    { type: 'md4', text: '123456', expectedLength: 32 }, // MD4会使用MD5替代
];

async function testHashEncrypt() {
    console.log('🔐 开始测试字符串Hash加密功能...\n');

    for (const testCase of testCases) {
        try {
            console.log(`📝 测试 ${testCase.type.toUpperCase()} 加密:`);
            console.log(`   输入文本: "${testCase.text}"`);

            const response = await axios.get(`${BASE_URL}/api/network/hash`, {
                params: {
                    type: testCase.type,
                    text: testCase.text
                },
                timeout: 10000
            });

            if (response.data.success) {
                const hash = response.data.data.data;
                console.log(`   ✅ 加密成功`);
                console.log(`   Hash值: ${hash}`);
                console.log(`   Hash长度: ${hash.length} (期望: ${testCase.expectedLength})`);
                
                if (hash.length === testCase.expectedLength) {
                    console.log(`   ✅ Hash长度正确\n`);
                } else {
                    console.log(`   ⚠️  Hash长度不匹配\n`);
                }
            } else {
                console.log(`   ❌ 加密失败: ${response.data.error}\n`);
            }

        } catch (error) {
            if (error.response) {
                console.log(`   ❌ 请求失败: ${error.response.status} - ${error.response.data.error || '未知错误'}\n`);
            } else if (error.request) {
                console.log(`   ❌ 网络错误: ${error.message}\n`);
            } else {
                console.log(`   ❌ 其他错误: ${error.message}\n`);
            }
        }
    }

    // 测试错误情况
    console.log('🔍 测试错误情况:');
    
    // 测试缺少参数
    try {
        console.log('   测试缺少type参数:');
        const response = await axios.get(`${BASE_URL}/api/network/hash`, {
            params: { text: '123456' },
            timeout: 10000
        });
        console.log(`   ❌ 应该返回错误，但得到了: ${response.data.success ? '成功' : '失败'}\n`);
    } catch (error) {
        if (error.response && error.response.status === 400) {
            console.log(`   ✅ 正确返回400错误: ${error.response.data.error}\n`);
        } else {
            console.log(`   ❌ 意外的错误: ${error.message}\n`);
        }
    }

    // 测试缺少text参数
    try {
        console.log('   测试缺少text参数:');
        const response = await axios.get(`${BASE_URL}/api/network/hash`, {
            params: { type: 'md5' },
            timeout: 10000
        });
        console.log(`   ❌ 应该返回错误，但得到了: ${response.data.success ? '成功' : '失败'}\n`);
    } catch (error) {
        if (error.response && error.response.status === 400) {
            console.log(`   ✅ 正确返回400错误: ${error.response.data.error}\n`);
        } else {
            console.log(`   ❌ 意外的错误: ${error.message}\n`);
        }
    }

    // 测试不支持的算法
    try {
        console.log('   测试不支持的算法:');
        const response = await axios.get(`${BASE_URL}/api/network/hash`, {
            params: { type: 'invalid', text: '123456' },
            timeout: 10000
        });
        console.log(`   ❌ 应该返回错误，但得到了: ${response.data.success ? '成功' : '失败'}\n`);
    } catch (error) {
        if (error.response && error.response.status === 400) {
            console.log(`   ✅ 正确返回400错误: ${error.response.data.error}\n`);
        } else {
            console.log(`   ❌ 意外的错误: ${error.message}\n`);
        }
    }

    // 测试空文本
    try {
        console.log('   测试空文本:');
        const response = await axios.get(`${BASE_URL}/api/network/hash`, {
            params: { type: 'md5', text: '' },
            timeout: 10000
        });
        console.log(`   ❌ 应该返回错误，但得到了: ${response.data.success ? '成功' : '失败'}\n`);
    } catch (error) {
        if (error.response && error.response.status === 400) {
            console.log(`   ✅ 正确返回400错误: ${error.response.data.error}\n`);
        } else {
            console.log(`   ❌ 意外的错误: ${error.message}\n`);
        }
    }

    console.log('🎉 Hash加密功能测试完成！');
}

// 运行测试
testHashEncrypt().catch(console.error); 