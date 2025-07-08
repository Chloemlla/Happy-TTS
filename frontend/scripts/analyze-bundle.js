const fs = require('fs');
const path = require('path');

// 分析构建产物
function analyzeBundle() {
  const distPath = path.join(__dirname, '../dist');
  
  if (!fs.existsSync(distPath)) {
    console.log('❌ dist目录不存在，请先运行 npm run build');
    return;
  }

  console.log('📊 构建产物分析报告\n');

  // 分析文件大小
  const files = getAllFiles(distPath);
  const fileSizes = files.map(file => {
    const stats = fs.statSync(file);
    const relativePath = path.relative(distPath, file);
    return {
      path: relativePath,
      size: stats.size,
      sizeKB: (stats.size / 1024).toFixed(2),
      sizeMB: (stats.size / (1024 * 1024)).toFixed(2)
    };
  });

  // 按大小排序
  fileSizes.sort((a, b) => b.size - a.size);

  console.log('📁 文件大小分析:');
  console.log('─'.repeat(80));
  
  let totalSize = 0;
  fileSizes.forEach(file => {
    totalSize += file.size;
    const sizeStr = file.size > 1024 * 1024 ? `${file.sizeMB}MB` : `${file.sizeKB}KB`;
    console.log(`${file.path.padEnd(50)} ${sizeStr.padStart(10)}`);
  });

  console.log('─'.repeat(80));
  const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(2);
  console.log(`总大小: ${totalSizeMB}MB`);

  // 分析JavaScript文件
  const jsFiles = fileSizes.filter(f => f.path.endsWith('.js'));
  const jsTotalSize = jsFiles.reduce((sum, f) => sum + f.size, 0);
  const jsTotalSizeMB = (jsTotalSize / (1024 * 1024)).toFixed(2);

  console.log(`\n📦 JavaScript文件: ${jsFiles.length}个文件，总大小: ${jsTotalSizeMB}MB`);

  // 分析CSS文件
  const cssFiles = fileSizes.filter(f => f.path.endsWith('.css'));
  const cssTotalSize = cssFiles.reduce((sum, f) => sum + f.size, 0);
  const cssTotalSizeMB = (cssTotalSize / (1024 * 1024)).toFixed(2);

  console.log(`🎨 CSS文件: ${cssFiles.length}个文件，总大小: ${cssTotalSizeMB}MB`);

  // 分析图片文件
  const imageFiles = fileSizes.filter(f => /\.(png|jpg|jpeg|gif|svg|ico|webp)$/i.test(f.path));
  const imageTotalSize = imageFiles.reduce((sum, f) => sum + f.size, 0);
  const imageTotalSizeMB = (imageTotalSize / (1024 * 1024)).toFixed(2);

  console.log(`🖼️  图片文件: ${imageFiles.length}个文件，总大小: ${imageTotalSizeMB}MB`);

  // 优化建议
  console.log('\n💡 优化建议:');
  
  if (totalSize > 30 * 1024 * 1024) { // 30MB
    console.log('⚠️  构建产物超过30MB，建议:');
    console.log('   - 检查是否有不必要的依赖');
    console.log('   - 优化图片资源');
    console.log('   - 进一步拆分代码块');
  }

  const largeFiles = fileSizes.filter(f => f.size > 1024 * 1024); // 1MB以上
  if (largeFiles.length > 0) {
    console.log('\n📈 大文件 (>1MB):');
    largeFiles.forEach(file => {
      console.log(`   - ${file.path}: ${file.sizeMB}MB`);
    });
  }

  // 检查chunk分割
  const chunks = jsFiles.filter(f => f.path.includes('chunk') || f.path.includes('vendor'));
  if (chunks.length > 0) {
    console.log('\n🔧 代码分割分析:');
    chunks.forEach(chunk => {
      console.log(`   - ${chunk.path}: ${chunk.sizeKB}KB`);
    });
  }

  console.log('\n✅ 分析完成！');
}

// 递归获取所有文件
function getAllFiles(dirPath, arrayOfFiles = []) {
  const files = fs.readdirSync(dirPath);

  files.forEach(file => {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
    } else {
      arrayOfFiles.push(fullPath);
    }
  });

  return arrayOfFiles;
}

// 运行分析
if (require.main === module) {
  analyzeBundle();
}

module.exports = { analyzeBundle }; 