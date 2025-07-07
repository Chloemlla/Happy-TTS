describe('credentialID 格式转换', () => {
  it('应能正确转换base64到base64url', () => {
    const testCases = [
      'R5Y1IIH4fPXoikLFsVXlRQ',
      'R5Y1IIH4fPXoikLFsVXlRQ==',
      'R5Y1IIH4fPXoikLFsVXlRQ/',
      'R5Y1IIH4fPXoikLFsVXlRQ',
      'abc123_-xyz',
    ];
    testCases.forEach(id => {
      const fixedId = id.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
      expect(/^[A-Za-z0-9_-]+$/.test(fixedId)).toBe(true);
    });
  });
}); 