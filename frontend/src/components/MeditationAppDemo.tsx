import React, { useEffect, useRef, Activity } from 'react';
import {
  Home, Star, BarChart3, User, ChevronLeft, ChevronRight, MoreHorizontal,
  Search, Settings, Play, RotateCcw, Pause, Square, Plus, Minus,
  Heart, CloudRain, Waves, Trees, Moon, Radio as RadioIcon, Flame,
  Mountain, Bug, Bell, LogOut, Trophy, Award, Sunrise, Crown, CheckCircle
} from 'lucide-react';
import { FaLeaf } from 'react-icons/fa';
import {
  InfoBadge,
  InfoPanel,
  InfoQueryHero,
  InfoQueryShell,
  logShareSecondaryButtonClass,
} from './LogShareStyleScaffold';

// 冥想APP UI展示页面
const MeditationAppDemo: React.FC = () => {
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  
  // 交互状态 - 屏幕切换
  const [activeScreen, setActiveScreen] = React.useState(0); // 0-8代表9个屏幕
  
  // 其他交互状态
  const [selectedCategory, setSelectedCategory] = React.useState('全部');
  const [likedScenes, setLikedScenes] = React.useState<Set<string>>(new Set(['雨声', '森林', '山谷风', '音钵']));
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [breathingEnabled, setBreathingEnabled] = React.useState(true);
  const [volume, setVolume] = React.useState(75);
  const [vibration, setVibration] = React.useState(false);
  const [brightness, setBrightness] = React.useState(50);
  const [dailyReminder, setDailyReminder] = React.useState(true);
  const [dataSync, setDataSync] = React.useState(true);
  const [currentDuration, setCurrentDuration] = React.useState(20);
  const [currentMonth, setCurrentMonth] = React.useState(10);
  
  // 设置Canvas引用
  const setCanvasRef = (index: number) => (el: HTMLCanvasElement | null) => {
    canvasRefs.current[index] = el;
  };

  // 切换喜欢状态
  const toggleLike = (sceneName: string) => {
    setLikedScenes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sceneName)) {
        newSet.delete(sceneName);
      } else {
        newSet.add(sceneName);
      }
      return newSet;
    });
  };

  // 调整时长
  const adjustDuration = (delta: number) => {
    setCurrentDuration(prev => Math.max(5, Math.min(60, prev + delta)));
  };

  // 切换月份
  const changeMonth = (delta: number) => {
    setCurrentMonth(prev => {
      let newMonth = prev + delta;
      if (newMonth < 1) newMonth = 12;
      if (newMonth > 12) newMonth = 1;
      return newMonth;
    });
  };

  // Canvas动画效果
  useEffect(() => {
    // 第2屏: 雨滴动画
    const rainCanvas = canvasRefs.current[1];
    if (rainCanvas) {
      const ctx = rainCanvas.getContext('2d');
      if (ctx) {
        rainCanvas.width = 360;
        rainCanvas.height = 780;
        
        const raindrops = Array.from({ length: 60 }, () => ({
          x: Math.random() * 360,
          y: Math.random() * 780,
          length: Math.random() * 20 + 10,
          speed: Math.random() * 3 + 2
        }));

        const animateRain = () => {
          ctx.clearRect(0, 0, 360, 780);
          ctx.strokeStyle = 'rgba(255,255,255,0.3)';
          ctx.lineWidth = 2;

          raindrops.forEach(drop => {
            ctx.beginPath();
            ctx.moveTo(drop.x, drop.y);
            ctx.lineTo(drop.x, drop.y + drop.length);
            ctx.stroke();

            drop.y += drop.speed;
            if (drop.y > 780) {
              drop.y = -drop.length;
              drop.x = Math.random() * 360;
            }
          });

          requestAnimationFrame(animateRain);
        };

        animateRain();
      }
    }

    // 第2屏: 计时器圆环
    const timerCanvas = canvasRefs.current[2];
    if (timerCanvas) {
      const ctx = timerCanvas.getContext('2d');
      if (ctx) {
        timerCanvas.width = 280;
        timerCanvas.height = 280;

        let progress = 0;
        const targetProgress = 0.6;

        const drawCircle = () => {
          ctx.clearRect(0, 0, 280, 280);
          const centerX = 140;
          const centerY = 140;
          const radius = 130;

          // 背景环
          ctx.beginPath();
          ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(255,255,255,0.2)';
          ctx.lineWidth = 8;
          ctx.stroke();

          // 进度环
          ctx.beginPath();
          ctx.arc(centerX, centerY, radius, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * progress));
          ctx.strokeStyle = 'white';
          ctx.lineWidth = 8;
          ctx.lineCap = 'round';
          ctx.stroke();

          if (progress < targetProgress) {
            progress += 0.01;
            requestAnimationFrame(drawCircle);
          }
        };

        drawCircle();
      }
    }

    // 第3屏: 烟花粒子动画
    const fireworkCanvas = canvasRefs.current[3];
    if (fireworkCanvas) {
      const ctx = fireworkCanvas.getContext('2d');
      if (ctx) {
        fireworkCanvas.width = 360;
        fireworkCanvas.height = 780;

        const particles: Array<{
          x: number;
          y: number;
          vx: number;
          vy: number;
          alpha: number;
          color: string;
        }> = [];

        const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#F7B731', '#5F27CD'];

        const createFirework = () => {
          const x = 180;
          const y = 300;
          for (let i = 0; i < 50; i++) {
            particles.push({
              x,
              y,
              vx: (Math.random() - 0.5) * 6,
              vy: (Math.random() - 0.5) * 6,
              alpha: 1,
              color: colors[Math.floor(Math.random() * colors.length)]
            });
          }
        };

        let lastFirework = 0;

        const animateFireworks = (timestamp: number) => {
          if (timestamp - lastFirework > 2000) {
            createFirework();
            lastFirework = timestamp;
          }

          ctx.clearRect(0, 0, 360, 780);

          particles.forEach((p, index) => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.globalAlpha = p.alpha;
            ctx.fill();

            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.1; // 重力
            p.alpha -= 0.015;

            if (p.alpha <= 0) {
              particles.splice(index, 1);
            }
          });

          ctx.globalAlpha = 1;
          requestAnimationFrame(animateFireworks);
        };

        createFirework();
        requestAnimationFrame(animateFireworks);
      }
    }

    // 第4屏: 柱状图
    const chartCanvas = canvasRefs.current[4];
    if (chartCanvas) {
      const ctx = chartCanvas.getContext('2d');
      if (ctx) {
        chartCanvas.width = 320;
        chartCanvas.height = 200;

        const data = [45, 62, 38, 71, 55, 48, 88];
        const days = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
        const maxValue = Math.max(...data);
        const barWidth = 35;
        const gap = 8;
        const startX = 20;
        const startY = 160;

        ctx.clearRect(0, 0, 320, 200);

        data.forEach((value, index) => {
          const x = startX + index * (barWidth + gap);
          const height = (value / maxValue) * 120;
          const y = startY - height;

          // 绘制柱子
          const gradient = ctx.createLinearGradient(x, y, x, startY);
          if (index === 5) { // 周六高亮
            gradient.addColorStop(0, '#FFD700');
            gradient.addColorStop(1, '#FFED4E');
          } else {
            gradient.addColorStop(0, '#667eea');
            gradient.addColorStop(1, '#764ba2');
          }
          ctx.fillStyle = gradient;
          ctx.fillRect(x, y, barWidth, height);

          // 绘制数值
          ctx.fillStyle = '#2c3e50';
          ctx.font = '12px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(value.toString(), x + barWidth / 2, y - 5);

          // 绘制标签
          ctx.fillStyle = '#95a5a6';
          ctx.font = '11px sans-serif';
          ctx.fillText(days[index], x + barWidth / 2, startY + 20);
        });
      }
    }

    // 第9屏: 气泡上浮动画
    const bubbleCanvas = canvasRefs.current[8];
    if (bubbleCanvas) {
      const ctx = bubbleCanvas.getContext('2d');
      if (ctx) {
        bubbleCanvas.width = 360;
        bubbleCanvas.height = 780;

        const bubbles = Array.from({ length: 20 }, () => ({
          x: Math.random() * 360,
          y: 780 + Math.random() * 100,
          radius: Math.random() * 30 + 10,
          speed: Math.random() * 0.5 + 0.2,
          alpha: Math.random() * 0.3 + 0.1
        }));

        const animateBubbles = () => {
          ctx.clearRect(0, 0, 360, 780);

          bubbles.forEach(bubble => {
            ctx.beginPath();
            ctx.arc(bubble.x, bubble.y, bubble.radius, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255,255,255,${bubble.alpha})`;
            ctx.fill();

            bubble.y -= bubble.speed;

            if (bubble.y + bubble.radius < 0) {
              bubble.y = 780 + bubble.radius;
              bubble.x = Math.random() * 360;
            }
          });

          requestAnimationFrame(animateBubbles);
        };

        animateBubbles();
      }
    }
  }, []);

  return (
    <InfoQueryShell maxWidthClassName="max-w-[1280px]" className="space-y-6">
      <InfoQueryHero
        eyebrow="Demo Center"
        title="冥想 APP UI 展示"
        description="9 个冥想应用屏幕、Canvas 动画、呼吸引导和成就系统集中展示。外层页面已统一为 LogShare 的轻量工具页风格。"
        icon={FaLeaf}
        meta={
          <>
            <InfoBadge>9 个屏幕</InfoBadge>
            <InfoBadge>Canvas 动画</InfoBadge>
            <InfoBadge>React 19 Activity</InfoBadge>
          </>
        }
      />

      <InfoPanel className="overflow-visible">
        {/* 屏幕切换按钮 */}
        <div className="flex items-center justify-center gap-2 mb-8 flex-wrap">
          {['首页', '计时器', '完成', '统计', '成就', '日历', '场景库', '设置', '呼吸'].map((name, idx) => (
            <button
              key={idx}
              onClick={() => setActiveScreen(idx)}
              className={`${logShareSecondaryButtonClass} ${
                activeScreen === idx
                  ? '!border-slate-900 !bg-slate-900 !text-white shadow-sm'
                  : ''
              }`}
            >
              {name}
            </button>
          ))}
        </div>

        {/* 使用Activity优化性能提示 */}
        <div className="mb-8 flex justify-center px-4">
          <div className="inline-flex flex-wrap items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-2 text-sm text-slate-600">
            <span>使用 React 19</span>
            <code className="rounded-lg border border-slate-200 bg-white px-1.5 py-0.5 text-xs text-slate-700">&lt;Activity&gt;</code>
            <span>组件优化性能，保留状态并清理副作用</span>
          </div>
        </div>

        {/* 手机屏幕网格 - 使用Activity包裹每个屏幕 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
          {/* 第1屏: 首页 */}
          <Activity mode={activeScreen === 0 ? 'visible' : 'hidden'}>
            <div className="flex flex-col items-center">
            <h3 className="text-base font-semibold text-[#2c3e50] mb-4">首页 - 场景选择</h3>
            <div className="relative w-[360px] h-[780px] rounded-[35px] border-[10px] border-[#2a2a2a] bg-white overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.3)]">
              {/* 刘海 */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[150px] h-[25px] bg-[#2a2a2a] rounded-b-[12px] z-10" />
              
              {/* 内容 */}
              <div className="h-full overflow-y-auto overflow-x-hidden no-scrollbar bg-[#f5f7fa]">
                {/* 顶部横幅 */}
                <div className="bg-gradient-to-br from-[#667eea] to-[#764ba2] px-5 pt-9 pb-4 text-white">
                  <div className="text-sm opacity-90 mb-2">10月23日 星期三 14:30</div>
                  <div className="text-2xl font-light mb-4">下午好 🌤️</div>
                  
                  {/* 今日冥想卡片 */}
                  <div className="bg-white/20 backdrop-blur-md rounded-[15px] p-4">
                    <div className="text-xs mb-2">今日已冥想</div>
                    <div className="text-[32px] font-extralight">15 <span className="text-base">分钟</span></div>
                    <div className="text-xs opacity-90 mb-2">目标 30 分钟</div>
                    <div className="w-full h-1.5 bg-white/30 rounded-full overflow-hidden">
                      <div className="h-full w-1/2 bg-white rounded-full" />
                    </div>
                  </div>
                </div>

                {/* 深呼吸标题 */}
                <div className="bg-white rounded-[15px] mx-5 my-5 p-6 text-center">
                  <h2 className="text-4xl font-extralight text-[#2c3e50] mb-2">深呼吸</h2>
                  <p className="text-base text-[#95a5a6]">让心灵得到平静</p>
                </div>

                {/* 场景卡片 */}
                <div className="px-5 space-y-3 pb-20">
                  {[
                    { title: '雨声', desc: '聆听雨滴的声音', tag: '自然', plays: '12.3k', color: 'from-[#667eea] to-[#764ba2]' },
                    { title: '海浪', desc: '感受海洋的呼吸', tag: '自然', plays: '8.9k', color: 'from-[#4facfe] to-[#00f2fe]' },
                    { title: '森林', desc: '漫步在绿色之中', tag: '自然', plays: '15.6k', color: 'from-[#56ab2f] to-[#a8e063]' },
                    { title: '夜晚', desc: '享受宁静时光', tag: '氛围', plays: '6.2k', color: 'from-[#2c3e50] to-[#3498db]', height: '100px' }
                  ].map((scene, idx) => (
                    <div 
                      key={idx}
                      className={`relative rounded-[16px] bg-gradient-to-br ${scene.color} overflow-hidden`}
                      style={{ height: scene.height || '200px' }}
                    >
                      <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/60" />
                      <div className="absolute bottom-0 left-0 right-0 p-5 text-white">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-2xl font-light">{scene.title}</h3>
                          <div className="w-10 h-10 rounded-full bg-white/30 backdrop-blur-sm flex items-center justify-center">
                            ▶️
                          </div>
                        </div>
                        <p className="text-sm opacity-90 mb-2">{scene.desc}</p>
                        <div className="flex items-center gap-3 text-xs opacity-80">
                          <span>🏷️ {scene.tag}</span>
                          <span>🎧 {scene.plays}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* 底部导航 */}
                <div className="fixed bottom-0 left-0 right-0 h-[70px] bg-white border-t border-gray-100 flex items-center justify-around shadow-[0_-2px_10px_rgba(0,0,0,0.05)] z-20">
                  {[
                    { icon: Home, label: '首页', active: true },
                    { icon: Star, label: '收藏', active: false },
                    { icon: BarChart3, label: '统计', active: false },
                    { icon: User, label: '我的', active: false }
                  ].map((nav, idx) => (
                    <div key={idx} className="flex flex-col items-center gap-1">
                      <nav.icon className={`w-6 h-6 ${nav.active ? 'text-[#667eea]' : 'text-[#95a5a6]'}`} />
                      <span className={`text-xs ${nav.active ? 'text-[#667eea]' : 'text-[#95a5a6]'}`}>
                        {nav.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            </div>
          </Activity>

          {/* 第2屏: 计时器页面 */}
          <Activity mode={activeScreen === 1 ? 'visible' : 'hidden'}>
            <div className="flex flex-col items-center">
            <h3 className="text-base font-semibold text-[#2c3e50] mb-4">计时器页面</h3>
            <div className="relative w-[360px] h-[780px] rounded-[35px] border-[10px] border-[#2a2a2a] bg-white overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.3)]">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[150px] h-[25px] bg-[#2a2a2a] rounded-b-[12px] z-10" />
              
              <div className="relative h-full bg-gradient-to-br from-[#667eea] to-[#764ba2] overflow-hidden">
                {/* 雨滴背景 */}
                <canvas ref={setCanvasRef(1)} className="absolute inset-0" />
                
                {/* 顶部栏 */}
                <div className="relative z-10 flex items-center justify-between p-5 pt-9 text-white">
                  <button className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <span className="text-lg">雨声</span>
                  <button className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                    <MoreHorizontal className="w-5 h-5" />
                  </button>
                </div>

                {/* 中央计时器 */}
                <div className="relative z-10 flex flex-col items-center justify-center mt-16">
                  <div className="relative">
                    <canvas ref={setCanvasRef(2)} width="280" height="280" />
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <div className="text-7xl font-extralight text-white">20</div>
                      <div className="text-base text-white/80 mt-1">分钟</div>
                      <div className="mt-4 text-[32px]">🌧️</div>
                    </div>
                  </div>

                  {/* 呼吸引导圆圈 */}
                  <div className="mt-12 relative">
                    <div className="w-[100px] h-[100px] rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center animate-[breathe_11s_ease-in-out_infinite]">
                      <span className="text-white text-sm">吸气...</span>
                    </div>
                  </div>

                  {/* 控制按钮 */}
                  <div className="flex items-center gap-5 mt-12">
                    <button 
                      onClick={() => setCurrentDuration(20)}
                      className="w-[50px] h-[50px] rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/30 transition-all"
                    >
                      <RotateCcw className="w-5 h-5" />
                    </button>
                    <button 
                      onClick={() => setIsPlaying(!isPlaying)}
                      className="w-20 h-20 rounded-full bg-white/30 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/40 hover:scale-110 transition-all"
                    >
                      {isPlaying ? <Pause className="w-8 h-8 fill-white" /> : <Play className="w-8 h-8 fill-white" />}
                    </button>
                    <button 
                      onClick={() => setIsPlaying(false)}
                      className="w-[50px] h-[50px] rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/30 transition-all"
                    >
                      <Square className="w-5 h-5" />
                    </button>
                  </div>

                  {/* 设置 */}
                  <div className="mt-12 space-y-4">
                    <div className="flex items-center justify-between px-8 text-white">
                      <span className="text-sm">时长</span>
                      <div className="flex items-center gap-3">
                        <button 
                          onClick={() => adjustDuration(-5)}
                          className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-all"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="text-base w-20 text-center">{currentDuration}分钟</span>
                        <button 
                          onClick={() => adjustDuration(5)}
                          className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-all"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between px-8 text-white">
                      <span className="text-sm">呼吸引导</span>
                      <button 
                        onClick={() => setBreathingEnabled(!breathingEnabled)}
                        className={`w-12 h-6 rounded-full relative transition-colors ${breathingEnabled ? 'bg-[#52c41a]' : 'bg-[#d0d0d0]'}`}
                      >
                        <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${breathingEnabled ? 'right-0.5' : 'left-0.5'}`} />
                      </button>
                    </div>
                    <div className="flex items-center justify-between px-8 text-white">
                      <span className="text-sm">音量</span>
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-1 bg-white/30 rounded-full">
                          <div className="h-full bg-white rounded-full" style={{ width: `${volume}%` }} />
                        </div>
                        <span className="text-xs w-10 text-right">{volume}%</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            </div>
          </Activity>

          {/* 第3屏: 完成页面 */}
          <Activity mode={activeScreen === 2 ? 'visible' : 'hidden'}>
            <div className="flex flex-col items-center">
            <h3 className="text-base font-semibold text-[#2c3e50] mb-4">完成页面</h3>
            <div className="relative w-[360px] h-[780px] rounded-[35px] border-[10px] border-[#2a2a2a] bg-white overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.3)]">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[150px] h-[25px] bg-[#2a2a2a] rounded-b-[12px] z-10" />
              
              <div className="relative h-full bg-gradient-to-br from-[#f5f7fa] to-[#e8eaf6] overflow-y-auto no-scrollbar">
                {/* 烟花背景 */}
                <canvas ref={setCanvasRef(3)} className="absolute inset-0" />
                
                <div className="relative z-10 flex flex-col items-center px-5 pt-20">
                  {/* 成就图标 */}
                  <div className="text-[80px] animate-pulse">🏆</div>
                  
                  {/* 完成信息 */}
                  <h2 className="text-5xl font-extralight text-[#2c3e50] mt-6 mb-2">完成</h2>
                  <div className="text-4xl font-light text-[#667eea] mb-1">20</div>
                  <div className="text-base text-[#95a5a6]">分钟 · 雨声冥想</div>

                  {/* 统计卡片 */}
                  <div className="w-full mt-8 bg-white/80 backdrop-blur-md rounded-[20px] p-6 shadow-lg">
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <div className="text-xs text-[#95a5a6] mb-1">今日总计</div>
                        <div className="text-2xl font-light text-[#2c3e50]">35min</div>
                      </div>
                      <div>
                        <div className="text-xs text-[#95a5a6] mb-1">连续天数</div>
                        <div className="text-2xl font-light text-[#2c3e50]">7天</div>
                      </div>
                      <div>
                        <div className="text-xs text-[#95a5a6] mb-1">累计时长</div>
                        <div className="text-2xl font-light text-[#2c3e50]">127h</div>
                      </div>
                    </div>
                  </div>

                  {/* 激励文字 */}
                  <div className="mt-8 text-center">
                    <h3 className="text-2xl font-light text-[#2c3e50] mb-2">干得漂亮！</h3>
                    <p className="text-sm text-[#95a5a6]">连续冥想3天，继续保持</p>
                  </div>

                  {/* 成就徽章 */}
                  <div className="w-full mt-6 bg-gradient-to-r from-[#ffd700] to-[#ffed4e] rounded-[25px] p-4 text-center">
                    <span className="text-base font-medium text-[#2c3e50]">🌟 解锁新成就：专注新星</span>
                  </div>

                  {/* 操作按钮 */}
                  <div className="w-full mt-8 space-y-3">
                    <button className="w-full py-4 bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white rounded-[25px] text-base font-medium">
                      再来一次
                    </button>
                    <button className="w-full py-4 border-2 border-[#667eea] text-[#667eea] rounded-[25px] text-base font-medium bg-transparent">
                      查看统计
                    </button>
                    <button className="w-full py-2 text-[#95a5a6] text-sm">
                      返回首页
                    </button>
                  </div>
                </div>
              </div>
            </div>
            </div>
          </Activity>

          {/* 第4屏: 统计总览 */}
          <Activity mode={activeScreen === 3 ? 'visible' : 'hidden'}>
            <div className="flex flex-col items-center">
            <h3 className="text-base font-semibold text-[#2c3e50] mb-4">统计总览</h3>
            <div className="relative w-[360px] h-[780px] rounded-[35px] border-[10px] border-[#2a2a2a] bg-white overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.3)]">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[150px] h-[25px] bg-[#2a2a2a] rounded-b-[12px] z-10" />
              
              <div className="h-full overflow-y-auto no-scrollbar bg-[#f5f7fa]">
                {/* 顶部横幅 */}
                <div className="bg-gradient-to-br from-[#667eea] to-[#764ba2] px-5 pt-9 pb-6 text-white">
                  <h2 className="text-2xl font-light mb-4">本周统计</h2>
                  
                  {/* 今日数据 */}
                  <div className="bg-white/20 backdrop-blur-md rounded-[15px] p-4">
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <div className="text-xs opacity-90 mb-1">冥想次数</div>
                        <div className="text-[28px] font-extralight">3</div>
                      </div>
                      <div>
                        <div className="text-xs opacity-90 mb-1">总时长</div>
                        <div className="text-[28px] font-extralight">45min</div>
                      </div>
                      <div>
                        <div className="text-xs opacity-90 mb-1">连续天数</div>
                        <div className="text-[28px] font-extralight">7</div>
                      </div>
                    </div>
                    <div className="mt-3 text-xs text-center opacity-90">比昨天多15分钟 ↑</div>
                  </div>
                </div>

                {/* 本周冥想时长图表 */}
                <div className="mx-5 mt-5 bg-white rounded-[15px] p-5 shadow-sm">
                  <h3 className="text-base font-semibold text-[#2c3e50] mb-4">本周冥想时长</h3>
                  <canvas ref={setCanvasRef(4)} width="320" height="200" />
                </div>

                {/* 最常使用场景 */}
                <div className="mx-5 mt-5 bg-white rounded-[15px] p-5 shadow-sm">
                  <h3 className="text-base font-semibold text-[#2c3e50] mb-4">最常使用场景</h3>
                  <div className="space-y-3">
                    {[
                      { name: '雨声', icon: '🌧️', percent: 35, time: '42min', color: '#667eea' },
                      { name: '海浪', icon: '🌊', percent: 28, time: '34min', color: '#4facfe' },
                      { name: '森林', icon: '🌲', percent: 22, time: '26min', color: '#56ab2f' },
                      { name: '夜晚', icon: '🌙', percent: 15, time: '18min', color: '#3498db' }
                    ].map((scene, idx) => (
                      <div key={idx} className="flex items-center gap-3">
                        <span className="text-xl">{scene.icon}</span>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm text-[#2c3e50]">{scene.name}</span>
                            <span className="text-xs text-[#95a5a6]">{scene.percent}% · {scene.time}</span>
                          </div>
                          <div className="h-1.5 bg-[#f0f0f0] rounded-full overflow-hidden">
                            <div 
                              className="h-full rounded-full"
                              style={{ 
                                width: `${scene.percent}%`,
                                background: `linear-gradient(90deg, ${scene.color}, ${scene.color}dd)`
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 时间分布 */}
                <div className="mx-5 mt-5 mb-20 bg-white rounded-[15px] p-5 shadow-sm text-center">
                  <span className="text-2xl">🌙</span>
                  <h3 className="text-base font-semibold text-[#2c3e50] mt-2 mb-1">最活跃时段</h3>
                  <p className="text-sm text-[#95a5a6]">晚上 21:00-23:00</p>
                </div>
              </div>
            </div>
            </div>
          </Activity>

          {/* 第5屏: 成就页面 */}
          <Activity mode={activeScreen === 4 ? 'visible' : 'hidden'}>
            <div className="flex flex-col items-center">
            <h3 className="text-base font-semibold text-[#2c3e50] mb-4">成就页面</h3>
            <div className="relative w-[360px] h-[780px] rounded-[35px] border-[10px] border-[#2a2a2a] bg-white overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.3)]">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[150px] h-[25px] bg-[#2a2a2a] rounded-b-[12px] z-10" />
              
              <div className="h-full overflow-y-auto no-scrollbar bg-[#f5f7fa]">
                {/* 顶部横幅 */}
                <div className="bg-gradient-to-br from-[#667eea] to-[#764ba2] px-5 pt-9 pb-6 text-white text-center">
                  <h2 className="text-[42px] font-extralight leading-tight mb-2">累计冥想<br/>127 小时</h2>
                  <p className="text-sm opacity-90 mb-3">已超越 85% 的用户</p>
                  <div className="w-full h-1.5 bg-white/30 rounded-full overflow-hidden">
                    <div className="h-full w-[85%] bg-white rounded-full" />
                  </div>
                </div>

                {/* 成就徽章网格 */}
                <div className="p-5 grid grid-cols-2 gap-4">
                  {[
                    { icon: '🥇', name: '初学者', desc: '完成首次冥想', unlocked: true, date: '2025-10-15', color: '#ffd700' },
                    { icon: '⭐', name: '专注新星', desc: '连续冥想3天', unlocked: true, date: '2025-10-18', color: '#ffd700' },
                    { icon: '🌅', name: '早起鸟', desc: '早晨冥想10次', unlocked: true, date: '2025-10-20', color: '#ffd700' },
                    { icon: '🌙', name: '夜猫子', desc: '夜晚冥想10次', unlocked: true, date: '2025-10-22', color: '#ffd700' },
                    { icon: '🏆', name: '冥想大师', desc: '累计100小时', unlocked: false, progress: '78/100小时', color: '#d0d0d0' },
                    { icon: '👑', name: '全勤王', desc: '连续冥想30天', unlocked: false, progress: '7/30天', color: '#d0d0d0' }
                  ].map((achievement, idx) => (
                    <div 
                      key={idx} 
                      className={`bg-white rounded-[15px] p-4 shadow-sm ${!achievement.unlocked ? 'opacity-50' : ''}`}
                      style={{ borderTop: `4px solid ${achievement.color}` }}
                    >
                      <div className="text-4xl mb-2">{achievement.icon}</div>
                      <h4 className="text-base font-bold text-[#2c3e50] mb-1">{achievement.name}</h4>
                      <p className="text-xs text-[#95a5a6] mb-2">{achievement.desc}</p>
                      {achievement.unlocked ? (
                        <div className="text-xs text-[#52c41a]">✓ {achievement.date}</div>
                      ) : (
                        <div className="text-xs text-[#95a5a6]">{achievement.progress}</div>
                      )}
                    </div>
                  ))}
                </div>

                {/* 底部汇总 */}
                <div className="mx-5 mb-20 bg-white rounded-[15px] p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm text-[#95a5a6]">已解锁</span>
                    <span className="text-lg font-semibold text-[#667eea]">4/12</span>
                  </div>
                  <div className="h-2 bg-[#f0f0f0] rounded-full overflow-hidden">
                    <div className="h-full w-1/3 bg-gradient-to-r from-[#667eea] to-[#764ba2] rounded-full" />
                  </div>
                </div>
              </div>
            </div>
            </div>
          </Activity>

          {/* 第6屏: 日历页面 */}
          <Activity mode={activeScreen === 5 ? 'visible' : 'hidden'}>
            <div className="flex flex-col items-center">
            <h3 className="text-base font-semibold text-[#2c3e50] mb-4">日历页面</h3>
            <div className="relative w-[360px] h-[780px] rounded-[35px] border-[10px] border-[#2a2a2a] bg-white overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.3)]">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[150px] h-[25px] bg-[#2a2a2a] rounded-b-[12px] z-10" />
              
              <div className="h-full overflow-y-auto no-scrollbar bg-[#f5f7fa]">
                {/* 顶部横幅 */}
                <div className="bg-gradient-to-br from-[#667eea] to-[#764ba2] px-5 pt-9 pb-5 text-white">
                  <div className="flex items-center justify-between mb-4">
                    <button 
                      onClick={() => changeMonth(-1)}
                      className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center hover:bg-white/30 transition-all"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <span className="text-xl font-light">2025年{currentMonth}月</span>
                    <button 
                      onClick={() => changeMonth(1)}
                      className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center hover:bg-white/30 transition-all"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* 日历 */}
                <div className="mx-5 mt-5 bg-white rounded-[15px] p-4 shadow-sm">
                  {/* 星期标题 */}
                  <div className="grid grid-cols-7 gap-1 mb-2">
                    {['一', '二', '三', '四', '五', '六', '日'].map((day, idx) => (
                      <div key={idx} className="text-center text-xs font-semibold text-[#95a5a6] py-2">
                        {day}
                      </div>
                    ))}
                  </div>

                  {/* 日期网格 */}
                  <div className="grid grid-cols-7 gap-1">
                    {Array.from({ length: 35 }, (_, i) => {
                      const day = i - 1; // 从0开始，1号是周二
                      const isCurrentMonth = day >= 1 && day <= 31;
                      const isToday = day === 23;
                      const hasMeditation = [5, 8, 12, 15, 18, 19, 20, 21, 22, 23].includes(day);
                      
                      return (
                        <div
                          key={i}
                          className={`aspect-square flex flex-col items-center justify-center rounded-lg relative
                            ${isToday ? 'bg-[#667eea] text-white' : ''}
                            ${!isCurrentMonth ? 'text-[#d0d0d0]' : 'text-[#2c3e50]'}
                          `}
                        >
                          <span className="text-sm">{isCurrentMonth ? day : ''}</span>
                          {hasMeditation && (
                            <div className={`absolute bottom-1 w-1 h-1 rounded-full ${isToday ? 'bg-white' : 'bg-[#52c41a]'}`} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 统计卡片 */}
                <div className="mx-5 mt-5 grid grid-cols-3 gap-3">
                  {[
                    { label: '本月打卡', value: '12', unit: '天' },
                    { label: '连续天数', value: '7', unit: '天' },
                    { label: '完成率', value: '40', unit: '%' }
                  ].map((stat, idx) => (
                    <div key={idx} className="bg-white rounded-[12px] p-4 shadow-sm text-center">
                      <div className="text-2xl font-light text-[#667eea] mb-1">{stat.value}<span className="text-sm">{stat.unit}</span></div>
                      <div className="text-xs text-[#95a5a6]">{stat.label}</div>
                    </div>
                  ))}
                </div>

                {/* 月度汇总 */}
                <div className="mx-5 mt-5 mb-20 bg-white rounded-[15px] p-5 shadow-sm">
                  <h3 className="text-base font-semibold text-[#2c3e50] mb-3">本月汇总</h3>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-[#95a5a6]">累计冥想时间</span>
                      <span className="text-base font-semibold text-[#2c3e50]">180分钟</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-[#95a5a6]">最长连续天数</span>
                      <span className="text-base font-semibold text-[#2c3e50]">7天</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-[#95a5a6]">获得成就</span>
                      <span className="text-base font-semibold text-[#2c3e50]">2个 🏆</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            </div>
          </Activity>

          {/* 第7屏: 场景库 */}
          <Activity mode={activeScreen === 6 ? 'visible' : 'hidden'}>
            <div className="flex flex-col items-center">
            <h3 className="text-base font-semibold text-[#2c3e50] mb-4">场景库</h3>
            <div className="relative w-[360px] h-[780px] rounded-[35px] border-[10px] border-[#2a2a2a] bg-white overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.3)]">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[150px] h-[25px] bg-[#2a2a2a] rounded-b-[12px] z-10" />
              
              <div className="h-full overflow-y-auto no-scrollbar bg-[#f5f7fa]">
                {/* 搜索区 */}
                <div className="px-5 pt-9 pb-4 bg-white">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 flex items-center gap-2 bg-[#f5f7fa] border border-[#e0e0e0] rounded-[25px] px-4 py-2.5">
                      <Search className="w-4 h-4 text-[#95a5a6]" />
                      <input type="text" placeholder="搜索场景..." className="flex-1 bg-transparent border-none outline-none text-sm" />
                    </div>
                    <button className="w-[45px] h-[45px] rounded-full bg-[#667eea] text-white flex items-center justify-center">
                      <Settings className="w-5 h-5" />
                    </button>
                  </div>

                  {/* 分类标签 */}
                  <div className="flex items-center gap-2 mt-4 overflow-x-auto no-scrollbar">
                    {['全部', '自然', '城市', '白噪音', '音乐'].map((cat, idx) => (
                      <button
                        key={idx}
                        onClick={() => setSelectedCategory(cat)}
                        className={`px-4 py-2 rounded-[20px] text-sm whitespace-nowrap border-2 transition-all hover:scale-105
                          ${selectedCategory === cat ? 'bg-[#667eea] text-white border-[#667eea]' : 'border-[#e0e0e0] text-[#95a5a6] hover:border-[#667eea]'}
                        `}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 场景卡片网格 */}
                <div className="p-5 grid grid-cols-2 gap-4 pb-20">
                  {[
                    { icon: '🌧️', name: '雨声', time: '15min', plays: '12.3k', color: 'from-[#667eea] to-[#764ba2]', liked: true },
                    { icon: '🌊', name: '海浪', time: '20min', plays: '8.9k', color: 'from-[#4facfe] to-[#00f2fe]', liked: false },
                    { icon: '🌲', name: '森林', time: '25min', plays: '15.6k', color: 'from-[#56ab2f] to-[#a8e063]', liked: true },
                    { icon: '📻', name: '白噪音', time: '30min', plays: '6.2k', color: 'from-[#bdc3c7] to-[#ecf0f1]', liked: false },
                    { icon: '🔥', name: '篝火', time: '20min', plays: '9.4k', color: 'from-[#f12711] to-[#f5af19]', liked: false },
                    { icon: '🏔️', name: '山谷风', time: '18min', plays: '7.8k', color: 'from-[#89f7fe] to-[#66a6ff]', liked: true },
                    { icon: '🦗', name: '虫鸣', time: '22min', plays: '5.6k', color: 'from-[#11998e] to-[#38ef7d]', liked: false },
                    { icon: '🔔', name: '音钵', time: '15min', plays: '11.2k', color: 'from-[#ffd89b] to-[#19547b]', liked: true }
                  ].map((scene, idx) => (
                    <div
                      key={idx}
                      className={`relative aspect-square rounded-[12px] bg-gradient-to-br ${scene.color} overflow-hidden cursor-pointer hover:scale-105 transition-transform`}
                    >
                      <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/60" />
                      <button 
                        onClick={() => toggleLike(scene.name)}
                        className="absolute top-2 right-2 z-10 hover:scale-125 transition-transform"
                      >
                        <Heart 
                          className={`w-6 h-6 text-white ${likedScenes.has(scene.name) ? 'fill-white' : ''}`}
                        />
                      </button>
                      <div className="absolute bottom-0 left-0 right-0 p-3 text-white">
                        <div className="text-4xl mb-2">{scene.icon}</div>
                        <h4 className="text-lg font-medium mb-1">{scene.name}</h4>
                        <div className="flex items-center gap-2 text-xs opacity-90">
                          <span>{scene.time}</span>
                          <span>·</span>
                          <span>{scene.plays}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            </div>
          </Activity>

          {/* 第8屏: 设置页面 */}
          <Activity mode={activeScreen === 7 ? 'visible' : 'hidden'}>
            <div className="flex flex-col items-center">
            <h3 className="text-base font-semibold text-[#2c3e50] mb-4">设置页面</h3>
            <div className="relative w-[360px] h-[780px] rounded-[35px] border-[10px] border-[#2a2a2a] bg-white overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.3)]">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[150px] h-[25px] bg-[#2a2a2a] rounded-b-[12px] z-10" />
              
              <div className="h-full overflow-y-auto no-scrollbar bg-[#f5f7fa]">
                {/* 个人信息卡片 */}
                <div className="bg-gradient-to-br from-[#667eea] to-[#764ba2] px-5 pt-10 pb-8 text-white">
                  <div className="flex items-center gap-5">
                    <div className="w-[70px] h-[70px] rounded-full bg-white/30 backdrop-blur-sm flex items-center justify-center text-[32px]">
                      🧘
                    </div>
                    <div className="flex-1">
                      <h2 className="text-2xl font-light mb-1">冥想者</h2>
                      <p className="text-sm opacity-90 mb-2">保持平静，专注当下</p>
                      <div className="inline-block px-3 py-1 bg-yellow-500/30 backdrop-blur-sm rounded-[12px] text-xs">
                        💎 VIP会员
                      </div>
                    </div>
                  </div>
                </div>

                {/* 冥想设置 */}
                <div className="p-5">
                  <h3 className="text-sm font-semibold text-[#95a5a6] uppercase tracking-wide mb-3">冥想设置</h3>
                  <div className="bg-white rounded-[15px] overflow-hidden shadow-sm">
                    {[
                      { label: '默认时长', value: '20分钟', type: 'arrow' },
                      { label: '启用呼吸引导', value: '', type: 'toggle', enabled: true },
                      { label: '音效音量', value: '75%', type: 'slider' },
                      { label: '振动反馈', value: '', type: 'toggle', enabled: false },
                      { label: '背景亮度', value: '50%', type: 'slider' }
                    ].map((setting, idx, arr) => {
                      const getToggleValue = (label: string) => {
                        if (label === '启用呼吸引导') return breathingEnabled;
                        if (label === '振动反馈') return vibration;
                        return false;
                      };
                      
                      const handleToggle = (label: string) => {
                        if (label === '启用呼吸引导') setBreathingEnabled(!breathingEnabled);
                        if (label === '振动反馈') setVibration(!vibration);
                      };

                      const getSliderValue = (label: string) => {
                        if (label === '音效音量') return volume;
                        if (label === '背景亮度') return brightness;
                        return 50;
                      };

                      const enabled = getToggleValue(setting.label);
                      const sliderVal = getSliderValue(setting.label);

                      return (
                        <div
                          key={idx}
                          className={`flex items-center justify-between px-4 py-4 ${idx < arr.length - 1 ? 'border-b border-[#f5f7fa]' : ''}`}
                        >
                          <span className="text-[15px] text-[#2c3e50]">{setting.label}</span>
                          {setting.type === 'arrow' && (
                            <button className="flex items-center gap-2 hover:opacity-70 transition-opacity">
                              <span className="text-[15px] text-[#95a5a6]">{setting.value}</span>
                              <ChevronRight className="w-4 h-4 text-[#95a5a6]" />
                            </button>
                          )}
                          {setting.type === 'toggle' && (
                            <button 
                              onClick={() => handleToggle(setting.label)}
                              className={`w-[48px] h-[28px] rounded-full relative transition-colors ${enabled ? 'bg-[#52c41a]' : 'bg-[#d0d0d0]'}`}
                            >
                              <div className={`absolute top-0.5 w-[24px] h-[24px] rounded-full bg-white shadow transition-transform ${enabled ? 'right-0.5' : 'left-0.5'}`} />
                            </button>
                          )}
                          {setting.type === 'slider' && (
                            <div className="flex items-center gap-2">
                              <div className="w-20 h-1 bg-[#e0e0e0] rounded-full overflow-hidden">
                                <div className="h-full bg-[#667eea] rounded-full" style={{ width: `${sliderVal}%` }} />
                              </div>
                              <span className="text-xs text-[#95a5a6] w-10 text-right">{sliderVal}%</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 提醒设置 */}
                <div className="px-5">
                  <h3 className="text-sm font-semibold text-[#95a5a6] uppercase tracking-wide mb-3">提醒设置</h3>
                  <div className="bg-white rounded-[15px] overflow-hidden shadow-sm">
                    {[
                      { label: '每日提醒', value: '', type: 'toggle', enabled: true },
                      { label: '提醒时间', value: '21:00', type: 'arrow' },
                      { label: '提醒声音', value: '轻柔铃声', type: 'arrow' },
                      { label: '重复设置', value: '每天', type: 'arrow' }
                    ].map((setting, idx, arr) => (
                      <div
                        key={idx}
                        className={`flex items-center justify-between px-4 py-4 ${idx < arr.length - 1 ? 'border-b border-[#f5f7fa]' : ''}`}
                      >
                        <span className="text-[15px] text-[#2c3e50]">{setting.label}</span>
                        {setting.type === 'arrow' && (
                          <div className="flex items-center gap-2">
                            <span className="text-[15px] text-[#95a5a6]">{setting.value}</span>
                            <span className="text-[#95a5a6]">›</span>
                          </div>
                        )}
                        {setting.type === 'toggle' && (
                          <div className={`w-[48px] h-[28px] rounded-full relative ${setting.enabled ? 'bg-[#52c41a]' : 'bg-[#d0d0d0]'}`}>
                            <div className={`absolute top-0.5 w-[24px] h-[24px] rounded-full bg-white transition-transform ${setting.enabled ? 'right-0.5' : 'left-0.5'}`} />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* 通用设置 */}
                <div className="px-5">
                  <h3 className="text-sm font-semibold text-[#95a5a6] uppercase tracking-wide mb-3">通用设置</h3>
                  <div className="bg-white rounded-[15px] overflow-hidden shadow-sm">
                    {[
                      { label: '主题模式', value: '浅色', type: 'arrow' },
                      { label: '语言', value: '简体中文', type: 'arrow' },
                      { label: '数据同步', value: '', type: 'toggle', enabled: true }
                    ].map((setting, idx, arr) => (
                      <div
                        key={idx}
                        className={`flex items-center justify-between px-4 py-4 ${idx < arr.length - 1 ? 'border-b border-[#f5f7fa]' : ''}`}
                      >
                        <span className="text-[15px] text-[#2c3e50]">{setting.label}</span>
                        {setting.type === 'arrow' && (
                          <div className="flex items-center gap-2">
                            <span className="text-[15px] text-[#95a5a6]">{setting.value}</span>
                            <span className="text-[#95a5a6]">›</span>
                          </div>
                        )}
                        {setting.type === 'toggle' && (
                          <div className={`w-[48px] h-[28px] rounded-full relative ${setting.enabled ? 'bg-[#52c41a]' : 'bg-[#d0d0d0]'}`}>
                            <div className={`absolute top-0.5 w-[24px] h-[24px] rounded-full bg-white transition-transform ${setting.enabled ? 'right-0.5' : 'left-0.5'}`} />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* 其他 */}
                <div className="px-5 pb-20">
                  <h3 className="text-sm font-semibold text-[#95a5a6] uppercase tracking-wide mb-3">其他</h3>
                  <div className="bg-white rounded-[15px] overflow-hidden shadow-sm mb-5">
                    {[
                      { label: '清除缓存', value: '125MB', type: 'arrow' },
                      { label: '关于我们', value: '', type: 'arrow' },
                      { label: '隐私政策', value: '', type: 'arrow' },
                      { label: '帮助与反馈', value: '', type: 'arrow' }
                    ].map((setting, idx, arr) => (
                      <div
                        key={idx}
                        className={`flex items-center justify-between px-4 py-4 ${idx < arr.length - 1 ? 'border-b border-[#f5f7fa]' : ''}`}
                      >
                        <span className="text-[15px] text-[#2c3e50]">{setting.label}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[15px] text-[#95a5a6]">{setting.value}</span>
                          <span className="text-[#95a5a6]">›</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* 退出登录 */}
                  <button className="w-full bg-white rounded-[15px] py-4 text-[#f5222d] text-base font-semibold shadow-sm flex items-center justify-center gap-2">
                    <LogOut className="w-4 h-4" />
                    <span>退出登录</span>
                  </button>

                  {/* 版本信息 */}
                  <div className="text-center mt-5 text-xs text-[#95a5a6]">
                    v2.0.1
                  </div>
                </div>
              </div>
            </div>
            </div>
          </Activity>

          {/* 第9屏: 呼吸引导页面 */}
          <Activity mode={activeScreen === 8 ? 'visible' : 'hidden'}>
            <div className="flex flex-col items-center">
            <h3 className="text-base font-semibold text-[#2c3e50] mb-4">呼吸引导页面</h3>
            <div className="relative w-[360px] h-[780px] rounded-[35px] border-[10px] border-[#2a2a2a] bg-white overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.3)]">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[150px] h-[25px] bg-[#2a2a2a] rounded-b-[12px] z-10" />
              
              <div className="relative h-full bg-gradient-to-br from-[#1a237e] to-[#283593] overflow-hidden">
                {/* 气泡背景 */}
                <canvas ref={setCanvasRef(8)} className="absolute inset-0" />
                
                {/* 顶部计数器 */}
                <div className="relative z-10 text-center pt-12 text-white text-sm opacity-90">
                  第 3/10 次呼吸
                </div>

                {/* 中央呼吸圆圈 */}
                <div className="relative z-10 flex flex-col items-center justify-center h-[calc(100%-200px)] mt-12">
                  <div className="w-[300px] h-[300px] rounded-full border-[3px] border-white/30 flex items-center justify-center animate-[breathingCircle_12s_ease-in-out_infinite]"
                    style={{
                      background: 'radial-gradient(circle, rgba(102,126,234,0.3) 0%, transparent 70%)'
                    }}>
                    <div className="text-4xl font-extralight text-white">吸气...</div>
                  </div>
                </div>

                {/* 进度点指示器 */}
                <div className="relative z-10 flex items-center justify-center gap-2 mt-8">
                  {Array.from({ length: 10 }, (_, i) => (
                    <div
                      key={i}
                      className={`rounded-full ${i < 3 ? 'w-2 h-2 bg-white' : i === 3 ? 'w-4 h-2 bg-white animate-pulse' : 'w-2 h-2 bg-white/30'}`}
                    />
                  ))}
                </div>

                {/* 底部控制 */}
                <div className="relative z-10 text-center mt-8 space-y-4">
                  <button className="w-[60px] h-[60px] rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white mx-auto">
                    <Pause className="w-7 h-7 fill-white" />
                  </button>
                  <p className="text-white/70 text-xs px-8">坐直，双脚平放地面，保持放松</p>
                </div>
              </div>
            </div>
            </div>
          </Activity>
        </div>

        {/* 底部提示 */}
        <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-center text-sm text-slate-600">
          <p>点击上方按钮切换屏幕 · Canvas 动画在后台自动优化 · 状态完整保留</p>
        </div>
      </InfoPanel>

      {/* 动画样式 */}
      <style>{`
        @keyframes breathe {
          0%, 100% { transform: scale(0.9); opacity: 0.7; }
          36% { transform: scale(1.1); opacity: 1; }
          45% { transform: scale(1.1); opacity: 1; }
          91% { transform: scale(0.9); opacity: 0.7; }
        }

        @keyframes breathingCircle {
          0%, 100% { transform: scale(0.6); opacity: 0.6; }
          33% { transform: scale(1.0); opacity: 1; }
          50% { transform: scale(1.0); opacity: 1; }
          83% { transform: scale(0.6); opacity: 0.6; }
        }
      `}</style>
    </InfoQueryShell>
  );
};

export default MeditationAppDemo;

