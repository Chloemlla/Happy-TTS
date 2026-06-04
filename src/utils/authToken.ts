import jwt, { type SignOptions } from "jsonwebtoken";
import { config } from "../config/config";

export interface LoginTokenUser {
  id: string;
  username: string;
  role?: string;
}

export function signLoginToken(user: LoginTokenUser): string {
  return jwt.sign(
    {
      userId: user.id,
      username: user.username,
      role: user.role || "user",
    },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn as SignOptions["expiresIn"] },
  );
}
