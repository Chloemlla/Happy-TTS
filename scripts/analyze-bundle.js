#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * 摇树优化分析工具
 * 分析前后端bundle大小和优化效果
 */

class BundleAnalyzer {
  constructor() {
    this.projectRoot = path.resolve(__dirname, '..');
    this.frontendDist = path.join(this.projectRoot, 'frontend', 'dist');
    this.backendDist = path.join(this.projectRoot, 'dist');
  }

  /**
   * 获取文件大小（KB）
   */
  getFileSize(filePath) {
    try {
      const stats = fs.statSync(filePath);
      return Math.round(stats.size / 1024);
    } catch (error) {
      return 0;
    }
  }

  /**
   * 分析目录中的文件大小
   */
  analyzeDirectory(dirPath, fileExtensions = ['.js', '.css']) {
    if (!fs.existsSync(dirPath)) {
      console.log(`目录不存在: ${dirPath}`);
      return [];
    }

    const files = [];
    const items = fs.readdirSync(dirPath);

    for (const item of items) {
      const itemPath = path.join(dirPath, item);
      const stat = fs.statSync(itemPath);

      if (stat.isDirectory()) {
        files.push(...this.analyzeDirectory(itemPath, fileExtensions));
      } else if (fileExtensions.some(ext => item.endsWith(ext))) {
        const size = this.getFileSize(itemPath);
        files.push({
          name: item,
          path: itemPath,
          size,
          relativePath: path.relative(this.projectRoot, itemPath)
        });
      }
    }

    return files;
  }

  /**
   * 分析前端bundle
   */
  analyzeFrontend() {
    console.log('\n📊 前端 Bundle 分析');
    console.log('='.repeat(50));

    const files = this.analyzeDirectory(this.frontendDist);
    
    if (files.length === 0) {
      console.log('❌ 前端构建文件不存在，请先运行 npm run build:frontend');
      return;
    }

    let totalSize = 0;
    const categories = {
      'React核心': [],
      '路由': [],
      'UI组件': [],
      '工具库': [],
      '认证': [],
      '动画': [],
      '代码高亮': [],
      '其他': []
    };

    files.forEach(file => {
      totalSize += file.size;
      
      if (file.name.includes('react-vendor')) {
        categories['React核心'].push(file);
      } else if (file.name.includes('router')) {
        categories['路由'].push(file);
      } else if (file.name.includes('ui')) {
        categories['UI组件'].push(file);
      } else if (file.name.includes('utils')) {
        categories['工具库'].push(file);
      } else if (file.name.includes('auth')) {
        categories['认证'].push(file);
      } else if (file.name.includes('animations')) {
        categories['动画'].push(file);
      } else if (file.name.includes('code-highlight')) {
        categories['代码高亮'].push(file);
      } else {
        categories['其他'].push(file);
      }
    });

    // 按类别显示
    Object.entries(categories).forEach(([category, categoryFiles]) => {
      if (categoryFiles.length > 0) {
        console.log(`\n${category}:`);
        categoryFiles.forEach(file => {
          console.log(`  ${file.name}: ${file.size}KB`);
        });
      }
    });

    console.log(`\n📦 总大小: ${totalSize}KB (${(totalSize / 1024).toFixed(2)}MB)`);
    
    // 优化建议
    this.printOptimizationTips(files, totalSize, 'frontend');
  }

  /**
   * 分析后端bundle
   */
  analyzeBackend() {
    console.log('\n📊 后端 Bundle 分析');
    console.log('='.repeat(50));

    const files = this.analyzeDirectory(this.backendDist, ['.js']);
    
    if (files.length === 0) {
      console.log('❌ 后端构建文件不存在，请先运行 npm run build:backend');
      return;
    }

    let totalSize = 0;
    files.forEach(file => {
      totalSize += file.size;
      console.log(`${file.name}: ${file.size}KB`);
    });

    console.log(`\n📦 总大小: ${totalSize}KB (${(totalSize / 1024).toFixed(2)}MB)`);
    
    // 优化建议
    this.printOptimizationTips(files, totalSize, 'backend');
  }

  /**
   * 打印优化建议
   */
  printOptimizationTips(files, totalSize, type) {
    console.log('\n💡 摇树优化建议:');
    
    if (type === 'frontend') {
      if (totalSize > 1000) {
        console.log('  ⚠️  Bundle较大，建议:');
        console.log('    - 检查是否有未使用的依赖');
        console.log('    - 考虑使用动态导入 (lazy loading)');
        console.log('    - 优化图片和静态资源');
      }
      
      const largeFiles = files.filter(f => f.size > 100);
      if (largeFiles.length > 0) {
        console.log('  📁 大文件 (>100KB):');
        largeFiles.forEach(file => {
          console.log(`    - ${file.name}: ${file.size}KB`);
        });
      }
    } else {
      if (totalSize > 500) {
        console.log('  ⚠️  后端代码较大，建议:');
        console.log('    - 检查是否有未使用的模块');
        console.log('    - 考虑代码分割');
        console.log('    - 移除开发依赖');
      }
    }
  }

  /**
   * 运行完整分析
   */
  run() {
    console.log('🔍 开始摇树优化分析...\n');
    
    this.analyzeFrontend();
    this.analyzeBackend();
    
    console.log('\n✅ 分析完成！');
    console.log('\n📋 优化检查清单:');
    console.log('  □ 检查 package.json 中的 sideEffects 配置');
    console.log('  □ 确认所有导入都使用 ES6 模块语法');
    console.log('  □ 移除未使用的依赖');
    console.log('  □ 检查是否有副作用代码');
    console.log('  □ 验证代码分割配置');
  }
}

// 运行分析
if (require.main === module) {
  const analyzer = new BundleAnalyzer();
  analyzer.run();
}

module.exports = BundleAnalyzer; 