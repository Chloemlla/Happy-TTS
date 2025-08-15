import { Request, Response, NextFunction } from 'express';
import { UserStorage } from '../utils/userStorage';
import { config } from '../config/config';
import jwt from 'jsonwebtoken';

// 可选认证中间件：
// - 若携带合法JWT，则解析并注入 req.user
// - 若未携带或解析失败，则不报错，继续作为游客
export const optionalAuthenticateToken = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }
    const token = authHeader.split(' ')[1];
    if (!token) {
      return next();
    }
    let userId: string | undefined;
    try {
      const decoded: any = jwt.verify(token, config.jwtSecret);
      userId = decoded.userId;
    } catch {
      // Token 无效则忽略，继续匿名
      return next();
    }
    if (!userId) return next();
    const user = await UserStorage.getUserById(userId);
    if (!user) return next();
    // @ts-ignore
    req.user = user;
    return next();
  } catch {
    // 任何异常都不阻断请求
    return next();
  }
};
