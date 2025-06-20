import { Request, Response, NextFunction } from 'express';
import { UserStorage, InputValidationError } from '../utils/userStorage';

export const validateAuthInput = (req: Request, res: Response, next: NextFunction) => {
    try {
        const { username = '', email = '', password = '' } = req.body;
        const isRegistration = req.path.includes('register');

        // 使用 UserStorage 的验证方法
        const errors = UserStorage.validateUserInput(username, password, email, isRegistration);

        if (errors.length > 0) {
            throw new InputValidationError(errors);
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