#!/usr/bin/env node

/**
 * 测试credentialID修复功能
 * 使用方法: node scripts/test-credential-id-fix.js
 */

const fs = require('fs');
const path = require('path');

// 模拟用户数据
const testUserData = {
    id: "1",
    username: "admin",
    passkeyEnabled: true,
    passkeyCredentials: [
        {
            id: "X7jmkxuksuMX-mGC4W49-g",
            name: "happy",
            credentialID: "X7jmkxuksuMX-mGC4W49-g", // 这个看起来是正确的base64url格式
            credentialPublicKey: "pQECAyYgASFYIAsjrQ5TkSraBeOS3EpIxJENdreimeBGOZoP/cssI2pRIlgg3kXKyLXSr569UVQ6IKQKABtcVZAvfNmZvcQ6tGrC1qE=",
            counter: 0,
            createdAt: "2025-07-05T07:22:06.882Z"
        }
    ]
};

// 模拟修复函数
function fixCredentialId(credentialId) {
    if (!credentialId) {
        throw new Error('credentialID为空');
    }

    // 如果已经是正确的base64url格式，直接返回
    if (typeof credentialId === 'string' && /^[A-Za-z0-9_-]+$/.test(credentialId)) {
        return credentialId;
    }

    // 尝试转换为base64url格式
    try {
        if (Buffer.isBuffer(credentialId)) {
            return credentialId.toString('base64url');
        }
        
        if (typeof credentialId === 'string') {
            // 尝试从base64解码再重新编码为base64url
            try {
                const buffer = Buffer.from(credentialId, 'base64');
                return buffer.toString('base64url');
            } catch {
                // 如果解码失败，直接转换为base64url
                return Buffer.from(credentialId).toString('base64url');
            }
        }
        
        // 其他类型，强制转换为字符串再转base64url
        return Buffer.from(String(credentialId)).toString('base64url');
        
    } catch (error) {
        throw new Error(`无法修复credentialID: ${credentialId} - ${error.message}`);
    }
}

function isValidCredentialId(credentialId) {
    return credentialId && 
           typeof credentialId === 'string' && 
           /^[A-Za-z0-9_-]+$/.test(credentialId) && 
           credentialId.length > 0;
}

function getCredentialIdInfo(credentialId) {
    const issues = [];
    let isValid = false;
    let format = 'unknown';

    if (!credentialId) {
        issues.push('credentialID为空');
    } else if (typeof credentialId !== 'string') {
        issues.push(`credentialID类型错误: ${typeof credentialId}`);
    } else if (credentialId.length === 0) {
        issues.push('credentialID长度为0');
    } else if (!/^[A-Za-z0-9_-]+$/.test(credentialId)) {
        issues.push('credentialID格式不是有效的base64url');
        // 尝试检测格式
        if (/^[A-Za-z0-9+/]+=*$/.test(credentialId)) {
            format = 'base64';
        } else if (/^[A-Za-z0-9_-]+$/.test(credentialId)) {
            format = 'base64url';
        } else {
            format = 'unknown';
        }
    } else {
        isValid = true;
        format = 'base64url';
    }

    return {
        isValid,
        type: typeof credentialId,
        length: credentialId?.length || 0,
        format,
        issues
    };
}

// 测试用例
const testCases = [
    {
        name: "正确的base64url格式",
        credentialId: "X7jmkxuksuMX-mGC4W49-g",
        expectedValid: true
    },
    {
        name: "base64格式（需要转换）",
        credentialId: "X7jmkxuksuMX+mGC4W49/g==",
        expectedValid: false
    },
    {
        name: "空字符串",
        credentialId: "",
        expectedValid: false
    },
    {
        name: "null值",
        credentialId: null,
        expectedValid: false
    },
    {
        name: "undefined值",
        credentialId: undefined,
        expectedValid: false
    },
    {
        name: "包含特殊字符",
        credentialId: "X7jmkxuksuMX@mGC4W49#g",
        expectedValid: false
    }
];

console.log('=== CredentialID 修复测试 ===\n');

// 运行测试用例
testCases.forEach((testCase, index) => {
    console.log(`测试 ${index + 1}: ${testCase.name}`);
    console.log(`输入: ${testCase.credentialId}`);
    
    try {
        const info = getCredentialIdInfo(testCase.credentialId);
        console.log(`状态: ${info.isValid ? '有效' : '无效'}`);
        console.log(`格式: ${info.format}`);
        console.log(`长度: ${info.length}`);
        
        if (info.issues.length > 0) {
            console.log(`问题: ${info.issues.join(', ')}`);
        }
        
        if (!info.isValid && testCase.credentialId) {
            try {
                const fixed = fixCredentialId(testCase.credentialId);
                const fixedInfo = getCredentialIdInfo(fixed);
                console.log(`修复后: ${fixed}`);
                console.log(`修复后状态: ${fixedInfo.isValid ? '有效' : '无效'}`);
            } catch (error) {
                console.log(`修复失败: ${error.message}`);
            }
        }
        
        console.log('');
    } catch (error) {
        console.log(`错误: ${error.message}\n`);
    }
});

// 测试当前用户数据
console.log('=== 当前用户数据测试 ===\n');

testUserData.passkeyCredentials.forEach((cred, index) => {
    console.log(`凭证 ${index + 1}: ${cred.name}`);
    console.log(`credentialID: ${cred.credentialID}`);
    
    const info = getCredentialIdInfo(cred.credentialID);
    console.log(`状态: ${info.isValid ? '有效' : '无效'}`);
    console.log(`格式: ${info.format}`);
    console.log(`长度: ${info.length}`);
    
    if (info.issues.length > 0) {
        console.log(`问题: ${info.issues.join(', ')}`);
    }
    
    console.log('');
});

console.log('=== 测试完成 ==='); 