const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';

// 测试配置
const testConfig = {
    timeout: 30000,
    headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Test-Client/1.0'
    }
};

// 颜色输出函数
const colors = {
    green: (text) => `\x1b[32m${text}\x1b[0m`,
    red: (text) => `\x1b[31m${text}\x1b[0m`,
    yellow: (text) => `\x1b[33m${text}\x1b[0m`,
    blue: (text) => `\x1b[34m${text}\x1b[0m`,
    cyan: (text) => `\x1b[36m${text}\x1b[0m`
};

// 测试结果统计
let testResults = {
    total: 0,
    passed: 0,
    failed: 0,
    errors: []
};

// 测试函数
async function runTest(testName, testFunction) {
    testResults.total++;
    console.log(colors.cyan(`\n🧪 运行测试: ${testName}`));
    
    try {
        await testFunction();
        console.log(colors.green(`✅ ${testName} - 通过`));
        testResults.passed++;
    } catch (error) {
        console.log(colors.red(`❌ ${testName} - 失败`));
        console.log(colors.red(`   错误: ${error.message}`));
        testResults.failed++;
        testResults.errors.push({ test: testName, error: error.message });
    }
}

// 媒体解析API测试
async function testMediaAPIs() {
    console.log(colors.blue('\n🎵 测试媒体解析API'));
    
    // 测试网抑云音乐解析
    await runTest('网抑云音乐解析', async () => {
        const response = await axios.get(`${BASE_URL}/media/music163`, {
            params: { id: '2651528954' },
            ...testConfig
        });
        
        if (response.status !== 200) {
            throw new Error(`HTTP状态码错误: ${response.status}`);
        }
        
        if (!response.data.success) {
            throw new Error(`API返回失败: ${response.data.error}`);
        }
        
        console.log(colors.yellow(`   返回数据: ${JSON.stringify(response.data, null, 2)}`));
    });
    
    // 测试皮皮虾视频解析
    await runTest('皮皮虾视频解析', async () => {
        const response = await axios.get(`${BASE_URL}/media/pipixia`, {
            params: { url: 'https://h5.pipix.com/s/BWmCQUg/' },
            ...testConfig
        });
        
        if (response.status !== 200) {
            throw new Error(`HTTP状态码错误: ${response.status}`);
        }
        
        if (!response.data.success) {
            throw new Error(`API返回失败: ${response.data.error}`);
        }
        
        console.log(colors.yellow(`   返回数据: ${JSON.stringify(response.data, null, 2)}`));
    });
}

// 社交媒体API测试
async function testSocialAPIs() {
    console.log(colors.blue('\n📱 测试社交媒体API'));
    
    // 测试微博热搜
    await runTest('微博热搜', async () => {
        const response = await axios.get(`${BASE_URL}/social/weibo-hot`, testConfig);
        
        if (response.status !== 200) {
            throw new Error(`HTTP状态码错误: ${response.status}`);
        }
        
        if (!response.data.success) {
            throw new Error(`API返回失败: ${response.data.error}`);
        }
        
        console.log(colors.yellow(`   返回数据: ${JSON.stringify(response.data, null, 2)}`));
    });
    
    // 测试百度热搜
    await runTest('百度热搜', async () => {
        const response = await axios.get(`${BASE_URL}/social/baidu-hot`, testConfig);
        
        if (response.status !== 200) {
            throw new Error(`HTTP状态码错误: ${response.status}`);
        }
        
        if (!response.data.success) {
            throw new Error(`API返回失败: ${response.data.error}`);
        }
        
        console.log(colors.yellow(`   返回数据: ${JSON.stringify(response.data, null, 2)}`));
    });
}

// 生活信息API测试
async function testLifeAPIs() {
    console.log(colors.blue('\n🏠 测试生活信息API'));
    
    // 测试手机号码归属地查询
    await runTest('手机号码归属地查询', async () => {
        const response = await axios.get(`${BASE_URL}/life/phone-address`, {
            params: { phone: '13800138000' },
            ...testConfig
        });
        
        if (response.status !== 200) {
            throw new Error(`HTTP状态码错误: ${response.status}`);
        }
        
        if (!response.data.success) {
            throw new Error(`API返回失败: ${response.data.error}`);
        }
        
        console.log(colors.yellow(`   返回数据: ${JSON.stringify(response.data, null, 2)}`));
    });
    
    // 测试油价查询（全国）
    await runTest('油价查询（全国）', async () => {
        const response = await axios.get(`${BASE_URL}/life/oil-price`, testConfig);
        
        if (response.status !== 200) {
            throw new Error(`HTTP状态码错误: ${response.status}`);
        }
        
        if (!response.data.success) {
            throw new Error(`API返回失败: ${response.data.error}`);
        }
        
        console.log(colors.yellow(`   返回数据: ${JSON.stringify(response.data, null, 2)}`));
    });
    
    // 测试油价查询（指定城市）
    await runTest('油价查询（指定城市）', async () => {
        const response = await axios.get(`${BASE_URL}/life/oil-price`, {
            params: { city: '北京' },
            ...testConfig
        });
        
        if (response.status !== 200) {
            throw new Error(`HTTP状态码错误: ${response.status}`);
        }
        
        if (!response.data.success) {
            throw new Error(`API返回失败: ${response.data.error}`);
        }
        
        console.log(colors.yellow(`   返回数据: ${JSON.stringify(response.data, null, 2)}`));
    });
}

// 错误处理测试
async function testErrorHandling() {
    console.log(colors.blue('\n⚠️ 测试错误处理'));
    
    // 测试无效的歌曲ID
    await runTest('无效歌曲ID处理', async () => {
        try {
            await axios.get(`${BASE_URL}/media/music163`, {
                params: { id: 'invalid_id' },
                ...testConfig
            });
            throw new Error('应该返回错误但成功了');
        } catch (error) {
            if (error.response && error.response.status === 400) {
                console.log(colors.yellow(`   正确返回400错误: ${error.response.data.error}`));
            } else {
                throw new Error(`期望400错误，但得到: ${error.response?.status || '未知错误'}`);
            }
        }
    });
    
    // 测试无效的手机号码
    await runTest('无效手机号码处理', async () => {
        try {
            await axios.get(`${BASE_URL}/life/phone-address`, {
                params: { phone: '123' },
                ...testConfig
            });
            throw new Error('应该返回错误但成功了');
        } catch (error) {
            if (error.response && error.response.status === 400) {
                console.log(colors.yellow(`   正确返回400错误: ${error.response.data.error}`));
            } else {
                throw new Error(`期望400错误，但得到: ${error.response?.status || '未知错误'}`);
            }
        }
    });
    
    // 测试缺少参数
    await runTest('缺少参数处理', async () => {
        try {
            await axios.get(`${BASE_URL}/media/music163`, testConfig);
            throw new Error('应该返回错误但成功了');
        } catch (error) {
            if (error.response && error.response.status === 400) {
                console.log(colors.yellow(`   正确返回400错误: ${error.response.data.error}`));
            } else {
                throw new Error(`期望400错误，但得到: ${error.response?.status || '未知错误'}`);
            }
        }
    });
}

// 主测试函数
async function runAllTests() {
    console.log(colors.blue('🚀 开始测试媒体解析、社交媒体和生活信息API'));
    console.log(colors.yellow(`测试服务器: ${BASE_URL}`));
    
    const startTime = Date.now();
    
    try {
        await testMediaAPIs();
        await testSocialAPIs();
        await testLifeAPIs();
        await testErrorHandling();
    } catch (error) {
        console.log(colors.red(`测试过程中发生错误: ${error.message}`));
    }
    
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    
    // 输出测试结果
    console.log(colors.blue('\n📊 测试结果汇总'));
    console.log(colors.cyan(`总测试数: ${testResults.total}`));
    console.log(colors.green(`通过: ${testResults.passed}`));
    console.log(colors.red(`失败: ${testResults.failed}`));
    console.log(colors.yellow(`耗时: ${duration.toFixed(2)}秒`));
    
    if (testResults.failed > 0) {
        console.log(colors.red('\n❌ 失败的测试:'));
        testResults.errors.forEach(error => {
            console.log(colors.red(`  - ${error.test}: ${error.error}`));
        });
    }
    
    if (testResults.passed === testResults.total) {
        console.log(colors.green('\n🎉 所有测试通过！'));
        process.exit(0);
    } else {
        console.log(colors.red('\n💥 部分测试失败！'));
        process.exit(1);
    }
}

// 运行测试
if (require.main === module) {
    runAllTests().catch(error => {
        console.log(colors.red(`测试执行失败: ${error.message}`));
        process.exit(1);
    });
}

module.exports = {
    runAllTests,
    testMediaAPIs,
    testSocialAPIs,
    testLifeAPIs,
    testErrorHandling
}; 