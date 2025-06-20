import { Request, Response, NextFunction } from 'express';
import { isAdminToken } from '../controllers/authController';

export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (isAdminToken(token)) {
        next();
    } else {
        res.status(403).json({ error: '无权限' });
    }
}; 