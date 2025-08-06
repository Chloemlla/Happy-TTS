import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { config } from '@/config';
import { logger } from '@/utils/logger';
import Admin from '@/models/Admin';
import Resource from '@/models/Resource';
import CDK from '@/models/CDK';

async function initializeDatabase() {
  try {
    logger.info('Starting database initialization...');

    // 连接数据库
    await mongoose.connect(config.database.url, config.database.options);
    logger.info('Connected to MongoDB');

    // 清空现有数据（可选）
    if (process.argv.includes('--clear')) {
      logger.info('Clearing existing data...');
      await Admin.deleteMany({});
      await Resource.deleteMany({});
      await CDK.deleteMany({});
      logger.info('Existing data cleared');
    }

    // 创建默认管理员
    const adminExists = await Admin.findOne({ username: 'admin' });
    if (!adminExists) {
      const hashedPassword = await bcrypt.hash('admin123', 12);
      const admin = new Admin({
        username: 'admin',
        email: 'admin@happytss.com',
        password: hashedPassword,
        role: 'super_admin',
        isActive: true
      });
      await admin.save();
      logger.info('Default admin created: admin/admin123');
    } else {
      logger.info('Admin already exists');
    }

    // 创建示例资源
    const resourceCount = await Resource.countDocuments();
    if (resourceCount === 0) {
      const sampleResources = [
        {
          title: '示例资源1',
          description: '这是一个示例资源，用于测试系统功能',
          downloadUrl: 'https://example.com/resource1.zip',
          price: 9.99,
          category: '软件',
          imageUrl: 'https://example.com/image1.jpg',
          tags: ['软件', '工具', '示例'],
          downloads: 0,
          rating: 0
        },
        {
          title: '示例资源2',
          description: '另一个示例资源，展示不同的分类',
          downloadUrl: 'https://example.com/resource2.zip',
          price: 19.99,
          category: '游戏',
          imageUrl: 'https://example.com/image2.jpg',
          tags: ['游戏', '娱乐', '示例'],
          downloads: 0,
          rating: 0
        },
        {
          title: '示例资源3',
          description: '第三个示例资源，用于演示系统',
          downloadUrl: 'https://example.com/resource3.zip',
          price: 5.99,
          category: '工具',
          imageUrl: 'https://example.com/image3.jpg',
          tags: ['工具', '实用', '示例'],
          downloads: 0,
          rating: 0
        }
      ];

      const createdResources = await Resource.insertMany(sampleResources);
      logger.info(`Created ${createdResources.length} sample resources`);

      // 为第一个资源创建示例CDK
      if (createdResources.length > 0) {
        const sampleCDKs = [];
        for (let i = 0; i < 10; i++) {
          sampleCDKs.push({
            code: `SAMPLE${String(i + 1).padStart(3, '0')}CDK`,
            resourceId: createdResources[0]._id,
            isUsed: i < 3, // 前3个已使用
            usedAt: i < 3 ? new Date() : null,
            usedBy: i < 3 ? 'test-user' : null,
            usedIp: i < 3 ? '127.0.0.1' : null,
            batchId: 'sample-batch-001'
          });
        }
        await CDK.insertMany(sampleCDKs);
        logger.info(`Created ${sampleCDKs.length} sample CDKs`);
      }
    } else {
      logger.info('Resources already exist');
    }

    // 创建索引
    logger.info('Creating database indexes...');
    await Admin.createIndexes();
    await Resource.createIndexes();
    await CDK.createIndexes();
    logger.info('Database indexes created');

    // 显示统计信息
    const adminCount = await Admin.countDocuments();
    const resourceCount = await Resource.countDocuments();
    const cdkCount = await CDK.countDocuments();

    logger.info('Database initialization completed!');
    logger.info(`Statistics:`);
    logger.info(`  - Admins: ${adminCount}`);
    logger.info(`  - Resources: ${resourceCount}`);
    logger.info(`  - CDKs: ${cdkCount}`);

    await mongoose.disconnect();
    logger.info('Database connection closed');

  } catch (error) {
    logger.error('Database initialization failed:', error);
    process.exit(1);
  }
}

// 运行初始化
if (require.main === module) {
  initializeDatabase();
}

export default initializeDatabase; 