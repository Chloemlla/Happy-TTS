import React from 'react';
import { Link } from 'react-router-dom';
import { ShoppingBag, Brain, Music, Wallet } from 'lucide-react';

// Demo Hub - 所有UI展示页面的导航中心
const DemoHub: React.FC = () => {
  const demos = [
    {
      id: 'xiaohongshu',
      name: '小红书风格瀑布流',
      description: '响应式瀑布流布局，浅色/深色主题切换，搜索筛选，无限滚动',
      path: '/demo/xiaohongshu',
      icon: ShoppingBag,
      gradient: 'from-[#FF2442] to-[#FF8C00]',
      features: ['瀑布流布局', '主题切换', '搜索筛选', '无限滚动', '点赞收藏']
    },
    {
      id: 'meditation',
      name: '冥想APP UI',
      description: '9个精美屏幕，Canvas动画效果，呼吸引导，成就系统',
      path: '/demo/meditation',
      icon: Brain,
      gradient: 'from-[#667eea] to-[#764ba2]',
      features: ['Canvas动画', '呼吸引导', '成就徽章', '日历打卡', '场景库']
    },
    {
      id: 'music',
      name: '音乐播放器UI',
      description: '8个Spotify风格深色主题屏幕，黑胶唱片动画，波形可视化',
      path: '/demo/music',
      icon: Music,
      gradient: 'from-[#1DB954] to-[#1ed760]',
      features: ['深色主题', '黑胶动画', '波形可视化', '歌词页面', '播放列表']
    },
    {
      id: 'finance',
      name: '记账理财APP UI',
      description: '9个Bento风格屏幕，Canvas图表绘制，数据可视化',
      path: '/demo/finance',
      icon: Wallet,
      gradient: 'from-[#4facfe] to-[#00f2fe]',
      features: ['Bento布局', 'Canvas图表', '预算管理', '账户管理', '数据分析']
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 py-10 px-4">
      <div className="max-w-7xl mx-auto">
        {/* 标题 */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-gray-900 mb-4">
            UI 展示中心
          </h1>
          <p className="text-xl text-gray-600">
            精美的移动应用UI设计展示 · 使用 TypeScript + Tailwind CSS + lucide-react
          </p>
        </div>

        {/* Demo卡片网格 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {demos.map((demo) => (
            <Link
              key={demo.id}
              to={demo.path}
              className="group relative bg-white rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 hover:-translate-y-2"
            >
              {/* 渐变背景头部 */}
              <div className={`h-48 bg-gradient-to-br ${demo.gradient} relative overflow-hidden`}>
                <div className="absolute inset-0 bg-black/10" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-24 h-24 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                    <demo.icon className="w-12 h-12 text-white" />
                  </div>
                </div>
              </div>

              {/* 内容区 */}
              <div className="p-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-2 group-hover:text-indigo-600 transition-colors">
                  {demo.name}
                </h2>
                <p className="text-gray-600 mb-4 leading-relaxed">
                  {demo.description}
                </p>

                {/* 特性标签 */}
                <div className="flex flex-wrap gap-2">
                  {demo.features.map((feature, idx) => (
                    <span
                      key={idx}
                      className="px-3 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded-full group-hover:bg-indigo-100 group-hover:text-indigo-700 transition-colors"
                    >
                      {feature}
                    </span>
                  ))}
                </div>

                {/* 查看按钮 */}
                <div className="mt-6 flex items-center justify-between">
                  <span className="text-indigo-600 font-semibold group-hover:translate-x-2 transition-transform">
                    查看演示 →
                  </span>
                </div>
              </div>

              {/* 悬停效果装饰 */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-16 translate-x-16 group-hover:scale-150 transition-transform duration-500" />
            </Link>
          ))}
        </div>

        {/* 技术栈信息 */}
        <div className="mt-16 bg-white rounded-2xl shadow-lg p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">
            技术栈与特性
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
                <span className="text-3xl text-white font-bold">TS</span>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">TypeScript</h3>
              <p className="text-gray-600 text-sm">类型安全的代码，提升开发效率</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center">
                <span className="text-2xl text-white">🎨</span>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Tailwind CSS</h3>
              <p className="text-gray-600 text-sm">原子化CSS，快速构建现代UI</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-orange-500 to-red-600 rounded-xl flex items-center justify-center">
                <span className="text-2xl text-white">📊</span>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Canvas 图表</h3>
              <p className="text-gray-600 text-sm">丰富的数据可视化和动画效果</p>
            </div>
          </div>
        </div>

        {/* 返回首页 */}
        <div className="mt-12 text-center">
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300"
          >
            <span>←</span>
            <span>返回首页</span>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default DemoHub;

