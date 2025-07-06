const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

async function testNetworkAPIs() {
    console.log('开始测试网络检测和数据处理API...\n');

    // 测试TCP连接检测
    console.log('1. 测试TCP连接检测...');
    try {
        const tcpingResponse = await axios.get(`${BASE_URL}/api/network/tcping`, {
            params: {
                address: 'www.baidu.com',
                port: 80
            }
        });
        console.log('✅ TCP连接检测成功:', tcpingResponse.data);
    } catch (error) {
        console.log('❌ TCP连接检测失败:', error.response?.data || error.message);
    }

    console.log('\n' + '='.repeat(50) + '\n');

    // 测试Ping检测
    console.log('2. 测试Ping检测...');
    try {
        const pingResponse = await axios.get(`${BASE_URL}/api/network/ping`, {
            params: {
                url: 'www.baidu.com'
            }
        });
        console.log('✅ Ping检测成功:', pingResponse.data);
    } catch (error) {
        console.log('❌ Ping检测失败:', error.response?.data || error.message);
    }

    console.log('\n' + '='.repeat(50) + '\n');

    // 测试网站测速
    console.log('3. 测试网站测速...');
    try {
        const speedResponse = await axios.get(`${BASE_URL}/api/network/speed`, {
            params: {
                url: 'https://www.baidu.com'
            }
        });
        console.log('✅ 网站测速成功:', speedResponse.data);
    } catch (error) {
        console.log('❌ 网站测速失败:', error.response?.data || error.message);
    }

    console.log('\n' + '='.repeat(50) + '\n');

    // 测试端口扫描
    console.log('4. 测试端口扫描...');
    try {
        const portscanResponse = await axios.get(`${BASE_URL}/api/network/portscan`, {
            params: {
                address: '127.0.0.1'
            }
        });
        console.log('✅ 端口扫描成功:', portscanResponse.data);
    } catch (error) {
        console.log('❌ 端口扫描失败:', error.response?.data || error.message);
    }

    console.log('\n' + '='.repeat(50) + '\n');

    // 测试Base64编码
    console.log('5. 测试Base64编码...');
    try {
        const encodeResponse = await axios.get(`${BASE_URL}/api/data/base64/encode`, {
            params: {
                text: 'Hello World!'
            }
        });
        console.log('✅ Base64编码成功:', encodeResponse.data);
    } catch (error) {
        console.log('❌ Base64编码失败:', error.response?.data || error.message);
    }

    console.log('\n' + '='.repeat(50) + '\n');

    // 测试Base64解码
    console.log('6. 测试Base64解码...');
    try {
        const decodeResponse = await axios.get(`${BASE_URL}/api/data/base64/decode`, {
            params: {
                text: 'SGVsbG8gV29ybGQh'
            }
        });
        console.log('✅ Base64解码成功:', decodeResponse.data);
    } catch (error) {
        console.log('❌ Base64解码失败:', error.response?.data || error.message);
    }

    console.log('\n' + '='.repeat(50) + '\n');

    // 测试MD5哈希加密
    console.log('7. 测试MD5哈希加密...');
    try {
        const md5Response = await axios.get(`${BASE_URL}/api/data/md5`, {
            params: {
                text: '123456'
            }
        });
        console.log('✅ MD5哈希加密成功:', md5Response.data);
    } catch (error) {
        console.log('❌ MD5哈希加密失败:', error.response?.data || error.message);
    }

    console.log('\n' + '='.repeat(50) + '\n');
    console.log('所有API测试完成！');
}

// 运行测试
testNetworkAPIs().catch(console.error); 