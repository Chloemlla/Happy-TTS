import speakeasy from 'speakeasy';

describe('Speakeasy库调试', () => {
  test('调试speakeasy.generateSecret', () => {
    const secret = speakeasy.generateSecret({
      name: 'Test Service (testuser)',
      issuer: 'Test Service',
      length: 20
    });
    
    console.log('生成的密钥对象:', secret);
    console.log('base32密钥:', secret.base32);
    console.log('base32长度:', secret.base32.length);
    console.log('hex密钥:', secret.hex);
    console.log('ascii密钥:', secret.ascii);
    console.log('otpauth URL:', secret.otpauth_url);
    
    expect(secret.base32).toBeDefined();
    expect(secret.base32.length).toBe(32);
  });

  test('otpauthURL 里的密钥能正确生成 TOTP', () => {
    const secretObj = speakeasy.generateSecret({ length: 20 });
    const otpauthUrl = speakeasy.otpauthURL({
      secret: secretObj.ascii, // 传ascii原文
      label: 'testuser',
      issuer: 'Test Service',
      encoding: 'ascii', // 明确指定
      algorithm: 'sha1',
      digits: 6,
      period: 30
    });
    // 提取密钥
    const secretMatch = otpauthUrl.match(/secret=([^&]+)/);
    const extractedSecret = secretMatch ? secretMatch[1] : null;
    const decodedSecret = extractedSecret ? decodeURIComponent(extractedSecret) : null;
    expect(decodedSecret).toBeDefined();
    // 用 speakeasy 生成的 base32 密钥和 URL 里提取出来的密钥都能生成同样的 TOTP
    const token1 = speakeasy.totp({ secret: secretObj.base32, encoding: 'base32' });
    const token2 = speakeasy.totp({ secret: decodedSecret!, encoding: 'base32' });
    expect(token1).toBe(token2);
  });

  test('调试完整的TOTP流程', () => {
    // 1. 生成密钥
    const secretObj = speakeasy.generateSecret({
      name: 'Test Service (testuser)',
      issuer: 'Test Service',
      length: 20
    });
    
    console.log('1. 生成的密钥:', secretObj.base32);
    
    // 2. 生成otpauth URL
    const otpauthUrl = speakeasy.otpauthURL({
      secret: secretObj.ascii,
      label: 'testuser',
      issuer: 'Test Service',
      encoding: 'ascii',
      algorithm: 'sha1',
      digits: 6,
      period: 30
    });
    
    console.log('2. 生成的otpauth URL:', otpauthUrl);
    
    // 3. 从URL中提取密钥
    const secretMatch = otpauthUrl.match(/secret=([^&]+)/);
    const extractedSecret = secretMatch ? secretMatch[1] : null;
    const decodedSecret = extractedSecret ? decodeURIComponent(extractedSecret) : null;
    
    console.log('3. URL中提取的密钥:', extractedSecret);
    console.log('4. URL解码后的密钥:', decodedSecret);
    console.log('5. 密钥匹配:', secretObj.base32 === decodedSecret);
    
    expect(decodedSecret).toBeDefined();
    
    // 4. 生成验证码
    const token1 = speakeasy.totp({
      secret: secretObj.base32,
      encoding: 'base32',
      step: 30
    });
    
    const token2 = speakeasy.totp({
      secret: decodedSecret!,
      encoding: 'base32',
      step: 30
    });
    
    console.log('6. 原始密钥生成的验证码:', token1);
    console.log('7. URL密钥生成的验证码:', token2);
    console.log('8. 验证码匹配:', token1 === token2);
    
    // 5. 验证令牌
    const isValid1 = speakeasy.totp.verify({
      secret: secretObj.base32,
      encoding: 'base32',
      token: token1,
      window: 2,
      step: 30
    });
    
    const isValid2 = speakeasy.totp.verify({
      secret: decodedSecret!,
      encoding: 'base32',
      token: token2,
      window: 2,
      step: 30
    });
    
    console.log('9. 原始密钥验证结果:', isValid1);
    console.log('10. URL密钥验证结果:', isValid2);
    
    expect(token1).toBe(token2);
    expect(isValid1).toBe(true);
    expect(isValid2).toBe(true);
  });
}); 