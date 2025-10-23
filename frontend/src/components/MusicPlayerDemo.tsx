import React from 'react';
import { 
  Search, User, Home, Play, Radio, Heart, MessageCircle, MoreHorizontal,
  ChevronLeft, ChevronRight, Repeat, Shuffle, SkipBack, SkipForward,
  Pause, Share2, Music, Download, Clock, Settings, HelpCircle, LogOut,
  List, ChevronUp, X, Plus
} from 'lucide-react';

// 音乐播放器UI展示页面 (类似Spotify深色主题)
const MusicPlayerDemo: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#667eea] to-[#764ba2] py-10 px-4">
      <div className="max-w-[1800px] mx-auto">
        {/* 标题 */}
        <h1 className="text-4xl font-bold text-center mb-12 text-white drop-shadow-lg">
          音乐播放器 UI 展示
        </h1>

        {/* 手机屏幕网格 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* 第1屏: 首页 */}
          <div className="flex flex-col items-center">
            <h3 className="text-base font-semibold text-white mb-4 drop-shadow">首页 - 发现音乐</h3>
            <div className="relative w-[340px] h-[720px] rounded-[32px] border-[10px] border-[#1a1a1a] bg-[#191414] overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.6)]">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[130px] h-[20px] bg-[#1a1a1a] rounded-b-[10px] z-10" />
              
              <div className="h-full overflow-y-auto overflow-x-hidden scrollbar-hide">
                {/* 顶部区域 */}
                <div className="flex items-center justify-between p-4 pt-7">
                  <div className="flex items-center gap-2 text-2xl font-bold text-[#1DB954]">
                    <Music className="w-6 h-6" />
                    <span>Music</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="px-4 py-2 bg-[#2a2a2a] rounded-full flex items-center gap-2">
                      <Search className="w-4 h-4 text-white" />
                      <span className="text-sm text-[#b3b3b3]">搜索</span>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#667eea] to-[#764ba2] flex items-center justify-center">
                      <User className="w-5 h-5 text-white" />
                    </div>
                  </div>
                </div>

                {/* 推荐歌单 */}
                <div className="px-4 mt-5">
                  <h2 className="text-[17px] font-bold text-white mb-3">推荐歌单</h2>
                  <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-4">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div key={i} className="flex-shrink-0">
                        <div className="w-[100px] h-[100px] bg-gradient-to-br from-[#667eea] to-[#764ba2] rounded-[10px] mb-2" />
                        <div className="text-[13px] text-white font-medium mb-0.5">每日歌单 {i}</div>
                        <div className="text-[11px] text-[#b3b3b3]">12.3k 次播放</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 热门单曲 */}
                <div className="px-4 mt-5">
                  <h2 className="text-[17px] font-bold text-white mb-3">热门单曲</h2>
                  <div className="space-y-2 pb-24">
                    {[
                      { num: '1', name: '晴天', artist: '周杰伦' },
                      { num: '2', name: '告白气球', artist: '周杰伦' },
                      { num: '3', name: '稻香', artist: '周杰伦' },
                      { num: '4', name: '夜曲', artist: '周杰伦' },
                      { num: '5', name: '七里香', artist: '周杰伦' }
                    ].map((song, idx) => (
                      <div key={idx} className="flex items-center gap-3 py-2">
                        <div className="w-5 text-center text-sm text-[#b3b3b3] font-medium">{song.num}</div>
                        <div className="w-[45px] h-[45px] bg-gradient-to-br from-[#4facfe] to-[#00f2fe] rounded-[8px]" />
                        <div className="flex-1">
                          <div className="text-sm text-white font-medium">{song.name}</div>
                          <div className="text-xs text-[#b3b3b3]">{song.artist}</div>
                        </div>
                        <button className="w-[22px] h-[22px] rounded-full bg-[#1DB954] flex items-center justify-center">
                          <Play className="w-3 h-3 text-white fill-white" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 底部导航 */}
                <div className="fixed bottom-0 left-0 right-0 h-[60px] bg-[#181818] border-t border-[#282828] flex items-center justify-around z-20">
                  {[
                    { icon: '🏠', label: '首页', active: true },
                    { icon: '🔍', label: '发现', active: false },
                    { icon: '▶️', label: '播放', active: false },
                    { icon: '📻', label: '电台', active: false },
                    { icon: '👤', label: '我的', active: false }
                  ].map((nav, idx) => (
                    <div key={idx} className="flex flex-col items-center gap-0.5">
                      <span className="text-xl">{nav.icon}</span>
                      <span className={`text-[11px] ${nav.active ? 'text-[#1DB954]' : 'text-[#b3b3b3]'}`}>
                        {nav.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 第2屏: 播放器页面 */}
          <div className="flex flex-col items-center">
            <h3 className="text-base font-semibold text-white mb-4 drop-shadow">播放器页面</h3>
            <div className="relative w-[340px] h-[720px] rounded-[32px] border-[10px] border-[#1a1a1a] bg-[#191414] overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.6)]">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[130px] h-[20px] bg-[#1a1a1a] rounded-b-[10px] z-10" />
              
              <div className="relative h-full bg-gradient-to-b from-[#1DB954]/30 to-[#191414]">
                {/* 顶部栏 */}
                <div className="flex items-center justify-between p-4 pt-7 text-white">
                  <button className="w-8 h-8 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center">
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <span className="text-sm">正在播放</span>
                  <button className="w-8 h-8 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center">
                    <MoreHorizontal className="w-5 h-5" />
                  </button>
                </div>

                {/* 黑胶唱片封面 */}
                <div className="flex items-center justify-center mt-8">
                  <div className="relative w-[240px] h-[240px] rounded-full overflow-hidden shadow-[0_15px_40px_rgba(0,0,0,0.5)] animate-spin-slow">
                    <div className="absolute inset-0 bg-gradient-to-br from-[#667eea] to-[#764ba2]" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-[50px] h-[50px] rounded-full bg-[#191414]" />
                    </div>
                  </div>
                </div>

                {/* 歌曲信息 */}
                <div className="text-center mt-8 px-8">
                  <h2 className="text-[21px] font-bold text-white mb-1">晴天</h2>
                  <p className="text-sm text-[#b3b3b3] mb-0.5">周杰伦</p>
                  <p className="text-[13px] text-[#777]">范特西 Plus</p>
                </div>

                {/* 音频波形 */}
                <div className="flex items-center justify-center gap-1 mt-6">
                  {[0.6, 0.9, 0.7, 1, 0.8, 0.5, 0.9, 0.7, 0.6].map((height, idx) => (
                    <div
                      key={idx}
                      className="w-[3px] h-[28px] bg-gradient-to-b from-[#1DB954] to-[#1ed760] rounded-full animate-wave"
                      style={{ 
                        animationDelay: `${idx * 0.1}s`,
                        transform: `scaleY(${height})`
                      }}
                    />
                  ))}
                </div>

                {/* 进度条 */}
                <div className="px-8 mt-6">
                  <div className="h-1 bg-[#4d4d4d] rounded-full overflow-hidden">
                    <div className="h-full w-[45%] bg-[#1DB954] rounded-full" />
                  </div>
                  <div className="flex items-center justify-between mt-2 text-xs text-[#b3b3b3]">
                    <span>1:45</span>
                    <span>4:03</span>
                  </div>
                </div>

                {/* 控制按钮 */}
                <div className="flex items-center justify-center gap-6 mt-6">
                  <button className="text-[#b3b3b3]">
                    <Shuffle className="w-5 h-5" />
                  </button>
                  <button className="text-white">
                    <SkipBack className="w-6 h-6 fill-white" />
                  </button>
                  <button className="w-14 h-14 rounded-full bg-[#1DB954] flex items-center justify-center text-white">
                    <Pause className="w-7 h-7 fill-white" />
                  </button>
                  <button className="text-white">
                    <SkipForward className="w-6 h-6 fill-white" />
                  </button>
                  <button className="text-[#b3b3b3]">
                    <Repeat className="w-5 h-5" />
                  </button>
                </div>

                {/* 底部操作 */}
                <div className="flex items-center justify-center gap-8 mt-8">
                  <button className="text-[#ff4d4d] animate-heartbeat">
                    <Heart className="w-6 h-6 fill-current" />
                  </button>
                  <button className="text-white">
                    <MessageCircle className="w-6 h-6" />
                  </button>
                  <button className="text-white">
                    <MoreHorizontal className="w-6 h-6" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* 第3屏: 歌词页面 */}
          <div className="flex flex-col items-center">
            <h3 className="text-base font-semibold text-white mb-4 drop-shadow">歌词页面</h3>
            <div className="relative w-[340px] h-[720px] rounded-[32px] border-[10px] border-[#1a1a1a] bg-[#191414] overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.6)]">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[130px] h-[20px] bg-[#1a1a1a] rounded-b-[10px] z-10" />
              
              <div className="h-full bg-gradient-to-b from-[#282828] to-black overflow-y-auto scrollbar-hide">
                {/* 顶部栏 */}
                <div className="flex items-center justify-between p-4 pt-7 text-white">
                  <button className="w-8 h-8 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center">
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <span className="text-sm">歌词</span>
                  <button className="w-8 h-8 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center">
                    <Share2 className="w-5 h-5" />
                  </button>
                </div>

                {/* 歌词 */}
                <div className="text-center px-8 mt-16 space-y-6">
                  {[
                    { text: '从前从前有个人爱你很久', current: false },
                    { text: '但偏偏风渐渐把距离吹得好远', current: false },
                    { text: '好不容易又能再多爱一天', current: true },
                    { text: '但故事的最后你好像还是说了拜拜', current: false },
                    { text: '', current: false },
                    { text: '🎵', current: false },
                    { text: '', current: false },
                    { text: '为什么一定要这样', current: false }
                  ].map((line, idx) => (
                    <div
                      key={idx}
                      className={`transition-all duration-300 ${
                        line.current 
                          ? 'text-lg text-white font-bold scale-110' 
                          : 'text-sm text-white/40'
                      }`}
                      style={{ lineHeight: '2' }}
                    >
                      {line.text}
                    </div>
                  ))}
                </div>

                {/* 底部迷你控制 */}
                <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent p-6">
                  <div className="flex items-center justify-center gap-6">
                    <button className="text-white">
                      <SkipBack className="w-5 h-5 fill-white" />
                    </button>
                    <button className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white">
                      <Pause className="w-5 h-5 fill-white" />
                    </button>
                    <button className="text-white">
                      <SkipForward className="w-5 h-5 fill-white" />
                    </button>
                  </div>
                  <div className="flex items-center justify-center gap-2 mt-4">
                    {[0, 1, 2, 3, 4].map((dot, idx) => (
                      <div
                        key={idx}
                        className={`rounded-full ${idx === 2 ? 'w-4 h-[5px] bg-white' : 'w-[5px] h-[5px] bg-white/40'}`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 第4屏: 播放列表 */}
          <div className="flex flex-col items-center">
            <h3 className="text-base font-semibold text-white mb-4 drop-shadow">播放列表</h3>
            <div className="relative w-[340px] h-[720px] rounded-[32px] border-[10px] border-[#1a1a1a] bg-[#191414] overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.6)]">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[130px] h-[20px] bg-[#1a1a1a] rounded-b-[10px] z-10" />
              
              <div className="h-full overflow-y-auto scrollbar-hide">
                {/* 头部信息 */}
                <div className="p-4 pt-7">
                  <h2 className="text-[23px] font-bold text-white mb-1">当前播放</h2>
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] text-[#b3b3b3]">8首歌曲</span>
                    <button className="text-[13px] text-[#ff4d4d]">清空</button>
                  </div>
                </div>

                {/* 队列列表 */}
                <div className="px-4 pb-24 space-y-2">
                  {[
                    { name: '晴天', artist: '周杰伦', time: '4:03', playing: true },
                    { name: '告白气球', artist: '周杰伦', time: '3:23', playing: false },
                    { name: '稻香', artist: '周杰伦', time: '3:43', playing: false },
                    { name: '夜曲', artist: '周杰伦', time: '3:46', playing: false },
                    { name: '七里香', artist: '周杰伦', time: '5:05', playing: false },
                    { name: '简单爱', artist: '周杰伦', time: '4:30', playing: false },
                    { name: '彩虹', artist: '周杰伦', time: '4:24', playing: false },
                    { name: '不能说的秘密', artist: '周杰伦', time: '4:55', playing: false }
                  ].map((song, idx) => (
                    <div
                      key={idx}
                      className={`flex items-center gap-3 p-3 rounded-lg ${song.playing ? 'bg-[#282828]' : ''}`}
                    >
                      {song.playing ? (
                        <div className="flex items-end gap-0.5 w-5">
                          {[0.6, 1, 0.8].map((h, i) => (
                            <div
                              key={i}
                              className="w-1 bg-[#1DB954] rounded-full animate-wave"
                              style={{ height: `${h * 16}px`, animationDelay: `${i * 0.15}s` }}
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="w-5 text-center text-sm text-[#b3b3b3]">{idx + 1}</div>
                      )}
                      <div className="w-[45px] h-[45px] bg-gradient-to-br from-[#4facfe] to-[#00f2fe] rounded-lg" />
                      <div className="flex-1">
                        <div className={`text-sm font-medium ${song.playing ? 'text-[#1DB954]' : 'text-white'}`}>
                          {song.name}
                        </div>
                        <div className="text-xs text-[#b3b3b3]">{song.artist}</div>
                      </div>
                      <div className="text-xs text-[#b3b3b3]">{song.time}</div>
                        <button className="text-[#b3b3b3]">
                          <List className="w-4 h-4" />
                        </button>
                    </div>
                  ))}
                </div>

                {/* 添加歌曲按钮 */}
                <div className="px-4 pb-20">
                  <button className="w-full py-4 border-2 border-dashed border-[#4d4d4d] rounded-[10px] text-sm text-[#b3b3b3] flex items-center justify-center gap-2">
                    <Plus className="w-4 h-4" />
                    <span>添加更多歌曲</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* 第5屏: 搜索页面 */}
          <div className="flex flex-col items-center">
            <h3 className="text-base font-semibold text-white mb-4 drop-shadow">搜索页面</h3>
            <div className="relative w-[340px] h-[720px] rounded-[32px] border-[10px] border-[#1a1a1a] bg-[#191414] overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.6)]">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[130px] h-[20px] bg-[#1a1a1a] rounded-b-[10px] z-10" />
              
              <div className="h-full overflow-y-auto scrollbar-hide">
                {/* 搜索头部 */}
                <div className="p-4 pt-7">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 flex items-center gap-2 bg-[#2a2a2a] rounded-[16px] px-4 py-3">
                      <Search className="w-4 h-4 text-[#b3b3b3]" />
                      <input
                        type="text"
                        placeholder="搜索歌曲、歌手或专辑"
                        className="flex-1 bg-transparent border-none outline-none text-sm text-white placeholder-[#b3b3b3]"
                      />
                    </div>
                    <button className="text-[#1DB954] text-sm font-medium">取消</button>
                  </div>
                </div>

                {/* 热门搜索 */}
                <div className="px-4 mt-4">
                  <h3 className="text-base font-bold text-white mb-3">热门搜索</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      '周杰伦',
                      '流行音乐',
                      '华语金曲',
                      '经典老歌',
                      '抖音热歌',
                      '说唱音乐',
                      '粤语歌曲',
                      '民谣音乐'
                    ].map((tag, idx) => (
                      <div
                        key={idx}
                        className="px-4 py-3 bg-[#2a2a2a] border border-[#3a3a3a] rounded-[12px] text-[13px] text-white text-center hover:bg-[#1DB954] hover:border-[#1DB954] transition-all duration-300 cursor-pointer"
                      >
                        {tag}
                      </div>
                    ))}
                  </div>
                </div>

                {/* 搜索历史 */}
                <div className="px-4 mt-6 pb-24">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-base font-bold text-white">搜索历史</h3>
                    <button className="text-sm text-[#b3b3b3]">清空</button>
                  </div>
                  <div className="space-y-1">
                    {[
                      '晴天 周杰伦',
                      '告白气球',
                      '稻香',
                      '夜曲'
                    ].map((history, idx) => (
                      <div key={idx} className="flex items-center justify-between py-3 border-b border-[#282828]">
                        <div className="flex items-center gap-3">
                          <Clock className="w-4 h-4 text-[#b3b3b3]" />
                          <span className="text-sm text-white">{history}</span>
                        </div>
                        <button className="text-[#b3b3b3]">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 第6屏: 个人中心 */}
          <div className="flex flex-col items-center">
            <h3 className="text-base font-semibold text-white mb-4 drop-shadow">个人中心</h3>
            <div className="relative w-[340px] h-[720px] rounded-[32px] border-[10px] border-[#1a1a1a] bg-[#191414] overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.6)]">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[130px] h-[20px] bg-[#1a1a1a] rounded-b-[10px] z-10" />
              
              <div className="h-full overflow-y-auto scrollbar-hide">
                {/* 个人信息卡片 */}
                <div className="bg-gradient-to-br from-[#1DB954] to-[#1ed760] px-5 pt-7 pb-6 rounded-b-[12px]">
                  <div className="flex items-center gap-4">
                    <div className="w-[65px] h-[65px] rounded-full bg-white flex items-center justify-center text-[28px]">
                      🎵
                    </div>
                    <div className="flex-1 text-white">
                      <h2 className="text-lg font-bold mb-0.5">音乐爱好者</h2>
                      <p className="text-[13px] opacity-90">享受音乐，享受生活</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-around mt-5 text-white">
                    {[
                      { value: '128', label: '关注' },
                      { value: '256', label: '粉丝' },
                      { value: '42', label: '动态' }
                    ].map((stat, idx) => (
                      <div key={idx} className="text-center">
                        <div className="text-base font-bold">{stat.value}</div>
                        <div className="text-[11px] opacity-80">{stat.label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 功能菜单 */}
                <div className="mt-4 bg-[#181818]">
                  {[
                    { icon: Music, label: '我的歌单', badge: '23', arrow: true },
                    { icon: Heart, label: '我喜欢的音乐', badge: '156', arrow: true },
                    { icon: Clock, label: '最近播放', badge: null, arrow: true },
                    { icon: Download, label: '下载管理', badge: '8', arrow: true },
                    { icon: Clock, label: '定时关闭', badge: null, arrow: true },
                    { icon: Settings, label: '主题设置', badge: null, arrow: true },
                    { icon: Settings, label: '设置', badge: null, arrow: true },
                    { icon: HelpCircle, label: '帮助与反馈', badge: null, arrow: true }
                  ].map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between px-5 py-4 border-b border-[#282828]"
                    >
                      <div className="flex items-center gap-3">
                        <item.icon className="w-5 h-5 text-white" />
                        <span className="text-sm text-white">{item.label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {item.badge && (
                          <span className="text-xs text-[#b3b3b3]">{item.badge}</span>
                        )}
                        {item.arrow && (
                          <ChevronRight className="w-4 h-4 text-[#4d4d4d]" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* 退出登录 */}
                <div className="p-5 pb-24">
                  <button className="w-full py-4 bg-[#181818] text-[#ff4d4d] text-sm font-medium rounded-lg text-center flex items-center justify-center gap-2">
                    <LogOut className="w-4 h-4" />
                    <span>退出登录</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* 第7屏: 歌单详情 */}
          <div className="flex flex-col items-center">
            <h3 className="text-base font-semibold text-white mb-4 drop-shadow">歌单详情</h3>
            <div className="relative w-[340px] h-[720px] rounded-[32px] border-[10px] border-[#1a1a1a] bg-[#191414] overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.6)]">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[130px] h-[20px] bg-[#1a1a1a] rounded-b-[10px] z-10" />
              
              <div className="h-full overflow-y-auto scrollbar-hide">
                {/* 顶部封面区 */}
                <div className="relative h-[200px] bg-gradient-to-b from-[#1DB954] to-[#191414] flex items-center justify-center">
                  <button className="absolute top-7 left-4 w-8 h-8 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center text-white">
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button className="absolute top-7 right-4 w-8 h-8 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center text-white">
                    <MoreHorizontal className="w-5 h-5" />
                  </button>
                  <div className="w-[145px] h-[145px] bg-gradient-to-br from-[#667eea] to-[#764ba2] rounded-[10px] shadow-lg" />
                </div>

                {/* 歌单信息 */}
                <div className="px-5 -mt-8 text-center">
                  <h2 className="text-[19px] font-bold text-white mb-1">华语流行金曲</h2>
                  <p className="text-xs text-[#b3b3b3]">热门榜单 · 播放 2.3亿次</p>
                </div>

                {/* 操作按钮 */}
                <div className="flex items-center justify-center gap-3 px-5 mt-5">
                  <button className="flex-1 py-3 bg-[#1DB954] text-white text-[13px] font-medium rounded-[18px] flex items-center justify-center gap-2">
                    <Play className="w-4 h-4 fill-white" />
                    <span>播放全部</span>
                  </button>
                  <button className="px-5 py-3 border border-white text-white text-[13px] font-medium rounded-[18px] flex items-center justify-center">
                    <Heart className="w-4 h-4" />
                  </button>
                  <button className="px-5 py-3 border border-white text-white text-[13px] font-medium rounded-[18px] flex items-center justify-center">
                    <Download className="w-4 h-4" />
                  </button>
                </div>

                {/* 歌曲列表 */}
                <div className="mt-5 pb-24">
                  {[
                    { hot: true, name: '晴天', artist: '周杰伦', mv: true },
                    { hot: true, name: '告白气球', artist: '周杰伦', mv: false },
                    { hot: true, name: '稻香', artist: '周杰伦', mv: true },
                    { hot: false, name: '夜曲', artist: '周杰伦', mv: false },
                    { hot: false, name: '七里香', artist: '周杰伦', mv: true },
                    { hot: false, name: '简单爱', artist: '周杰伦', mv: false },
                    { hot: false, name: '彩虹', artist: '周杰伦', mv: false },
                    { hot: false, name: '不能说的秘密', artist: '周杰伦', mv: true }
                  ].map((song, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-3 px-5 py-3 border-b border-[#282828]"
                    >
                      {song.hot && <span className="text-sm">🔥</span>}
                      <div className="w-5 text-center text-sm text-[#b3b3b3] font-medium">
                        {idx + 1}
                      </div>
                      <div className="w-[45px] h-[45px] bg-gradient-to-br from-[#4facfe] to-[#00f2fe] rounded-lg" />
                      <div className="flex-1">
                        <div className="text-sm text-white font-medium">{song.name}</div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-[#b3b3b3]">{song.artist}</span>
                          {song.mv && <span className="text-xs text-[#ff4d4d]">MV</span>}
                        </div>
                      </div>
                      <button className="text-[#b3b3b3]">
                        <MoreHorizontal className="w-5 h-5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 第8屏: 迷你播放条 */}
          <div className="flex flex-col items-center">
            <h3 className="text-base font-semibold text-white mb-4 drop-shadow">迷你播放条</h3>
            <div className="relative w-[340px] h-[720px] rounded-[32px] border-[10px] border-[#1a1a1a] bg-[#191414] overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.6)]">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[130px] h-[20px] bg-[#1a1a1a] rounded-b-[10px] z-10" />
              
              <div className="h-full overflow-y-auto scrollbar-hide">
                {/* 首页内容 (背景) */}
                <div className="flex items-center justify-between p-4 pt-7">
                  <div className="text-2xl font-bold text-[#1DB954]">Music</div>
                  <div className="flex items-center gap-3">
                    <div className="px-4 py-2 bg-[#2a2a2a] rounded-full flex items-center gap-2">
                      <span className="text-sm text-white">🔍</span>
                      <span className="text-sm text-[#b3b3b3]">搜索</span>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#667eea] to-[#764ba2] flex items-center justify-center text-xs text-white font-bold">
                      M
                    </div>
                  </div>
                </div>

                <div className="px-4 mt-5">
                  <h2 className="text-[17px] font-bold text-white mb-3">推荐歌单</h2>
                  <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-4">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div key={i} className="flex-shrink-0">
                        <div className="w-[100px] h-[100px] bg-gradient-to-br from-[#667eea] to-[#764ba2] rounded-[10px] mb-2" />
                        <div className="text-[13px] text-white font-medium mb-0.5">每日歌单 {i}</div>
                        <div className="text-[11px] text-[#b3b3b3]">12.3k 次播放</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 展开提示 */}
                <div className="fixed bottom-[74px] left-1/2 -translate-x-1/2 px-4 py-2 bg-[#282828] rounded-[14px] text-[11px] text-white flex items-center gap-1 z-30">
                  <span>向上滑动展开播放器</span>
                  <ChevronUp className="w-3 h-3" />
                </div>

                {/* 迷你播放器 */}
                <div className="fixed bottom-[60px] left-0 right-0 h-[54px] bg-[#282828]/95 backdrop-blur-md border-t border-[#1DB954] flex items-center px-3 z-20">
                  <div className="w-[42px] h-[42px] bg-gradient-to-br from-[#667eea] to-[#764ba2] rounded-[8px] mr-3" />
                  <div className="flex-1">
                    <div className="text-sm text-white font-medium">晴天</div>
                    <div className="text-[11px] text-[#b3b3b3]">周杰伦</div>
                  </div>
                  <button className="w-6 h-6 flex items-center justify-center text-white mr-2">
                    <Pause className="w-5 h-5 fill-white" />
                  </button>
                  <button className="w-[22px] h-[22px] flex items-center justify-center text-[#b3b3b3]">
                    <List className="w-4 h-4" />
                  </button>
                </div>

                {/* 底部导航 */}
                <div className="fixed bottom-0 left-0 right-0 h-[60px] bg-[#181818] border-t border-[#282828] flex items-center justify-around z-20">
                  {[
                    { icon: Home, label: '首页', active: true },
                    { icon: Search, label: '发现', active: false },
                    { icon: Play, label: '播放', active: false },
                    { icon: Radio, label: '电台', active: false },
                    { icon: User, label: '我的', active: false }
                  ].map((nav, idx) => (
                    <div key={idx} className="flex flex-col items-center gap-0.5">
                      <nav.icon className={`w-5 h-5 ${nav.active && nav.icon === Play ? 'fill-current' : ''}`} 
                        style={{ color: nav.active ? '#1DB954' : '#b3b3b3' }} />
                      <span className={`text-[11px] ${nav.active ? 'text-[#1DB954]' : 'text-[#b3b3b3]'}`}>
                        {nav.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 动画样式 */}
      <style>{`
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .animate-spin-slow {
          animation: spin-slow 12s linear infinite;
        }

        @keyframes wave {
          0%, 100% { transform: scaleY(0.5); }
          50% { transform: scaleY(1); }
        }

        .animate-wave {
          animation: wave 0.8s ease-in-out infinite;
        }

        @keyframes heartbeat {
          0%, 100% { transform: scale(1); }
          25% { transform: scale(1.2); }
          50% { transform: scale(1.1); }
        }

        .animate-heartbeat {
          animation: heartbeat 1.5s ease-in-out infinite;
        }

        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }

        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
};

export default MusicPlayerDemo;

