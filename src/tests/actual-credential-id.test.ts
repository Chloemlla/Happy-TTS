describe('实际credentialID格式', () => {
  it('应能正确识别base64url和base64格式', () => {
    const actualCredentialId = 'OqI3Ywc2XtE2QzorLtzT0Q';
    expect(/^[A-Za-z0-9_-]+$/.test(actualCredentialId)).toBe(true);
    expect(() => Buffer.from(actualCredentialId, 'base64url')).not.toThrow();
    expect(() => Buffer.from(actualCredentialId, 'base64')).not.toThrow();
  });
}); 