import mongoose from 'mongoose';

// 优先使用环境变量 MONGO_URI，否则默认连接到本地 tts 数据库
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/tts';

export const connectMongo = async () => {
  try {
    // 解析 URI，若无 database，强制加上 tts
    let uri = MONGO_URI;
    if (/mongodb\+srv:\/\/.+\/?(\?.*)?$/.test(uri)) {
      // Atlas URI 没有指定 db，自动加 /tts
      if (!/\/[a-zA-Z0-9_-]+(\?|$)/.test(uri.replace('mongodb+srv://', ''))) {
        uri = uri.replace(/\/?(\?.*)?$/, '/tts$1');
      }
    } else if (/mongodb:\/\/.+\/?(\?.*)?$/.test(uri)) {
      // 普通 URI 没有指定 db，自动加 /tts
      if (!/\/[a-zA-Z0-9_-]+(\?|$)/.test(uri.replace('mongodb://', ''))) {
        uri = uri.replace(/\/?(\?.*)?$/, '/tts$1');
      }
    }
    await mongoose.connect(uri, {
      // 可根据需要添加更多 mongoose 连接选项
      serverSelectionTimeoutMS: 5000, // 5秒超时
      socketTimeoutMS: 45000, // 45秒超时
    });
    console.log('MongoDB 连接成功:', uri);
  } catch (error) {
    console.error('MongoDB 连接失败:', error);
    // 不退出进程，让应用继续运行并使用文件存储
    throw error;
  }
};

export default mongoose; 