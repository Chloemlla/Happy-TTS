#!/usr/bin/env node

/**
 * 测试credentialID格式转换
 * 使用方法: node scripts/test-credential-id-format.js
 */

// 模拟前端发送的credentialID
const testCredentialIds = [
    "K40prwEZUuEOASN09YJS3w",  // 从日志中看到的格式
    "X7jmkxuksuMX-mGC4W49-g",  // 正确的base64url格式
    "X7jmkxuksuMX+mGC4W49/g==", // base64格式
    "invalid@format#123",       // 无效格式
    "",                         // 空字符串
    null,                       // null值
    undefined                   // undefined值
];

console.log('=== CredentialID 格式转换测试 ===\n');

function isBase64Url(str) {
    return str && typeof str === 'string' && /^[A-Za-z0-9_-]+$/.test(str);
}

function convertToBase64Url(input) {
    if (!input || typeof input !== 'string') {
        throw new Error('输入必须是有效的字符串');
    }

    // 如果已经是base64url格式，直接返回
    if (isBase64Url(input)) {
        return input;
    }

    try {
        // 尝试从base64解码再重新编码为base64url
        const buffer = Buffer.from(input, 'base64');
        return buffer.toString('base64url');
    } catch (error) {
        throw new Error(`转换失败: ${error.message}`);
    }
}

function testCredentialId(credentialId, index) {
    console.log(`测试 ${index + 1}:`);
    console.log(`  输入: ${credentialId}`);
    console.log(`  类型: ${typeof credentialId}`);
    console.log(`  长度: ${credentialId?.length || 0}`);
    
    if (!credentialId) {
        console.log(`  状态: 空值，跳过`);
        console.log('');
        return;
    }

    const isBase64UrlFormat = isBase64Url(credentialId);
    console.log(`  是否为base64url格式: ${isBase64UrlFormat ? '是' : '否'}`);

    if (isBase64UrlFormat) {
        console.log(`  状态: 格式正确，无需转换`);
    } else {
        try {
            const converted = convertToBase64Url(credentialId);
            console.log(`  转换后: ${converted}`);
            console.log(`  转换后是否为base64url格式: ${isBase64Url(converted) ? '是' : '否'}`);
            console.log(`  状态: 转换成功`);
        } catch (error) {
            console.log(`  状态: 转换失败 - ${error.message}`);
        }
    }
    console.log('');
}

// 运行测试
testCredentialIds.forEach((credentialId, index) => {
    testCredentialId(credentialId, index);
});

// 测试实际的转换逻辑
console.log('=== 实际转换逻辑测试 ===\n');

const testId = "K40prwEZUuEOASN09YJS3w";
console.log(`原始ID: ${testId}`);
console.log(`是否为base64url格式: ${isBase64Url(testId)}`);

try {
    // 尝试base64解码
    const buffer = Buffer.from(testId, 'base64');
    console.log(`base64解码成功，buffer长度: ${buffer.length}`);
    
    // 转换为base64url
    const base64url = buffer.toString('base64url');
    console.log(`转换为base64url: ${base64url}`);
    console.log(`转换后是否为base64url格式: ${isBase64Url(base64url)}`);
    
    // 验证转换的正确性
    const backToBuffer = Buffer.from(base64url, 'base64url');
    const backToBase64 = backToBuffer.toString('base64');
    console.log(`转换回base64: ${backToBase64}`);
    console.log(`转换一致性: ${backToBase64 === testId ? '一致' : '不一致'}`);
    
} catch (error) {
    console.log(`转换失败: ${error.message}`);
}

console.log('\n=== 测试完成 ==='); 