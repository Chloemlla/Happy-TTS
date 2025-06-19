import { Request, Response, NextFunction } from 'express';
import validator from 'validator';
import { sanitize } from 'dompurify';
import { JSDOM } from 'jsdom';

const window = new JSDOM('').window;
const DOMPurify = require('dompurify')(window);

interface ValidationError {
    field: string;
    message: string;
}

export class InputValidationError extends Error {
    errors: ValidationError[];
    
    constructor(errors: ValidationError[]) {
        super('Input validation failed');
        this.errors = errors;
        this.name = 'InputValidationError';
    }
}

// 密码强度检查
const checkPasswordStrength = (password: string, username: string): ValidationError[] => {
    const errors: ValidationError[] = [];

    if (password.length < 8) {
        errors.push({ field: 'password', message: '密码长度至少需要8个字符' });
    }

    if (!/\d/.test(password)) {
        errors.push({ field: 'password', message: '密码需要包含数字' });
    }

    if (!/[a-z]/.test(password)) {
        errors.push({ field: 'password', message: '密码需要包含小写字母' });
    }

    if (!/[A-Z]/.test(password)) {
        errors.push({ field: 'password', message: '密码需要包含大写字母' });
    }

    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
        errors.push({ field: 'password', message: '密码需要包含特殊字符' });
    }

    // 检查常见密码模式
    const commonPatterns = [
        /^123/, /password/i, /qwerty/i, /abc/i,
        new RegExp(username, 'i')
    ];

    if (commonPatterns.some(pattern => pattern.test(password))) {
        errors.push({ field: 'password', message: '密码不能使用常见密码模式或包含用户名' });
    }

    return errors;
};

// 用户名验证
const validateUsername = (username: string): ValidationError[] => {
    const errors: ValidationError[] = [];

    if (!validator.isLength(username, { min: 3, max: 20 })) {
        errors.push({ field: 'username', message: '用户名长度必须在3-20个字符之间' });
    }

    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        errors.push({ field: 'username', message: '用户名只能包含字母、数字和下划线' });
    }

    // 检查SQL注入相关字符
    if (/['";]/.test(username)) {
        errors.push({ field: 'username', message: '用户名包含非法字符' });
    }

    return errors;
};

// 邮箱验证
const validateEmail = (email: string): ValidationError[] => {
    const errors: ValidationError[] = [];

    if (!validator.isEmail(email)) {
        errors.push({ field: 'email', message: '请输入有效的邮箱地址' });
    }

    return errors;
};

// 输入净化
const sanitizeInput = (input: string): string => {
    return DOMPurify.sanitize(validator.trim(input));
};

// 验证中间件
export const validateAuthInput = (req: Request, res: Response, next: NextFunction) => {
    try {
        const errors: ValidationError[] = [];
        const { username, email, password } = req.body;

        // 净化输入
        const sanitizedUsername = sanitizeInput(username);
        const sanitizedEmail = email ? sanitizeInput(email) : '';
        
        // 验证用户名
        errors.push(...validateUsername(sanitizedUsername));

        // 注册时验证邮箱
        if (req.path.includes('register') && email) {
            errors.push(...validateEmail(sanitizedEmail));
        }

        // 验证密码强度
        errors.push(...checkPasswordStrength(password, sanitizedUsername));

        if (errors.length > 0) {
            throw new InputValidationError(errors);
        }

        // 将净化后的值存回请求体
        req.body.username = sanitizedUsername;
        if (email) {
            req.body.email = sanitizedEmail;
        }

        next();
    } catch (error) {
        if (error instanceof InputValidationError) {
            res.status(400).json({
                status: 'error',
                message: '输入验证失败',
                errors: error.errors
            });
        } else {
            next(error);
        }
    }
}; 