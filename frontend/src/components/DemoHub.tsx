import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Brain, Code2, Layers, Music, ShoppingBag, Wallet, Wand2 } from 'lucide-react';
import { FaFlask, FaMobileAlt } from 'react-icons/fa';
import {
  InfoBadge,
  InfoPanel,
  InfoQueryHero,
  InfoQueryShell,
  InfoSectionTitle,
  logShareSecondaryButtonClass,
  logShareTileClass,
} from './LogShareStyleScaffold';

// Demo Hub - 所有UI展示页面的导航中心
const DemoHub: React.FC = () => {
  const demos = [
    {
      id: 'xiaohongshu',
      name: '小红书风格瀑布流',
      description: '响应式瀑布流布局，浅色/深色主题切换，搜索筛选，无限滚动',
      path: '/demo/xiaohongshu',
      icon: ShoppingBag,
      features: ['瀑布流布局', '主题切换', '搜索筛选', '无限滚动', '点赞收藏']
    },
    {
      id: 'meditation',
      name: '冥想APP UI',
      description: '9个精美屏幕，Canvas动画效果，呼吸引导，成就系统',
      path: '/demo/meditation',
      icon: Brain,
      features: ['Canvas动画', '呼吸引导', '成就徽章', '日历打卡', '场景库']
    },
    {
      id: 'music',
      name: '音乐播放器UI',
      description: '8个Spotify风格深色主题屏幕，黑胶唱片动画，波形可视化',
      path: '/demo/music',
      icon: Music,
      features: ['深色主题', '黑胶动画', '波形可视化', '歌词页面', '播放列表']
    },
    {
      id: 'finance',
      name: '记账理财APP UI',
      description: '9个Bento风格屏幕，Canvas图表绘制，数据可视化',
      path: '/demo/finance',
      icon: Wallet,
      features: ['Bento布局', 'Canvas图表', '预算管理', '账户管理', '数据分析']
    }
  ];

  const techStack = [
    {
      title: 'TypeScript',
      description: '类型安全的组件结构与状态管理',
      icon: Code2,
    },
    {
      title: 'Tailwind CSS',
      description: '统一响应式布局、间距和交互状态',
      icon: Wand2,
    },
    {
      title: 'Canvas 图表',
      description: '用于动画、统计图和可视化演示',
      icon: Layers,
    },
  ];

  return (
    <InfoQueryShell maxWidthClassName="max-w-7xl" className="space-y-6">
      <InfoQueryHero
        eyebrow="Demo Center"
        title="演示中心"
        description="集中查看移动端 UI 演示页面。入口、卡片、标签和操作按钮已统一为 LogShare 的轻量玻璃面板风格。"
        icon={FaFlask}
        meta={
          <>
            <InfoBadge>4 个应用演示</InfoBadge>
            <InfoBadge>移动端屏幕预览</InfoBadge>
            <InfoBadge>TypeScript + Tailwind CSS</InfoBadge>
          </>
        }
      />

      <InfoPanel>
        <InfoSectionTitle
          icon={FaMobileAlt}
          eyebrow="Showcase"
          title="应用演示"
          description="每个演示保留原有交互和手机画布内容，外层导航和信息承载统一为 LogShare 的清爽工具页视觉。"
        />

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {demos.map((demo) => (
            <Link
              key={demo.id}
              to={demo.path}
              className={`${logShareTileClass} group flex h-full flex-col p-5 transition duration-300 hover:-translate-y-1 hover:border-slate-300 hover:shadow-[0_22px_70px_rgba(15,23,42,0.08)]`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-[22px] border border-slate-200 bg-slate-50 text-slate-600 transition group-hover:border-slate-300 group-hover:text-slate-900">
                  <demo.icon className="h-6 w-6" />
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-slate-900">
                  <ArrowUpRight className="h-4 w-4" />
                </div>
              </div>

              <div className="mt-5 flex flex-1 flex-col">
                <h2 className="text-xl font-semibold text-slate-900">{demo.name}</h2>
                <p className="mt-2 flex-1 text-sm leading-6 text-slate-600">{demo.description}</p>

                <div className="mt-5 flex flex-wrap gap-2">
                  {demo.features.map((feature) => (
                    <InfoBadge key={feature}>{feature}</InfoBadge>
                  ))}
                </div>

                <span className={`${logShareSecondaryButtonClass} mt-6 w-fit`}>
                  查看演示
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </InfoPanel>

      <InfoPanel>
        <InfoSectionTitle title="技术栈与特性" description="演示页面共享的实现基础和交互能力。" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {techStack.map((item) => (
            <div key={item.title} className={`${logShareTileClass} p-4`}>
              <div className="flex h-11 w-11 items-center justify-center rounded-[18px] border border-slate-200 bg-slate-50 text-slate-500">
                <item.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-slate-900">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{item.description}</p>
            </div>
          ))}
        </div>
      </InfoPanel>

      <div className="flex justify-center">
        <Link to="/" className={logShareSecondaryButtonClass}>
          返回首页
        </Link>
      </div>
    </InfoQueryShell>
  );
};

export default DemoHub;

