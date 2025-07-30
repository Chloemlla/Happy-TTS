import { domainExemptionService } from '../services/domainExemptionService';

describe('DomainExemptionService', () => {
  beforeEach(() => {
    // 重置环境变量
    delete process.env.EXEMPTED_DOMAINS;
    delete process.env.INTERNAL_DOMAINS;
  });

  describe('checkDomainExemption', () => {
    it('应该正确识别豁免域名', () => {
      const result = domainExemptionService.checkDomainExemption('arteam.dev');
      expect(result.exempted).toBe(true);
      expect(result.isExempted).toBe(true);
      expect(result.isInternal).toBe(true);
      expect(result.message).toContain('豁免列表中');
    });

    it('应该正确识别hapxs.com域名', () => {
      const result = domainExemptionService.checkDomainExemption('hapxs.com');
      expect(result.exempted).toBe(true);
      expect(result.isExempted).toBe(true);
      expect(result.isInternal).toBe(false);
    });

    it('应该正确识别外部域名', () => {
      const result = domainExemptionService.checkDomainExemption('example.com');
      expect(result.exempted).toBe(false);
      expect(result.isExempted).toBe(false);
      expect(result.isInternal).toBe(false);
      expect(result.message).toContain('需要额外的安全检查');
    });

    it('应该处理空域名', () => {
      const result = domainExemptionService.checkDomainExemption('');
      expect(result.exempted).toBe(false);
      expect(result.message).toBe('域名不能为空');
    });

    it('应该支持通配符域名', () => {
      // 设置环境变量测试通配符
      process.env.EXEMPTED_DOMAINS = '*.test.com,example.org';
      
      const result1 = domainExemptionService.checkDomainExemption('sub.test.com');
      expect(result1.exempted).toBe(true);
      
      const result2 = domainExemptionService.checkDomainExemption('test.com');
      expect(result2.exempted).toBe(true);
      
      const result3 = domainExemptionService.checkDomainExemption('other.com');
      expect(result3.exempted).toBe(false);
    });
  });

  describe('getExemptedDomains', () => {
    it('应该返回豁免域名列表', () => {
      const domains = domainExemptionService.getExemptedDomains();
      expect(domains).toContain('arteam.dev');
      expect(domains).toContain('hapxs.com');
      expect(domains).toContain('crossbell.io');
    });
  });

  describe('getInternalDomains', () => {
    it('应该返回内部域名列表', () => {
      const domains = domainExemptionService.getInternalDomains();
      expect(domains).toContain('arteam.dev');
    });
  });

  describe('addExemptedDomain', () => {
    it('应该添加新的豁免域名', () => {
      const result = domainExemptionService.addExemptedDomain('newdomain.com');
      expect(result).toBe(true);
      
      const domains = domainExemptionService.getExemptedDomains();
      expect(domains).toContain('newdomain.com');
    });

    it('不应该重复添加已存在的域名', () => {
      const result = domainExemptionService.addExemptedDomain('arteam.dev');
      expect(result).toBe(false);
    });
  });

  describe('removeExemptedDomain', () => {
    it('应该移除豁免域名', () => {
      // 先添加一个域名
      domainExemptionService.addExemptedDomain('tempdomain.com');
      
      const result = domainExemptionService.removeExemptedDomain('tempdomain.com');
      expect(result).toBe(true);
      
      const domains = domainExemptionService.getExemptedDomains();
      expect(domains).not.toContain('tempdomain.com');
    });

    it('移除不存在的域名应该返回false', () => {
      const result = domainExemptionService.removeExemptedDomain('nonexistent.com');
      expect(result).toBe(false);
    });
  });
}); 