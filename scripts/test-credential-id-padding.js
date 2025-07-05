// 测试credentialID填充修复
const testCredentialIdPadding = () => {
    console.log('=== 测试credentialID填充修复 ===');
    
    const originalCredentialId = 'OqI3Ywc2XtE2QzorLtzT0Q';
    console.log(`原始credentialID: ${originalCredentialId}`);
    console.log(`长度: ${originalCredentialId.length}`);
    console.log(`长度除以4的余数: ${originalCredentialId.length % 4}`);
    
    // 检查是否需要填充
    if (originalCredentialId.length % 4 !== 0) {
        const padding = '='.repeat(4 - (originalCredentialId.length % 4));
        const paddedCredentialId = originalCredentialId + padding;
        
        console.log(`\n需要填充: ${padding.length} 个字符`);
        console.log(`填充字符: "${padding}"`);
        console.log(`填充后credentialID: ${paddedCredentialId}`);
        console.log(`填充后长度: ${paddedCredentialId.length}`);
        console.log(`填充后长度除以4的余数: ${paddedCredentialId.length % 4}`);
        
        // 测试解码
        try {
            const buffer = Buffer.from(paddedCredentialId, 'base64url');
            console.log(`✅ 填充后base64url解码成功: ${buffer.length} 字节`);
            console.log(`解码结果: [${Array.from(buffer).join(', ')}]`);
        } catch (error) {
            console.log(`❌ 填充后base64url解码失败: ${error.message}`);
        }
        
        // 测试原始解码
        try {
            const buffer = Buffer.from(originalCredentialId, 'base64url');
            console.log(`✅ 原始base64url解码成功: ${buffer.length} 字节`);
            console.log(`解码结果: [${Array.from(buffer).join(', ')}]`);
        } catch (error) {
            console.log(`❌ 原始base64url解码失败: ${error.message}`);
        }
        
        // 测试base64解码
        try {
            const buffer = Buffer.from(originalCredentialId, 'base64');
            console.log(`✅ 原始base64解码成功: ${buffer.length} 字节`);
            console.log(`解码结果: [${Array.from(buffer).join(', ')}]`);
        } catch (error) {
            console.log(`❌ 原始base64解码失败: ${error.message}`);
        }
        
        // 验证填充是否正确
        const expectedPadding = 4 - (originalCredentialId.length % 4);
        console.log(`\n验证填充:`);
        console.log(`期望填充长度: ${expectedPadding}`);
        console.log(`实际填充长度: ${padding.length}`);
        console.log(`填充是否正确: ${expectedPadding === padding.length ? '是' : '否'}`);
        
        // 检查填充后的字符串是否符合base64url格式
        const isBase64Url = /^[A-Za-z0-9_-]+=*$/.test(paddedCredentialId);
        console.log(`填充后是否符合base64url格式: ${isBase64Url ? '是' : '否'}`);
        
    } else {
        console.log('credentialID长度是4的倍数，无需填充');
    }
    
    // 测试其他长度的credentialID
    console.log('\n=== 测试其他长度的credentialID ===');
    const testCases = [
        'abc',           // 长度3，需要1个=
        'abcd',          // 长度4，无需填充
        'abcde',         // 长度5，需要3个=
        'abcdef',        // 长度6，需要2个=
        'abcdefg',       // 长度7，需要1个=
        'abcdefgh'       // 长度8，无需填充
    ];
    
    testCases.forEach((testId, index) => {
        console.log(`\n测试用例 ${index + 1}: ${testId}`);
        console.log(`长度: ${testId.length}, 余数: ${testId.length % 4}`);
        
        if (testId.length % 4 !== 0) {
            const padding = '='.repeat(4 - (testId.length % 4));
            const padded = testId + padding;
            console.log(`填充后: ${padded}`);
            
            try {
                const buffer = Buffer.from(padded, 'base64url');
                console.log(`✅ 解码成功: ${buffer.length} 字节`);
            } catch (error) {
                console.log(`❌ 解码失败: ${error.message}`);
            }
        } else {
            console.log('无需填充');
        }
    });
};

// 运行测试
testCredentialIdPadding(); 