const express = require('express');
const path = require('path');
const app = express();
const port = 3001;

// 静态文件服务
app.use(express.static(path.join(__dirname, 'dist')));

// SPA路由处理 - 所有路由都返回index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`静态服务器运行在 http://localhost:${port}`);
  console.log('SPA路由已启用，所有路由都会重定向到index.html');
}); 