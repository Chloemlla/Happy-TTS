# FBI通缉犯数据验证增强方案

## 问题分析

### 1. sanitizeInput 函数不够安全
当前实现（第26-31行）:
```typescript
function sanitizeInput(str: string | undefined | null): string {
    if (typeof str !== 'string' || !str) {
        return '';
    }
    return str.replace(/[<>]/g, '').trim();
}
```

**问题**: 
- 只移除 `<>` 字符，无法防御所有XSS攻击
- 不处理HTML实体编码
- 不限制字符串长度

### 2. 创建通缉犯时的验证不足
```typescript
// 当前验证（第239-243行）
if (!name || !charges.length || reward === undefined) {
    return res.status(400).json({
        success: false,
        message: '姓名、指控和悬赏金额是必填项'
    });
}
```

**问题**:
- reward 只检查 undefined，允许负数、NaN、Infinity
- charges 只检查数组长度，不验证内容
- 缺少其他字段的合理性验证

## 推荐解决方案

### 方案1: 增强验证函数

```typescript
// src/utils/validators.ts (新建文件)
import validator from 'validator';

/**
 * 安全的输入清理函数
 * @param str 输入字符串
 * @param maxLength 最大长度限制
 * @returns 清理后的字符串
 */
export function sanitizeInput(
  str: string | undefined | null, 
  maxLength: number = 500
): string {
  if (typeof str !== 'string' || !str) {
    return '';
  }
  
  // 1. 限制长度
  let cleaned = str.substring(0, maxLength);
  
  // 2. 移除HTML标签
  cleaned = cleaned.replace(/<[^>]*>/g, '');
  
  // 3. 转义特殊字符
  cleaned = validator.escape(cleaned);
  
  // 4. 移除控制字符
  cleaned = cleaned.replace(/[\x00-\x1F\x7F]/g, '');
  
  // 5. trim空白字符
  return cleaned.trim();
}

/**
 * 验证悬赏金额
 */
export function validateReward(reward: any): { valid: boolean; error?: string } {
  if (reward === undefined || reward === null) {
    return { valid: false, error: '悬赏金额不能为空' };
  }
  
  const num = Number(reward);
  
  if (isNaN(num)) {
    return { valid: false, error: '悬赏金额必须是有效数字' };
  }
  
  if (!isFinite(num)) {
    return { valid: false, error: '悬赏金额不能为无穷大' };
  }
  
  if (num < 0) {
    return { valid: false, error: '悬赏金额不能为负数' };
  }
  
  if (num > 999999999) {
    return { valid: false, error: '悬赏金额超出范围（最大9.99亿）' };
  }
  
  return { valid: true };
}

/**
 * 验证年龄
 */
export function validateAge(age: any): { valid: boolean; value?: number; error?: string } {
  if (age === undefined || age === null || age === '') {
    return { valid: true, value: 0 }; // 年龄可选
  }
  
  const num = Number(age);
  
  if (isNaN(num)) {
    return { valid: false, error: '年龄必须是有效数字' };
  }
  
  if (!isFinite(num)) {
    return { valid: false, error: '年龄不能为无穷大' };
  }
  
  if (num < 0) {
    return { valid: false, error: '年龄不能为负数' };
  }
  
  if (num > 150) {
    return { valid: false, error: '年龄不能超过150岁' };
  }
  
  return { valid: true, value: Math.floor(num) };
}

/**
 * 验证指控数组
 */
export function validateCharges(charges: any): { valid: boolean; error?: string } {
  if (!Array.isArray(charges)) {
    return { valid: false, error: '指控必须是数组' };
  }
  
  if (charges.length === 0) {
    return { valid: false, error: '至少需要一条指控' };
  }
  
  if (charges.length > 50) {
    return { valid: false, error: '指控数量不能超过50条' };
  }
  
  // 检查每条指控
  for (const charge of charges) {
    if (typeof charge !== 'string') {
      return { valid: false, error: '每条指控必须是字符串' };
    }
    
    const trimmed = charge.trim();
    if (trimmed.length === 0) {
      return { valid: false, error: '指控内容不能为空' };
    }
    
    if (trimmed.length > 500) {
      return { valid: false, error: '单条指控长度不能超过500字符' };
    }
  }
  
  return { valid: true };
}

/**
 * 验证姓名
 */
export function validateName(name: any): { valid: boolean; error?: string } {
  if (typeof name !== 'string' || !name.trim()) {
    return { valid: false, error: '姓名不能为空' };
  }
  
  const trimmed = name.trim();
  
  if (trimmed.length < 2) {
    return { valid: false, error: '姓名至少需要2个字符' };
  }
  
  if (trimmed.length > 100) {
    return { valid: false, error: '姓名不能超过100个字符' };
  }
  
  // 检查是否包含非法字符
  if (/<|>|script|javascript|onerror|onload/i.test(trimmed)) {
    return { valid: false, error: '姓名包含非法字符' };
  }
  
  return { valid: true };
}

/**
 * 验证危险等级
 */
export function validateDangerLevel(level: any): { valid: boolean; error?: string } {
  const allowedLevels = ['LOW', 'MEDIUM', 'HIGH', 'EXTREME'];
  
  if (typeof level !== 'string' || !allowedLevels.includes(level)) {
    return { valid: false, error: `危险等级必须是: ${allowedLevels.join(', ')}` };
  }
  
  return { valid: true };
}

/**
 * 验证状态
 */
export function validateStatus(status: any): { valid: boolean; error?: string } {
  const allowedStatus = ['ACTIVE', 'CAPTURED', 'DECEASED', 'REMOVED'];
  
  if (typeof status !== 'string' || !allowedStatus.includes(status)) {
    return { valid: false, error: `状态必须是: ${allowedStatus.join(', ')}` };
  }
  
  return { valid: true };
}
```

### 方案2: 在控制器中应用增强验证

```typescript
// src/controllers/fbiWantedController.ts - createWanted 方法改进

import {
  sanitizeInput,
  validateReward,
  validateAge,
  validateCharges,
  validateName,
  validateDangerLevel
} from '../utils/validators';

async createWanted(req: Request, res: Response) {
  try {
    const {
      name,
      aliases = [],
      age,
      charges = [],
      reward,
      dangerLevel = 'MEDIUM',
      // ... 其他字段
    } = req.body;

    // 1. 验证姓名
    const nameValidation = validateName(name);
    if (!nameValidation.valid) {
      return res.status(400).json({
        success: false,
        message: nameValidation.error
      });
    }

    // 2. 验证指控
    const chargesValidation = validateCharges(charges);
    if (!chargesValidation.valid) {
      return res.status(400).json({
        success: false,
        message: chargesValidation.error
      });
    }

    // 3. 验证悬赏金额
    const rewardValidation = validateReward(reward);
    if (!rewardValidation.valid) {
      return res.status(400).json({
        success: false,
        message: rewardValidation.error
      });
    }

    // 4. 验证年龄
    const ageValidation = validateAge(age);
    if (!ageValidation.valid) {
      return res.status(400).json({
        success: false,
        message: ageValidation.error
      });
    }

    // 5. 验证危险等级
    const dangerValidation = validateDangerLevel(dangerLevel);
    if (!dangerValidation.valid) {
      return res.status(400).json({
        success: false,
        message: dangerValidation.error
      });
    }

    // 6. 清理和构建数据
    const newWanted = new FBIWantedModel({
      fbiNumber: generateFBINumber(),
      ncicNumber: generateNCICNumber(),
      name: sanitizeInput(name, 100),
      aliases: aliases
        .filter((alias: any) => typeof alias === 'string' && alias.trim())
        .map((alias: string) => sanitizeInput(alias, 100))
        .slice(0, 20), // 最多20个别名
      age: ageValidation.value || 0,
      charges: charges.map((charge: string) => sanitizeInput(charge, 500)),
      reward: Number(reward),
      dangerLevel,
      // ... 其他字段
    });

    const savedWanted = await newWanted.save();
    
    logger.info(`创建新的通缉犯记录: ${savedWanted.name} (FBI: ${savedWanted.fbiNumber})`);
    
    res.status(201).json({
      success: true,
      message: '通缉犯记录创建成功',
      data: savedWanted
    });
  } catch (error) {
    logger.error('创建通缉犯记录失败:', error);
    res.status(500).json({
      success: false,
      message: '创建通缉犯记录失败'
    });
  }
}
```

## 需要安装的依赖
```bash
npm install validator
npm install --save-dev @types/validator
```

## 测试用例建议

```typescript
// tests/validators.test.ts
describe('FBI Wanted Validators', () => {
  describe('validateReward', () => {
    it('should reject negative rewards', () => {
      const result = validateReward(-100);
      expect(result.valid).toBe(false);
    });

    it('should reject NaN', () => {
      const result = validateReward('invalid');
      expect(result.valid).toBe(false);
    });

    it('should accept valid reward', () => {
      const result = validateReward(50000);
      expect(result.valid).toBe(true);
    });
  });

  describe('validateCharges', () => {
    it('should reject empty charges array', () => {
      const result = validateCharges([]);
      expect(result.valid).toBe(false);
    });

    it('should reject non-array', () => {
      const result = validateCharges('not an array');
      expect(result.valid).toBe(false);
    });

    it('should accept valid charges', () => {
      const result = validateCharges(['Murder', 'Robbery']);
      expect(result.valid).toBe(true);
    });
  });
});
```

## 优势
1. **安全性提升**: 全面的XSS防护和输入验证
2. **可维护性**: 验证逻辑集中管理，易于修改和测试
3. **可复用性**: 验证函数可在其他模块复用
4. **错误提示**: 详细的错误消息帮助用户理解问题
5. **性能优化**: 早期验证失败快速返回
