import { logger } from './logger';

interface ExemptionResult {
  exempted: boolean;
  message: string;
  isInternal: boolean;
  isExempted: boolean;
  domain: string;
}

interface RecipientWhitelistResult {
  whitelisted: boolean;
  message: string;
  domain: string;
  isWhitelisted: boolean;
}

class DomainExemptionService {
  private exemptedDomains: string[];
  private internalDomains: string[];
  private recipientWhitelistDomains: string[];

  constructor() {
    // 从环境变量获取豁免域名列表
    this.exemptedDomains = process.env.EXEMPTED_DOMAINS ? 
      process.env.EXEMPTED_DOMAINS.split(',').map(d => d.trim()) : 
      ['arteam.dev', 'hapxs.com', 'crossbell.io'];

    // 从环境变量获取内部域名列表
    this.internalDomains = process.env.INTERNAL_DOMAINS ? 
      process.env.INTERNAL_DOMAINS.split(',').map(d => d.trim()) : 
      ['arteam.dev'];

    // 从环境变量获取收件人白名单域名列表
    this.recipientWhitelistDomains = process.env.RECIPIENT_WHITELIST_DOMAINS ? 
      process.env.RECIPIENT_WHITELIST_DOMAINS.split(',').map(d => d.trim()) : 
      ['gmail.com', 'outlook.com', 'yahoo.com', 'qq.com', '163.com', '126.com'];

    logger.log(`[DomainExemption] 初始化完成，豁免域名: ${this.exemptedDomains.join(', ')}`);
    logger.log(`[DomainExemption] 内部域名: ${this.internalDomains.join(', ')}`);
    logger.log(`[DomainExemption] 收件人白名单域名: ${this.recipientWhitelistDomains.join(', ')}`);
  }

  /**
   * 检查域名是否匹配（支持通配符）
   */
  private isDomainMatch(domain: string, pattern: string): boolean {
    if (pattern.startsWith('*.')) {
      const wildcardDomain = pattern.substring(2);
      return domain === wildcardDomain || domain.endsWith('.' + wildcardDomain);
    }
    return domain === pattern;
  }

  /**
   * 检查域名豁免状态
   */
  checkDomainExemption(domain: string): ExemptionResult {
    if (!domain) {
      return {
        exempted: false,
        message: '域名不能为空',
        isInternal: false,
        isExempted: false,
        domain: ''
      };
    }

    // 检查是否在豁免列表中
    const isExempted = this.exemptedDomains.some(exemptedDomain => 
      this.isDomainMatch(domain, exemptedDomain)
    );

    // 检查是否在内部域名列表中
    const isInternal = this.internalDomains.some(internalDomain => 
      this.isDomainMatch(domain, internalDomain)
    );

    let message = '';
    if (isExempted) {
      message = '域名在豁免列表中，无需额外检查';
    } else if (isInternal) {
      message = '内部域名，已通过安全检查';
    } else {
      message = '外部域名，需要额外的安全检查';
    }

    const result: ExemptionResult = {
      exempted: isExempted || isInternal,
      message,
      isInternal,
      isExempted,
      domain
    };

    logger.log(`[DomainExemption] 检查域名 ${domain}: ${JSON.stringify(result)}`);
    return result;
  }

  /**
   * 检查收件人域名白名单状态
   */
  checkRecipientWhitelist(domain: string): RecipientWhitelistResult {
    if (!domain) {
      return {
        whitelisted: false,
        message: '域名不能为空',
        domain: '',
        isWhitelisted: false
      };
    }

    // 检查是否在白名单列表中
    const isWhitelisted = this.recipientWhitelistDomains.some(whitelistDomain => 
      this.isDomainMatch(domain, whitelistDomain)
    );

    let message = '';
    if (isWhitelisted) {
      message = '域名在白名单中，无需额外检查';
    } else {
      message = '域名不在白名单中，需要额外的安全检查';
    }

    const result: RecipientWhitelistResult = {
      whitelisted: isWhitelisted,
      message,
      domain,
      isWhitelisted
    };

    logger.log(`[DomainExemption] 检查收件人域名白名单 ${domain}: ${JSON.stringify(result)}`);
    return result;
  }

  /**
   * 获取所有豁免域名
   */
  getExemptedDomains(): string[] {
    return [...this.exemptedDomains];
  }

  /**
   * 获取所有内部域名
   */
  getInternalDomains(): string[] {
    return [...this.internalDomains];
  }

  /**
   * 获取所有收件人白名单域名
   */
  getRecipientWhitelistDomains(): string[] {
    return [...this.recipientWhitelistDomains];
  }

  /**
   * 添加豁免域名
   */
  addExemptedDomain(domain: string): boolean {
    if (!this.exemptedDomains.includes(domain)) {
      this.exemptedDomains.push(domain);
      logger.log(`[DomainExemption] 添加豁免域名: ${domain}`);
      return true;
    }
    return false;
  }

  /**
   * 移除豁免域名
   */
  removeExemptedDomain(domain: string): boolean {
    const index = this.exemptedDomains.indexOf(domain);
    if (index > -1) {
      this.exemptedDomains.splice(index, 1);
      logger.log(`[DomainExemption] 移除豁免域名: ${domain}`);
      return true;
    }
    return false;
  }

  /**
   * 添加收件人白名单域名
   */
  addRecipientWhitelistDomain(domain: string): boolean {
    if (!this.recipientWhitelistDomains.includes(domain)) {
      this.recipientWhitelistDomains.push(domain);
      logger.log(`[DomainExemption] 添加收件人白名单域名: ${domain}`);
      return true;
    }
    return false;
  }

  /**
   * 移除收件人白名单域名
   */
  removeRecipientWhitelistDomain(domain: string): boolean {
    const index = this.recipientWhitelistDomains.indexOf(domain);
    if (index > -1) {
      this.recipientWhitelistDomains.splice(index, 1);
      logger.log(`[DomainExemption] 移除收件人白名单域名: ${domain}`);
      return true;
    }
    return false;
  }
}

export const domainExemptionService = new DomainExemptionService(); 