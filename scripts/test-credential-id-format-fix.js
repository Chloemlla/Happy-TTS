// 测试credentialID格式转换逻辑
const testCredentialIdFormat = () => {
    console.log('=== 测试credentialID格式转换 ===');
    
    // 测试用例：包含+字符的credentialID
    const testCases = [
        'R5Y1IIH4fPXoikLFsVXlRQ',  // 包含+字符
        'R5Y1IIH4fPXoikLFsVXlRQ==', // 包含+和=字符
        'R5Y1IIH4fPXoikLFsVXlRQ/',  // 包含+和/字符
        'R5Y1IIH4fPXoikLFsVXlRQ',  // 正常base64url格式
        'abc123_-xyz',             // 纯base64url字符
    ];
    
    testCases.forEach((originalId, index) => {
        console.log(`\n测试用例 ${index + 1}:`);
        console.log(`原始ID: ${originalId}`);
        
        // 检查是否包含base64标准字符
        const hasBase64Chars = originalId.includes('+') || originalId.includes('/') || originalId.includes('=');
        console.log(`包含base64标准字符: ${hasBase64Chars}`);
        
        if (hasBase64Chars) {
            // 转换为base64url格式
            const fixedId = originalId.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
            console.log(`转换后ID: ${fixedId}`);
            
            // 验证转换结果
            const isValidBase64Url = /^[A-Za-z0-9_-]+$/.test(fixedId);
            console.log(`转换后是否有效base64url: ${isValidBase64Url}`);
        } else {
            console.log('无需转换，已经是base64url格式');
        }
        
        // 验证原始格式
        const originalIsValidBase64Url = /^[A-Za-z0-9_-]+$/.test(originalId);
        console.log(`原始格式是否有效base64url: ${originalIsValidBase64Url}`);
    });
    
    // 测试实际的credentialID
    console.log('\n=== 测试实际credentialID ===');
    const actualCredentialId = 'R5Y1IIH4fPXoikLFsVXlRQ';
    console.log(`实际credentialID: ${actualCredentialId}`);
    
    // 检查是否包含+字符
    if (actualCredentialId.includes('+')) {
        console.log('发现+字符，需要转换为-');
        const fixedId = actualCredentialId.replace(/\+/g, '-');
        console.log(`转换后: ${fixedId}`);
        
        // 验证转换是否正确
        const originalBuffer = Buffer.from(actualCredentialId, 'base64');
        const fixedBuffer = Buffer.from(fixedId, 'base64url');
        console.log(`原始buffer长度: ${originalBuffer.length}`);
        console.log(`转换后buffer长度: ${fixedBuffer.length}`);
        console.log(`buffer内容相同: ${originalBuffer.equals(fixedBuffer)}`);
    } else {
        console.log('credentialID格式正确，无需转换');
    }
};

// 运行测试
testCredentialIdFormat(); 