import { TOTPService } from '../services/totpService';

describe('TOTP服务测试', () => {
  test('生成密钥和otpauth URL的一致性', async () => {
    const username = 'testuser';
    const serviceName = 'Test Service';
    
    // 1. 生成密钥
    const secret = TOTPService.generateSecret(username, serviceName);
    console.log('生成的密钥:', secret);
    
    // 2. 生成otpauth URL
    const otpauthUrl = TOTPService.generateOTPAuthURL(secret, username, serviceName);
    console.log('生成的otpauth URL:', otpauthUrl);
    
    // 3. 从URL中提取密钥
    const secretMatch = otpauthUrl.match(/secret=([^&]+)/);
    const extractedSecret = secretMatch ? secretMatch[1] : null;
    const decodedSecret = extractedSecret ? decodeURIComponent(extractedSecret) : null;
    
    console.log('URL中提取的密钥:', extractedSecret);
    console.log('URL解码后的密钥:', decodedSecret);
    console.log('密钥匹配:', secret === decodedSecret);
    
    // 4. 生成二维码
    const qrCodeDataUrl = await TOTPService.generateQRCodeDataURL(secret, username, serviceName);
    console.log('生成的二维码Data URL长度:', qrCodeDataUrl.length);
    
    // 5. 验证TOTP令牌
    const token1 = require('speakeasy').totp({
      secret: secret,
      encoding: 'base32',
      step: 30
    });
    
    const token2 = require('speakeasy').totp({
      secret: decodedSecret!,
      encoding: 'base32',
      step: 30
    });
    
    console.log('原始密钥生成的验证码:', token1);
    console.log('URL密钥生成的验证码:', token2);
    console.log('验证码匹配:', token1 === token2);
    
    // 断言
    expect(secret).toBeDefined();
    expect(secret.length).toBe(32); // base32密钥应该是32字符
    expect(otpauthUrl).toBeDefined();
    expect(decodedSecret).toBeDefined();
    expect(decodedSecret).toBe(secret); // URL中的密钥应该与原始密钥一致
    expect(qrCodeDataUrl).toBeDefined();
    expect(qrCodeDataUrl.startsWith('data:image/png;base64,')).toBe(true);
    expect(token1).toBe(token2); // 两个密钥应该生成相同的TOTP
  });

  test('验证TOTP令牌', () => {
    const secret = TOTPService.generateSecret('testuser', 'Test Service');
    
    // 生成当前时间的TOTP令牌
    const token = require('speakeasy').totp({
      secret: secret,
      encoding: 'base32',
      step: 30
    });
    
    console.log('生成的TOTP令牌:', token);
    
    // 验证令牌
    const isValid = TOTPService.verifyToken(token, secret);
    console.log('令牌验证结果:', isValid);
    
    expect(isValid).toBe(true);
  });

  test('生成备用恢复码', () => {
    const backupCodes = TOTPService.generateBackupCodes();
    
    console.log('生成的备用恢复码:', backupCodes);
    
    expect(backupCodes).toBeDefined();
    expect(backupCodes.length).toBe(10);
    expect(backupCodes.every(code => /^[A-Z0-9]{8}$/.test(code))).toBe(true);
    
    // 测试验证备用恢复码
    const testCode = backupCodes[0];
    const isValid = TOTPService.verifyBackupCode(testCode, backupCodes);
    
    console.log('测试恢复码:', testCode);
    console.log('恢复码验证结果:', isValid);
    console.log('剩余恢复码数量:', backupCodes.length);
    
    expect(isValid).toBe(true);
    expect(backupCodes.length).toBe(9); // 使用后应该减少一个
  });
}); 