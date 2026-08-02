#!/usr/bin/env node

/**
 * 抖音热榜API测试脚本
 * 测试抖音热榜查询功能
 */

const axios = require('axios');

// 配置
const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const API_ENDPOINT = '/api/network/douyinhot';

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
 * 测试抖音热榜API
 */
async function testDouyinHot() {
    logInfo('开始测试抖音热榜API...');
    logInfo(`测试地址: ${BASE_URL}${API_ENDPOINT}`);
    
    try {
        const startTime = Date.now();
        
        const response = await axios.get(`${BASE_URL}${API_ENDPOINT}`, {
            timeout: 20000, // 20秒超时
            headers: {
                'User-Agent': 'DouyinHot-Test/1.0',
                'Accept': 'application/json'
            }
        });
        
        const endTime = Date.now();
        const responseTime = endTime - startTime;
        
        logSuccess(`请求成功! 响应时间: ${responseTime}ms`);
        logInfo(`HTTP状态码: ${response.status}`);
        
        // 验证响应结构
        if (response.data && typeof response.data === 'object') {
            logSuccess('响应格式正确');
            
            // 检查基本字段
            if (response.data.success === true) {
                logSuccess('success字段正确');
            } else {
                logWarning('success字段不是true');
            }
            
            if (response.data.message) {
                logInfo(`响应消息: ${response.data.message}`);
            }
            
            if (response.data.data) {
                logSuccess('data字段存在');
                
                // 检查抖音热榜数据结构
                const hotData = response.data.data;
                
                if (hotData.code === 200) {
                    logSuccess('API响应码正确');
                } else {
                    logWarning(`API响应码: ${hotData.code}`);
                }
                
                if (hotData.msg) {
                    logInfo(`API消息: ${hotData.msg}`);
                }
                
                if (hotData.data && Array.isArray(hotData.data)) {
                    logSuccess(`热榜数据获取成功，共${hotData.data.length}条记录`);
                    
                    // 显示前5条热榜数据
                    const top5 = hotData.data.slice(0, 5);
                    logInfo('前5条热榜数据:');
                    top5.forEach((item, index) => {
                        console.log(`  ${index + 1}. ${item.word} (热度: ${item.hot_value}, 排名: ${item.position})`);
                    });
                    
                    // 验证数据结构
                    const firstItem = hotData.data[0];
                    if (firstItem) {
                        const requiredFields = ['word', 'hot_value', 'position', 'event_time'];
                        const missingFields = requiredFields.filter(field => !(field in firstItem));
                        
                        if (missingFields.length === 0) {
                            logSuccess('热榜数据结构完整');
                        } else {
                            logWarning(`缺少字段: ${missingFields.join(', ')}`);
                        }
                    }
                } else {
                    logError('热榜数据格式错误或为空');
                }
                
                if (hotData.request_id) {
                    logInfo(`请求ID: ${hotData.request_id}`);
                }
            } else {
                logError('缺少data字段');
            }
        } else {
            logError('响应格式错误');
        }
        
        // 显示响应头信息
        logInfo('响应头信息:');
        Object.entries(response.headers).forEach(([key, value]) => {
            if (key.toLowerCase().includes('content-type') || 
                key.toLowerCase().includes('cache-control') ||
                key.toLowerCase().includes('server')) {
                console.log(`  ${key}: ${value}`);
            }
        });
        
    } catch (error) {
        if (axios.isAxiosError(error)) {
            if (error.response) {
                logError(`HTTP错误: ${error.response.status} - ${error.response.statusText}`);
                logError(`错误响应: ${JSON.stringify(error.response.data, null, 2)}`);
            } else if (error.request) {
                logError('网络错误: 无法连接到服务器');
                logError(`请求详情: ${error.message}`);
            } else {
                logError(`请求配置错误: ${error.message}`);
            }
        } else {
            logError(`未知错误: ${error.message}`);
        }
        
        process.exit(1);
    }
}

/**
 * 测试限流功能
 */
async function testRateLimit() {
    logInfo('测试限流功能...');
    
    const requests = [];
    const maxRequests = 35; // 超过限流器设置的30次
    
    for (let i = 0; i < maxRequests; i++) {
        requests.push(
            axios.get(`${BASE_URL}${API_ENDPOINT}`, {
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
                    if (index === 0) {
                        logWarning(`第${index + 1}个请求被限流`);
                    }
                } else {
                    errorCount++;
                    if (index === 0) {
                        logError(`第${index + 1}个请求失败: ${result.message}`);
                    }
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
        } else {
            logWarning('未检测到限流，可能需要调整测试参数');
        }
        
    } catch (error) {
        logError(`限流测试失败: ${error.message}`);
    }
}

/**
 * 主函数
 */
async function main() {
    log('='.repeat(60), 'bright');
    log('抖音热榜API测试脚本', 'bright');
    log('='.repeat(60), 'bright');
    
    // 检查命令行参数
    const args = process.argv.slice(2);
    const testType = args[0] || 'basic';
    
    switch (testType) {
        case 'basic':
            await testDouyinHot();
            break;
        case 'ratelimit':
            await testRateLimit();
            break;
        case 'all':
            await testDouyinHot();
            console.log('\n');
            await testRateLimit();
            break;
        default:
            logError(`未知的测试类型: ${testType}`);
            logInfo('可用选项: basic, ratelimit, all');
            process.exit(1);
    }
    
    log('\n' + '='.repeat(60), 'bright');
    log('测试完成!', 'bright');
    log('='.repeat(60), 'bright');
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
    testDouyinHot,
    testRateLimit
}; 