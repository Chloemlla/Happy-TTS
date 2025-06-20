import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const USERS_FILE = path.join(process.cwd(), 'data/users.json');

// Define a User type for type safety
interface User {
  id: string;
  username: string;
  email: string;
  password?: string; // Password might not always be present
  role: 'user' | 'admin';
  createdAt: string;
  dailyUsage: number;
  lastUsageDate: string;
  token?: string;
  tokenExpiresAt?: string;
}

function readUsers(): User[] {
    if (!fs.existsSync(USERS_FILE)) return [];
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
}
function writeUsers(users: User[]) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

export const adminController = {
    getUsers: (req: Request, res: Response) => {
        const users = readUsers().map(user => {
            const { password, ...userWithoutPassword } = user;
            return userWithoutPassword;
        });
        res.json(users);
    },
    createUser: (req: Request, res: Response) => {
        const users = readUsers();
        const { username, email, password, role } = req.body;
        if (!username || !email || !password) return res.status(400).json({ error: '参数不全' });
        if (users.find((u: User) => u.username === username)) return res.status(400).json({ error: '用户名已存在' });
        const user: User = { id: uuidv4(), username, email, password, role, createdAt: new Date().toISOString(), dailyUsage: 0, lastUsageDate: new Date().toISOString() };
        users.push(user);
        writeUsers(users);
        const { password: _, ...newUser } = user;
        res.status(201).json(newUser);
    },
    updateUser: (req: Request, res: Response) => {
        const users = readUsers();
        const idx = users.findIndex((u: User) => u.id === req.params.id);
        if (idx === -1) return res.status(404).json({ error: '用户不存在' });
        const { username, email, password, role } = req.body;
        
        // 保留现有密码（如果请求中没有提供新密码）
        const newPassword = password || users[idx].password;

        if (!username || !email || !role) return res.status(400).json({ error: '参数不全' });
        
        users[idx] = { ...users[idx], username, email, password: newPassword, role };
        writeUsers(users);
        const { password: _, ...updatedUser } = users[idx];
        res.json(updatedUser);
    },
    deleteUser: (req: Request, res: Response) => {
        let users = readUsers();
        const userToDelete = users.find((u: User) => u.id === req.params.id);
        if (!userToDelete) return res.status(404).json({ error: '用户不存在' });
        
        users = users.filter((u: User) => u.id !== req.params.id);
        writeUsers(users);
        
        const { password, ...deletedUser } = userToDelete;
        res.json(deletedUser);
    }
}; 