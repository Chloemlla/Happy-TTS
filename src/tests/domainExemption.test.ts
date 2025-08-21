import { domainExemptionService } from '../services/domainExemptionService';

describe('DomainExemptionService', () => {
  describe('checkDomainExemption', () => {
    it('应该正确检查豁免域名', () => {
      const result = domainExemptionService.checkDomainExemption('hapxs.com');
      expect(result.exempted).toBe(true);
      expect(result.isExempted).toBe(true);
      expect(result.message).toContain('豁免列表中');
    });

    it('应该正确检查内部域名', () => {
      const result = domainExemptionService.checkDomainExemption('arteam.dev');
      expect(result.exempted).toBe(true);
      expect(result.isInternal).toBe(true);
      expect(result.message).toContain('豁免列表中');
    });

    it('应该正确检查外部域名', () => {
      const result = domainExemptionService.checkDomainExemption('example.com');
      expect(result.exempted).toBe(false);
      expect(result.message).toContain('需要额外的安全检查');
    });

    it('应该处理空域名', () => {
      const result = domainExemptionService.checkDomainExemption('');
      expect(result.exempted).toBe(false);
      expect(result.message).toBe('域名不能为空');
    });
  });

  describe('checkRecipientWhitelist', () => {
    it('应该正确检查白名单域名', () => {
      const result = domainExemptionService.checkRecipientWhitelist('gmail.com');
      expect(result.whitelisted).toBe(true);
      expect(result.isWhitelisted).toBe(true);
      expect(result.message).toContain('白名单中');
    });

    it('应该正确检查非白名单域名', () => {
      const result = domainExemptionService.checkRecipientWhitelist('unknown.com');
      expect(result.whitelisted).toBe(false);
      expect(result.message).toContain('需要额外的安全检查');
    });

    it('应该处理空域名', () => {
      const result = domainExemptionService.checkRecipientWhitelist('');
      expect(result.whitelisted).toBe(false);
      expect(result.message).toBe('域名不能为空');
    });
  });

  describe('域名管理功能', () => {
    it('应该能够添加和移除豁免域名', () => {
      const testDomain = 'test-exemption.com';
      
      // 初始状态应该不在豁免列表中
      let result = domainExemptionService.checkDomainExemption(testDomain);
      expect(result.exempted).toBe(false);

      // 添加豁免域名
      const added = domainExemptionService.addExemptedDomain(testDomain);
      expect(added).toBe(true);

      // 检查是否已豁免
      result = domainExemptionService.checkDomainExemption(testDomain);
      expect(result.exempted).toBe(true);

      // 移除豁免域名
      const removed = domainExemptionService.removeExemptedDomain(testDomain);
      expect(removed).toBe(true);

      // 检查是否不再豁免
      result = domainExemptionService.checkDomainExemption(testDomain);
      expect(result.exempted).toBe(false);
    });

    it('应该能够添加和移除收件人白名单域名', () => {
      const testDomain = 'test-whitelist.com';
      
      // 初始状态应该不在白名单中
      let result = domainExemptionService.checkRecipientWhitelist(testDomain);
      expect(result.whitelisted).toBe(false);

      // 添加白名单域名
      const added = domainExemptionService.addRecipientWhitelistDomain(testDomain);
      expect(added).toBe(true);

      // 检查是否已在白名单中
      result = domainExemptionService.checkRecipientWhitelist(testDomain);
      expect(result.whitelisted).toBe(true);

      // 移除白名单域名
      const removed = domainExemptionService.removeRecipientWhitelistDomain(testDomain);
      expect(removed).toBe(true);

      // 检查是否不再在白名单中
      result = domainExemptionService.checkRecipientWhitelist(testDomain);
      expect(result.whitelisted).toBe(false);
    });
  });
}); 