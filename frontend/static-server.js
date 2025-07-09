const express = require('express');
const path = require('path');
const rateLimit = require('express-rate-limit');
const app = express();
const port = 3001;

// 创建速率限制器
const staticFileLimiter = rateLimit({
  windowMs: 60 * 1000, // 1分钟
  max: 200, // 每分钟最多200次静态文件请求
  message: { error: '请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip || (req.socket?.remoteAddress) || 'unknown'
});

const spaRouteLimiter = rateLimit({
  windowMs: 60 * 1000, // 1分钟
  max: 100, // 每分钟最多100次SPA路由请求
  message: { error: '请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip || (req.socket?.remoteAddress) || 'unknown'
});

// 静态文件服务（应用速率限制）
app.use(staticFileLimiter, express.static(path.join(__dirname, 'dist')));

// SPA路由处理 - 所有路由都返回index.html（应用速率限制）
app.get('*', spaRouteLimiter, (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`静态服务器运行在 http://localhost:${port}`);
  console.log('SPA路由已启用，所有路由都会重定向到index.html');
  console.log('速率限制已启用：静态文件200次/分钟，SPA路由100次/分钟');
}); 