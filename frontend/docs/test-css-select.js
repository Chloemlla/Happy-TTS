#!/usr/bin/env node

console.log('测试css-select安装状态...');

try {
    // 测试直接安装的css-select
    const cssSelect = require('css-select');
    console.log('✓ 直接安装的css-select可用');
    
    // 测试compile函数
    if (typeof cssSelect.compile === 'function') {
        console.log('✓ css-select.compile函数可用');
    } else {
        console.log('✗ css-select.compile函数不可用');
    }
    
} catch (error) {
    console.log('✗ 直接安装的css-select不可用:', error.message);
}

try {
    // 测试从其他包中引用的css-select
    const path = require('path');
    const fs = require('fs');
    
    // 查找node_modules中的css-select
    const nodeModulesPath = path.join(__dirname, 'node_modules');
    const cssSelectPath = path.join(nodeModulesPath, 'css-select');
    
    if (fs.existsSync(cssSelectPath)) {
        console.log('✓ css-select目录存在');
        
        const libPath = path.join(cssSelectPath, 'lib');
        if (fs.existsSync(libPath)) {
            console.log('✓ css-select/lib目录存在');
            
            const compilePath = path.join(libPath, 'compile.js');
            if (fs.existsSync(compilePath)) {
                console.log('✓ css-select/lib/compile.js文件存在');
            } else {
                console.log('✗ css-select/lib/compile.js文件不存在');
            }
            
            const helpersPath = path.join(libPath, 'helpers');
            if (fs.existsSync(helpersPath)) {
                console.log('✓ css-select/lib/helpers目录存在');
                
                const queryingPath = path.join(helpersPath, 'querying.js');
                if (fs.existsSync(queryingPath)) {
                    console.log('✓ css-select/lib/helpers/querying.js文件存在');
                } else {
                    console.log('✗ css-select/lib/helpers/querying.js文件不存在');
                }
            } else {
                console.log('✗ css-select/lib/helpers目录不存在');
            }
            
            const pseudoSelectorsPath = path.join(libPath, 'pseudo-selectors');
            if (fs.existsSync(pseudoSelectorsPath)) {
                console.log('✓ css-select/lib/pseudo-selectors目录存在');
                
                const pseudoSelectorsIndexPath = path.join(pseudoSelectorsPath, 'index.js');
                if (fs.existsSync(pseudoSelectorsIndexPath)) {
                    console.log('✓ css-select/lib/pseudo-selectors/index.js文件存在');
                } else {
                    console.log('✗ css-select/lib/pseudo-selectors/index.js文件不存在');
                }
            } else {
                console.log('✗ css-select/lib/pseudo-selectors目录不存在');
            }
            
            const parsePath = path.join(libPath, 'parse.js');
            if (fs.existsSync(parsePath)) {
                console.log('✓ css-select/lib/parse.js文件存在');
            } else {
                console.log('✗ css-select/lib/parse.js文件不存在');
            }
            
            const renderPath = path.join(libPath, 'render.js');
            if (fs.existsSync(renderPath)) {
                console.log('✓ css-select/lib/render.js文件存在');
            } else {
                console.log('✗ css-select/lib/render.js文件不存在');
            }
            
            const indexPath = path.join(libPath, 'index.js');
            if (fs.existsSync(indexPath)) {
                console.log('✓ css-select/lib/index.js文件存在');
            } else {
                console.log('✗ css-select/lib/index.js文件不存在');
            }
        } else {
            console.log('✗ css-select/lib目录不存在');
        }
    } else {
        console.log('✗ css-select目录不存在');
    }
    
} catch (error) {
    console.log('✗ 检查css-select时出错:', error.message);
}

console.log('测试完成'); 