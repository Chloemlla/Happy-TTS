import React, { useEffect, useRef } from 'react';
import {
  Home, ClipboardList, BarChart3, User, Plus, ChevronLeft, ChevronRight,
  ChevronRight as ArrowRight, Wallet, CreditCard, Banknote, Building2,
  ShoppingBag, Car, Film, Home as HomeIcon2, Pill, Book, MoreHorizontal,
  DollarSign, TrendingUp, Gift, LogOut, Settings
} from 'lucide-react';
import { FaWallet } from 'react-icons/fa';
import {
  InfoBadge,
  InfoPanel,
  InfoQueryHero,
  InfoQueryShell,
} from './LogShareStyleScaffold';

// 记账理财APP UI展示页面 (Bento设计风格)
const FinanceAppDemo: React.FC = () => {
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  
  // 交互状态
  const [recordType, setRecordType] = React.useState<'expense' | 'income'>('expense');
  const [amount, setAmount] = React.useState('0');
  const [selectedCategory, setSelectedCategory] = React.useState('餐饮');
  const [selectedDate, setSelectedDate] = React.useState('本月');
  const [currentMonth, setCurrentMonth] = React.useState(10);
  const [currentYear, setCurrentYear] = React.useState(2025);
  const [remindersEnabled, setRemindersEnabled] = React.useState(true);
  const [fingerprintEnabled, setFingerprintEnabled] = React.useState(true);

  const setCanvasRef = (index: number) => (el: HTMLCanvasElement | null) => {
    canvasRefs.current[index] = el;
  };

  // 处理数字输入
  const handleNumberClick = (num: string) => {
    if (num === '⌫') {
      setAmount(prev => prev.length > 1 ? prev.slice(0, -1) : '0');
    } else if (num === '.') {
      if (!amount.includes('.')) {
        setAmount(prev => prev + '.');
      }
    } else {
      setAmount(prev => prev === '0' ? num : prev + num);
    }
  };

  // 切换月份
  const changeMonth = (delta: number) => {
    let newMonth = currentMonth + delta;
    let newYear = currentYear;
    if (newMonth < 1) {
      newMonth = 12;
      newYear--;
    } else if (newMonth > 12) {
      newMonth = 1;
      newYear++;
    }
    setCurrentMonth(newMonth);
    setCurrentYear(newYear);
  };

  // Canvas图表绘制
  useEffect(() => {
    // 第4屏: 收支趋势双折线图
    const trendCanvas = canvasRefs.current[0];
    if (trendCanvas) {
      const ctx = trendCanvas.getContext('2d');
      if (ctx) {
        trendCanvas.width = 320;
        trendCanvas.height = 200;
        
        const expenseData = [280, 320, 290, 350, 310, 280, 320];
        const incomeData = [400, 380, 420, 410, 450, 400, 430];
        const labels = ['一', '二', '三', '四', '五', '六', '日'];
        
        const maxValue = Math.max(...expenseData, ...incomeData);
        const padding = 40;
        const chartHeight = 140;
        const chartWidth = 280;
        const pointCount = 7;
        const xStep = chartWidth / (pointCount - 1);
        
        ctx.clearRect(0, 0, 320, 200);
        
        // 绘制背景网格
        ctx.strokeStyle = '#f0f0f0';
        ctx.lineWidth = 1;
        for (let i = 0; i < 5; i++) {
          const y = padding + (chartHeight / 4) * i;
          ctx.beginPath();
          ctx.moveTo(padding, y);
          ctx.lineTo(padding + chartWidth, y);
          ctx.stroke();
        }
        
        // 绘制支出折线
        ctx.strokeStyle = '#ff6b6b';
        ctx.lineWidth = 3;
        ctx.beginPath();
        expenseData.forEach((value, index) => {
          const x = padding + index * xStep;
          const y = padding + chartHeight - (value / maxValue) * chartHeight;
          if (index === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        });
        ctx.stroke();
        
        // 绘制收入折线
        ctx.strokeStyle = '#52c41a';
        ctx.lineWidth = 3;
        ctx.beginPath();
        incomeData.forEach((value, index) => {
          const x = padding + index * xStep;
          const y = padding + chartHeight - (value / maxValue) * chartHeight;
          if (index === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        });
        ctx.stroke();
        
        // 绘制星期标签
        ctx.fillStyle = '#95a5a6';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        labels.forEach((label, index) => {
          const x = padding + index * xStep;
          ctx.fillText(label, x, padding + chartHeight + 20);
        });
      }
    }

    // 第4屏: 分类饼图
    const pieCanvas = canvasRefs.current[1];
    if (pieCanvas) {
      const ctx = pieCanvas.getContext('2d');
      if (ctx) {
        pieCanvas.width = 150;
        pieCanvas.height = 150;
        
        const data = [
          { label: '餐饮', value: 35, color: '#ff6b6b' },
          { label: '购物', value: 25, color: '#4ecdc4' },
          { label: '交通', value: 20, color: '#45b7d1' },
          { label: '娱乐', value: 15, color: '#f7b731' },
          { label: '其他', value: 5, color: '#5f27cd' }
        ];
        
        const centerX = 75;
        const centerY = 75;
        const radius = 60;
        let currentAngle = -Math.PI / 2;
        
        data.forEach(item => {
          const sliceAngle = (item.value / 100) * Math.PI * 2;
          
          ctx.beginPath();
          ctx.moveTo(centerX, centerY);
          ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle);
          ctx.closePath();
          ctx.fillStyle = item.color;
          ctx.fill();
          
          currentAngle += sliceAngle;
        });
        
        // 中心白色圆
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius * 0.6, 0, Math.PI * 2);
        ctx.fillStyle = '#f8f9fa';
        ctx.fill();
      }
    }

    // 第5屏: 预算环形图
    const budgetCanvas = canvasRefs.current[2];
    if (budgetCanvas) {
      const ctx = budgetCanvas.getContext('2d');
      if (ctx) {
        budgetCanvas.width = 200;
        budgetCanvas.height = 200;
        
        const centerX = 100;
        const centerY = 100;
        const radius = 80;
        const lineWidth = 20;
        const progress = 0.54; // 54%
        
        // 背景环
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.strokeStyle = '#f0f0f0';
        ctx.lineWidth = lineWidth;
        ctx.stroke();
        
        // 进度环
        const gradient = ctx.createLinearGradient(0, 0, 200, 200);
        gradient.addColorStop(0, '#667eea');
        gradient.addColorStop(1, '#764ba2');
        
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * progress));
        ctx.strokeStyle = gradient;
        ctx.lineWidth = lineWidth;
        ctx.lineCap = 'round';
        ctx.stroke();
      }
    }

    // 第6屏: 年度收支对比柱状图
    const yearChartCanvas = canvasRefs.current[3];
    if (yearChartCanvas) {
      const ctx = yearChartCanvas.getContext('2d');
      if (ctx) {
        yearChartCanvas.width = 320;
        yearChartCanvas.height = 200;
        
        const months = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
        const incomeData = [4200, 4500, 4800, 4600, 5000, 5200, 5500, 5300, 5800, 5600, 6000, 6200];
        const expenseData = [3800, 4000, 4200, 3900, 4300, 4500, 4800, 4600, 5000, 4800, 5200, 5400];
        
        const maxValue = Math.max(...incomeData, ...expenseData);
        const padding = 40;
        const chartHeight = 140;
        const chartWidth = 280;
        const groupWidth = chartWidth / 12;
        const barWidth = groupWidth / 3;
        
        ctx.clearRect(0, 0, 320, 200);
        
        // 绘制柱子
        months.forEach((month, index) => {
          const x = padding + index * groupWidth;
          
          // 收入柱
          const incomeHeight = (incomeData[index] / maxValue) * chartHeight;
          const incomeGradient = ctx.createLinearGradient(0, padding + chartHeight - incomeHeight, 0, padding + chartHeight);
          incomeGradient.addColorStop(0, '#52c41a');
          incomeGradient.addColorStop(1, '#73d13d');
          ctx.fillStyle = incomeGradient;
          ctx.fillRect(x, padding + chartHeight - incomeHeight, barWidth, incomeHeight);
          
          // 支出柱
          const expenseHeight = (expenseData[index] / maxValue) * chartHeight;
          const expenseGradient = ctx.createLinearGradient(0, padding + chartHeight - expenseHeight, 0, padding + chartHeight);
          expenseGradient.addColorStop(0, '#ff6b6b');
          expenseGradient.addColorStop(1, '#ff8787');
          ctx.fillStyle = expenseGradient;
          ctx.fillRect(x + barWidth, padding + chartHeight - expenseHeight, barWidth, expenseHeight);
        });
        
        // 绘制月份标签(部分)
        ctx.fillStyle = '#95a5a6';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        [0, 3, 6, 9].forEach(index => {
          const x = padding + index * groupWidth + groupWidth / 2;
          ctx.fillText(months[index], x, padding + chartHeight + 20);
        });
      }
    }

    // 第6屏: 月度消费趋势面积图
    const monthTrendCanvas = canvasRefs.current[4];
    if (monthTrendCanvas) {
      const ctx = monthTrendCanvas.getContext('2d');
      if (ctx) {
        monthTrendCanvas.width = 320;
        monthTrendCanvas.height = 200;
        
        const data = [320, 280, 350, 310, 290, 340, 300, 360, 330, 380];
        const maxValue = Math.max(...data);
        const padding = 40;
        const chartHeight = 140;
        const chartWidth = 280;
        const xStep = chartWidth / (data.length - 1);
        
        ctx.clearRect(0, 0, 320, 200);
        
        // 绘制面积填充
        const gradient = ctx.createLinearGradient(0, padding, 0, padding + chartHeight);
        gradient.addColorStop(0, 'rgba(102, 126, 234, 0.3)');
        gradient.addColorStop(1, 'rgba(102, 126, 234, 0.05)');
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(padding, padding + chartHeight);
        data.forEach((value, index) => {
          const x = padding + index * xStep;
          const y = padding + chartHeight - (value / maxValue) * chartHeight;
          ctx.lineTo(x, y);
        });
        ctx.lineTo(padding + chartWidth, padding + chartHeight);
        ctx.closePath();
        ctx.fill();
        
        // 绘制折线
        ctx.strokeStyle = '#667eea';
        ctx.lineWidth = 3;
        ctx.beginPath();
        data.forEach((value, index) => {
          const x = padding + index * xStep;
          const y = padding + chartHeight - (value / maxValue) * chartHeight;
          if (index === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        });
        ctx.stroke();
      }
    }
  }, []);

  return (
    <InfoQueryShell maxWidthClassName="max-w-[1280px]" className="space-y-6">
      <InfoQueryHero
        eyebrow="Demo Center"
        title="记账理财 APP UI 展示"
        description="9 个 Bento 风格记账理财屏幕，覆盖首页、记账、账单、统计、预算、账户和设置等流程。"
        icon={FaWallet}
        meta={
          <>
            <InfoBadge>9 个屏幕</InfoBadge>
            <InfoBadge>Bento 布局</InfoBadge>
            <InfoBadge>Canvas 图表</InfoBadge>
          </>
        }
      />

      <InfoPanel className="overflow-visible">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
          {/* 第1屏: 首页 (Bento网格) */}
          <div className="flex flex-col items-center">
            <h3 className="text-base font-semibold text-slate-700 mb-4">首页 - Bento网格布局</h3>
            <div className="relative w-[360px] h-[780px] rounded-[35px] border-[10px] border-[#2a2a2a] bg-white overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.3)]">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[150px] h-[25px] bg-[#2a2a2a] rounded-b-[12px] z-10" />
              
              <div className="h-full overflow-y-auto scrollbar-hide bg-[#f8f9fa] px-4 pt-8 pb-20">
                {/* Bento网格 */}
                <div className="grid grid-cols-2 gap-3">
                  {/* 资产卡片 - 跨2列 */}
                  <div className="col-span-2 relative bg-gradient-to-br from-[#667eea] to-[#764ba2] rounded-[20px] p-5 text-white overflow-hidden group hover:-translate-y-1 hover:shadow-xl transition-all duration-300">
                    <div className="absolute -top-8 -right-8 w-[100px] h-[100px] rounded-full bg-white/10" />
                    <div className="relative z-10">
                      <div className="text-sm opacity-90 mb-2">总资产（元）</div>
                      <div className="text-[42px] font-light mb-4">12,586.50</div>
                      <div className="flex items-center justify-around pt-4 border-t border-white/20">
                        <div>
                          <div className="text-lg font-medium text-[#52c41a]">+2,580</div>
                          <div className="text-xs opacity-80">本月收入</div>
                        </div>
                        <div>
                          <div className="text-lg font-medium text-[#ff6b6b]">-1,860</div>
                          <div className="text-xs opacity-80">本月支出</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 账户卡片网格 - 跨2列 */}
                  <div className="col-span-2 grid grid-cols-3 gap-2.5">
                    {[
                      { icon: '💵', name: '现金', balance: '528' },
                      { icon: '🏦', name: '银行卡', balance: '8,926' },
                      { icon: '💳', name: '支付宝', balance: '3,132' }
                    ].map((account, idx) => (
                      <div key={idx} className="bg-[#f8f9fa] border border-black/5 rounded-[16px] p-4 text-center hover:bg-white hover:scale-105 hover:border-[#667eea] transition-all duration-300">
                        <div className="text-[28px] mb-2">{account.icon}</div>
                        <div className="text-xs text-[#95a5a6] mb-1">{account.name}</div>
                        <div className="text-base font-bold text-[#2c3e50]">{account.balance}</div>
                      </div>
                    ))}
                  </div>

                  {/* 区块标题 - 跨2列 */}
                  <div className="col-span-2 flex items-center justify-between pt-2">
                    <h3 className="text-base font-bold text-[#2c3e50] tracking-tight">最近交易</h3>
                    <button className="text-xs font-bold text-[#667eea]">查看全部</button>
                  </div>

                  {/* 交易列表 - 跨2列 */}
                  <div className="col-span-2 space-y-2">
                    {[
                      { icon: '🍜', name: '餐饮', note: '午餐', amount: '-42.00', time: '今天 12:30', color: 'from-orange-400 to-orange-500' },
                      { icon: '🚕', name: '交通', note: '打车', amount: '-28.50', time: '今天 09:15', color: 'from-blue-400 to-blue-500' },
                      { icon: '🛍️', name: '购物', note: '淘宝', amount: '-158.00', time: '昨天 20:45', color: 'from-pink-400 to-pink-500' },
                      { icon: '💰', name: '工资', note: '月薪', amount: '+8,500.00', time: '10-15', color: 'from-green-400 to-green-500' }
                    ].map((trans, idx) => (
                      <div key={idx} className="bg-white border border-black/6 rounded-[16px] p-3.5 flex items-center gap-3 hover:border-[#667eea] hover:translate-x-1 transition-all duration-300">
                        <div className={`w-12 h-12 rounded-[14px] bg-gradient-to-br ${trans.color} flex items-center justify-center text-[22px]`}>
                          {trans.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-[#2c3e50]">{trans.name}</div>
                          <div className="text-xs text-[#95a5a6]">{trans.note}</div>
                        </div>
                        <div className="text-right">
                          <div className={`text-base font-bold ${trans.amount.startsWith('-') ? 'text-[#ff6b6b]' : 'text-[#52c41a]'}`}>
                            {trans.amount}
                          </div>
                          <div className="text-[11px] text-[#95a5a6]">{trans.time}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 浮动添加按钮 */}
                <button className="fixed bottom-[90px] right-5 z-10 w-[60px] h-[60px] rounded-[18px] bg-gradient-to-br from-[#667eea] to-[#764ba2] text-white flex items-center justify-center shadow-lg hover:scale-110 hover:shadow-2xl transition-all duration-300">
                  <Plus className="w-8 h-8" />
                </button>

                {/* 底部导航 */}
                <div className="fixed bottom-0 left-0 right-0 h-[70px] bg-white border-t border-gray-100 flex items-center justify-around shadow-[0_-2px_10px_rgba(0,0,0,0.05)] z-20">
                  {[
                    { icon: Home, label: '首页', active: true },
                    { icon: ClipboardList, label: '账单', active: false },
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

          {/* 第2屏: 记账页面 */}
          <div className="flex flex-col items-center">
            <h3 className="text-base font-semibold text-slate-700 mb-4">记账页面</h3>
            <div className="relative w-[360px] h-[780px] rounded-[35px] border-[10px] border-[#2a2a2a] bg-white overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.3)]">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[150px] h-[25px] bg-[#2a2a2a] rounded-b-[12px] z-10" />
              
              <div className="h-full flex flex-col bg-white">
                {/* 类型切换 */}
                <div className="flex gap-2.5 p-5 bg-white">
                  <button 
                    onClick={() => setRecordType('expense')}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
                      recordType === 'expense' 
                        ? 'bg-[#ff6b6b] text-white' 
                        : 'bg-[#ff6b6b]/10 text-[#ff6b6b]'
                    }`}
                  >
                    支出
                  </button>
                  <button 
                    onClick={() => setRecordType('income')}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
                      recordType === 'income' 
                        ? 'bg-[#52c41a] text-white' 
                        : 'bg-[#52c41a]/10 text-[#52c41a]'
                    }`}
                  >
                    收入
                  </button>
                </div>

                {/* 金额显示 */}
                <div className="bg-white py-10 px-5 text-center">
                  <div className="text-2xl text-[#95a5a6] mb-2.5">¥</div>
                  <div className={`text-[56px] font-light min-h-[70px] ${recordType === 'expense' ? 'text-[#ff6b6b]' : 'text-[#52c41a]'}`}>
                    {amount}
                  </div>
                </div>

                {/* 分类选择 */}
                <div className="flex-1 px-5 py-5 overflow-y-auto scrollbar-hide">
                  <div className="grid grid-cols-4 gap-4 mb-5">
                    {[
                      { icon: '🍜', name: '餐饮' },
                      { icon: '🛍️', name: '购物' },
                      { icon: '🚕', name: '交通' },
                      { icon: '🎬', name: '娱乐' },
                      { icon: '🏠', name: '住房' },
                      { icon: '💊', name: '医疗' },
                      { icon: '📚', name: '教育' },
                      { icon: '⋯', name: '其他' }
                    ].map((cat, idx) => (
                      <button
                        key={idx}
                        onClick={() => setSelectedCategory(cat.name)}
                        className={`flex flex-col items-center py-4 px-2.5 rounded-[16px] bg-white border-2 border-black/6 hover:border-[#667eea] hover:scale-105 transition-all duration-300 cursor-pointer
                          ${selectedCategory === cat.name ? 'bg-gradient-to-br from-[#667eea] to-[#764ba2] text-white border-transparent scale-110 shadow-lg' : ''}
                        `}
                      >
                        <span className="text-[28px] mb-1">{cat.icon}</span>
                        <span className="text-xs">{cat.name}</span>
                      </button>
                    ))}
                  </div>

                  {/* 额外信息 */}
                  <div className="bg-white rounded-[20px] p-4 shadow-sm border border-black/6 mb-2.5">
                    {[
                      { label: '备注', value: '午餐' },
                      { label: '日期', value: '今天' },
                      { label: '账户', value: '支付宝' }
                    ].map((item, idx) => (
                      <div key={idx} className={`flex items-center py-2.5 ${idx < 2 ? 'border-b border-[#f0f0f0]' : ''}`}>
                        <div className="w-20 text-sm text-[#95a5a6]">{item.label}</div>
                        <input
                          type="text"
                          placeholder={item.value}
                          className="flex-1 text-sm text-[#2c3e50] border-none outline-none"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* 数字键盘 */}
                <div className="bg-white p-4 grid grid-cols-3 gap-2.5">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'].map((key, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleNumberClick(key)}
                      className={`py-4 bg-white border-2 border-black/6 rounded-[16px] text-xl font-bold text-[#2c3e50] shadow-sm hover:border-[#667eea] hover:-translate-y-0.5 active:scale-95 transition-all duration-200`}
                    >
                      {key}
                    </button>
                  ))}
                  <button 
                    onClick={() => {
                      // 记账确认逻辑
                      setAmount('0');
                    }}
                    className="col-span-3 py-4 bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white rounded-[16px] text-[17px] font-bold shadow-md hover:-translate-y-1 hover:shadow-lg active:scale-95 transition-all duration-300"
                  >
                    确认
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* 第3屏: 账单详情 */}
          <div className="flex flex-col items-center">
            <h3 className="text-base font-semibold text-slate-700 mb-4">账单详情</h3>
            <div className="relative w-[360px] h-[780px] rounded-[35px] border-[10px] border-[#2a2a2a] bg-white overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.3)]">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[150px] h-[25px] bg-[#2a2a2a] rounded-b-[12px] z-10" />
              
              <div className="h-full overflow-y-auto scrollbar-hide bg-[#f8f9fa] pb-20">
                {/* 日期筛选 */}
                <div className="flex gap-2.5 p-5 overflow-x-auto scrollbar-hide">
                  {['本月', '上月', '本年', '2024', '2023', '2022'].map((date, idx) => (
                    <button
                      key={idx}
                      onClick={() => setSelectedDate(date)}
                      className={`px-4 py-2.5 rounded-[20px] text-[13px] font-medium whitespace-nowrap border-2 transition-all duration-300 hover:-translate-y-0.5 hover:border-[#667eea]
                        ${selectedDate === date ? 'bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white border-transparent shadow-md' : 'bg-white text-[#2c3e50] border-black/6'}
                      `}
                    >
                      {date}
                    </button>
                  ))}
                </div>

                {/* 汇总卡片 */}
                <div className="flex gap-3 px-5 pb-5">
                  {[
                    { label: '支出', value: '1,860.50', color: 'text-[#ff6b6b]' },
                    { label: '收入', value: '2,580.00', color: 'text-[#52c41a]' }
                  ].map((sum, idx) => (
                    <div key={idx} className="flex-1 bg-white rounded-[20px] p-6 shadow-sm border border-black/6 hover:-translate-y-1 hover:shadow-lg transition-all duration-300">
                      <div className="text-xs text-[#95a5a6] mb-2">{sum.label}</div>
                      <div className={`text-2xl font-bold ${sum.color}`}>{sum.value}</div>
                    </div>
                  ))}
                </div>

                {/* 时间轴 */}
                <div className="px-5 space-y-4">
                  {[
                    { date: '今天', items: [
                      { icon: '🍜', name: '餐饮', note: '午餐', amount: '-42.00', time: '12:30', color: 'from-orange-400 to-orange-500' },
                      { icon: '🚕', name: '交通', note: '打车', amount: '-28.50', time: '09:15', color: 'from-blue-400 to-blue-500' }
                    ]},
                    { date: '昨天', items: [
                      { icon: '🛍️', name: '购物', note: '淘宝', amount: '-158.00', time: '20:45', color: 'from-pink-400 to-pink-500' },
                      { icon: '🎬', name: '娱乐', note: '电影票', amount: '-86.00', time: '19:30', color: 'from-yellow-400 to-yellow-500' }
                    ]},
                    { date: '10月15日', items: [
                      { icon: '💰', name: '工资', note: '月薪', amount: '+8,500.00', time: '09:00', color: 'from-green-400 to-green-500' }
                    ]}
                  ].map((day, dayIdx) => (
                    <div key={dayIdx}>
                      <div className="relative text-sm text-[#95a5a6] mb-4 pl-4">
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-[#667eea]" />
                        {day.date}
                      </div>
                      <div className="space-y-2.5 relative pl-5">
                        <div className="absolute left-1 top-0 bottom-0 w-0.5 bg-[#e8ecef]" />
                        {day.items.map((item, itemIdx) => (
                          <div
                            key={itemIdx}
                            className="relative bg-white rounded-xl p-3 flex items-center gap-3 shadow-sm border border-black/6 hover:-translate-y-0.5 hover:shadow-md transition-all duration-300"
                          >
                            <div className={`w-12 h-12 rounded-[14px] bg-gradient-to-br ${item.color} flex items-center justify-center text-[22px]`}>
                              {item.icon}
                            </div>
                            <div className="flex-1">
                              <div className="text-sm font-medium text-[#2c3e50]">{item.name}</div>
                              <div className="text-xs text-[#95a5a6]">{item.note} · {item.time}</div>
                            </div>
                            <div className={`text-base font-bold ${item.amount.startsWith('-') ? 'text-[#ff6b6b]' : 'text-[#52c41a]'}`}>
                              {item.amount}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 第4屏: 统计分析 */}
          <div className="flex flex-col items-center">
            <h3 className="text-base font-semibold text-slate-700 mb-4">统计分析</h3>
            <div className="relative w-[360px] h-[780px] rounded-[35px] border-[10px] border-[#2a2a2a] bg-white overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.3)]">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[150px] h-[25px] bg-[#2a2a2a] rounded-b-[12px] z-10" />
              
              <div className="h-full overflow-y-auto scrollbar-hide bg-[#f8f9fa] pb-20">
                {/* 月份选择器 */}
                <div className="flex items-center justify-between p-5 bg-white">
                  <button 
                    onClick={() => changeMonth(-1)}
                    className="w-8 h-8 rounded-full bg-[#f5f7fa] flex items-center justify-center hover:bg-[#e8ecef] transition-all"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-lg font-bold text-[#2c3e50]">{currentYear}年{currentMonth}月</span>
                  <button 
                    onClick={() => changeMonth(1)}
                    className="w-8 h-8 rounded-full bg-[#f5f7fa] flex items-center justify-center hover:bg-[#e8ecef] transition-all"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                {/* 收支趋势图 */}
                <div className="mx-5 mt-5 bg-white rounded-[20px] p-6 shadow-sm border border-black/6 hover:-translate-y-1 hover:shadow-lg transition-all duration-300">
                  <h3 className="text-[17px] font-bold text-[#2c3e50] mb-4 tracking-tight">收支趋势</h3>
                  <canvas ref={setCanvasRef(0)} width="320" height="200" />
                </div>

                {/* 支出分类饼图 */}
                <div className="mx-5 mt-5 bg-white rounded-[20px] p-6 shadow-sm border border-black/6 hover:-translate-y-1 hover:shadow-lg transition-all duration-300">
                  <h3 className="text-[17px] font-bold text-[#2c3e50] mb-4 tracking-tight">支出分类</h3>
                  <div className="flex items-center gap-5">
                    <canvas ref={setCanvasRef(1)} width="150" height="150" />
                    <div className="flex-1 space-y-2.5">
                      {[
                        { name: '餐饮', value: '35%', color: '#ff6b6b' },
                        { name: '购物', value: '25%', color: '#4ecdc4' },
                        { name: '交通', value: '20%', color: '#45b7d1' },
                        { name: '娱乐', value: '15%', color: '#f7b731' },
                        { name: '其他', value: '5%', color: '#5f27cd' }
                      ].map((cat, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: cat.color }} />
                          <div className="flex-1 text-[13px] text-[#2c3e50]">{cat.name}</div>
                          <div className="text-[13px] text-[#95a5a6]">{cat.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 关键指标 */}
                <div className="grid grid-cols-2 gap-4 px-5 mt-5">
                  {[
                    { label: '日均支出', value: '62.02', unit: '元' },
                    { label: '节余', value: '720', unit: '元' }
                  ].map((metric, idx) => (
                    <div key={idx} className="bg-white rounded-[18px] p-5 text-center shadow-sm border border-black/6 hover:-translate-y-1 hover:shadow-lg hover:border-[#667eea] transition-all duration-300">
                      <div className="text-[32px] font-bold bg-gradient-to-r from-[#667eea] to-[#764ba2] bg-clip-text text-transparent mb-2">
                        {metric.value}<span className="text-sm">{metric.unit}</span>
                      </div>
                      <div className="text-[13px] font-medium text-[#95a5a6]">{metric.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 第5屏: 预算管理 */}
          <div className="flex flex-col items-center">
            <h3 className="text-base font-semibold text-slate-700 mb-4">预算管理</h3>
            <div className="relative w-[360px] h-[780px] rounded-[35px] border-[10px] border-[#2a2a2a] bg-white overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.3)]">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[150px] h-[25px] bg-[#2a2a2a] rounded-b-[12px] z-10" />
              
              <div className="h-full overflow-y-auto scrollbar-hide bg-[#f8f9fa] px-5 pt-5 pb-20">
                {/* 预算环形卡片 */}
                <div className="bg-white rounded-[24px] p-8 text-center shadow-sm border border-black/6 mb-5 hover:-translate-y-1 hover:shadow-lg transition-all duration-300">
                  <div className="relative mx-auto mb-5" style={{ width: '200px', height: '200px' }}>
                    <canvas ref={setCanvasRef(2)} width="200" height="200" />
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <div className="text-4xl font-bold text-[#2c3e50] mb-1">54%</div>
                      <div className="text-xs text-[#95a5a6]">已使用</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-around pt-5 border-t border-[#f0f0f0]">
                    {[
                      { label: '总预算', value: '5,000', color: 'text-[#2c3e50]' },
                      { label: '已使用', value: '2,700', color: 'text-[#ff6b6b]' },
                      { label: '剩余', value: '2,300', color: 'text-[#52c41a]' }
                    ].map((item, idx) => (
                      <div key={idx} className="text-center">
                        <div className={`text-xl font-bold ${item.color} mb-1`}>{item.value}</div>
                        <div className="text-xs text-[#95a5a6]">{item.label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 预算列表 */}
                <div className="bg-white rounded-[24px] p-6 shadow-sm border border-black/6 hover:shadow-lg transition-all duration-300">
                  {[
                    { name: '餐饮', budget: 1500, used: 1200, status: 'normal' },
                    { name: '购物', budget: 1000, used: 920, status: 'warning' },
                    { name: '交通', budget: 500, used: 380, status: 'normal' },
                    { name: '娱乐', budget: 800, used: 200, status: 'normal' }
                  ].map((item, idx) => (
                    <div key={idx} className={`${idx > 0 ? 'mt-5' : ''}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-[#2c3e50]">{item.name}</span>
                        </div>
                        <div className="text-sm text-[#95a5a6]">{item.used}/{item.budget}</div>
                      </div>
                      <div className="h-2 bg-[#f0f0f0] rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-1000 ease-out ${
                            item.status === 'normal' ? 'bg-gradient-to-r from-[#52c41a] to-[#73d13d]' :
                            item.status === 'warning' ? 'bg-gradient-to-r from-[#f7b731] to-[#ffd93d]' :
                            'bg-gradient-to-r from-[#ff6b6b] to-[#ff8787]'
                          }`}
                          style={{ width: `${(item.used / item.budget) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 第6屏: 图表分析页 */}
          <div className="flex flex-col items-center">
            <h3 className="text-base font-semibold text-slate-700 mb-4">图表分析</h3>
            <div className="relative w-[360px] h-[780px] rounded-[35px] border-[10px] border-[#2a2a2a] bg-white overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.3)]">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[150px] h-[25px] bg-[#2a2a2a] rounded-b-[12px] z-10" />
              
              <div className="h-full overflow-y-auto scrollbar-hide bg-[#f8f9fa] px-5 pt-5 pb-20">
                {/* 年度图表 */}
                <div className="bg-white rounded-[15px] p-5 shadow-sm mb-5">
                  <h3 className="text-base font-semibold text-[#2c3e50] mb-3">年度收支对比</h3>
                  <canvas ref={setCanvasRef(3)} width="320" height="200" />
                </div>

                {/* 月度趋势 */}
                <div className="bg-white rounded-[15px] p-5 shadow-sm mb-5">
                  <h3 className="text-base font-semibold text-[#2c3e50] mb-3">月度消费趋势</h3>
                  <canvas ref={setCanvasRef(4)} width="320" height="200" />
                </div>

                {/* 消费习惯 */}
                <div className="bg-white rounded-[15px] p-5 shadow-sm">
                  <h3 className="text-base font-semibold text-[#2c3e50] mb-3">消费习惯</h3>
                  {[
                    { icon: '🍜', name: '餐饮', percent: 35 },
                    { icon: '🛍️', name: '购物', percent: 25 },
                    { icon: '🚕', name: '交通', percent: 20 }
                  ].map((habit, idx) => (
                    <div key={idx} className="flex items-center gap-3 mb-4 last:mb-0">
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#667eea] to-[#764ba2] text-white text-xs font-bold flex items-center justify-center">
                        {idx + 1}
                      </div>
                      <span className="text-2xl">{habit.icon}</span>
                      <div className="flex-1">
                        <div className="text-sm text-[#2c3e50] mb-1">{habit.name}</div>
                        <div className="h-1.5 bg-[#f0f0f0] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-[#667eea] to-[#764ba2] rounded-full"
                            style={{ width: `${habit.percent}%` }}
                          />
                        </div>
                      </div>
                      <div className="text-sm font-bold text-[#667eea]">{habit.percent}%</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 第7屏: 账户管理 */}
          <div className="flex flex-col items-center">
            <h3 className="text-base font-semibold text-slate-700 mb-4">账户管理</h3>
            <div className="relative w-[360px] h-[780px] rounded-[35px] border-[10px] border-[#2a2a2a] bg-white overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.3)]">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[150px] h-[25px] bg-[#2a2a2a] rounded-b-[12px] z-10" />
              
              <div className="h-full overflow-y-auto scrollbar-hide bg-[#f8f9fa] px-5 pt-5 pb-20">
                {/* 总资产卡片 */}
                <div className="bg-gradient-to-br from-[#4facfe] to-[#00f2fe] rounded-[24px] p-8 text-white mb-5 shadow-md border border-white/20 hover:-translate-y-1 hover:shadow-xl transition-all duration-300">
                  <div className="text-sm opacity-90 mb-2">总资产</div>
                  <div className="text-4xl font-light mb-4">¥12,586.50</div>
                </div>

                {/* 账户列表 */}
                <div className="space-y-3">
                  {[
                    { icon: '💵', name: '现金', balance: '528.00', color: 'from-yellow-400 to-orange-400' },
                    { icon: '🏦', name: '中国银行', balance: '8,926.50', color: 'from-[#667eea] to-[#764ba2]' },
                    { icon: '💳', name: '支付宝', balance: '3,132.00', color: 'from-blue-400 to-blue-500' },
                    { icon: '💚', name: '微信', balance: '0.00', color: 'from-green-400 to-green-500' }
                  ].map((account, idx) => (
                    <div
                      key={idx}
                      className="bg-white rounded-[20px] p-5 flex items-center gap-4 shadow-sm border border-black/6 hover:-translate-y-1 hover:shadow-lg hover:border-[#667eea] transition-all duration-300"
                    >
                      <div className={`w-14 h-14 rounded-[16px] bg-gradient-to-br ${account.color} flex items-center justify-center text-[26px] shadow-md`}>
                        {account.icon}
                      </div>
                      <div className="flex-1">
                        <div className="text-[15px] font-bold text-[#2c3e50] mb-0.5">{account.name}</div>
                        <div className="text-xl font-bold text-[#667eea]">¥{account.balance}</div>
                      </div>
                      <ArrowRight className="w-5 h-5 text-[#95a5a6]" />
                    </div>
                  ))}
                  
                  {/* 添加账户 */}
                  <div className="bg-[#f8f9fa] border-2 border-dashed border-[#d0d0d0] rounded-[20px] p-8 text-center text-[#95a5a6] hover:bg-white hover:border-[#667eea] hover:text-[#667eea] hover:-translate-y-1 hover:shadow-md transition-all duration-300 cursor-pointer">
                    <Plus className="w-8 h-8 mx-auto mb-2" />
                    <div className="text-sm">添加新账户</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 第8屏: 分类管理 */}
          <div className="flex flex-col items-center">
            <h3 className="text-base font-semibold text-slate-700 mb-4">分类管理</h3>
            <div className="relative w-[360px] h-[780px] rounded-[35px] border-[10px] border-[#2a2a2a] bg-white overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.3)]">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[150px] h-[25px] bg-[#2a2a2a] rounded-b-[12px] z-10" />
              
              <div className="h-full overflow-y-auto scrollbar-hide bg-[#f8f9fa] px-5 pt-5 pb-20">
                {/* 支出分类 */}
                <div className="mb-8">
                  <h3 className="text-base font-bold text-[#2c3e50] mb-4">支出分类</h3>
                  <div className="grid grid-cols-4 gap-3">
                    {[
                      { icon: '🍜', name: '餐饮', amount: '650', color: 'from-orange-400 to-orange-500' },
                      { icon: '🛍️', name: '购物', amount: '520', color: 'from-pink-400 to-pink-500' },
                      { icon: '🚕', name: '交通', amount: '380', color: 'from-blue-400 to-blue-500' },
                      { icon: '🎬', name: '娱乐', amount: '310', color: 'from-yellow-400 to-yellow-500' },
                      { icon: '🏠', name: '住房', amount: '0', color: 'from-purple-400 to-purple-500' },
                      { icon: '💊', name: '医疗', amount: '0', color: 'from-red-400 to-red-500' },
                      { icon: '📚', name: '教育', amount: '0', color: 'from-green-400 to-green-500' },
                      { icon: '⋯', name: '其他', amount: '0', color: 'from-gray-400 to-gray-500' }
                    ].map((cat, idx) => (
                      <div
                        key={idx}
                        className="bg-white rounded-[18px] p-4 text-center shadow-sm border border-black/6 hover:-translate-y-1 hover:scale-105 hover:shadow-lg hover:border-[#667eea] transition-all duration-300"
                      >
                        <div className={`w-[52px] h-[52px] rounded-[16px] bg-gradient-to-br ${cat.color} flex items-center justify-center text-2xl shadow-md mx-auto mb-2.5`}>
                          {cat.icon}
                        </div>
                        <div className="text-[13px] text-[#2c3e50] mb-1">{cat.name}</div>
                        <div className="text-[11px] text-[#95a5a6]">¥{cat.amount}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 收入分类 */}
                <div>
                  <h3 className="text-base font-bold text-[#2c3e50] mb-4">收入分类</h3>
                  <div className="grid grid-cols-4 gap-3">
                    {[
                      { icon: '💰', name: '工资', amount: '8,500', color: 'from-green-400 to-green-500' },
                      { icon: '📈', name: '理财', amount: '0', color: 'from-blue-400 to-blue-500' },
                      { icon: '🎁', name: '红包', amount: '0', color: 'from-red-400 to-red-500' },
                      { icon: '⋯', name: '其他', amount: '0', color: 'from-gray-400 to-gray-500' }
                    ].map((cat, idx) => (
                      <div
                        key={idx}
                        className="bg-white rounded-[18px] p-4 text-center shadow-sm border border-black/6 hover:-translate-y-1 hover:scale-105 hover:shadow-lg hover:border-[#667eea] transition-all duration-300"
                      >
                        <div className={`w-[52px] h-[52px] rounded-[16px] bg-gradient-to-br ${cat.color} flex items-center justify-center text-2xl shadow-md mx-auto mb-2.5`}>
                          {cat.icon}
                        </div>
                        <div className="text-[13px] text-[#2c3e50] mb-1">{cat.name}</div>
                        <div className="text-[11px] text-[#95a5a6]">¥{cat.amount}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 第9屏: 设置页面 */}
          <div className="flex flex-col items-center">
            <h3 className="text-base font-semibold text-slate-700 mb-4">设置页面</h3>
            <div className="relative w-[360px] h-[780px] rounded-[35px] border-[10px] border-[#2a2a2a] bg-white overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.3)]">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[150px] h-[25px] bg-[#2a2a2a] rounded-b-[12px] z-10" />
              
              <div className="h-full overflow-y-auto scrollbar-hide bg-[#f8f9fa] pb-20">
                {/* 个人信息头部 */}
                <div className="bg-gradient-to-br from-[#667eea] to-[#764ba2] px-5 pt-8 pb-7 text-white flex items-center gap-5 rounded-b-[28px] shadow-md">
                  <div className="w-[70px] h-[70px] rounded-full bg-white flex items-center justify-center text-[32px] shadow-lg">
                    💰
                  </div>
                  <div className="flex-1">
                    <h2 className="text-xl font-bold mb-1">理财达人</h2>
                    <div className="inline-block px-3 py-1 bg-yellow-500/30 rounded-[12px] text-xs mb-2">
                      💎 记账365天
                    </div>
                    <div className="text-[13px] opacity-90">坚持记账，财务自由</div>
                  </div>
                </div>

                {/* 设置区块 */}
                <div className="px-5 pt-5 space-y-5">
                  {/* 通用设置 */}
                  <div>
                    <h3 className="text-sm font-semibold text-[#95a5a6] uppercase tracking-wide mb-3">通用设置</h3>
                    <div className="bg-white rounded-[20px] overflow-hidden shadow-sm border border-black/6 hover:shadow-lg transition-shadow">
                      {[
                      { label: '货币单位', value: '人民币（¥）', type: 'arrow' },
                      { label: '月度预算', value: '5,000', type: 'arrow' },
                      { label: '记账提醒', value: '', type: 'toggle', enabled: true },
                      { label: '面容/指纹解锁', value: '', type: 'toggle', enabled: true }
                      ].map((item, idx) => {
                        const enabled = item.label === '记账提醒' ? remindersEnabled : 
                                       item.label === '面容/指纹解锁' ? fingerprintEnabled : false;
                        const handleToggle = () => {
                          if (item.label === '记账提醒') setRemindersEnabled(!remindersEnabled);
                          if (item.label === '面容/指纹解锁') setFingerprintEnabled(!fingerprintEnabled);
                        };

                        return (
                          <div
                            key={idx}
                            className={`flex items-center justify-between px-4 py-4 ${idx < 3 ? 'border-b border-[#f5f7fa]' : ''} hover:bg-[#f8f9fa] hover:pl-5 transition-all`}
                          >
                            <span className="text-[15px] text-[#2c3e50]">{item.label}</span>
                            {item.type === 'arrow' && (
                              <button className="flex items-center gap-2 hover:opacity-70 transition-opacity">
                                <span className="text-[15px] text-[#95a5a6]">{item.value}</span>
                                <ArrowRight className="w-4 h-4 text-[#d0d0d0]" />
                              </button>
                            )}
                            {item.type === 'toggle' && (
                              <button 
                                onClick={handleToggle}
                                className={`w-12 h-7 rounded-full relative transition-colors ${enabled ? 'bg-[#52c41a]' : 'bg-[#d0d0d0]'}`}
                              >
                                <div className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${enabled ? 'right-0.5' : 'left-0.5'}`} />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* 数据管理 */}
                  <div>
                    <h3 className="text-sm font-semibold text-[#95a5a6] uppercase tracking-wide mb-3">数据管理</h3>
                    <div className="bg-white rounded-[20px] overflow-hidden shadow-sm border border-black/6 hover:shadow-lg transition-shadow">
                      {[
                        { label: '数据备份', value: '', type: 'arrow' },
                        { label: '数据恢复', value: '', type: 'arrow' },
                        { label: '导出账单', value: '', type: 'arrow' },
                        { label: '清除缓存', value: '45MB', type: 'arrow' }
                      ].map((item, idx) => (
                        <div
                          key={idx}
                          className={`flex items-center justify-between px-4 py-4 ${idx < 3 ? 'border-b border-[#f5f7fa]' : ''} hover:bg-[#f8f9fa] hover:pl-5 transition-all`}
                        >
                          <span className="text-[15px] text-[#2c3e50]">{item.label}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-[15px] text-[#95a5a6]">{item.value}</span>
                            <ArrowRight className="w-4 h-4 text-[#d0d0d0]" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 关于 */}
                  <div>
                    <h3 className="text-sm font-semibold text-[#95a5a6] uppercase tracking-wide mb-3">关于</h3>
                    <div className="bg-white rounded-[20px] overflow-hidden shadow-sm border border-black/6 hover:shadow-lg transition-shadow">
                      {[
                        { label: '关于我们', value: '', type: 'arrow' },
                        { label: '隐私政策', value: '', type: 'arrow' },
                        { label: '使用条款', value: '', type: 'arrow' },
                        { label: '帮助中心', value: '', type: 'arrow' }
                      ].map((item, idx) => (
                        <div
                          key={idx}
                          className={`flex items-center justify-between px-4 py-4 ${idx < 3 ? 'border-b border-[#f5f7fa]' : ''} hover:bg-[#f8f9fa] hover:pl-5 transition-all`}
                        >
                          <span className="text-[15px] text-[#2c3e50]">{item.label}</span>
                          <ArrowRight className="w-4 h-4 text-[#d0d0d0]" />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 退出登录 */}
                  <button className="w-full bg-white rounded-[15px] py-4 text-[#f5222d] text-base font-semibold shadow-sm border border-[#ff6b6b]/20 hover:-translate-y-0.5 hover:shadow-md transition-all flex items-center justify-center gap-2">
                    <LogOut className="w-4 h-4" />
                    <span>退出登录</span>
                  </button>

                  {/* 版本信息 */}
                  <div className="text-center text-xs text-[#95a5a6] py-5">
                    v3.2.1
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </InfoPanel>

      {/* 动画样式 */}
      <style>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }

        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </InfoQueryShell>
  );
};

export default FinanceAppDemo;

