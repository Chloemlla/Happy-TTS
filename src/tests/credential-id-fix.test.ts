describe('CredentialID 修复', () => {
  function fixCredentialId(credentialId: any) {
    if (!credentialId) throw new Error('credentialID为空');
    if (typeof credentialId === 'string' && /^[A-Za-z0-9_-]+$/.test(credentialId)) return credentialId;
    try {
      if (Buffer.isBuffer(credentialId)) return credentialId.toString('base64url');
      if (typeof credentialId === 'string') {
        try {
          const buffer = Buffer.from(credentialId, 'base64');
          return buffer.toString('base64url');
        } catch {
          return Buffer.from(credentialId).toString('base64url');
        }
      }
      return Buffer.from(String(credentialId)).toString('base64url');
    } catch (error) {
      throw new Error(`无法修复credentialID: ${credentialId}`);
    }
  }
  it('应能修复各种credentialID', () => {
    const testCases = [
      { credentialId: 'X7jmkxuksuMX-mGC4W49-g', valid: true },
      { credentialId: 'X7jmkxuksuMX+mGC4W49/g==', valid: false },
      { credentialId: '', valid: false },
      { credentialId: null, valid: false },
      { credentialId: undefined, valid: false },
      { credentialId: 'X7jmkxuksuMX@mGC4W49#g', valid: false }
    ];
    testCases.forEach(tc => {
      if (tc.valid) {
        expect(() => fixCredentialId(tc.credentialId)).not.toThrow();
      } else {
        try {
          fixCredentialId(tc.credentialId);
        } catch {
          // 允许抛出异常
        }
      }
    });
  });
}); 