import axios from 'axios';
import { config } from '../config/config';

// 测试配置
const BASE_URL = `http://localhost:${config.port || 3000}`;
const TEST_ENDPOINTS = [
    { path: '/api/auth/login', method: 'POST', data: { identifier: 'test', password: 'test' } },
    { path: '/api/tts/generate', method: 'POST', data: { text: 'test', model: 'tts-1', voice: 'alloy', outputFormat: 'mp3' } },
    { path: '/api/totp/status', method: 'GET' },
    { path: '/api/passkey/credentials', method: 'GET' },
    { path: '/api/admin/users', method: 'GET' },
    { path: '/api/status', method: 'GET' },
    { path: '/api/network/ip', method: 'GET' },
    { path: '/api/media/parse', method: 'POST', data: { url: 'https://example.com' } },
    { path: '/api/social/douyin-hot', method: 'GET' },
    { path: '/api/life/bmi', method: 'POST', data: { weight: 70, height: 170 } }
];

interface TestResult {
    endpoint: string;
    method: string;
    successCount: number;
    rateLimitedCount: number;
    otherErrors: number;
    averageResponseTime: number;
}

// 测试单个端点
async function testEndpoint(endpoint: any): Promise<TestResult> {
    console.log(`测试端点: ${endpoint.method} ${endpoint.path}`);
    
    const startTime = Date.now();
    const promises = [];
    const responseTimes: number[] = [];
    
    // 发送超过限制的请求
    const requestCount = 150; // 超过大多数限制
    
    for (let i = 0; i < requestCount; i++) {
        const requestStart = Date.now();
        promises.push(
            axios({
                method: endpoint.method,
                url: `${BASE_URL}${endpoint.path}`,
                data: endpoint.data,
                timeout: 5000,
                validateStatus: () => true // 不抛出错误
            })
            .then(response => {
                responseTimes.push(Date.now() - requestStart);
                return { 
                    status: response.status, 
                    success: response.status < 400,
                    data: response.data 
                };
            })
            .catch(error => {
                responseTimes.push(Date.now() - requestStart);
                return { 
                    status: error.response?.status || 'error', 
                    success: false,
                    data: error.response?.data || error.message 
                };
            })
        );
    }

    const results = await Promise.all(promises);
    const totalTime = Date.now() - startTime;
    
    // 统计结果
    const successCount = results.filter(r => r.success).length;
    const rateLimitedCount = results.filter(r => r.status === 429).length;
    const otherErrors = results.filter(r => !r.success && r.status !== 429).length;
    const averageResponseTime = responseTimes.length > 0 ? 
        responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : 0;

    return {
        endpoint: endpoint.path,
        method: endpoint.method,
        successCount,
        rateLimitedCount,
        otherErrors,
        averageResponseTime
    };
}

// 测试所有端点
async function testAllEndpoints(): Promise<void> {
    console.log('=== 速率限制测试 ===\n');
    console.log(`测试服务器: ${BASE_URL}`);
    console.log(`测试时间: ${new Date().toLocaleString()}\n`);
    
    const results: TestResult[] = [];
    
    for (const endpoint of TEST_ENDPOINTS) {
        try {
            const result = await testEndpoint(endpoint);
            results.push(result);
            
            console.log(`✅ ${endpoint.method} ${endpoint.path}`);
            console.log(`   成功请求: ${result.successCount}`);
            console.log(`   被限制请求: ${result.rateLimitedCount}`);
            console.log(`   其他错误: ${result.otherErrors}`);
            console.log(`   平均响应时间: ${result.averageResponseTime.toFixed(2)}ms`);
            
            if (result.rateLimitedCount > 0) {
                console.log(`   ✅ 速率限制正常工作`);
            } else {
                console.log(`   ⚠️  未触发速率限制`);
            }
            console.log('');
            
        } catch (error) {
            console.log(`❌ ${endpoint.method} ${endpoint.path} - 测试失败: ${error}`);
            console.log('');
        }
        
        // 等待一下再测试下一个端点
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // 总结
    console.log('=== 测试总结 ===');
    const totalRateLimited = results.reduce((sum, r) => sum + r.rateLimitedCount, 0);
    const totalSuccess = results.reduce((sum, r) => sum + r.successCount, 0);
    const totalErrors = results.reduce((sum, r) => sum + r.otherErrors, 0);
    
    console.log(`总成功请求: ${totalSuccess}`);
    console.log(`总被限制请求: ${totalRateLimited}`);
    console.log(`总其他错误: ${totalErrors}`);
    
    if (totalRateLimited > 0) {
        console.log('✅ 速率限制系统正常工作');
    } else {
        console.log('⚠️  未检测到速率限制，请检查配置');
    }
}

// 测试特定端点的速率限制
async function testSpecificEndpoint(path: string, method: string = 'GET', data?: any): Promise<void> {
    console.log(`=== 测试特定端点: ${method} ${path} ===\n`);
    
    const endpoint = { path, method, data };
    const result = await testEndpoint(endpoint);
    
    console.log(`测试结果:`);
    console.log(`  成功请求: ${result.successCount}`);
    console.log(`  被限制请求: ${result.rateLimitedCount}`);
    console.log(`  其他错误: ${result.otherErrors}`);
    console.log(`  平均响应时间: ${result.averageResponseTime.toFixed(2)}ms`);
    
    if (result.rateLimitedCount > 0) {
        console.log('✅ 速率限制正常工作');
    } else {
        console.log('⚠️  未触发速率限制');
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length >= 2) {
        // 测试特定端点
        const [path, method, data] = args;
        testSpecificEndpoint(path, method, data ? JSON.parse(data) : undefined)
            .catch(console.error);
    } else {
        // 测试所有端点
        testAllEndpoints().catch(console.error);
    }
}

export { testAllEndpoints, testSpecificEndpoint, testEndpoint }; 