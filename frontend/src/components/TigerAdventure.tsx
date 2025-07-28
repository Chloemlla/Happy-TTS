import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Scene {
  id: number;
  title: string;
  description: string;
  background: string;
  tigerPosition: { x: number; y: number };
  elements: React.ReactNode;
}

const TigerAdventure: React.FC = () => {
  const [currentScene, setCurrentScene] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [touchStart, setTouchStart] = useState(0);
  const [touchEnd, setTouchEnd] = useState(0);

  // 检测移动设备
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // 触摸手势处理
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > 50;
    const isRightSwipe = distance < -50;

    if (isLeftSwipe && currentScene < scenes.length - 1) {
      nextScene();
    } else if (isRightSwipe && currentScene > 0) {
      prevScene();
    }
  };

  const scenes: Scene[] = [
    {
      id: 1,
      title: "阴谋策划",
      description: "1970年，林虎将军一伙企图以和平方式\"抢班夺权\"，因提议设国家主席和\"天才\"问题失败后，开始密谋武装政变...",
      background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)",
      tigerPosition: { x: 20, y: 60 },
      elements: (
        <div className="absolute inset-0">
          {/* 会议室背景 */}
          <motion.div
            className="absolute inset-0 bg-gradient-to-b from-gray-800 to-gray-900"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 2 }}
          />
          {/* 会议桌 */}
          <motion.div
            className="absolute bottom-20 left-1/2 transform -translate-x-1/2 w-64 sm:w-80 md:w-96 h-6 sm:h-8 bg-brown-800 rounded-lg"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 2, ease: "easeOut" }}
          />
          {/* 林虎将军在会议桌前 */}
          <motion.div
            className="absolute w-12 h-8 sm:w-16 sm:h-12"
            style={{ left: '30%', bottom: '35%' }}
            animate={{
              y: [0, -5, 0],
              rotateY: [0, 5, 0]
            }}
            transition={{
              duration: 3,
              ease: "easeInOut",
              repeat: Infinity
            }}
          >
            <div className="w-full h-full bg-orange-500 rounded-lg relative">
              {/* 军帽 */}
              <div className="absolute -top-2 left-1/2 transform -translate-x-1/2 w-8 h-2 bg-green-600 rounded-t-lg"></div>
              {/* 军装领子 */}
              <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-6 h-1 bg-green-600 rounded-b-sm"></div>
              <div className="absolute top-1 left-2 w-2 h-2 bg-black rounded-full"></div>
              <div className="absolute top-1 right-2 w-2 h-2 bg-black rounded-full"></div>
              <div className="absolute bottom-1 left-1/2 transform -translate-x-1/2 w-8 h-1 bg-black rounded-full"></div>
              <div className="absolute top-2 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-black rounded-full"></div>
              {/* 军衔星徽 */}
              <div className="absolute -top-1 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-yellow-400 rounded-full"></div>
              {/* 军装扣子 */}
              <div className="absolute top-3 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-yellow-400 rounded-full"></div>
            </div>
          </motion.div>
          {/* 阴谋文件 */}
          {[...Array(3)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-6 h-8 sm:w-8 sm:h-10 bg-yellow-100 rounded"
              style={{
                left: `${50 + i * 10}%`,
                bottom: '30%'
              }}
              initial={{ scale: 0, rotate: -45 }}
              animate={{ 
                scale: [0, 1, 0.8],
                rotate: [-45, 0, 5],
                y: [0, -10, 0]
              }}
              transition={{
                duration: 2,
                delay: i * 0.5,
                repeat: Infinity,
                repeatType: "reverse"
              }}
            >
              <div className="w-full h-1 bg-gray-400 mt-1"></div>
              <div className="w-3/4 h-1 bg-gray-400 mt-1 mx-auto"></div>
              <div className="w-1/2 h-1 bg-gray-400 mt-1 mx-auto"></div>
            </motion.div>
          ))}
          {/* 阴影效果 */}
          <motion.div
            className="absolute bottom-0 w-full h-20 bg-black opacity-20"
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ duration: 2, delay: 1 }}
          />
        </div>
      )
    },
    {
      id: 2,
      title: "毛泽东南巡",
      description: "1971年8月，毛泽东巡视南方，林虎将军一伙极力探听谈话内容。9月5日、6日，林虎将军等人得知毛泽东批评他们后，决定谋杀毛泽东，发动武装政变...",
      background: "linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%)",
      tigerPosition: { x: 50, y: 40 },
      elements: (
        <div className="absolute inset-0">
          {/* 南方城市背景 */}
          <motion.div
            className="absolute inset-0 bg-gradient-to-b from-blue-400 to-blue-600"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 2 }}
          />
          {/* 建筑群 */}
          {[...Array(5)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-6 h-12 sm:w-8 sm:h-16 bg-gray-700 rounded-t-lg"
              style={{
                left: `${20 + i * 15}%`,
                bottom: '20%'
              }}
              initial={{ scaleY: 0 }}
              animate={{ scaleY: 1 }}
              transition={{ duration: 1.5, delay: i * 0.2 }}
            >
              <div className="w-full h-1 sm:h-2 bg-yellow-400"></div>
              <div className="w-full h-1 sm:h-2 bg-yellow-400 mt-1 sm:mt-2"></div>
              <div className="w-full h-1 sm:h-2 bg-yellow-400 mt-1 sm:mt-2"></div>
            </motion.div>
          ))}
          {/* 林虎将军在暗中观察 */}
          <motion.div
            className="absolute w-10 h-6 sm:w-12 sm:h-8"
            style={{ left: '10%', top: '60%' }}
            animate={{
              x: [0, 20, 0],
              opacity: [0.3, 1, 0.3]
            }}
            transition={{
              duration: 4,
              ease: "easeInOut",
              repeat: Infinity
            }}
          >
            <div className="w-full h-full bg-orange-500 rounded-lg relative">
              {/* 军帽 */}
              <div className="absolute -top-2 left-1/2 transform -translate-x-1/2 w-6 h-1 bg-green-600 rounded-t-sm"></div>
              {/* 军装领子 */}
              <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-4 h-1 bg-green-600 rounded-b-sm"></div>
              <div className="absolute top-1 left-2 w-2 h-2 bg-black rounded-full"></div>
              <div className="absolute top-1 right-2 w-2 h-2 bg-black rounded-full"></div>
              <div className="absolute bottom-1 left-1/2 transform -translate-x-1/2 w-6 h-1 bg-black rounded-full"></div>
              {/* 军衔星徽 */}
              <div className="absolute -top-1 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-yellow-400 rounded-full"></div>
              {/* 军装扣子 */}
              <div className="absolute top-3 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-yellow-400 rounded-full"></div>
            </div>
          </motion.div>
          {/* 探听情报的符号 */}
          {[...Array(3)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-4 h-4 bg-red-500 rounded-full opacity-60"
              style={{
                left: `${70 + i * 5}%`,
                top: `${30 + i * 10}%`
              }}
              animate={{
                scale: [0, 1, 0],
                opacity: [0, 0.6, 0]
              }}
              transition={{
                duration: 2,
                delay: i * 0.5,
                repeat: Infinity
              }}
            />
          ))}
          {/* 太阳 */}
          <motion.div
            className="absolute w-12 h-12 sm:w-16 sm:h-16 bg-yellow-400 rounded-full"
            style={{ right: '10%', top: '10%' }}
            animate={{
              rotate: 360
            }}
            transition={{
              duration: 10,
              repeat: Infinity,
              ease: "linear"
            }}
          />
        </div>
      )
    },
    {
      id: 3,
      title: "仓皇出逃",
      description: "9月12日晚，周恩来获悉林虎将军要乘机出逃，下令控制山海关机场的256号三叉戟专机。深夜，林虎将军等人不顾警卫阻拦，强行登机起飞，仓皇出逃...",
      background: "linear-gradient(135deg, #2c3e50 0%, #34495e 100%)",
      tigerPosition: { x: 30, y: 30 },
      elements: (
        <div className="absolute inset-0">
          {/* 夜晚背景 */}
          <motion.div
            className="absolute inset-0 bg-gradient-to-b from-gray-900 to-black"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 2 }}
          />
          {/* 机场跑道 */}
          <motion.div
            className="absolute bottom-0 w-full h-16 bg-gray-600"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 2, ease: "easeOut" }}
          />
          {/* 跑道灯 */}
          {[...Array(8)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-2 h-2 bg-yellow-400 rounded-full"
              style={{
                left: `${10 + i * 10}%`,
                bottom: '8%'
              }}
              animate={{
                opacity: [0.3, 1, 0.3]
              }}
              transition={{
                duration: 1,
                delay: i * 0.2,
                repeat: Infinity
              }}
            />
          ))}
          {/* 256号三叉戟专机 */}
          <motion.div
            className="absolute w-32 h-8 sm:w-40 sm:h-10 bg-gray-800 rounded-lg shadow-lg"
            style={{ left: '30%', top: '40%' }}
            animate={{
              x: [0, 50, 0],
              y: [0, -10, 0]
            }}
            transition={{
              duration: 4,
              ease: "easeInOut",
              repeat: Infinity
            }}
          >
            <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 w-3 h-3 bg-red-600 rounded-full"></div>
            <div className="absolute -bottom-3 left-6 w-6 h-1 bg-gray-400 rounded-full"></div>
            <div className="absolute -bottom-3 right-6 w-6 h-1 bg-gray-400 rounded-full"></div>
            <div className="absolute top-2 left-3 w-1 h-1 bg-white rounded-full"></div>
            <div className="absolute top-2 right-3 w-1 h-1 bg-white rounded-full"></div>
            {/* 256标识 */}
            <div className="absolute top-1 left-1/2 transform -translate-x-1/2 text-xs text-white font-bold hidden sm:block">256</div>
          </motion.div>
          {/* 林虎将军仓皇登机 */}
          <motion.div
            className="absolute w-10 h-6 sm:w-12 sm:h-8"
            style={{ left: '20%', top: '50%' }}
            animate={{
              x: [0, 100],
              y: [0, -30],
              scale: [1, 0.8]
            }}
            transition={{
              duration: 3,
              ease: "easeIn"
            }}
          >
            <div className="w-full h-full bg-orange-500 rounded-lg relative">
              {/* 军帽 */}
              <div className="absolute -top-2 left-1/2 transform -translate-x-1/2 w-6 h-1 bg-green-600 rounded-t-sm"></div>
              {/* 军装领子 */}
              <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-4 h-1 bg-green-600 rounded-b-sm"></div>
              <div className="absolute top-1 left-2 w-2 h-2 bg-black rounded-full"></div>
              <div className="absolute top-1 right-2 w-2 h-2 bg-black rounded-full"></div>
              <div className="absolute bottom-1 left-1/2 transform -translate-x-1/2 w-6 h-1 bg-black rounded-full"></div>
              {/* 军衔星徽 */}
              <div className="absolute -top-1 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-yellow-400 rounded-full"></div>
              {/* 军装扣子 */}
              <div className="absolute top-3 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-yellow-400 rounded-full"></div>
            </div>
          </motion.div>
          {/* 警卫阻拦效果 */}
          {[...Array(3)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-6 h-6 bg-red-500 rounded-full opacity-60"
              style={{
                left: `${60 + i * 8}%`,
                top: `${50 + i * 5}%`
              }}
              animate={{
                scale: [0, 1, 0],
                opacity: [0, 0.6, 0]
              }}
              transition={{
                duration: 2,
                delay: i * 0.3,
                repeat: Infinity
              }}
            />
          ))}
          {/* 月亮 */}
          <motion.div
            className="absolute w-10 h-10 sm:w-12 sm:h-12 bg-gray-300 rounded-full"
            style={{ right: '10%', top: '10%' }}
            animate={{
              opacity: [0.5, 1, 0.5]
            }}
            transition={{
              duration: 3,
              repeat: Infinity
            }}
          />
        </div>
      )
    },
    {
      id: 4,
      title: "温都尔汗坠机",
      description: "1971年9月13日凌晨，林虎将军乘坐的256号三叉戟专机在蒙古温都尔汗草原上空坠毁，机上人员全部死亡...",
      background: "linear-gradient(135deg, #8B0000 0%, #DC143C 100%)",
      tigerPosition: { x: 40, y: 20 },
      elements: (
        <div className="absolute inset-0">
          {/* 蒙古草原 */}
          <motion.div
            className="absolute bottom-0 w-full h-40 bg-green-600"
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ duration: 2, ease: "easeOut" }}
          />
          {/* 草原上的草 */}
          {[...Array(20)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-1 h-4 bg-green-800"
              style={{
                left: `${5 + i * 5}%`,
                bottom: '0%'
              }}
              initial={{ scaleY: 0 }}
              animate={{ scaleY: 1 }}
              transition={{ duration: 1, delay: i * 0.1 }}
            />
          ))}
          {/* 坠落的256号专机 */}
          <motion.div
            className="absolute w-32 h-8 sm:w-40 sm:h-10 bg-red-800 rounded-lg shadow-lg"
            style={{ left: '40%', top: '15%' }}
            animate={{
              x: [0, 80, -80],
              y: [0, 150, 300],
              rotate: [0, 60, 120]
            }}
            transition={{
              duration: 5,
              ease: "easeIn"
            }}
          >
            <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 w-3 h-3 bg-red-900 rounded-full"></div>
            <div className="absolute -bottom-3 left-6 w-6 h-1 bg-red-900 rounded-full"></div>
            <div className="absolute -bottom-3 right-6 w-6 h-1 bg-red-900 rounded-full"></div>
            <div className="absolute top-2 left-3 w-1 h-1 bg-white rounded-full"></div>
            <div className="absolute top-2 right-3 w-1 h-1 bg-white rounded-full"></div>
            {/* 256标识残骸 */}
            <div className="absolute top-1 left-1/2 transform -translate-x-1/2 text-xs text-white font-bold hidden sm:block">256</div>
          </motion.div>
          {/* 林虎将军在飞机中 */}
          <motion.div
            className="absolute w-10 h-6 sm:w-12 sm:h-8"
            style={{ left: '45%', top: '25%' }}
            animate={{
              x: [0, 80, -80],
              y: [0, 150, 300],
              rotate: [0, 60, 120],
              scale: [1, 0.8, 0.5]
            }}
            transition={{
              duration: 5,
              ease: "easeIn"
            }}
          >
            <div className="w-full h-full bg-orange-500 rounded-lg relative">
              {/* 军帽 */}
              <div className="absolute -top-2 left-1/2 transform -translate-x-1/2 w-6 h-1 bg-green-600 rounded-t-sm"></div>
              {/* 军装领子 */}
              <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-4 h-1 bg-green-600 rounded-b-sm"></div>
              <div className="absolute top-1 left-2 w-2 h-2 bg-black rounded-full"></div>
              <div className="absolute top-1 right-2 w-2 h-2 bg-black rounded-full"></div>
              <div className="absolute bottom-1 left-1/2 transform -translate-x-1/2 w-6 h-1 bg-black rounded-full"></div>
              {/* 军衔星徽 */}
              <div className="absolute -top-1 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-yellow-400 rounded-full"></div>
              {/* 军装扣子 */}
              <div className="absolute top-3 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-yellow-400 rounded-full"></div>
            </div>
          </motion.div>
          {/* 爆炸效果 */}
          <motion.div
            className="absolute w-24 h-24 sm:w-32 sm:h-32 bg-yellow-400 rounded-full"
            style={{ left: '50%', top: '70%' }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: [0, 3, 0], opacity: [0, 1, 0] }}
            transition={{ duration: 3, delay: 4 }}
          />
          {/* 火焰效果 */}
          {[...Array(5)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-6 h-8 sm:w-8 sm:h-12 bg-orange-500 rounded-t-full"
              style={{
                left: `${45 + i * 2}%`,
                top: '75%'
              }}
              initial={{ scaleY: 0, opacity: 0 }}
              animate={{ 
                scaleY: [0, 1, 0],
                opacity: [0, 1, 0],
                y: [0, -20, 0]
              }}
              transition={{
                duration: 2,
                delay: 4 + i * 0.2,
                repeat: Infinity
              }}
            />
          ))}
          {/* 烟雾效果 */}
          {[...Array(8)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-6 h-6 bg-gray-600 rounded-full opacity-60"
              style={{
                left: `${40 + i * 3}%`,
                top: '65%'
              }}
              animate={{
                scale: [0, 2, 0],
                opacity: [0, 0.6, 0],
                y: [0, -50, -100]
              }}
              transition={{
                duration: 4,
                delay: 4 + i * 0.3,
                repeat: Infinity
              }}
            />
          ))}
        </div>
      )
    },
    {
      id: 5,
      title: "历史教训",
      description: "1971年9月13日，林虎将军在蒙古温都尔汗坠机身亡，飞机和老虎都被跌得粉碎，这场震惊中外的\"九·一三\"事件成为历史的重要转折点...",
      background: "linear-gradient(135deg, #2c3e50 0%, #34495e 100%)",
      tigerPosition: { x: 50, y: 70 },
      elements: (
        <div className="absolute inset-0">
          {/* 历史背景 */}
          <motion.div
            className="absolute inset-0 bg-gradient-to-b from-gray-800 to-black"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 2 }}
          />
          {/* 飞机残骸碎片 */}
          {[...Array(12)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-6 h-6 bg-gray-700 rounded"
              style={{
                left: `${20 + (i % 4) * 20}%`,
                top: `${30 + Math.floor(i / 4) * 15}%`
              }}
              initial={{ scale: 0, rotate: 0, opacity: 0 }}
              animate={{
                scale: [0, 1, 0.8],
                rotate: [0, 180, 360],
                opacity: [0, 1, 0.5]
              }}
              transition={{
                duration: 4,
                delay: i * 0.3
              }}
            >
              <div className="w-full h-1 bg-gray-500 mt-1"></div>
              <div className="w-2/3 h-1 bg-gray-500 mt-1 mx-auto"></div>
            </motion.div>
          ))}

          {/* 林虎将军的碎片 */}
          {[...Array(8)].map((_, i) => (
            <motion.div
              key={`tiger-${i}`}
              className="absolute bg-orange-500 rounded"
              style={{
                width: `${8 + (i % 3) * 4}px`,
                height: `${6 + (i % 2) * 4}px`,
                left: `${35 + (i % 4) * 15}%`,
                top: `${40 + Math.floor(i / 4) * 12}%`
              }}
              initial={{ scale: 0, rotate: 0, opacity: 0 }}
              animate={{
                scale: [0, 1, 0.6],
                rotate: [0, 90, 180, 270, 360],
                opacity: [0, 1, 0.7],
                x: [0, (i % 2 === 0 ? 20 : -20)],
                y: [0, (i % 3 === 0 ? 15 : -15)]
              }}
              transition={{
                duration: 3,
                delay: 1 + i * 0.2
              }}
            >
              {/* 老虎碎片细节 */}
              {i % 2 === 0 && (
                <div className="w-1 h-1 bg-black rounded-full mt-1 ml-1"></div>
              )}
              {i % 3 === 0 && (
                <div className="w-1 h-1 bg-yellow-400 rounded-full mt-1 mr-1"></div>
              )}
            </motion.div>
          ))}

          {/* 军装碎片 */}
          {[...Array(6)].map((_, i) => (
            <motion.div
              key={`uniform-${i}`}
              className="absolute bg-green-600 rounded"
              style={{
                width: `${6 + (i % 2) * 3}px`,
                height: `${4 + (i % 3) * 2}px`,
                left: `${45 + (i % 3) * 12}%`,
                top: `${35 + Math.floor(i / 3) * 10}%`
              }}
              initial={{ scale: 0, rotate: 0, opacity: 0 }}
              animate={{
                scale: [0, 1, 0.5],
                rotate: [0, 45, 90, 135, 180],
                opacity: [0, 1, 0.6],
                x: [0, (i % 2 === 0 ? 15 : -15)],
                y: [0, (i % 2 === 1 ? 10 : -10)]
              }}
              transition={{
                duration: 2.5,
                delay: 1.5 + i * 0.15
              }}
            />
          ))}
          {/* 林虎将军的军帽残骸 */}
          <motion.div
            className="absolute w-8 h-3 bg-green-600 rounded-t-lg"
            style={{ left: '50%', top: '40%' }}
            initial={{ scale: 0, rotate: 0 }}
            animate={{
              scale: [0, 1, 0.8],
              rotate: [0, 45, 90],
              opacity: [0, 1, 0.6],
              x: [0, 30, -30],
              y: [0, 20, -20]
            }}
            transition={{
              duration: 4,
              delay: 2
            }}
          />
          {/* 军衔星徽残骸 */}
          <motion.div
            className="absolute w-3 h-3 bg-yellow-400 rounded-full"
            style={{ left: '52%', top: '38%' }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{
              scale: [0, 1, 0.5],
              opacity: [0, 1, 0.3],
              x: [0, 25, -25],
              y: [0, 15, -15]
            }}
            transition={{
              duration: 3,
              delay: 2.5
            }}
          />
          {/* 历史文字效果 */}
          <motion.div
            className="absolute top-16 sm:top-20 left-1/2 transform -translate-x-1/2 text-center"
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 2, delay: 1 }}
          >
            <div className="text-white text-xl sm:text-2xl font-bold mb-2">九·一三事件</div>
            <div className="text-gray-300 text-base sm:text-lg">1971年9月13日</div>
          </motion.div>
          {/* 烟雾缭绕 */}
          {[...Array(6)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-12 h-12 bg-gray-600 rounded-full opacity-40"
              style={{
                left: `${30 + i * 8}%`,
                top: `${60 + i * 3}%`
              }}
              animate={{
                scale: [0, 2, 0],
                opacity: [0, 0.4, 0],
                y: [0, -80, -160]
              }}
              transition={{
                duration: 6,
                delay: i * 0.5,
                repeat: Infinity
              }}
            />
          ))}

          {/* 粉碎效果粒子 */}
          {[...Array(15)].map((_, i) => (
            <motion.div
              key={`particle-${i}`}
              className="absolute w-1 h-1 bg-orange-300 rounded-full"
              style={{
                left: `${40 + (i % 5) * 8}%`,
                top: `${45 + Math.floor(i / 5) * 8}%`
              }}
              initial={{ scale: 0, opacity: 0 }}
              animate={{
                scale: [0, 1, 0],
                opacity: [0, 1, 0],
                x: [0, (i % 2 === 0 ? 30 : -30)],
                y: [0, (i % 3 === 0 ? 20 : -20)]
              }}
              transition={{
                duration: 2,
                delay: 3 + i * 0.1,
                repeat: Infinity,
                repeatDelay: 1
              }}
            />
          ))}

          {/* 血迹效果 */}
          {[...Array(5)].map((_, i) => (
            <motion.div
              key={`blood-${i}`}
              className="absolute bg-red-800 rounded-full opacity-60"
              style={{
                width: `${4 + i * 2}px`,
                height: `${3 + i * 2}px`,
                left: `${50 + (i % 3) * 10}%`,
                top: `${50 + Math.floor(i / 3) * 8}%`
              }}
              initial={{ scale: 0, opacity: 0 }}
              animate={{
                scale: [0, 1, 0.8],
                opacity: [0, 0.6, 0.3]
              }}
              transition={{
                duration: 2,
                delay: 3.5 + i * 0.3
              }}
            />
          ))}
          {/* 历史教训文字 */}
          <motion.div
            className="absolute bottom-24 sm:bottom-28 left-1/2 transform -translate-x-1/2 text-center z-20"
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 2, delay: 3 }}
          >
            <div className="text-yellow-400 text-lg sm:text-xl font-bold mb-2 drop-shadow-lg">历史教训</div>
            <div className="text-gray-400 text-xs sm:text-sm max-w-md px-4 drop-shadow-lg bg-black/30 rounded-lg py-2">
              这场事件深刻影响了中国政治格局，成为历史的重要转折点
            </div>
          </motion.div>
        </div>
      )
    }
  ];

  const startStory = () => {
    setIsPlaying(true);
    setCurrentScene(0);
  };

  const nextScene = () => {
    if (currentScene < scenes.length - 1) {
      setCurrentScene(currentScene + 1);
    } else {
      setIsPlaying(false);
      setCurrentScene(0);
    }
  };

  const prevScene = () => {
    if (currentScene > 0) {
      setCurrentScene(currentScene - 1);
    }
  };

  useEffect(() => {
    if (isPlaying && currentScene < scenes.length - 1) {
      const timer = setTimeout(() => {
        nextScene();
      }, isMobile ? 4000 : 6000); // 移动端4秒，桌面端6秒
      return () => clearTimeout(timer);
    }
  }, [currentScene, isPlaying, isMobile]);

  if (!isPlaying) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 px-4">
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="text-center w-full max-w-4xl"
        >
          <motion.h1
            className="text-4xl sm:text-5xl md:text-6xl font-bold text-white mb-4 sm:mb-6 md:mb-8 px-2"
            animate={{ 
              textShadow: [
                "0 0 20px rgba(255,255,255,0.5)",
                "0 0 40px rgba(255,255,255,0.8)",
                "0 0 20px rgba(255,255,255,0.5)"
              ]
            }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            九·一三事件
          </motion.h1>
          <motion.p className="text-base sm:text-lg md:text-xl text-gray-300 mb-6 sm:mb-8 max-w-2xl mx-auto px-4 leading-relaxed">
            1971年9月13日，林虎将军乘坐256号三叉戟专机在蒙古温都尔汗坠机身亡，飞机和老虎都被跌得粉碎，这场震惊中外的"九·一三"事件成为历史的重要转折点...
          </motion.p>
          <motion.button
            onClick={startStory}
            className="px-6 sm:px-8 py-3 sm:py-4 bg-gradient-to-r from-orange-500 to-red-500 text-white font-bold rounded-lg text-lg sm:text-xl shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300 w-full max-w-xs sm:max-w-none"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            开始冒险
          </motion.button>
        </motion.div>
      </div>
    );
  }

  const currentSceneData = scenes[currentScene];

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* 背景 */}
      <motion.div
        className="absolute inset-0"
        style={{ background: currentSceneData.background }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1 }}
      />
      
      {/* 场景内容 */}
      <div 
        className="relative z-10 h-screen"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {currentSceneData.elements}
        
        {/* 场景信息 */}
        <motion.div
          className={`absolute left-4 sm:left-8 right-4 sm:right-8 text-center z-10 ${
            currentScene === 4 ? 'top-4 sm:top-8' : 'top-4 sm:top-8'
          }`}
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.8 }}
        >
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-2 sm:mb-4 drop-shadow-lg px-2">
            {currentSceneData.title}
          </h2>
          <p className={`text-white/90 max-w-2xl mx-auto drop-shadow-lg px-4 leading-relaxed ${
            currentScene === 4 ? 'text-xs sm:text-sm bg-black/40 rounded-lg py-2' : 'text-sm sm:text-base md:text-xl'
          }`}>
            {currentSceneData.description}
          </p>
        </motion.div>

        {/* 进度指示器 */}
        <div className={`absolute left-1/2 transform -translate-x-1/2 ${
          currentScene === 4 ? 'bottom-8 sm:bottom-12' : 'bottom-4 sm:bottom-8'
        }`}>
          <div className="flex space-x-1 sm:space-x-2">
            {scenes.map((_, index) => (
              <motion.div
                key={index}
                className={`w-2 h-2 sm:w-3 sm:h-3 rounded-full ${
                  index === currentScene ? 'bg-white' : 'bg-white/30'
                }`}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: index * 0.1 }}
              />
            ))}
          </div>
        </div>

        {/* 控制按钮 */}
        <div className={`absolute right-4 sm:right-8 flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-4 ${
          currentScene === 4 ? 'bottom-8 sm:bottom-12' : 'bottom-4 sm:bottom-8'
        }`}>
          <motion.button
            onClick={prevScene}
            disabled={currentScene === 0}
            className={`px-3 sm:px-4 py-2 rounded-lg font-semibold text-sm sm:text-base ${
              currentScene === 0
                ? 'bg-gray-400 text-gray-600 cursor-not-allowed'
                : 'bg-white/20 text-white hover:bg-white/30'
            }`}
            whileHover={currentScene > 0 ? { scale: 1.05 } : {}}
            whileTap={currentScene > 0 ? { scale: 0.95 } : {}}
          >
            上一幕
          </motion.button>
          <motion.button
            onClick={nextScene}
            className="px-3 sm:px-4 py-2 bg-white/20 text-white rounded-lg font-semibold hover:bg-white/30 text-sm sm:text-base"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            {currentScene === scenes.length - 1 ? '重新开始' : '下一幕'}
          </motion.button>
        </div>

        {/* 退出按钮 */}
        <motion.button
          onClick={() => setIsPlaying(false)}
          className="absolute top-4 sm:top-8 right-4 sm:right-8 px-3 sm:px-4 py-2 bg-white/20 text-white rounded-lg font-semibold hover:bg-white/30 text-sm sm:text-base"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          退出
        </motion.button>
      </div>
    </div>
  );
};

export default TigerAdventure; 