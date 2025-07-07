describe('简单credentialID base64url解码', () => {
  it('应能正确处理base64url和base64解码', () => {
    const credentialId = 'OqI3Ywc2XtE2QzorLtzT0Q';
    const remainder = credentialId.length % 4;
    if (remainder !== 0) {
      const padding = '='.repeat(4 - remainder);
      const paddedId = credentialId + padding;
      expect(() => Buffer.from(paddedId, 'base64url')).not.toThrow();
    }
    expect(() => Buffer.from(credentialId, 'base64url')).not.toThrow();
    expect(() => Buffer.from(credentialId, 'base64')).not.toThrow();
  });
}); 