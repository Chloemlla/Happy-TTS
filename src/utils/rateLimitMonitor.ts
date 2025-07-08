import { Request, Response } from 'express';
import logger from './logger';

interface RateLimitStats {
    route: string;
    ip: string;
    timestamp: number;
    userAgent?: string;
    method: string;
    path: string;
}

class RateLimitMonitor {
    private static instance: RateLimitMonitor;
    private stats: RateLimitStats[] = [];
    private readonly MAX_STATS = 1000; // 最多保存1000条记录

    private constructor() {}

    public static getInstance(): RateLimitMonitor {
        if (!RateLimitMonitor.instance) {
            RateLimitMonitor.instance = new RateLimitMonitor();
        }
        return RateLimitMonitor.instance;
    }

    // 记录被限制的请求
    public recordRateLimited(req: Request, routeName: string): void {
        const stat: RateLimitStats = {
            route: routeName,
            ip: req.ip || req.socket.remoteAddress || 'unknown',
            timestamp: Date.now(),
            userAgent: req.headers['user-agent'],
            method: req.method,
            path: req.path
        };

        this.stats.push(stat);

        // 保持数组大小
        if (this.stats.length > this.MAX_STATS) {
            this.stats = this.stats.slice(-this.MAX_STATS);
        }

        // 记录日志
        logger.warn('请求被速率限制', {
            route: routeName,
            ip: stat.ip,
            method: stat.method,
            path: stat.path,
            userAgent: stat.userAgent
        });
    }

    // 获取统计信息
    public getStats(): {
        total: number;
        byRoute: Record<string, number>;
        byIP: Record<string, number>;
        recent: RateLimitStats[];
    } {
        const now = Date.now();
        const oneHourAgo = now - 60 * 60 * 1000;
        const recent = this.stats.filter(stat => stat.timestamp > oneHourAgo);

        const byRoute: Record<string, number> = {};
        const byIP: Record<string, number> = {};

        this.stats.forEach(stat => {
            byRoute[stat.route] = (byRoute[stat.route] || 0) + 1;
            byIP[stat.ip] = (byIP[stat.ip] || 0) + 1;
        });

        return {
            total: this.stats.length,
            byRoute,
            byIP,
            recent
        };
    }

    // 清理旧数据
    public cleanup(): void {
        const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
        this.stats = this.stats.filter(stat => stat.timestamp > oneDayAgo);
    }

    // 获取可疑IP列表
    public getSuspiciousIPs(threshold: number = 10): Array<{ ip: string; count: number }> {
        const stats = this.getStats();
        return Object.entries(stats.byIP)
            .filter(([_, count]) => count >= threshold)
            .map(([ip, count]) => ({ ip, count }))
            .sort((a, b) => b.count - a.count);
    }

    // 获取最活跃的路由
    public getMostActiveRoutes(limit: number = 10): Array<{ route: string; count: number }> {
        const stats = this.getStats();
        return Object.entries(stats.byRoute)
            .map(([route, count]) => ({ route, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, limit);
    }
}

// 中间件：记录被限制的请求
export const rateLimitMonitorMiddleware = (routeName: string) => {
    return (req: Request, res: Response, next: Function) => {
        const monitor = RateLimitMonitor.getInstance();
        
        // 监听429状态码
        const originalStatus = res.status;
        res.status = function(code: number) {
            if (code === 429) {
                monitor.recordRateLimited(req, routeName);
            }
            return originalStatus.call(this, code);
        };
        
        next();
    };
};

// 获取监控实例
export const getRateLimitMonitor = () => RateLimitMonitor.getInstance();

// 定期清理旧数据
setInterval(() => {
    RateLimitMonitor.getInstance().cleanup();
}, 60 * 60 * 1000); // 每小时清理一次

export default RateLimitMonitor; 