#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');

/**
 * 异步清理文件夹及其子文件夹下的所有.log文件
 * @param {string} targetPath - 要清理的文件夹路径
 * @param {Object} options - 配置选项
 * @param {boolean} options.dryRun - 是否为试运行模式（不实际删除文件）
 * @param {boolean} options.verbose - 是否显示详细日志
 * @returns {Promise<Object>} 清理结果统计
 */
async function cleanupLogFiles(targetPath, options = {}) {
    const {
        dryRun = false,
        verbose = true
    } = options;

    const stats = {
        totalFiles: 0,
        deletedFiles: 0,
        failedFiles: 0,
        totalSize: 0,
        startTime: new Date(),
        errors: []
    };

    /**
     * 记录日志信息
     * @param {string} message - 日志消息
     * @param {string} level - 日志级别 (info, warn, error)
     */
    function log(message, level = 'info') {
        const timestamp = new Date().toISOString();
        const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
        console.log(`${prefix} ${message}`);
    }

    /**
     * 检查文件是否为.log文件
     * @param {string} filename - 文件名
     * @returns {boolean}
     */
    function isLogFile(filename) {
        return filename.toLowerCase().endsWith('.log');
    }

    /**
     * 递归遍历目录并删除.log文件
     * @param {string} dirPath - 目录路径
     * @returns {Promise<void>}
     */
    async function processDirectory(dirPath) {
        try {
            const entries = await fs.readdir(dirPath, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name);
                
                if (entry.isDirectory()) {
                    // 递归处理子目录
                    if (verbose) {
                        log(`进入目录: ${fullPath}`);
                    }
                    await processDirectory(fullPath);
                } else if (entry.isFile() && isLogFile(entry.name)) {
                    // 处理.log文件
                    await processLogFile(fullPath);
                }
            }
        } catch (error) {
            const errorMsg = `处理目录失败: ${dirPath} - ${error.message}`;
            log(errorMsg, 'error');
            stats.errors.push({
                path: dirPath,
                error: error.message,
                type: 'directory'
            });
        }
    }

    /**
     * 处理单个.log文件
     * @param {string} filePath - 文件路径
     * @returns {Promise<void>}
     */
    async function processLogFile(filePath) {
        try {
            stats.totalFiles++;
            
            // 获取文件信息
            const fileStats = await fs.stat(filePath);
            const fileSize = fileStats.size;
            
            if (verbose) {
                log(`发现日志文件: ${filePath} (${formatFileSize(fileSize)})`);
            }
            
            if (dryRun) {
                log(`[试运行] 将删除: ${filePath}`, 'warn');
            } else {
                // 实际删除文件
                await fs.unlink(filePath);
                stats.deletedFiles++;
                stats.totalSize += fileSize;
                log(`已删除: ${filePath}`, 'info');
            }
            
        } catch (error) {
            const errorMsg = `删除文件失败: ${filePath} - ${error.message}`;
            log(errorMsg, 'error');
            stats.failedFiles++;
            stats.errors.push({
                path: filePath,
                error: error.message,
                type: 'file'
            });
        }
    }

    /**
     * 格式化文件大小
     * @param {number} bytes - 字节数
     * @returns {string} 格式化后的大小
     */
    function formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * 打印清理结果统计
     */
    function printStats() {
        const endTime = new Date();
        const duration = (endTime - stats.startTime) / 1000;
        
        log('='.repeat(60));
        log('清理完成！统计信息:');
        log(`总扫描文件数: ${stats.totalFiles}`);
        log(`成功删除文件数: ${stats.deletedFiles}`);
        log(`删除失败文件数: ${stats.failedFiles}`);
        log(`释放空间: ${formatFileSize(stats.totalSize)}`);
        log(`执行时间: ${duration.toFixed(2)} 秒`);
        
        if (stats.errors.length > 0) {
            log(`错误数量: ${stats.errors.length}`, 'warn');
            if (verbose) {
                log('错误详情:', 'warn');
                stats.errors.forEach((error, index) => {
                    log(`  ${index + 1}. ${error.path}: ${error.error}`, 'error');
                });
            }
        }
        log('='.repeat(60));
    }

    // 主执行逻辑
    try {
        log(`开始清理日志文件...`);
        log(`目标路径: ${targetPath}`);
        log(`试运行模式: ${dryRun ? '是' : '否'}`);
        log(`详细日志: ${verbose ? '是' : '否'}`);
        log('-'.repeat(60));

        // 检查目标路径是否存在
        const targetStats = await fs.stat(targetPath);
        if (!targetStats.isDirectory()) {
            throw new Error(`目标路径不是目录: ${targetPath}`);
        }

        // 开始递归处理
        await processDirectory(targetPath);
        
        // 打印统计信息
        printStats();
        
        return stats;
        
    } catch (error) {
        log(`清理过程中发生严重错误: ${error.message}`, 'error');
        throw error;
    }
}

/**
 * 命令行入口点
 */
async function main() {
    const args = process.argv.slice(2);
    
    // 解析命令行参数
    const options = {
        dryRun: args.includes('--dry-run') || args.includes('-d'),
        verbose: !args.includes('--quiet') && !args.includes('-q')
    };
    
    // 获取目标路径，默认为当前目录
    let targetPath = args.find(arg => !arg.startsWith('-'));
    
    if (!targetPath) {
        // 如果没有指定路径，使用当前目录
        targetPath = process.cwd();
        console.log(`未指定目标路径，将使用当前目录: ${targetPath}`);
    }

    // 解析相对路径为绝对路径
    targetPath = path.resolve(targetPath);
    
    try {
        await cleanupLogFiles(targetPath, options);
    } catch (error) {
        console.error(`程序执行失败: ${error.message}`);
        process.exit(1);
    }
}

// 如果直接运行此脚本，则执行main函数
if (require.main === module) {
    main();
}

module.exports = { cleanupLogFiles }; 