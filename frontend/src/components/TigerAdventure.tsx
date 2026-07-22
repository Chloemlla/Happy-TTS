import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaChevronLeft, FaChevronRight, FaGamepad, FaPlay, FaTimes } from 'react-icons/fa';
import {
  InfoBadge,
  InfoPanel,
  InfoPrimaryButton,
  InfoQueryHero,
  InfoQueryShell
} from './LogShareStyleScaffold';

const tigerGlassButtonClass = 'inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white/90 px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm backdrop-blur-xl transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-45';
const tigerScenePanelClass = 'rounded-[28px] border border-white/70 bg-white/90 shadow-[0_18px_60px_rgba(15,23,42,0.12)] backdrop-blur-xl';

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

  // 检测移动设备 - 改进的响应式检测
  useEffect(() => {
    const checkMobile = () => {
      // 使用更精确的移动设备检测
      const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      const isSmallScreen = window.innerWidth < 768;
      setIsMobile(isMobileDevice || isSmallScreen);
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
    // 根据屏幕尺寸调整滑动阈值
    const swipeThreshold = isMobile ? 30 : 50;
    const isLeftSwipe = distance > swipeThreshold;
    const isRightSwipe = distance < -swipeThreshold;

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
            className="absolute bottom-20 left-1/2 transform -translate-x-1/2 w-64 sm:w-80 md:w-96 h-6 sm:h-8 bg-brown-800 rounded-lg shadow-lg"
            initial={{ scaleX: 0, y: 50, opacity: 0 }}
            animate={{ scaleX: 1, y: 0, opacity: 1 }}
            transition={{ duration: 1.5, ease: "easeOut" }}
          />
          {/* 林虎将军在会议桌前 */}
          <motion.div
            className="absolute w-12 h-8 sm:w-16 sm:h-12"
            style={{ left: '30%', bottom: '35%' }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ 
              scale: 1, 
              opacity: 1,
              y: [0, -5, 0],
              rotateY: [0, 5, 0]
            }}
            transition={{
              scale: { duration: 0.8, ease: "easeOut" },
              opacity: { duration: 0.8, ease: "easeOut" },
              default: { duration: 3, ease: "easeInOut", repeat: Infinity }
            }}
          >
            <div className="w-full h-full bg-orange-500 rounded-lg relative shadow-lg">
              {/* 军帽 */}
              <motion.div 
                className="absolute -top-2 left-1/2 transform -translate-x-1/2 w-8 h-2 bg-green-600 rounded-t-lg"
                initial={{ y: -10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.3 }}
              />
              {/* 军装领子 */}
              <motion.div 
                className="absolute top-0 left-1/2 transform -translate-x-1/2 w-6 h-1 bg-green-600 rounded-b-sm"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.4, delay: 0.4 }}
              />
              <motion.div 
                className="absolute top-1 left-2 w-2 h-2 bg-black rounded-full"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.3, delay: 0.5 }}
              />
              <motion.div 
                className="absolute top-1 right-2 w-2 h-2 bg-black rounded-full"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.3, delay: 0.55 }}
              />
              <motion.div 
                className="absolute bottom-1 left-1/2 transform -translate-x-1/2 w-8 h-1 bg-black rounded-full"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.4, delay: 0.6 }}
              />
              <motion.div 
                className="absolute top-2 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-black rounded-full"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.3, delay: 0.65 }}
              />
              {/* 军衔星徽 */}
              <motion.div 
                className="absolute -top-1 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-yellow-400 rounded-full"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.5, delay: 0.7 }}
              />
              {/* 军装扣子 */}
              <motion.div 
                className="absolute top-3 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-yellow-400 rounded-full"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.3, delay: 0.75 }}
              />
            </div>
          </motion.div>
          {/* 阴谋文件 */}
          {[...Array(3)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-6 h-8 sm:w-8 sm:h-10 bg-yellow-100 rounded shadow-md"
              style={{
                left: `${50 + i * 10}%`,
                bottom: '30%'
              }}
              initial={{ scale: 0, rotate: -45, y: 20, opacity: 0 }}
              animate={{ 
                scale: [0, 1, 0.8],
                rotate: [-45, 0, 5],
                y: [20, 0, -10, 0],
                opacity: 1
              }}
              transition={{
                scale: { duration: 0.6, ease: "easeOut" },
                opacity: { duration: 0.6, ease: "easeOut" },
                default: { duration: 2, delay: 0.8 + i * 0.2, repeat: Infinity, repeatType: "reverse" }
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
            initial={{ scaleY: 0, opacity: 0 }}
            animate={{ scaleY: 1, opacity: 0.2 }}
            transition={{ duration: 1.5, delay: 1 }}
          />
          {/* 神秘光线效果 */}
          <motion.div
            className="absolute top-0 left-1/4 w-32 h-32 bg-red-500 rounded-full blur-3xl opacity-10"
            animate={{
              scale: [1, 1.5, 1],
              opacity: [0.1, 0.2, 0.1]
            }}
            transition={{
              duration: 4,
              repeat: Infinity,
              ease: "easeInOut"
            }}
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
            transition={{ duration: 1.5 }}
          />
          {/* 建筑群 */}
          {[...Array(5)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-6 h-12 sm:w-8 sm:h-16 bg-gray-700 rounded-t-lg shadow-lg"
              style={{
                left: `${20 + i * 15}%`,
                bottom: '20%'
              }}
              initial={{ scaleY: 0, y: 50, opacity: 0 }}
              animate={{ 
                scaleY: 1, 
                y: 0, 
                opacity: 1 
              }}
              transition={{ 
                scaleY: { duration: 0.8, ease: "easeOut" },
                opacity: { duration: 0.8, ease: "easeOut" },
                default: { duration: 1, delay: i * 0.1 }
              }}
            >
              <motion.div 
                className="w-full h-1 sm:h-2 bg-yellow-400"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.5, delay: 0.5 + i * 0.1 }}
              />
              <motion.div 
                className="w-full h-1 sm:h-2 bg-yellow-400 mt-1 sm:mt-2"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.5, delay: 0.6 + i * 0.1 }}
              />
              <motion.div 
                className="w-full h-1 sm:h-2 bg-yellow-400 mt-1 sm:mt-2"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.5, delay: 0.7 + i * 0.1 }}
              />
            </motion.div>
          ))}
          {/* 林虎将军在暗中观察 */}
          <motion.div
            className="absolute w-10 h-6 sm:w-12 sm:h-8"
            style={{ left: '10%', top: '60%' }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ 
              scale: 1, 
              x: [0, 20, 0],
              opacity: [0.3, 1, 0.3]
            }}
            transition={{
              scale: { duration: 0.6, ease: "easeOut" },
              opacity: { duration: 0.6, ease: "easeOut" },
              default: { duration: 4, ease: "easeInOut", repeat: Infinity }
            }}
          >
            <div className="w-full h-full bg-orange-500 rounded-lg relative shadow-lg">
              {/* 军帽 */}
              <motion.div 
                className="absolute -top-2 left-1/2 transform -translate-x-1/2 w-6 h-1 bg-green-600 rounded-t-sm"
                initial={{ y: -5, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.4, delay: 1.2 }}
              />
              {/* 军装领子 */}
              <motion.div 
                className="absolute top-0 left-1/2 transform -translate-x-1/2 w-4 h-1 bg-green-600 rounded-b-sm"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.3, delay: 1.3 }}
              />
              <motion.div 
                className="absolute top-1 left-2 w-2 h-2 bg-black rounded-full"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.2, delay: 1.4 }}
              />
              <motion.div 
                className="absolute top-1 right-2 w-2 h-2 bg-black rounded-full"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.2, delay: 1.45 }}
              />
              <motion.div 
                className="absolute bottom-1 left-1/2 transform -translate-x-1/2 w-6 h-1 bg-black rounded-full"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.3, delay: 1.5 }}
              />
              {/* 军衔星徽 */}
              <motion.div 
                className="absolute -top-1 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-yellow-400 rounded-full"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.4, delay: 1.6 }}
              />
              {/* 军装扣子 */}
              <motion.div 
                className="absolute top-3 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-yellow-400 rounded-full"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.2, delay: 1.65 }}
              />
            </div>
          </motion.div>
          {/* 探听情报的符号 */}
          {[...Array(3)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-4 h-4 bg-red-500 rounded-full opacity-60 shadow-md"
              style={{
                left: `${70 + i * 5}%`,
                top: `${30 + i * 10}%`
              }}
              initial={{ scale: 0, opacity: 0 }}
              animate={{
                scale: [0, 1, 0],
                opacity: [0, 0.6, 0]
              }}
              transition={{
                scale: { duration: 0.5, ease: "easeOut" },
                opacity: { duration: 0.5, ease: "easeOut" },
                default: { duration: 2, delay: 1.8 + i * 0.3, repeat: Infinity }
              }}
            />
          ))}
          {/* 太阳 */}
          <motion.div
            className="absolute w-12 h-12 sm:w-16 sm:h-16 bg-yellow-400 rounded-full shadow-lg"
            style={{ right: '10%', top: '10%' }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{
              scale: 1,
              opacity: 1,
              rotate: 360
            }}
            transition={{
              scale: { duration: 1, ease: "easeOut" },
              opacity: { duration: 1, ease: "easeOut" },
              default: { duration: 10, repeat: Infinity, ease: "linear" }
            }}
          >
            {/* 太阳光芒 */}
            {[...Array(8)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute w-1 h-4 bg-yellow-300 rounded-full"
                style={{
                  left: '50%',
                  top: '-10%',
                  transformOrigin: '50% 600%',
                  transform: `rotate(${i * 45}deg)`
                }}
                animate={{
                  scaleY: [1, 1.5, 1]
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  delay: i * 0.1
                }}
              />
            ))}
          </motion.div>
          {/* 热浪效果 */}
          <motion.div
            className="absolute inset-0 pointer-events-none"
            animate={{
              opacity: [0.1, 0.2, 0.1]
            }}
            transition={{
              duration: 3,
              repeat: Infinity
            }}
          >
            {[...Array(15)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute w-24 h-1 bg-white/20 blur-sm"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `${25 + Math.random() * 50}%`,
                }}
                animate={{
                  x: [0, (Math.random() - 0.5) * 100],
                }}
                transition={{
                  duration: 3 + Math.random() * 5,
                  repeat: Infinity,
                  ease: "linear"
                }}
              />
            ))}
          </motion.div>
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
            initial={{ opacity: 0, scaleX: 0 }}
            animate={{ opacity: 1, scaleX: 1 }}
            transition={{ 
              opacity: { duration: 2 },
              scaleX: { duration: 0.3, delay: 0.2 }
            }}
          />
          <motion.div 
            className="absolute top-1/2 left-1/4 w-8 h-1 bg-gray-400 transform -translate-y-1/2 rotate-12"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.3, delay: 0.3 }}
          />
          {/* 警卫阻拦效果 */}
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
            initial={{ scaleY: 0, opacity: 0 }}
            animate={{ scaleY: 1, opacity: 1 }}
            transition={{ 
              scaleY: { duration: 1.5, ease: "easeOut" },
              opacity: { duration: 1.5, ease: "easeOut" }
            }}
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
              initial={{ scaleY: 0, opacity: 0 }}
              animate={{ scaleY: 1, opacity: 1 }}
              transition={{ 
                scaleY: { duration: 0.8, delay: i * 0.05 },
                opacity: { duration: 0.8, delay: i * 0.05 }
              }}
            />
          ))}
          {/* 坠落的256号专机 */}
          <motion.div
            className="absolute w-32 h-8 sm:w-40 sm:h-10 bg-red-800 rounded-lg shadow-lg"
            style={{ left: '40%', top: '15%' }}
            initial={{ x: 0, y: -100, rotate: 0, opacity: 0 }}
            animate={{
              x: [0, 80, -80],
              y: [0, 150, 300],
              rotate: [0, 60, 120],
              opacity: [0, 1, 1, 0]
            }}
            transition={{
              x: { duration: 5, ease: "easeIn" },
              y: { duration: 5, ease: "easeIn" },
              rotate: { duration: 5, ease: "easeIn" },
              opacity: { duration: 5, ease: "easeIn" }
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
            initial={{ x: 0, y: -100, rotate: 0, scale: 1, opacity: 0 }}
            animate={{
              x: [0, 80, -80],
              y: [0, 150, 300],
              rotate: [0, 60, 120],
              scale: [1, 0.8, 0.5],
              opacity: [0, 1, 1, 0]
            }}
            transition={{
              x: { duration: 5, ease: "easeIn" },
              y: { duration: 5, ease: "easeIn" },
              rotate: { duration: 5, ease: "easeIn" },
              scale: { duration: 5, ease: "easeIn" },
              opacity: { duration: 5, ease: "easeIn" }
            }}
          >
            <div className="w-full h-full bg-orange-500 rounded-lg relative shadow-lg">
              {/* 军帽 */}
              <motion.div 
                className="absolute -top-2 left-1/2 transform -translate-x-1/2 w-6 h-1 bg-green-600 rounded-t-sm"
                initial={{ y: -5, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.3, delay: 0.2 }}
              />
              {/* 军装领子 */}
              <motion.div 
                className="absolute top-0 left-1/2 transform -translate-x-1/2 w-4 h-1 bg-green-600 rounded-b-sm"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.2, delay: 0.3 }}
              />
              <motion.div 
                className="absolute top-1 left-2 w-2 h-2 bg-black rounded-full"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.1, delay: 0.4 }}
              />
              <motion.div 
                className="absolute top-1 right-2 w-2 h-2 bg-black rounded-full"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.1, delay: 0.45 }}
              />
              <motion.div 
                className="absolute bottom-1 left-1/2 transform -translate-x-1/2 w-6 h-1 bg-black rounded-full"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.2, delay: 0.5 }}
              />
              {/* 军衔星徽 */}
              <motion.div 
                className="absolute -top-1 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-yellow-400 rounded-full"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.3, delay: 0.6 }}
              />
              {/* 军装扣子 */}
              <motion.div 
                className="absolute top-3 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-yellow-400 rounded-full"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.1, delay: 0.65 }}
              />
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
              className="absolute w-6 h-8 sm:w-8 sm:h-12 bg-orange-500 rounded-t-full shadow-lg"
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
          {/* 地面冲击波 */}
          <motion.div
            className="absolute w-full h-4 bg-orange-400/30"
            style={{ bottom: '40%' }}
            initial={{ scaleX: 0, opacity: 0 }}
            animate={{ 
              scaleX: 1, 
              opacity: [0, 0.7, 0] 
            }}
            transition={{ 
              scaleX: { duration: 1, delay: 4 },
              opacity: { duration: 1, delay: 4 }
            }}
          />
          {/* 碎片飞溅效果 */}
          {[...Array(15)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-2 h-2 bg-gray-500 rounded-full"
              style={{
                left: '50%',
                top: '70%'
              }}
              initial={{ 
                scale: 0, 
                opacity: 0,
                x: 0,
                y: 0
              }}
              animate={{ 
                scale: [0, 1, 0],
                opacity: [0, 1, 0],
                x: (Math.random() - 0.5) * 200,
                y: (Math.random() - 0.5) * 200
              }}
              transition={{ 
                duration: 2, 
                delay: 4 + Math.random() * 0.5 
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
            transition={{ 
              opacity: { duration: 1.5, ease: "easeOut" }
            }}
          />
          {/* 飞机残骸碎片 */}
          {[...Array(12)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-6 h-6 bg-gray-700 rounded shadow-lg"
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
                scale: { duration: 0.8, ease: "easeOut" },
                rotate: { duration: 4 },
                opacity: { duration: 0.8, ease: "easeOut" },
                default: { delay: i * 0.1 }
              }}
            >
              <motion.div 
                className="w-full h-1 bg-gray-500 mt-1"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.3, delay: 0.5 + i * 0.1 }}
              />
              <motion.div 
                className="w-2/3 h-1 bg-gray-500 mt-1 mx-auto"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.3, delay: 0.6 + i * 0.1 }}
              />
            </motion.div>
          ))}

          {/* 林虎将军的碎片 */}
          {[...Array(8)].map((_, i) => (
            <motion.div
              key={`tiger-${i}`}
              className="absolute bg-orange-500 rounded shadow-lg"
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
                scale: { duration: 0.6, ease: "easeOut" },
                rotate: { duration: 3 },
                opacity: { duration: 0.6, ease: "easeOut" },
                default: { delay: 1 + i * 0.1 }
              }}
            >
              {/* 老虎碎片细节 */}
              {i % 2 === 0 && (
                <motion.div 
                  className="w-1 h-1 bg-black rounded-full mt-1 ml-1"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ duration: 0.2, delay: 1.3 + i * 0.1 }}
                />
              )}
              {i % 3 === 0 && (
                <motion.div 
                  className="w-1 h-1 bg-yellow-400 rounded-full mt-1 mr-1"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ duration: 0.2, delay: 1.4 + i * 0.1 }}
                />
              )}
            </motion.div>
          ))}

          {/* 军装碎片 */}
          {[...Array(6)].map((_, i) => (
            <motion.div
              key={`uniform-${i}`}
              className="absolute bg-green-600 rounded shadow-lg"
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
                scale: { duration: 0.5, ease: "easeOut" },
                rotate: { duration: 2.5 },
                opacity: { duration: 0.5, ease: "easeOut" },
                default: { delay: 1.5 + i * 0.1 }
              }}
            />
          ))}
          {/* 林虎将军的军帽残骸 */}
          <motion.div
            className="absolute w-8 h-3 bg-green-600 rounded-t-lg shadow-lg"
            style={{ left: '50%', top: '40%' }}
            initial={{ scale: 0, rotate: 0, opacity: 0 }}
            animate={{
              scale: [0, 1, 0.8],
              rotate: [0, 45, 90],
              opacity: [0, 1, 0.6],
              x: [0, 30, -30],
              y: [0, 20, -20]
            }}
            transition={{
              scale: { duration: 0.8, ease: "easeOut" },
              rotate: { duration: 4 },
              opacity: { duration: 0.8, ease: "easeOut" },
              default: { delay: 2 }
            }}
          />
          {/* 军衔星徽残骸 */}
          <motion.div
            className="absolute w-3 h-3 bg-yellow-400 rounded-full shadow-lg"
            style={{ left: '52%', top: '38%' }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{
              scale: [0, 1, 0.5],
              opacity: [0, 1, 0.3],
              x: [0, 25, -25],
              y: [0, 15, -15]
            }}
            transition={{
              scale: { duration: 0.6, ease: "easeOut" },
              opacity: { duration: 0.6, ease: "easeOut" },
              default: { duration: 3, delay: 2.5 }
            }}
          />
          {/* 历史文字效果 */}
          <motion.div
            className="absolute top-16 sm:top-20 left-1/2 transform -translate-x-1/2 text-center"
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ 
              opacity: { duration: 1, ease: "easeOut" },
              y: { duration: 1, ease: "easeOut" },
              default: { delay: 1 }
            }}
          >
            <motion.div 
              className="text-white text-xl sm:text-2xl font-bold mb-2"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.5, delay: 1.5 }}
            >
              九·一三事件
            </motion.div>
            <motion.div 
              className="text-gray-300 text-base sm:text-lg"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.5, delay: 1.7 }}
            >
              1971年9月13日
            </motion.div>
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
              initial={{ scale: 0, opacity: 0 }}
              animate={{
                scale: [0, 2, 0],
                opacity: [0, 0.4, 0],
                y: [0, -80, -160]
              }}
              transition={{
                scale: { duration: 1, ease: "easeOut" },
                opacity: { duration: 1, ease: "easeOut" },
                y: { duration: 6 },
                default: { delay: i * 0.3, repeat: Infinity }
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
                scale: { duration: 0.5, ease: "easeOut" },
                opacity: { duration: 0.5, ease: "easeOut" },
                x: { duration: 2 },
                y: { duration: 2 },
                default: { delay: 3 + i * 0.1, repeat: Infinity, repeatDelay: 1 }
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
                scale: { duration: 0.8, ease: "easeOut" },
                opacity: { duration: 0.8, ease: "easeOut" },
                default: { delay: 3.5 + i * 0.2 }
              }}
            />
          ))}
          {/* 历史教训文字 */}
          <motion.div
            className="absolute bottom-24 sm:bottom-28 left-1/2 transform -translate-x-1/2 text-center z-20"
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ 
              opacity: { duration: 1, ease: "easeOut" },
              y: { duration: 1, ease: "easeOut" },
              default: { delay: 3 }
            }}
          >
            <motion.div 
              className="text-yellow-400 text-lg sm:text-xl font-bold mb-2 drop-shadow-lg"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.5, delay: 3.5 }}
            >
              历史教训
            </motion.div>
            <motion.div 
              className="text-gray-400 text-xs sm:text-sm max-w-md px-4 drop-shadow-lg bg-black/30 rounded-lg py-2"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.5, delay: 3.7 }}
            >
              这场事件深刻影响了中国政治格局，成为历史的重要转折点
            </motion.div>
          </motion.div>
          {/* 庄严氛围光效 */}
          <motion.div
            className="absolute inset-0 pointer-events-none bg-gradient-to-t from-yellow-400/10 to-transparent"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.3, 0] }}
            transition={{ duration: 4, repeat: Infinity, delay: 2 }}
          />
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
      // 根据屏幕尺寸和用户交互调整自动播放时间
      const autoPlayDuration = isMobile ? 3500 : 5500;
      const timer = setTimeout(() => {
        nextScene();
      }, autoPlayDuration);
      return () => clearTimeout(timer);
    }
  }, [currentScene, isPlaying, isMobile]);

  if (!isPlaying) {
    return (
      <InfoQueryShell>
        <motion.div
          className="space-y-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <InfoQueryHero
            eyebrow="Entertainment"
            title="九·一三事件"
            description="以连续场景形式播放的互动冒险，支持自动推进、手动切换和移动端滑动操作。"
            icon={FaGamepad}
            tone="rose"
            meta={
              <>
                <InfoBadge tone="rose">剧情场景</InfoBadge>
                <InfoBadge tone="amber">{scenes.length} 幕</InfoBadge>
                <InfoBadge tone="sky">{isMobile ? '移动端适配' : '桌面端适配'}</InfoBadge>
              </>
            }
            actions={
              <InfoPrimaryButton onClick={startStory} tone="rose">
                <FaPlay className="h-4 w-4" />
                开始冒险
              </InfoPrimaryButton>
            }
          />

          <InfoPanel>
            <div className="grid gap-4 md:grid-cols-3">
              {scenes.slice(0, 3).map((scene, index) => (
                <motion.div
                  key={scene.id}
                  className="rounded-[24px] border border-white/70 bg-white/90 p-4 shadow-[0_10px_32px_rgba(15,23,42,0.06)] backdrop-blur"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 * index }}
                  whileHover={{ y: -3 }}
                >
                  <div
                    className="mb-4 h-24 rounded-[20px] border border-white/60"
                    style={{ background: scene.background }}
                  />
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Scene {index + 1}
                  </div>
                  <h3 className="mt-2 text-base font-semibold text-slate-950">{scene.title}</h3>
                  <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">{scene.description}</p>
                </motion.div>
              ))}
            </div>
          </InfoPanel>
        </motion.div>
      </InfoQueryShell>
    );
  }

  const currentSceneData = scenes[currentScene];

  return (
    <div className="relative min-h-[min(100svh,720px)] overflow-hidden md:h-[calc(100svh-3.5rem)] md:min-h-0">
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
        className="relative z-10 h-full min-h-[min(100svh,720px)] w-full md:min-h-0"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {currentSceneData.elements}
        
        {/* 场景信息 */}
        <motion.div
          className={`absolute left-4 right-4 z-10 mx-auto max-w-4xl px-4 py-4 text-center text-slate-900 xs:left-6 xs:right-6 sm:left-8 sm:right-8 ${tigerScenePanelClass} ${
            currentScene === 4 ? 'top-20 sm:top-8' : 'top-20 sm:top-8'
          }`}
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.8 }}
        >
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
            Scene {currentScene + 1} / {scenes.length}
          </div>
          <h2 className="px-2 text-xl font-semibold text-slate-900 xs:text-2xl sm:mb-2 sm:text-3xl md:text-4xl">
            {currentSceneData.title}
          </h2>
          <p className={`mx-auto max-w-2xl px-2 leading-relaxed text-slate-600 ${
            currentScene === 4 ? 'text-xs xs:text-xs sm:text-sm' : 'text-xs xs:text-sm sm:text-base md:text-xl'
          }`}>
            {currentSceneData.description}
          </p>
        </motion.div>

        {/* 进度指示器 */}
        <div className={`absolute left-1/2 z-20 transform -translate-x-1/2 ${
          currentScene === 4 ? 'bottom-6 xs:bottom-7 sm:bottom-12' : 'bottom-4 xs:bottom-5 sm:bottom-8'
        }`}>
          <div className="flex space-x-1 rounded-full border border-slate-200 bg-white/90 px-3 py-2 shadow-sm backdrop-blur-xl xs:space-x-1.5 sm:space-x-2">
            {scenes.map((_, index) => (
              <motion.div
                key={index}
                className={`h-1.5 w-1.5 rounded-full ring-1 ring-slate-200 xs:h-2 xs:w-2 sm:h-3 sm:w-3 ${
                  index === currentScene ? 'bg-slate-900' : 'bg-slate-200'
                }`}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: index * 0.1 }}
              />
            ))}
          </div>
        </div>

        {/* 控制按钮 */}
        <div className={`absolute right-4 z-20 flex flex-col space-y-2 xs:right-6 xs:flex-row xs:space-x-3 xs:space-y-0 sm:right-8 sm:space-x-4 ${
          currentScene === 4 ? 'bottom-6 xs:bottom-7 sm:bottom-12' : 'bottom-4 xs:bottom-5 sm:bottom-8'
        }`}>
          <motion.button
            onClick={prevScene}
            disabled={currentScene === 0}
            className={tigerGlassButtonClass}
            whileHover={currentScene > 0 ? { scale: 1.05 } : {}}
            whileTap={currentScene > 0 ? { scale: 0.95 } : {}}
          >
            <FaChevronLeft className="h-3 w-3" />
            上一幕
          </motion.button>
          <motion.button
            onClick={nextScene}
            className={tigerGlassButtonClass}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            {currentScene === scenes.length - 1 ? '重新开始' : '下一幕'}
            <FaChevronRight className="h-3 w-3" />
          </motion.button>
        </div>

        {/* 退出按钮 */}
        <motion.button
          onClick={() => setIsPlaying(false)}
          className={`${tigerGlassButtonClass} absolute right-4 top-4 z-20 xs:right-6 xs:top-6 sm:right-8 sm:top-8`}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <FaTimes className="h-3 w-3" />
          退出
        </motion.button>
      </div>
    </div>
  );
};

export default TigerAdventure; 
