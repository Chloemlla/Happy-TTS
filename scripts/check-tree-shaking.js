#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * 摇树优化配置检查工具
 * 快速检查项目中的摇树优化配置是否正确
 */

class TreeShakingChecker {
  constructor() {
    this.projectRoot = path.resolve(__dirname, '..');
    this.frontendPath = path.join(this.projectRoot, 'frontend');
    this.backendPath = this.projectRoot;
  }

  /**
   * 检查package.json中的sideEffects配置
   */
  checkSideEffects(packagePath, name) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      const hasSideEffects = 'sideEffects' in pkg;
      
      console.log(`\n📦 ${name} package.json:`);
      console.log(`  sideEffects配置: ${hasSideEffects ? '✅ 已配置' : '❌ 未配置'}`);
      
      if (hasSideEffects) {
        console.log(`  配置值: ${JSON.stringify(pkg.sideEffects)}`);
      }
      
      return hasSideEffects;
    } catch (error) {
      console.log(`❌ 无法读取 ${name} package.json: ${error.message}`);
      return false;
    }
  }

  /**
   * 检查TypeScript配置
   */
  checkTypeScriptConfig() {
    const tsConfigPath = path.join(this.projectRoot, 'tsconfig.json');
    
    try {
      const config = JSON.parse(fs.readFileSync(tsConfigPath, 'utf8'));
      const compilerOptions = config.compilerOptions || {};
      
      console.log('\n🔧 TypeScript配置:');
      
      const checks = [
        { key: 'importHelpers', name: 'importHelpers', expected: true },
        { key: 'isolatedModules', name: 'isolatedModules', expected: true },
        { key: 'removeComments', name: 'removeComments', expected: true },
        { key: 'sourceMap', name: 'sourceMap', expected: false },
        { key: 'declaration', name: 'declaration', expected: false }
      ];
      
      checks.forEach(check => {
        const value = compilerOptions[check.key];
        const status = value === check.expected ? '✅' : '❌';
        console.log(`  ${check.name}: ${status} ${value}`);
      });
      
    } catch (error) {
      console.log(`❌ 无法读取 tsconfig.json: ${error.message}`);
    }
  }

  /**
   * 检查Vite配置
   */
  checkViteConfig() {
    const viteConfigPath = path.join(this.frontendPath, 'vite.config.ts');
    
    try {
      const content = fs.readFileSync(viteConfigPath, 'utf8');
      
      console.log('\n⚡ Vite配置:');
      
      const checks = [
        { pattern: 'treeshake:', name: 'treeshake配置' },
        { pattern: 'manualChunks:', name: '代码分割配置' },
        { pattern: 'optimizeDeps:', name: '依赖预构建配置' },
        { pattern: 'treeShaking: true', name: 'esbuild摇树优化' }
      ];
      
      checks.forEach(check => {
        const hasConfig = content.includes(check.pattern);
        const status = hasConfig ? '✅' : '❌';
        console.log(`  ${check.name}: ${status}`);
      });
      
    } catch (error) {
      console.log(`❌ 无法读取 vite.config.ts: ${error.message}`);
    }
  }

  /**
   * 检查导入语法
   */
  checkImportSyntax() {
    console.log('\n📝 导入语法检查:');
    
    const srcPath = path.join(this.projectRoot, 'src');
    const frontendSrcPath = path.join(this.frontendPath, 'src');
    
    const patterns = [
      { pattern: /import \* as /g, name: '命名空间导入', bad: true },
      { pattern: /import \{ .* \} from/g, name: '具名导入', bad: false },
      { pattern: /import .* from/g, name: '默认导入', bad: false },
      { pattern: /require\(/g, name: 'CommonJS require', bad: true }
    ];
    
    const checkDirectory = (dirPath, name) => {
      if (!fs.existsSync(dirPath)) return;
      
      const files = this.getTypeScriptFiles(dirPath);
      let totalFiles = 0;
      let issues = 0;
      
      patterns.forEach(pattern => {
        let count = 0;
        files.forEach(file => {
          try {
            const content = fs.readFileSync(file, 'utf8');
            const matches = content.match(pattern.pattern);
            if (matches) {
              count += matches.length;
              if (pattern.bad) issues += matches.length;
            }
          } catch (error) {
            // 忽略读取错误
          }
        });
        
        if (count > 0) {
          const status = pattern.bad ? '❌' : '✅';
          console.log(`  ${name} - ${pattern.name}: ${status} ${count}个`);
        }
      });
      
      totalFiles += files.length;
      return { totalFiles, issues };
    };
    
    const backendResult = checkDirectory(srcPath, '后端');
    const frontendResult = checkDirectory(frontendSrcPath, '前端');
    
    if (backendResult && frontendResult) {
      console.log(`\n📊 统计: 后端${backendResult.totalFiles}个文件, 前端${frontendResult.totalFiles}个文件`);
      console.log(`⚠️  发现${backendResult.issues + frontendResult.issues}个潜在问题`);
    }
  }

  /**
   * 获取TypeScript文件列表
   */
  getTypeScriptFiles(dirPath) {
    const files = [];
    
    const walk = (currentPath) => {
      try {
        const items = fs.readdirSync(currentPath);
        
        for (const item of items) {
          const itemPath = path.join(currentPath, item);
          const stat = fs.statSync(itemPath);
          
          if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
            walk(itemPath);
          } else if (item.endsWith('.ts') || item.endsWith('.tsx')) {
            files.push(itemPath);
          }
        }
      } catch (error) {
        // 忽略目录访问错误
      }
    };
    
    walk(dirPath);
    return files;
  }

  /**
   * 生成优化建议
   */
  generateRecommendations() {
    console.log('\n💡 优化建议:');
    console.log('  1. 确保所有导入使用ES6模块语法');
    console.log('  2. 避免使用 import * as 语法');
    console.log('  3. 移除未使用的依赖');
    console.log('  4. 使用动态导入进行代码分割');
    console.log('  5. 定期运行 npm run analyze:full 检查bundle大小');
  }

  /**
   * 运行完整检查
   */
  run() {
    console.log('🔍 摇树优化配置检查\n');
    console.log('='.repeat(50));
    
    // 检查package.json配置
    this.checkSideEffects(path.join(this.backendPath, 'package.json'), '后端');
    this.checkSideEffects(path.join(this.frontendPath, 'package.json'), '前端');
    
    // 检查TypeScript配置
    this.checkTypeScriptConfig();
    
    // 检查Vite配置
    this.checkViteConfig();
    
    // 检查导入语法
    this.checkImportSyntax();
    
    // 生成建议
    this.generateRecommendations();
    
    console.log('\n✅ 检查完成！');
    console.log('\n📋 下一步:');
    console.log('  - 运行 npm run analyze:full 进行详细分析');
    console.log('  - 运行 npm run check:unused-deps 检查未使用的依赖');
    console.log('  - 查看 docs/tree-shaking-best-practices.md 了解更多最佳实践');
  }
}

// 运行检查
if (require.main === module) {
  const checker = new TreeShakingChecker();
  checker.run();
}

module.exports = TreeShakingChecker; 