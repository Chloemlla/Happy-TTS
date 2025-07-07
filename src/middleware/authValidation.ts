import { Request, Response, NextFunction } from 'express';
import { UserStorage, InputValidationError } from '../utils/userStorage';

export const validateAuthInput = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { identifier, username, email = '', password = '' } = req.body;
        const isRegistration = req.path.includes('register');

        // 登录时使用 identifier, 注册时使用 username
        const identityField = isRegistration ? username : identifier;
        
        // 确保身份字段存在
        if (!identityField) {
            const field = isRegistration ? 'username' : 'identifier';
            throw new InputValidationError([{ field, message: `${field} 不能为空` }]);
        }

        // 使用 UserStorage 的验证方法
        const errors = UserStorage.validateUserInput(identityField, password, email, isRegistration);

        if (errors.length > 0) {
            throw new InputValidationError(errors);
        }

        // 将净化后的值存回请求体
        req.body.sanitizedIdentifier = UserStorage['sanitizeInput'](identityField);
        if (isRegistration) {
            req.body.sanitizedEmail = UserStorage['sanitizeInput'](email);
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