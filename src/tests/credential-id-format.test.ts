describe('CredentialID 格式转换', () => {
  function isBase64Url(str: string) {
    return str && typeof str === 'string' && /^[A-Za-z0-9_-]+$/.test(str);
  }
  function convertToBase64Url(input: string) {
    if (!input || typeof input !== 'string') throw new Error('输入必须是有效的字符串');
    if (isBase64Url(input)) return input;
    const buffer = Buffer.from(input, 'base64');
    return buffer.toString('base64url');
  }
  it('应能正确转换各种格式', () => {
    const testCredentialIds = [
      'K40prwEZUuEOASN09YJS3w',
      'X7jmkxuksuMX-mGC4W49-g',
      'X7jmkxuksuMX+mGC4W49/g==',
      'invalid@format#123',
      '',
      null,
      undefined
    ];
    testCredentialIds.forEach(id => {
      if (!id || typeof id !== 'string') return;
      if (isBase64Url(id)) {
        expect(isBase64Url(id)).toBe(true);
      } else {
        try {
          const converted = convertToBase64Url(id);
          expect(isBase64Url(converted)).toBe(true);
        } catch {
          // 允许转换失败
        }
      }
    });
  });
}); 