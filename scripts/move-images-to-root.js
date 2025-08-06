const fs = require('fs').promises;
const path = require('path');

// 支持的图片格式
const IMAGE_EXTENSIONS = [
    '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.tif',
    '.webp', '.svg', '.ico', '.jfif', '.pjpeg', '.pjp',
    '.avif', '.heic', '.heif'
];

/**
 * 检查文件是否为图片
 * @param {string} filename 文件名
 * @returns {boolean} 是否为图片文件
 */
function isImageFile(filename) {
    const ext = path.extname(filename).toLowerCase();
    return IMAGE_EXTENSIONS.includes(ext);
}

/**
 * 获取文件的新名称（如果存在重名则添加数字后缀）
 * @param {string} targetPath 目标路径
 * @param {string} filename 文件名
 * @returns {string} 新的文件名
 */
async function getUniqueFilename(targetPath, filename) {
    const nameWithoutExt = path.parse(filename).name;
    const ext = path.extname(filename);
    let newName = filename;
    let counter = 1;

    while (await fs.access(path.join(targetPath, newName)).then(() => true).catch(() => false)) {
        newName = `${nameWithoutExt}_${counter}${ext}`;
        counter++;
    }

    return newName;
}

/**
 * 递归查找并移动图片文件
 * @param {string} currentDir 当前目录
 * @param {string} rootDir 根目录
 * @param {Array} movedFiles 已移动的文件列表
 */
async function findAndMoveImages(currentDir, rootDir, movedFiles = []) {
    try {
        const items = await fs.readdir(currentDir);
        
        for (const item of items) {
            const itemPath = path.join(currentDir, item);
            const stat = await fs.stat(itemPath);
            
            if (stat.isDirectory()) {
                // 递归处理子目录
                await findAndMoveImages(itemPath, rootDir, movedFiles);
                
                // 检查目录是否为空，如果为空则删除
                const remainingItems = await fs.readdir(itemPath);
                if (remainingItems.length === 0) {
                    await fs.rmdir(itemPath);
                    console.log(`🗑️  删除空文件夹: ${itemPath}`);
                }
            } else if (stat.isFile() && isImageFile(item)) {
                // 移动图片文件到根目录
                const uniqueName = await getUniqueFilename(rootDir, item);
                const targetPath = path.join(rootDir, uniqueName);
                
                await fs.rename(itemPath, targetPath);
                movedFiles.push({
                    original: itemPath,
                    moved: targetPath,
                    filename: uniqueName
                });
                
                console.log(`📸 移动图片: ${item} -> ${uniqueName}`);
            }
        }
    } catch (error) {
        console.error(`❌ 处理目录 ${currentDir} 时出错:`, error.message);
    }
}

/**
 * 主函数
 */
async function main() {
    const currentDir = process.cwd();
    console.log(`🚀 开始处理目录: ${currentDir}`);
    console.log(`📋 支持的图片格式: ${IMAGE_EXTENSIONS.join(', ')}`);
    console.log('─'.repeat(50));
    
    const movedFiles = [];
    
    try {
        // 递归查找并移动图片文件
        await findAndMoveImages(currentDir, currentDir, movedFiles);
        
        console.log('─'.repeat(50));
        console.log(`✅ 处理完成！`);
        console.log(`📊 统计信息:`);
        console.log(`   - 移动的图片文件数量: ${movedFiles.length}`);
        
        if (movedFiles.length > 0) {
            console.log(`\n📋 移动的文件列表:`);
            movedFiles.forEach((file, index) => {
                console.log(`   ${index + 1}. ${path.basename(file.original)} -> ${file.filename}`);
            });
        } else {
            console.log(`   - 未找到需要移动的图片文件`);
        }
        
    } catch (error) {
        console.error(`❌ 执行过程中发生错误:`, error.message);
        process.exit(1);
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    main().catch(error => {
        console.error('❌ 程序执行失败:', error);
        process.exit(1);
    });
}

module.exports = {
    findAndMoveImages,
    isImageFile,
    IMAGE_EXTENSIONS
}; 