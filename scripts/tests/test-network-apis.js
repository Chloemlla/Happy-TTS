#!/usr/bin/env node

/**
 * 网络API综合测试脚本
 * 测试所有网络相关API功能
 */

const axios = require('axios');

// 配置
const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

// API端点配置
const API_ENDPOINTS = {
    tcpPing: '/api/network/tcping',
    ping: '/api/network/ping',
    speedTest: '/api/network/speed',
    portScan: '/api/network/portscan',
    ipQuery: '/api/network/ipquery',
    randomQuote: '/api/network/yiyan',
    douyinHot: '/api/network/douyinhot'
};

// 颜色输出
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSuccess(message) {
    log(`✅ ${message}`, 'green');
}

function logError(message) {
    log(`❌ ${message}`, 'red');
}

function logInfo(message) {
    log(`ℹ️  ${message}`, 'blue');
}

function logWarning(message) {
    log(`⚠️  ${message}`, 'yellow');
}

/**
 * 通用API测试函数
 */
async function testApi(endpoint, params = {}, description) {
    logInfo(`测试 ${description}...`);
    
    try {
        const startTime = Date.now();
        
        const response = await axios.get(`${BASE_URL}${endpoint}`, {
            params,
            timeout: 30000,
            headers: {
                'User-Agent': 'NetworkAPI-Test/1.0',
                'Accept': 'application/json'
            }
        });
        
        const endTime = Date.now();
        const responseTime = endTime - startTime;
        
        logSuccess(`${description} 测试成功! 响应时间: ${responseTime}ms`);
        
        if (response.data && response.data.success) {
            logInfo(`响应消息: ${response.data.message}`);
            return true;
        } else {
            logWarning(`API返回失败: ${response.data?.error || '未知错误'}`);
            return false;
        }
        
    } catch (error) {
        if (axios.isAxiosError(error)) {
            if (error.response) {
                logError(`${description} 测试失败: ${error.response.status} - ${error.response.statusText}`);
            } else if (error.request) {
                logError(`${description} 测试失败: 网络连接错误`);
            } else {
                logError(`${description} 测试失败: ${error.message}`);
            }
        } else {
            logError(`${description} 测试失败: ${error.message}`);
        }
        return false;
    }
}

/**
 * TCP连接检测测试
 */
async function testTcpPing() {
    return await testApi(
        API_ENDPOINTS.tcpPing,
        { address: '8.8.8.8', port: 53 },
        'TCP连接检测 (8.8.8.8:53)'
    );
}

/**
 * Ping检测测试
 */
async function testPing() {
    return await testApi(
        API_ENDPOINTS.ping,
        { url: 'https://www.baidu.com' },
        'Ping检测 (baidu.com)'
    );
}

/**
 * 网站测速测试
 */
async function testSpeedTest() {
    return await testApi(
        API_ENDPOINTS.speedTest,
        { url: 'https://www.google.com' },
        '网站测速 (google.com)'
    );
}

/**
 * 端口扫描测试
 */
async function testPortScan() {
    return await testApi(
        API_ENDPOINTS.portScan,
        { address: '8.8.8.8' },
        '端口扫描 (8.8.8.8)'
    );
}

/**
 * IP查询测试
 */
async function testIpQuery() {
    return await testApi(
        API_ENDPOINTS.ipQuery,
        { ip: '8.8.8.8' },
        '精准IP查询 (8.8.8.8)'
    );
}

/**
 * 随机一言测试
 */
async function testRandomQuote() {
    const results = [];
    
    // 测试一言
    results.push(await testApi(
        API_ENDPOINTS.randomQuote,
        { type: 'hitokoto' },
        '随机一言 (hitokoto)'
    ));
    
    // 测试古诗词
    results.push(await testApi(
        API_ENDPOINTS.randomQuote,
        { type: 'poetry' },
        '随机古诗词 (poetry)'
    ));
    
    return results.every(result => result);
}

/**
 * 抖音热榜测试
 */
async function testDouyinHot() {
    logInfo('测试抖音热榜查询...');
    
    try {
        const startTime = Date.now();
        
        const response = await axios.get(`${BASE_URL}${API_ENDPOINTS.douyinHot}`, {
            timeout: 20000,
            headers: {
                'User-Agent': 'DouyinHot-Test/1.0',
                'Accept': 'application/json'
            }
        });
        
        const endTime = Date.now();
        const responseTime = endTime - startTime;
        
        logSuccess(`抖音热榜查询测试成功! 响应时间: ${responseTime}ms`);
        
        if (response.data && response.data.success) {
            const hotData = response.data.data;
            
            if (hotData && hotData.data && Array.isArray(hotData.data)) {
                logSuccess(`获取到 ${hotData.data.length} 条热榜数据`);
                
                // 显示前3条热榜数据
                const top3 = hotData.data.slice(0, 3);
                logInfo('前3条热榜数据:');
                top3.forEach((item, index) => {
                    console.log(`  ${index + 1}. ${item.word} (热度: ${item.hot_value})`);
                });
                
                return true;
            } else {
                logWarning('热榜数据格式异常');
                return false;
            }
        } else {
            logWarning(`API返回失败: ${response.data?.error || '未知错误'}`);
            return false;
        }
        
    } catch (error) {
        if (axios.isAxiosError(error)) {
            if (error.response) {
                logError(`抖音热榜查询测试失败: ${error.response.status} - ${error.response.statusText}`);
            } else if (error.request) {
                logError('抖音热榜查询测试失败: 网络连接错误');
            } else {
                logError(`抖音热榜查询测试失败: ${error.message}`);
            }
        } else {
            logError(`抖音热榜查询测试失败: ${error.message}`);
        }
        return false;
    }
}

/**
 * 限流测试
 */
async function testRateLimit() {
    logInfo('测试限流功能...');
    
    const requests = [];
    const maxRequests = 35; // 超过限流器设置的30次
    
    for (let i = 0; i < maxRequests; i++) {
        requests.push(
            axios.get(`${BASE_URL}${API_ENDPOINTS.douyinHot}`, {
                timeout: 5000,
                headers: {
                    'User-Agent': `RateLimit-Test/${i + 1}`,
                    'Accept': 'application/json'
                }
            }).catch(error => error)
        );
    }
    
    try {
        const results = await Promise.all(requests);
        
        let successCount = 0;
        let rateLimitCount = 0;
        let errorCount = 0;
        
        results.forEach((result, index) => {
            if (axios.isAxiosError(result)) {
                if (result.response && result.response.status === 429) {
                    rateLimitCount++;
                } else {
                    errorCount++;
                }
            } else {
                successCount++;
            }
        });
        
        logInfo(`限流测试结果:`);
        logInfo(`  成功请求: ${successCount}`);
        logInfo(`  限流请求: ${rateLimitCount}`);
        logInfo(`  错误请求: ${errorCount}`);
        
        if (rateLimitCount > 0) {
            logSuccess('限流功能正常工作');
            return true;
        } else {
            logWarning('未检测到限流，可能需要调整测试参数');
            return false;
        }
        
    } catch (error) {
        logError(`限流测试失败: ${error.message}`);
        return false;
    }
}

/**
 * 运行所有测试
 */
async function runAllTests() {
    const testResults = {
        tcpPing: false,
        ping: false,
        speedTest: false,
        portScan: false,
        ipQuery: false,
        randomQuote: false,
        douyinHot: false,
        rateLimit: false
    };
    
    log('='.repeat(60), 'bright');
    log('网络API综合测试', 'bright');
    log('='.repeat(60), 'bright');
    
    // 基础网络测试
    log('\n📡 基础网络测试', 'cyan');
    testResults.tcpPing = await testTcpPing();
    testResults.ping = await testPing();
    testResults.speedTest = await testSpeedTest();
    testResults.portScan = await testPortScan();
    
    // IP查询测试
    log('\n🌍 IP查询测试', 'cyan');
    testResults.ipQuery = await testIpQuery();
    
    // 一言古诗词测试
    log('\n📝 一言古诗词测试', 'cyan');
    testResults.randomQuote = await testRandomQuote();
    
    // 抖音热榜测试
    log('\n🔥 抖音热榜测试', 'cyan');
    testResults.douyinHot = await testDouyinHot();
    
    // 限流测试
    log('\n🚦 限流测试', 'cyan');
    testResults.rateLimit = await testRateLimit();
    
    // 测试结果汇总
    log('\n' + '='.repeat(60), 'bright');
    log('测试结果汇总', 'bright');
    log('='.repeat(60), 'bright');
    
    const totalTests = Object.keys(testResults).length;
    const passedTests = Object.values(testResults).filter(result => result).length;
    const failedTests = totalTests - passedTests;
    
    Object.entries(testResults).forEach(([testName, result]) => {
        const status = result ? '✅ 通过' : '❌ 失败';
        const color = result ? 'green' : 'red';
        log(`${status} ${testName}`, color);
    });
    
    log('\n' + '='.repeat(60), 'bright');
    log(`总计: ${totalTests} 项测试`, 'bright');
    log(`通过: ${passedTests} 项`, 'green');
    log(`失败: ${failedTests} 项`, failedTests > 0 ? 'red' : 'green');
    log('='.repeat(60), 'bright');
    
    return testResults;
}

/**
 * 主函数
 */
async function main() {
    // 检查命令行参数
    const args = process.argv.slice(2);
    const testType = args[0] || 'all';
    
    switch (testType) {
        case 'tcp':
            await testTcpPing();
            break;
        case 'ping':
            await testPing();
            break;
        case 'speed':
            await testSpeedTest();
            break;
        case 'portscan':
            await testPortScan();
            break;
        case 'ip':
            await testIpQuery();
            break;
        case 'yiyan':
            await testRandomQuote();
            break;
        case 'douyin':
            await testDouyinHot();
            break;
        case 'ratelimit':
            await testRateLimit();
            break;
        case 'all':
            await runAllTests();
            break;
        default:
            logError(`未知的测试类型: ${testType}`);
            logInfo('可用选项: tcp, ping, speed, portscan, ip, yiyan, douyin, ratelimit, all');
            process.exit(1);
    }
}

// 错误处理
process.on('unhandledRejection', (reason, promise) => {
    logError('未处理的Promise拒绝:');
    console.error(reason);
    process.exit(1);
});

process.on('uncaughtException', (error) => {
    logError('未捕获的异常:');
    console.error(error);
    process.exit(1);
});

// 运行测试
if (require.main === module) {
    main().catch(error => {
        logError(`测试执行失败: ${error.message}`);
        process.exit(1);
    });
}

module.exports = {
    testTcpPing,
    testPing,
    testSpeedTest,
    testPortScan,
    testIpQuery,
    testRandomQuote,
    testDouyinHot,
    testRateLimit,
    runAllTests
}; 