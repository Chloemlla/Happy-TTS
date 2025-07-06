const { execSync } = require('child_process');

console.log('正在安装 form-data 依赖...');

try {
    execSync('npm install form-data @types/form-data', { stdio: 'inherit' });
    console.log('form-data 依赖安装成功！');
} catch (error) {
    console.error('安装失败:', error.message);
    process.exit(1);
} 