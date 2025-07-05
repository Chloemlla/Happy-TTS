// 简单测试credentialID的base64url解码
const testSimpleCredentialId = () => {
    console.log('=== 简单测试credentialID ===');
    
    const credentialId = 'OqI3Ywc2XtE2QzorLtzT0Q';
    console.log(`credentialID: ${credentialId}`);
    console.log(`长度: ${credentialId.length}`);
    
    // 检查是否是4的倍数
    const remainder = credentialId.length % 4;
    console.log(`长度除以4的余数: ${remainder}`);
    
    if (remainder !== 0) {
        console.log('长度不是4的倍数，需要添加填充');
        const padding = '='.repeat(4 - remainder);
        const paddedId = credentialId + padding;
        console.log(`添加填充后: ${paddedId}`);
        
        try {
            const buffer = Buffer.from(paddedId, 'base64url');
            console.log(`✅ 填充后解码成功: ${buffer.length} 字节`);
            console.log(`解码结果: [${Array.from(buffer).join(', ')}]`);
        } catch (error) {
            console.log(`❌ 填充后解码失败: ${error.message}`);
        }
    }
    
    // 尝试直接解码
    try {
        const buffer = Buffer.from(credentialId, 'base64url');
        console.log(`✅ 直接解码成功: ${buffer.length} 字节`);
        console.log(`解码结果: [${Array.from(buffer).join(', ')}]`);
    } catch (error) {
        console.log(`❌ 直接解码失败: ${error.message}`);
    }
    
    // 尝试使用base64解码
    try {
        const buffer = Buffer.from(credentialId, 'base64');
        console.log(`✅ base64解码成功: ${buffer.length} 字节`);
        console.log(`解码结果: [${Array.from(buffer).join(', ')}]`);
    } catch (error) {
        console.log(`❌ base64解码失败: ${error.message}`);
    }
    
    // 检查字符
    console.log('\n字符检查:');
    const chars = credentialId.split('');
    chars.forEach((char, index) => {
        const code = char.charCodeAt(0);
        console.log(`位置 ${index}: '${char}' (ASCII: ${code})`);
    });
    
    // 检查是否包含base64url不允许的字符
    const invalidChars = chars.filter(char => !/[A-Za-z0-9_-]/.test(char));
    if (invalidChars.length > 0) {
        console.log(`❌ 发现无效字符: ${invalidChars.join(', ')}`);
    } else {
        console.log('✅ 所有字符都是有效的base64url字符');
    }
};

// 运行测试
testSimpleCredentialId(); 