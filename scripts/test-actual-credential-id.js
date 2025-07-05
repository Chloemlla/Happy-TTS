// 测试实际的credentialID格式
const testActualCredentialId = () => {
    console.log('=== 测试实际credentialID格式 ===');
    
    const actualCredentialId = 'OqI3Ywc2XtE2QzorLtzT0Q';
    console.log(`实际credentialID: ${actualCredentialId}`);
    
    // 检查字符组成
    console.log('\n字符分析:');
    const chars = actualCredentialId.split('');
    const charCounts = {};
    chars.forEach(char => {
        charCounts[char] = (charCounts[char] || 0) + 1;
    });
    console.log('字符统计:', charCounts);
    
    // 检查是否包含特殊字符
    const hasPlus = actualCredentialId.includes('+');
    const hasSlash = actualCredentialId.includes('/');
    const hasEquals = actualCredentialId.includes('=');
    const hasMinus = actualCredentialId.includes('-');
    const hasUnderscore = actualCredentialId.includes('_');
    
    console.log('\n特殊字符检查:');
    console.log(`包含+字符: ${hasPlus}`);
    console.log(`包含/字符: ${hasSlash}`);
    console.log(`包含=字符: ${hasEquals}`);
    console.log(`包含-字符: ${hasMinus}`);
    console.log(`包含_字符: ${hasUnderscore}`);
    
    // 检查格式
    const isBase64Url = /^[A-Za-z0-9_-]+$/.test(actualCredentialId);
    const isBase64Standard = /^[A-Za-z0-9+/]+={0,2}$/.test(actualCredentialId);
    
    console.log('\n格式检查:');
    console.log(`是base64url格式: ${isBase64Url}`);
    console.log(`是base64标准格式: ${isBase64Standard}`);
    
    // 尝试解码
    console.log('\n解码测试:');
    
    try {
        const buffer1 = Buffer.from(actualCredentialId, 'base64url');
        console.log(`base64url解码成功: ${buffer1.length} 字节`);
        console.log(`解码结果: [${Array.from(buffer1).join(', ')}]`);
    } catch (error) {
        console.log(`base64url解码失败: ${error.message}`);
    }
    
    try {
        const buffer2 = Buffer.from(actualCredentialId, 'base64');
        console.log(`base64解码成功: ${buffer2.length} 字节`);
        console.log(`解码结果: [${Array.from(buffer2).join(', ')}]`);
    } catch (error) {
        console.log(`base64解码失败: ${error.message}`);
    }
    
    // 模拟@simplewebauthn/server的验证逻辑
    console.log('\n模拟@simplewebauthn/server验证:');
    
    // 检查credentialID是否包含base64标准字符
    if (hasPlus || hasSlash || hasEquals) {
        console.log('❌ 发现base64标准字符，需要转换为base64url');
        const converted = actualCredentialId.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
        console.log(`转换后: ${converted}`);
        
        try {
            const buffer = Buffer.from(converted, 'base64url');
            console.log(`✅ 转换后base64url解码成功: ${buffer.length} 字节`);
        } catch (error) {
            console.log(`❌ 转换后base64url解码失败: ${error.message}`);
        }
    } else {
        console.log('✅ 未发现base64标准字符，格式正确');
        
        try {
            const buffer = Buffer.from(actualCredentialId, 'base64url');
            console.log(`✅ base64url解码成功: ${buffer.length} 字节`);
        } catch (error) {
            console.log(`❌ base64url解码失败: ${error.message}`);
            console.log('这可能就是@simplewebauthn/server报错的原因');
        }
    }
    
    // 检查长度
    console.log('\n长度分析:');
    console.log(`credentialID长度: ${actualCredentialId.length}`);
    
    // base64url编码的字节数应该是3的倍数，或者长度应该是4的倍数
    if (actualCredentialId.length % 4 === 0) {
        console.log('✅ 长度是4的倍数，符合base64编码规则');
    } else {
        console.log('❌ 长度不是4的倍数，可能有问题');
    }
    
    // 检查是否有填充字符
    const paddingCount = (actualCredentialId.match(/=/g) || []).length;
    console.log(`填充字符(=)数量: ${paddingCount}`);
    
    if (paddingCount > 0) {
        console.log('❌ 发现填充字符，需要移除');
    } else {
        console.log('✅ 无填充字符');
    }
};

// 运行测试
testActualCredentialId(); 