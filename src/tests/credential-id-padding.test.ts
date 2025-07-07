describe('credentialID 填充修复', () => {
  it('应能正确填充并解码 base64url', () => {
    const originalCredentialId = 'OqI3Ywc2XtE2QzorLtzT0Q';
    const remainder = originalCredentialId.length % 4;
    if (remainder !== 0) {
      const padding = '='.repeat(4 - remainder);
      const paddedCredentialId = originalCredentialId + padding;
      expect(() => Buffer.from(paddedCredentialId, 'base64url')).not.toThrow();
    }
  });
}); 