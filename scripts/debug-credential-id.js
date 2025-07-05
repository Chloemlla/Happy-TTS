// 调试实际的credentialID格式
const debugCredentialId = () => {
    console.log('=== 调试实际credentialID格式 ===');
    
    const actualCredentialId = 'OqI3Ywc2XtE2QzorLtzT0Q';
    console.log(`实际credentialID: ${actualCredentialId}`);
    console.log(`长度: ${actualCredentialId.length}`);
    
    // 检查每个字符
    console.log('\n字符分析:');
    for (let i = 0; i < actualCredentialId.length; i++) {
        const char = actualCredentialId[i];
        const code = char.charCodeAt(0);
        console.log(`位置 ${i}: '${char}' (ASCII: ${code})`);
    }
    
    // 检查是否包含base64标准字符
    const hasPlus = actualCredentialId.includes('+');
    const hasSlash = actualCredentialId.includes('/');
    const hasEquals = actualCredentialId.includes('=');
    
    console.log('\n字符检查:');
    console.log(`包含+字符: ${hasPlus}`);
    console.log(`包含/字符: ${hasSlash}`);
    console.log(`包含=字符: ${hasEquals}`);
    
    // 检查是否是有效的base64url格式
    const isValidBase64Url = /^[A-Za-z0-9_-]+$/.test(actualCredentialId);
    console.log(`是有效base64url格式: ${isValidBase64Url}`);
    
    // 尝试解码
    try {
        const buffer = Buffer.from(actualCredentialId, 'base64url');
        console.log(`\nbase64url解码成功: ${buffer.length} 字节`);
        console.log(`解码后的buffer: [${Array.from(buffer).join(', ')}]`);
    } catch (error) {
        console.log(`\nbase64url解码失败: ${error.message}`);
    }
    
    try {
        const buffer = Buffer.from(actualCredentialId, 'base64');
        console.log(`\nbase64解码成功: ${buffer.length} 字节`);
        console.log(`解码后的buffer: [${Array.from(buffer).join(', ')}]`);
    } catch (error) {
        console.log(`\nbase64解码失败: ${error.message}`);
    }
    
    // 检查后端存储的credentialID
    console.log('\n=== 后端存储的credentialID ===');
    const storedCredentialId = 'OqI3Ywc2XtE2QzorLtzT0Q';
    console.log(`存储的credentialID: ${storedCredentialId}`);
    
    // 比较前后端credentialID
    console.log(`前后端credentialID相同: ${actualCredentialId === storedCredentialId}`);
    
    // 尝试不同的编码方式
    console.log('\n=== 编码测试 ===');
    
    // 如果credentialID是base64格式，转换为base64url
    if (actualCredentialId.includes('+') || actualCredentialId.includes('/') || actualCredentialId.includes('=')) {
        const converted = actualCredentialId.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
        console.log(`转换后: ${converted}`);
        
        try {
            const buffer = Buffer.from(converted, 'base64url');
            console.log(`转换后base64url解码成功: ${buffer.length} 字节`);
        } catch (error) {
            console.log(`转换后base64url解码失败: ${error.message}`);
        }
    }
    
    // 检查是否是base64标准格式
    const isBase64Standard = /^[A-Za-z0-9+/]+={0,2}$/.test(actualCredentialId);
    console.log(`是base64标准格式: ${isBase64Standard}`);
    
    // 如果看起来像base64标准格式，转换为base64url
    if (isBase64Standard && !isValidBase64Url) {
        const converted = actualCredentialId.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
        console.log(`从base64标准转换为base64url: ${converted}`);
        
        try {
            const buffer = Buffer.from(converted, 'base64url');
            console.log(`转换后解码成功: ${buffer.length} 字节`);
        } catch (error) {
            console.log(`转换后解码失败: ${error.message}`);
        }
    }
};

// 运行调试
debugCredentialId(); 