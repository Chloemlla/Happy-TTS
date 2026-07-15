import React, { useState, useEffect, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaTerminal, FaServer, FaList, FaHistory, FaPlay, FaPlus, FaEye, FaTrash, FaSync, FaEyeSlash, FaArrowLeft, FaInfoCircle, FaChartLine, FaSpaceShuttle } from 'react-icons/fa';
import { Link } from 'react-router-dom';
import { useNotification } from './Notification';
import { api } from '../api/index';
import { useAuth } from '../hooks/useAuth';
import { decryptCommandEnvelope } from '../utils/commandCrypto';
import { getAuthToken } from '../utils/authSession';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';

// 注册Chart.js组件
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);


async function decryptWithSessionToken(envelope: {
  data: string;
  iv: string;
  tag?: string;
  version?: number;
  algorithm?: string;
}): Promise<any> {
  const token = getAuthToken();
  if (!token) {
    throw new Error('Token不存在，无法解密数据');
  }
  return decryptCommandEnvelope(envelope, token);
}

interface CommandHistory {
  historyId: string;
  command: string;
  result: string;
  executedAt: string;
  status: 'success' | 'failed';
  executionTime: number;
  errorMessage: string;
}

interface CommandQueueItem {
  commandId: string;
  command: string;
  addedAt: string;
  status: string;
}

interface ServerStatus {
  uptime: number;
  memory_usage: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
  };
  cpu_usage_percent: number;
  platform: string;
  arch: string;
  node_version: string;
  pid?: number;
  startTime?: number;
  version?: string;
  versions?: {
    node: string;
    v8: string;
    uv: string;
    zlib: string;
    ares: string;
    modules: string;
    nghttp2: string;
    napi: string;
    llhttp: string;
    openssl: string;
    cldr: string;
    icu: string;
    tz: string;
    unicode: string;
  };
}

const ResourceTrendChart = React.lazy(() => import('./CommandManager/ResourceTrendChart'));
const ResourceAnalysisPanel = React.lazy(() => import('./CommandManager/ResourceAnalysisPanel'));

const CommandManager: React.FC = () => {
  const { setNotification } = useNotification();
  const { user } = useAuth();
  const [command, setCommand] = useState('');
  const [password, setPassword] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [commandHistory, setCommandHistory] = useState<CommandHistory[]>([]);
  const [serverStatus, setServerStatus] = useState<ServerStatus | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [commandQueue, setCommandQueue] = useState<CommandQueueItem[]>([]);
  const [isLoadingQueue, setIsLoadingQueue] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [queueLoaded, setQueueLoaded] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastUpdateTime, setLastUpdateTime] = useState<Date | null>(null);
  const [resourceHistory, setResourceHistory] = useState<Array<{
    timestamp: Date;
    memoryUsage: number;
    cpuUsage: number;
  }>>([]);
  const [showCharts, setShowCharts] = useState(false);

  // 获取服务器状态（支持是否弹出成功提示）
  const fetchServerStatus = async (showSuccess = true) => {
    try {
      const response = await api.post('/api/command/status', { password });
      // 检查是否为加密数据
      if (response.data.data && response.data.iv && typeof response.data.data === 'string' && typeof response.data.iv === 'string') {
        try {
          const decryptedData = await decryptWithSessionToken(response.data);
          setServerStatus(decryptedData);
          setLastUpdateTime(new Date());
          // 添加资源使用历史记录
          const currentTime = new Date();
          const memoryUsagePercent = (decryptedData.memory_usage.heapUsed / decryptedData.memory_usage.heapTotal) * 100;
          setResourceHistory(prev => {
            const newHistory = [...prev, {
              timestamp: currentTime,
              memoryUsage: memoryUsagePercent,
              cpuUsage: decryptedData.cpu_usage_percent
            }];
            return newHistory.slice(-20);
          });
          if (showSuccess) setNotification({ message: '服务器状态获取成功', type: 'success' });
        } catch (decryptError) {
          setNotification({ message: '数据解密失败，请检查登录状态', type: 'error' });
        }
      } else {
        setServerStatus(response.data);
        setLastUpdateTime(new Date());
        if (showSuccess) setNotification({ message: '服务器状态获取成功', type: 'success' });
      }
    } catch (error: any) {
      setNotification({ 
        message: error.response?.data?.error || '获取服务器状态失败', 
        type: 'error' 
      });
    }
  };

  // 自动刷新效果
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (autoRefresh && password) {
      interval = setInterval(() => {
        fetchServerStatus(false); // 自动刷新时不弹出成功提示
      }, 6000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh, password]);

  // 检查管理员权限
  if (!user || user.role !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <FaSpaceShuttle style={{ fontSize: 120, lineHeight: 1 }} className="text-blue-500" />
        <div className="text-3xl font-bold mt-6 mb-2 text-rose-600 drop-shadow-lg">你不是管理员，禁止访问！</div>
        <div className="text-lg text-gray-500 mb-8">请用管理员账号登录后再来玩哦~<br/><span className="text-rose-400">（火箭发射中心需要管理员权限）</span></div>
        <div className="text-base text-gray-400 italic mt-4">仅限管理员使用，命令控制台仅供娱乐。</div>
      </div>
    );
  }

  // 执行命令
  const executeCommand = async () => {
    if (!command.trim() || !password.trim()) {
      setNotification({ message: '请输入命令和管理员密码', type: 'warning' });
      return;
    }

    setIsExecuting(true);
    try {
      const response = await api.post('/api/command/execute', { command, password });
      
      const newHistory: CommandHistory = {
        historyId: Date.now().toString(),
        command: command,
        result: response.data.output,
        executedAt: new Date().toISOString(),
        status: 'success',
        executionTime: 0,
        errorMessage: ''
      };
      
      setCommandHistory(prev => [newHistory, ...prev.slice(0, 9)]); // 保留最近10条
      setCommand('');
      setNotification({ message: '命令执行成功', type: 'success' });
    } catch (error: any) {
      const newHistory: CommandHistory = {
        historyId: Date.now().toString(),
        command: command,
        result: error.response?.data?.error || '命令执行失败',
        executedAt: new Date().toISOString(),
        status: 'failed',
        executionTime: 0,
        errorMessage: error.response?.data?.error || '命令执行失败'
      };
      
      setCommandHistory(prev => [newHistory, ...prev.slice(0, 9)]);
      setNotification({ 
        message: error.response?.data?.error || '命令执行失败', 
        type: 'error' 
      });
    } finally {
      setIsExecuting(false);
    }
  };

  // 添加命令到队列
  const addToQueue = async () => {
    if (!command.trim() || !password.trim()) {
      setNotification({ message: '请输入命令和管理员密码', type: 'warning' });
      return;
    }

    try {
      await api.post('/api/command/y', { command, password });
      setCommand('');
      setNotification({ message: '命令已添加到队列', type: 'success' });
    } catch (error: any) {
      setNotification({ 
        message: error.response?.data?.error || '添加命令失败', 
        type: 'error' 
      });
    }
  };

  // 加载命令队列
  const loadCommandQueue = async () => {
    if (isLoadingQueue || queueLoaded) return;
    
    setIsLoadingQueue(true);
    try {
      const response = await api.get('/api/command/q');
      
      // 检查是否为加密数据
      if (response.data.data && response.data.iv && typeof response.data.data === 'string' && typeof response.data.iv === 'string') {
        try {
                                        
          const decryptedData = await decryptWithSessionToken(response.data);
          
                    
          if (Array.isArray(decryptedData)) {
            setCommandQueue(decryptedData);
          } else if (decryptedData.command) {
            setCommandQueue([decryptedData]);
          } else {
            setCommandQueue([]);
          }
          setQueueLoaded(true);
          setNotification({ message: '命令队列加载成功', type: 'success' });
        } catch (decryptError) {
                    setNotification({ message: '数据解密失败，请检查登录状态', type: 'error' });
        }
      } else {
        // 兼容未加密格式
                if (Array.isArray(response.data)) {
          setCommandQueue(response.data);
        } else if (response.data.command) {
          setCommandQueue([response.data]);
        } else {
          setCommandQueue([]);
        }
        setQueueLoaded(true);
        setNotification({ message: '命令队列加载成功', type: 'success' });
      }
    } catch (error: any) {
      setNotification({ 
        message: error.response?.data?.error || '加载命令队列失败', 
        type: 'error' 
      });
    } finally {
      setIsLoadingQueue(false);
    }
  };

  // 获取下一个命令（保持原有功能）
  const getNextCommand = async () => {
    try {
      const response = await api.get('/api/command/q');
      
      // 检查是否为加密数据
      if (response.data.data && response.data.iv && typeof response.data.data === 'string' && typeof response.data.iv === 'string') {
        try {
                                        
          const decryptedData = await decryptWithSessionToken(response.data);
          
                    
          if (decryptedData.command) {
            setNotification({ 
              message: `下一个命令: ${decryptedData.command}`, 
              type: 'info' 
            });
          } else {
            setNotification({ message: '队列中没有命令', type: 'info' });
          }
        } catch (decryptError) {
                    setNotification({ message: '数据解密失败，请检查登录状态', type: 'error' });
        }
      } else {
        // 兼容未加密格式
                if (response.data.command) {
          setNotification({ 
            message: `下一个命令: ${response.data.command}`, 
            type: 'info' 
          });
        } else {
          setNotification({ message: '队列中没有命令', type: 'info' });
        }
      }
    } catch (error: any) {
      setNotification({ 
        message: error.response?.data?.error || '获取命令失败', 
        type: 'error' 
      });
    }
  };

  // 移除命令
  const removeCommand = async (commandId: string) => {
    try {
      await api.post('/api/command/p', { commandId });
      setCommandQueue(prev => prev.filter(cmd => cmd.commandId !== commandId));
      setNotification({ message: '命令已从队列移除', type: 'success' });
    } catch (error: any) {
      setNotification({ 
        message: error.response?.data?.error || '移除命令失败', 
        type: 'error' 
      });
    }
  };

  // 加载执行历史
  const loadExecutionHistory = async () => {
    if (isLoadingHistory || historyLoaded) return;
    
    setIsLoadingHistory(true);
    try {
      const response = await api.get('/api/command/history');
      
      // 检查是否为加密数据
      if (response.data.data && response.data.iv && typeof response.data.data === 'string' && typeof response.data.iv === 'string') {
        try {
          console.log('🔐 开始解密执行历史数据...');
                              
          const decryptedData = await decryptWithSessionToken(response.data);
          
          console.log('✅ 解密成功，获取到执行历史数据');
          
          if (Array.isArray(decryptedData)) {
            setCommandHistory(decryptedData);
          } else {
            setCommandHistory([]);
          }
          setHistoryLoaded(true);
          setNotification({ message: '执行历史加载成功', type: 'success' });
        } catch (decryptError) {
                    setNotification({ message: '数据解密失败，请检查登录状态', type: 'error' });
        }
      } else {
        // 兼容未加密格式
                if (Array.isArray(response.data)) {
          setCommandHistory(response.data);
        } else {
          setCommandHistory([]);
        }
        setHistoryLoaded(true);
        setNotification({ message: '执行历史加载成功', type: 'success' });
      }
    } catch (error: any) {
      setNotification({ 
        message: error.response?.data?.error || '加载执行历史失败', 
        type: 'error' 
      });
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // 清空历史记录
  const clearHistory = async () => {
    try {
      await api.post('/api/command/clear-history', { password });
      setCommandHistory([]);
      setHistoryLoaded(false);
      setNotification({ message: '历史记录已清空', type: 'success' });
    } catch (error: any) {
      setNotification({ 
        message: error.response?.data?.error || '清空历史记录失败', 
        type: 'error' 
      });
    }
  };

  // 格式化内存使用量
  const formatMemory = (bytes: number) => {
    const mb = bytes / 1024 / 1024;
    return `${mb.toFixed(2)} MB`;
  };

  // 格式化运行时间
  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${days}天 ${hours}小时 ${minutes}分钟`;
  };

  // 获取内存使用状态颜色
  const getMemoryStatusColor = (percentage: number) => {
    if (percentage < 50) return 'text-green-600';
    if (percentage < 80) return 'text-yellow-600';
    return 'text-red-600';
  };

  // 获取CPU使用状态颜色
  const getCPUStatusColor = (percentage: number) => {
    if (percentage < 30) return 'text-green-600';
    if (percentage < 70) return 'text-yellow-600';
    return 'text-red-600';
  };

  // 内存使用情况分析
  const analyzeMemoryUsage = (memoryUsage: any) => {
    const heapUsed = memoryUsage.heapUsed;
    const heapTotal = memoryUsage.heapTotal;
    const rss = memoryUsage.rss;
    const external = memoryUsage.external;
    
    const heapUsagePercent = (heapUsed / heapTotal) * 100;
    const rssToHeapRatio = rss / heapTotal;
    
    let status = '';
    let level = '';
    let suggestions: string[] = [];
    
    // 分析堆内存使用情况
    if (heapUsagePercent < 30) {
      status = '内存使用情况良好';
      level = 'excellent';
      suggestions.push('系统运行稳定，内存资源充足');
    } else if (heapUsagePercent < 60) {
      status = '内存使用情况正常';
      level = 'good';
      suggestions.push('内存使用在合理范围内');
    } else if (heapUsagePercent < 80) {
      status = '内存使用较高，需要关注';
      level = 'warning';
      suggestions.push('建议监控内存使用趋势');
      suggestions.push('考虑优化内存密集型操作');
    } else if (heapUsagePercent < 90) {
      status = '内存使用过高，需要优化';
      level = 'critical';
      suggestions.push('立即检查内存泄漏');
      suggestions.push('考虑重启服务释放内存');
      suggestions.push('优化代码中的内存使用');
    } else {
      status = '内存使用严重超载';
      level = 'danger';
      suggestions.push('立即重启服务');
      suggestions.push('检查内存泄漏问题');
      suggestions.push('考虑增加服务器内存');
    }
    
    // 分析RSS内存情况
    if (rssToHeapRatio > 3) {
      status += '，RSS内存占用过高';
      suggestions.push('检查是否有大量外部内存占用');
      suggestions.push('考虑优化第三方库使用');
    }
    
    // 分析外部内存情况
    if (external > heapTotal * 0.5) {
      status += '，外部内存占用较多';
      suggestions.push('检查Buffer和Stream使用情况');
      suggestions.push('优化文件操作和网络请求');
    }
    
    return {
      status,
      level,
      suggestions,
      heapUsagePercent: heapUsagePercent.toFixed(1),
      rssToHeapRatio: rssToHeapRatio.toFixed(2),
      externalRatio: ((external / heapTotal) * 100).toFixed(1)
    };
  };

  // CPU使用情况分析
  const analyzeCPUUsage = (cpuUsage: number) => {
    let status = '';
    let level = '';
    let suggestions: string[] = [];
    
    if (cpuUsage < 20) {
      status = 'CPU使用率很低，系统负载轻松';
      level = 'excellent';
      suggestions.push('系统运行非常稳定');
      suggestions.push('可以处理更多并发请求');
    } else if (cpuUsage < 50) {
      status = 'CPU使用率正常，系统运行良好';
      level = 'good';
      suggestions.push('系统负载在合理范围内');
    } else if (cpuUsage < 80) {
      status = 'CPU使用率较高，需要注意';
      level = 'warning';
      suggestions.push('监控CPU使用趋势');
      suggestions.push('检查是否有CPU密集型操作');
    } else if (cpuUsage < 95) {
      status = 'CPU使用率过高，需要优化';
      level = 'critical';
      suggestions.push('检查CPU密集型任务');
      suggestions.push('考虑负载均衡');
      suggestions.push('优化代码性能');
    } else {
      status = 'CPU使用率严重超载';
      level = 'danger';
      suggestions.push('立即检查系统负载');
      suggestions.push('考虑重启服务');
      suggestions.push('检查是否有死循环或异常进程');
    }
    
    return {
      status,
      level,
      suggestions,
      usage: cpuUsage.toFixed(1)
    };
  };

  // 获取状态等级对应的样式
  const getStatusLevelStyle = (level: string) => {
    switch (level) {
      case 'excellent':
        return 'bg-green-100 border-green-300 text-green-800';
      case 'good':
        return 'bg-blue-100 border-blue-300 text-blue-800';
      case 'warning':
        return 'bg-yellow-100 border-yellow-300 text-yellow-800';
      case 'critical':
        return 'bg-orange-100 border-orange-300 text-orange-800';
      case 'danger':
        return 'bg-red-100 border-red-300 text-red-800';
      default:
        return 'bg-gray-100 border-gray-300 text-gray-800';
    }
  };

  // 获取状态等级对应的图标
  const getStatusLevelIcon = (level: string) => {
    switch (level) {
      case 'excellent':
        return '🟢';
      case 'good':
        return '🔵';
      case 'warning':
        return '🟡';
      case 'critical':
        return '🟠';
      case 'danger':
        return '🔴';
      default:
        return '⚪';
    }
  };

  // 分析资源使用趋势
  const analyzeResourceTrend = (history: Array<{timestamp: Date; memoryUsage: number; cpuUsage: number}>) => {
    if (history.length < 2) {
      return {
        memoryTrend: 'stable',
        cpuTrend: 'stable',
        memoryChange: 0,
        cpuChange: 0,
        trendDescription: '数据不足，无法分析趋势'
      };
    }

    const recent = history.slice(-3); // 最近3个数据点
    const older = history.slice(-6, -3); // 前3个数据点

    const recentMemoryAvg = recent.reduce((sum, item) => sum + item.memoryUsage, 0) / recent.length;
    const olderMemoryAvg = older.reduce((sum, item) => sum + item.memoryUsage, 0) / older.length;
    const memoryChange = recentMemoryAvg - olderMemoryAvg;

    const recentCpuAvg = recent.reduce((sum, item) => sum + item.cpuUsage, 0) / recent.length;
    const olderCpuAvg = older.reduce((sum, item) => sum + item.cpuUsage, 0) / older.length;
    const cpuChange = recentCpuAvg - olderCpuAvg;

    let memoryTrend = 'stable';
    let cpuTrend = 'stable';
    let trendDescription = '';

    // 分析内存趋势
    if (memoryChange > 5) {
      memoryTrend = 'increasing';
      trendDescription += '内存使用呈上升趋势，';
    } else if (memoryChange < -5) {
      memoryTrend = 'decreasing';
      trendDescription += '内存使用呈下降趋势，';
    }

    // 分析CPU趋势
    if (cpuChange > 10) {
      cpuTrend = 'increasing';
      trendDescription += 'CPU使用呈上升趋势';
    } else if (cpuChange < -10) {
      cpuTrend = 'decreasing';
      trendDescription += 'CPU使用呈下降趋势';
    }

    if (!trendDescription) {
      trendDescription = '资源使用相对稳定';
    }

    return {
      memoryTrend,
      cpuTrend,
      memoryChange: memoryChange.toFixed(1),
      cpuChange: cpuChange.toFixed(1),
      trendDescription
    };
  };

  // 图表配置
  const getChartData = () => {
    if (resourceHistory.length === 0) {
      return {
        labels: [],
        datasets: []
      };
    }

    const labels = resourceHistory.map(item => 
      item.timestamp.toLocaleTimeString('zh-CN', { 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit' 
      })
    );

    return {
      labels,
      datasets: [
        {
          label: '内存使用率 (%)',
          data: resourceHistory.map(item => item.memoryUsage),
          borderColor: 'rgb(59, 130, 246)',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          pointRadius: 3,
          pointHoverRadius: 6,
          yAxisID: 'y'
        },
        {
          label: 'CPU使用率 (%)',
          data: resourceHistory.map(item => item.cpuUsage),
          borderColor: 'rgb(239, 68, 68)',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          pointRadius: 3,
          pointHoverRadius: 6,
          yAxisID: 'y'
        }
      ]
    };
  };

  const getChartOptions = () => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          usePointStyle: true,
          padding: 20
        }
      },
      title: {
        display: true,
        text: '系统资源使用趋势图'
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleColor: 'white',
        bodyColor: 'white',
        displayColors: true
      }
    },
    scales: {
      x: {
        display: true,
        title: {
          display: true,
          text: '时间'
        },
        grid: {
          color: 'rgba(0, 0, 0, 0.1)'
        }
      },
      y: {
        type: 'linear' as const,
        display: true,
        position: 'left' as const,
        title: {
          display: true,
          text: '使用率 (%)'
        },
        min: 0,
        max: 100,
        grid: {
          color: 'rgba(0, 0, 0, 0.1)'
        },
        ticks: {
          callback: (value: any) => `${value}%`
        }
      }
    }
  });

  return (
    <div className="space-y-6">
      {/* 标题和说明 */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-100">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-blue-700 flex items-center gap-2">
            <FaTerminal className="w-6 h-6" />
            命令执行管理
          </h2>
          <Link 
            to="/"
            className="px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition text-sm font-medium flex items-center gap-2"
          >
            <FaArrowLeft className="w-4 h-4" />
            返回主页
          </Link>
        </div>
        <div className="text-gray-600 space-y-2">
          <p>此功能用于执行系统命令和管理命令队列，支持实时命令执行、队列管理和执行历史查看。</p>
          <div className="flex items-start gap-2 text-sm">
            <FaInfoCircle className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold text-blue-700">功能说明：</p>
              <ul className="list-disc list-inside space-y-1 mt-1">
                <li>支持实时命令执行</li>
                <li>命令队列管理</li>
                <li>执行历史记录</li>
                <li>服务器状态监控</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* 命令执行 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-xl p-6 shadow-sm border border-gray-200"
      >
        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <FaPlay className="w-5 h-5 text-green-500" />
          命令执行
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* 命令输入 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              命令输入
            </label>
            <textarea
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="输入要执行的命令..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
              rows={3}
            />
          </div>

          {/* 管理员密码 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              管理员密码
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="输入管理员密码"
                className="w-full px-3 py-2 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1.5 rounded-full hover:bg-gray-100 transition-colors duration-200 flex items-center justify-center w-8 h-8"
              >
                {showPassword ? (
                  <FaEyeSlash className="w-4 h-4" />
                ) : (
                  <FaEye className="w-4 h-4" />
                )}
              </button>
            </div>
            <div className="mt-1 text-xs text-gray-500 flex items-center gap-1">
              <FaInfoCircle className="text-blue-500" />
              可在 EnvManager 的管理员安全配置中修改
            </div>
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="mt-4 flex flex-col sm:flex-row gap-3">
          <motion.button
            onClick={executeCommand}
            disabled={isExecuting}
            className={`flex-1 py-3 px-6 rounded-lg font-semibold text-white transition-all duration-200 ${
              isExecuting
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-600 hover:to-blue-700 shadow-lg hover:shadow-xl'
            }`}
            whileHover={!isExecuting ? { scale: 1.02 } : {}}
            whileTap={!isExecuting ? { scale: 0.98 } : {}}
          >
            {isExecuting ? (
              <div className="flex items-center justify-center space-x-2">
                <FaSync className="animate-spin w-5 h-5" />
                <span>执行中...</span>
              </div>
            ) : (
              <div className="flex items-center justify-center space-x-2">
                <FaPlay className="w-5 h-5" />
                <span>执行命令</span>
              </div>
            )}
          </motion.button>
          
          <motion.button
            onClick={addToQueue}
            className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg hover:from-green-600 hover:to-emerald-700 transition-all duration-200 font-semibold shadow-lg hover:shadow-xl flex items-center justify-center"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <FaPlus className="w-5 h-5" />
          </motion.button>
        </div>
      </motion.div>

      {/* 服务器状态 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-xl p-6 shadow-sm border border-gray-200"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <FaServer className="w-5 h-5 text-blue-500" />
            服务器状态
          </h3>
          <div className="flex gap-2">
            <motion.button
              onClick={() => fetchServerStatus()}
              className="px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition text-sm font-medium flex items-center gap-2"
              whileTap={{ scale: 0.95 }}
            >
              <FaSync className="w-4 h-4" />
              刷新
            </motion.button>
            <motion.button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`px-3 py-2 rounded-lg transition text-sm font-medium flex items-center gap-2 ${
                autoRefresh 
                  ? 'bg-green-500 text-white hover:bg-green-600' 
                  : 'bg-gray-500 text-white hover:bg-gray-600'
              }`}
              whileTap={{ scale: 0.95 }}
            >
              <FaSync className={`w-4 h-4 ${autoRefresh ? 'animate-spin' : ''}`} />
              {autoRefresh ? '停止自动刷新' : '开启自动刷新'}
            </motion.button>
            <motion.button
              onClick={() => setShowCharts(!showCharts)}
              className={`px-3 py-2 rounded-lg transition text-sm font-medium flex items-center gap-2 ${
                showCharts 
                  ? 'bg-purple-500 text-white hover:bg-purple-600' 
                  : 'bg-gray-500 text-white hover:bg-gray-600'
              }`}
              whileTap={{ scale: 0.95 }}
            >
              <FaChartLine className="w-4 h-4" />
              {showCharts ? '隐藏图表' : '显示图表'}
            </motion.button>
          </div>
        </div>
        
        {serverStatus ? (
          <div className="space-y-4">
            {/* 系统信息摘要 */}
            <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-lg p-4 text-white">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-lg font-semibold flex items-center gap-2">
                  <FaServer className="w-5 h-5" />
                  系统信息摘要
                </h4>
                <div className="text-sm opacity-90">
                  最后更新: {lastUpdateTime ? new Date(lastUpdateTime).toLocaleTimeString('zh-CN') : 'N/A'}
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold">{serverStatus.platform}</div>
                  <div className="text-sm opacity-90">操作系统</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">{serverStatus.arch}</div>
                  <div className="text-sm opacity-90">架构</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">{serverStatus.node_version}</div>
                  <div className="text-sm opacity-90">Node.js</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">{formatUptime(serverStatus.uptime).split(' ')[0]}</div>
                  <div className="text-sm opacity-90">运行天数</div>
                </div>
              </div>
            </div>

            {/* 基础状态信息 */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-blue-50 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-blue-700">{formatUptime(serverStatus.uptime)}</div>
                <div className="text-sm text-gray-600">运行时间</div>
              </div>
              <div className="bg-green-50 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-green-700">{serverStatus.platform}</div>
                <div className="text-sm text-gray-600">平台</div>
              </div>
              <div className="bg-purple-50 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-purple-700">{formatMemory(serverStatus.memory_usage.heapUsed)}</div>
                <div className="text-sm text-gray-600">内存使用</div>
              </div>
              <div className="bg-orange-50 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-orange-700">{serverStatus.cpu_usage_percent.toFixed(1)}%</div>
                <div className="text-sm text-gray-600">CPU使用率</div>
              </div>
            </div>

            {/* 架构和版本信息 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-indigo-50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-indigo-700">系统架构</span>
                  <span className="text-xs text-indigo-500">Architecture</span>
                </div>
                <div className="text-lg font-bold text-indigo-800">{serverStatus.arch}</div>
                <div className="text-xs text-indigo-600 mt-1">处理器架构</div>
              </div>
              
              <div className="bg-teal-50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-teal-700">Node.js版本</span>
                  <span className="text-xs text-teal-500">Version</span>
                </div>
                <div className="text-lg font-bold text-teal-800">{serverStatus.node_version}</div>
                <div className="text-xs text-teal-600 mt-1">运行时版本</div>
              </div>
              
              <div className="bg-cyan-50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-cyan-700">运行平台</span>
                  <span className="text-xs text-cyan-500">Platform</span>
                </div>
                <div className="text-lg font-bold text-cyan-800">{serverStatus.platform}</div>
                <div className="text-xs text-cyan-600 mt-1">操作系统</div>
              </div>
            </div>

            {/* 进程信息 */}
            {(serverStatus.pid || serverStatus.startTime) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {serverStatus.pid && (
                  <div className="bg-yellow-50 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-yellow-700">进程ID</span>
                      <span className="text-xs text-yellow-500">PID</span>
                    </div>
                    <div className="text-lg font-bold text-yellow-800">{serverStatus.pid}</div>
                    <div className="text-xs text-yellow-600 mt-1">当前进程标识符</div>
                  </div>
                )}
                
                {serverStatus.startTime && (
                  <div className="bg-pink-50 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-pink-700">启动时间</span>
                      <span className="text-xs text-pink-500">Start Time</span>
                    </div>
                    <div className="text-lg font-bold text-pink-800">
                      {new Date(serverStatus.startTime).toLocaleString('zh-CN')}
                    </div>
                    <div className="text-xs text-pink-600 mt-1">进程启动时间戳</div>
                  </div>
                )}
              </div>
            )}

            {/* 详细版本信息 */}
            {serverStatus.versions && (
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <FaInfoCircle className="w-4 h-4 text-gray-500" />
                  详细版本信息
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  <div className="bg-white rounded-lg p-3 border border-gray-200">
                    <div className="text-xs font-medium text-gray-600 mb-1">V8引擎</div>
                    <div className="text-sm font-bold text-blue-600">{serverStatus.versions.v8}</div>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-gray-200">
                    <div className="text-xs font-medium text-gray-600 mb-1">libuv</div>
                    <div className="text-sm font-bold text-green-600">{serverStatus.versions.uv}</div>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-gray-200">
                    <div className="text-xs font-medium text-gray-600 mb-1">OpenSSL</div>
                    <div className="text-sm font-bold text-purple-600">{serverStatus.versions.openssl}</div>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-gray-200">
                    <div className="text-xs font-medium text-gray-600 mb-1">zlib</div>
                    <div className="text-sm font-bold text-orange-600">{serverStatus.versions.zlib}</div>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-gray-200">
                    <div className="text-xs font-medium text-gray-600 mb-1">HTTP/2</div>
                    <div className="text-sm font-bold text-red-600">{serverStatus.versions.nghttp2}</div>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-gray-200">
                    <div className="text-xs font-medium text-gray-600 mb-1">ICU</div>
                    <div className="text-sm font-bold text-indigo-600">{serverStatus.versions.icu}</div>
                  </div>
                </div>
              </div>
            )}

            {/* 详细内存信息 */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <FaServer className="w-4 h-4 text-gray-500" />
                详细内存使用情况
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-lg p-3 border border-gray-200">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-gray-600">堆内存使用</span>
                    <span className="text-xs text-gray-500">Heap Used</span>
                  </div>
                  <div className="text-lg font-bold text-blue-600">{formatMemory(serverStatus.memory_usage.heapUsed)}</div>
                  <div className="text-xs text-gray-500 mt-1">已分配堆内存</div>
                </div>
                
                <div className="bg-white rounded-lg p-3 border border-gray-200">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-gray-600">堆内存总量</span>
                    <span className="text-xs text-gray-500">Heap Total</span>
                  </div>
                  <div className="text-lg font-bold text-green-600">{formatMemory(serverStatus.memory_usage.heapTotal)}</div>
                  <div className="text-xs text-gray-500 mt-1">总堆内存大小</div>
                </div>
                
                <div className="bg-white rounded-lg p-3 border border-gray-200">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-gray-600">RSS内存</span>
                    <span className="text-xs text-gray-500">RSS</span>
                  </div>
                  <div className="text-lg font-bold text-purple-600">{formatMemory(serverStatus.memory_usage.rss)}</div>
                  <div className="text-xs text-gray-500 mt-1">常驻集大小</div>
                </div>
                
                <div className="bg-white rounded-lg p-3 border border-gray-200">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-gray-600">外部内存</span>
                    <span className="text-xs text-gray-500">External</span>
                  </div>
                  <div className="text-lg font-bold text-orange-600">{formatMemory(serverStatus.memory_usage.external)}</div>
                  <div className="text-xs text-gray-500 mt-1">外部内存使用</div>
                </div>
              </div>
              
              {/* 内存使用率进度条 */}
              <div className="mt-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">堆内存使用率</span>
                  <span className="text-sm text-gray-600">
                    {((serverStatus.memory_usage.heapUsed / serverStatus.memory_usage.heapTotal) * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full transition-all duration-300"
                    style={{ 
                      width: `${Math.min(100, (serverStatus.memory_usage.heapUsed / serverStatus.memory_usage.heapTotal) * 100)}%` 
                    }}
                  ></div>
                </div>
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>0 MB</span>
                  <span>{formatMemory(serverStatus.memory_usage.heapTotal)}</span>
                </div>
              </div>
            </div>

            {/* 系统资源概览 */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 border border-blue-200">
              <h4 className="text-sm font-semibold text-blue-700 mb-3 flex items-center gap-2">
                <FaServer className="w-4 h-4 text-blue-500" />
                系统资源概览
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white rounded-lg p-3 border border-blue-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">堆内存使用率</span>
                    <span className={`text-sm font-bold ${getMemoryStatusColor((serverStatus.memory_usage.heapUsed / serverStatus.memory_usage.heapTotal) * 100)}`}>
                      {formatMemory(serverStatus.memory_usage.heapUsed)} / {formatMemory(serverStatus.memory_usage.heapTotal)}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2 mb-1">
                    <div
                      className={`h-2 rounded-full transition-all duration-300 ${
                        (serverStatus.memory_usage.heapUsed / serverStatus.memory_usage.heapTotal) * 100 < 50 ? 'bg-green-500' :
                        (serverStatus.memory_usage.heapUsed / serverStatus.memory_usage.heapTotal) * 100 < 80 ? 'bg-yellow-500' : 'bg-red-500'
                      }`}
                      style={{ 
                        width: `${Math.min(100, (serverStatus.memory_usage.heapUsed / serverStatus.memory_usage.heapTotal) * 100)}%` 
                      }}
                    ></div>
                  </div>
                  <div className="text-xs text-gray-500">
                    {formatMemory(serverStatus.memory_usage.heapUsed)} / {formatMemory(serverStatus.memory_usage.heapTotal)}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    可用: {formatMemory(serverStatus.memory_usage.heapUsed)}
                  </div>
                </div>
                
                <div className="bg-white rounded-lg p-3 border border-blue-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">CPU使用率</span>
                    <span className={`text-sm font-bold ${getCPUStatusColor(serverStatus.cpu_usage_percent)}`}>
                      {serverStatus.cpu_usage_percent.toFixed(1)}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2 mb-1">
                    <div
                      className={`h-2 rounded-full transition-all duration-300 ${
                        serverStatus.cpu_usage_percent < 30 ? 'bg-green-500' :
                        serverStatus.cpu_usage_percent < 70 ? 'bg-yellow-500' : 'bg-red-500'
                      }`}
                      style={{ 
                        width: `${Math.min(100, serverStatus.cpu_usage_percent)}%` 
                      }}
                    ></div>
                  </div>
                  <div className="text-xs text-gray-500">
                    当前CPU负载
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    架构: {serverStatus.arch}
                  </div>
                </div>
                
                <div className="bg-white rounded-lg p-3 border border-blue-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">RSS内存</span>
                    <span className="text-sm font-bold text-purple-600">
                      {formatMemory(serverStatus.memory_usage.rss)}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2 mb-1">
                    <div
                      className="bg-purple-500 h-2 rounded-full transition-all duration-300"
                      style={{ 
                        width: `${Math.min(100, (serverStatus.memory_usage.rss / (serverStatus.memory_usage.heapTotal * 2)) * 100)}%` 
                      }}
                    ></div>
                  </div>
                  <div className="text-xs text-gray-500">
                    常驻内存使用
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    外部: {formatMemory(serverStatus.memory_usage.external)}
                  </div>
                </div>
              </div>
            </div>

            {/* 实时分析结果 */}
            {serverStatus && (
              <div className="space-y-4">
                {/* 分析状态指示器 */}
                <div className="bg-white rounded-lg p-3 border border-gray-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${
                        autoRefresh ? 'bg-green-500 animate-pulse' : 'bg-gray-400'
                      }`}></div>
                      <span className="text-sm font-medium text-gray-700">
                        {autoRefresh ? '实时监控中' : '静态分析'}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500">
                      {lastUpdateTime && `最后更新: ${lastUpdateTime.toLocaleTimeString('zh-CN')}`}
                    </div>
                  </div>
                  {autoRefresh && (
                    <div className="mt-2 text-xs text-gray-600 flex items-center gap-1">
                      <FaInfoCircle className="text-blue-500" />
                      每6秒自动刷新一次，实时监控系统资源使用情况
                    </div>
                  )}
                </div>

                {/* 资源使用趋势图表 */}
                {showCharts && (
                  <Suspense fallback={<div className="h-80 flex items-center justify-center text-gray-400">图表加载中...</div>}>
                    <ResourceTrendChart resourceHistory={resourceHistory} autoRefresh={autoRefresh} />
                  </Suspense>
                )}

                {/* 内存使用分析 */}
                <div className={`rounded-lg p-4 border ${getStatusLevelStyle(analyzeMemoryUsage(serverStatus.memory_usage).level)}`}>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-lg font-semibold flex items-center gap-2">
                      <span className="text-2xl">{getStatusLevelIcon(analyzeMemoryUsage(serverStatus.memory_usage).level)}</span>
                      内存使用分析
                    </h4>
                    <div className="text-sm font-medium">
                      堆内存使用率: {analyzeMemoryUsage(serverStatus.memory_usage).heapUsagePercent}%
                    </div>
                  </div>
                  
                  <div className="mb-3">
                    <p className="text-base font-medium mb-2">
                      {analyzeMemoryUsage(serverStatus.memory_usage).status}
                    </p>
                    <div className="text-sm opacity-90">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
                        <div>RSS/堆内存比例: {analyzeMemoryUsage(serverStatus.memory_usage).rssToHeapRatio}</div>
                        <div>外部内存占比: {analyzeMemoryUsage(serverStatus.memory_usage).externalRatio}%</div>
                        <div>可用内存: {formatMemory(serverStatus.memory_usage.heapUsed)}</div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-white bg-opacity-50 rounded-lg p-3">
                    <h5 className="text-sm font-semibold mb-2 flex items-center gap-1">
                      <FaInfoCircle className="text-blue-500" />
                      优化建议
                    </h5>
                    <ul className="text-sm space-y-1">
                      {analyzeMemoryUsage(serverStatus.memory_usage).suggestions.map((suggestion, index) => (
                        <li key={index} className="flex items-start gap-2">
                          <span className="text-xs mt-1">•</span>
                          <span>{suggestion}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* CPU使用分析 */}
                <div className={`rounded-lg p-4 border ${getStatusLevelStyle(analyzeCPUUsage(serverStatus.cpu_usage_percent).level)}`}>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-lg font-semibold flex items-center gap-2">
                      <span className="text-2xl">{getStatusLevelIcon(analyzeCPUUsage(serverStatus.cpu_usage_percent).level)}</span>
                      CPU使用分析
                    </h4>
                    <div className="text-sm font-medium">
                      CPU使用率: {analyzeCPUUsage(serverStatus.cpu_usage_percent).usage}%
                    </div>
                  </div>
                  
                  <div className="mb-3">
                    <p className="text-base font-medium mb-2">
                      {analyzeCPUUsage(serverStatus.cpu_usage_percent).status}
                    </p>
                    <div className="text-sm opacity-90">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                        <div>系统架构: {serverStatus.arch}</div>
                        <div>运行平台: {serverStatus.platform}</div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-white bg-opacity-50 rounded-lg p-3">
                    <h5 className="text-sm font-semibold mb-2 flex items-center gap-1">
                      <FaInfoCircle className="text-blue-500" />
                      优化建议
                    </h5>
                    <ul className="text-sm space-y-1">
                      {analyzeCPUUsage(serverStatus.cpu_usage_percent).suggestions.map((suggestion, index) => (
                        <li key={index} className="flex items-start gap-2">
                          <span className="text-xs mt-1">•</span>
                          <span>{suggestion}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* 系统健康度评估 */}
                <div className="bg-gradient-to-r from-gray-50 to-blue-50 rounded-lg p-4 border border-gray-200">
                  <h4 className="text-lg font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <FaChartLine className="text-lg text-blue-500" />
                    系统健康度评估
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-white rounded-lg p-3 border border-gray-200">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-700">内存健康度</span>
                        <span className={`text-sm font-bold ${getMemoryStatusColor((serverStatus.memory_usage.heapUsed / serverStatus.memory_usage.heapTotal) * 100)}`}>
                          {analyzeMemoryUsage(serverStatus.memory_usage).level === 'excellent' ? '优秀' :
                           analyzeMemoryUsage(serverStatus.memory_usage).level === 'good' ? '良好' :
                           analyzeMemoryUsage(serverStatus.memory_usage).level === 'warning' ? '注意' :
                           analyzeMemoryUsage(serverStatus.memory_usage).level === 'critical' ? '警告' : '危险'}
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full transition-all duration-300 ${
                            analyzeMemoryUsage(serverStatus.memory_usage).level === 'excellent' ? 'bg-green-500' :
                            analyzeMemoryUsage(serverStatus.memory_usage).level === 'good' ? 'bg-blue-500' :
                            analyzeMemoryUsage(serverStatus.memory_usage).level === 'warning' ? 'bg-yellow-500' :
                            analyzeMemoryUsage(serverStatus.memory_usage).level === 'critical' ? 'bg-orange-500' : 'bg-red-500'
                          }`}
                          style={{ 
                            width: `${Math.min(100, (serverStatus.memory_usage.heapUsed / serverStatus.memory_usage.heapTotal) * 100)}%` 
                          }}
                        ></div>
                      </div>
                    </div>
                    
                    <div className="bg-white rounded-lg p-3 border border-gray-200">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-700">CPU健康度</span>
                        <span className={`text-sm font-bold ${getCPUStatusColor(serverStatus.cpu_usage_percent)}`}>
                          {analyzeCPUUsage(serverStatus.cpu_usage_percent).level === 'excellent' ? '优秀' :
                           analyzeCPUUsage(serverStatus.cpu_usage_percent).level === 'good' ? '良好' :
                           analyzeCPUUsage(serverStatus.cpu_usage_percent).level === 'warning' ? '注意' :
                           analyzeCPUUsage(serverStatus.cpu_usage_percent).level === 'critical' ? '警告' : '危险'}
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full transition-all duration-300 ${
                            analyzeCPUUsage(serverStatus.cpu_usage_percent).level === 'excellent' ? 'bg-green-500' :
                            analyzeCPUUsage(serverStatus.cpu_usage_percent).level === 'good' ? 'bg-blue-500' :
                            analyzeCPUUsage(serverStatus.cpu_usage_percent).level === 'warning' ? 'bg-yellow-500' :
                            analyzeCPUUsage(serverStatus.cpu_usage_percent).level === 'critical' ? 'bg-orange-500' : 'bg-red-500'
                          }`}
                          style={{ 
                            width: `${Math.min(100, serverStatus.cpu_usage_percent)}%` 
                          }}
                        ></div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-3 text-sm text-gray-600">
                    <p className="font-medium mb-1">📈 系统状态总结:</p>
                    <p>
                      {analyzeMemoryUsage(serverStatus.memory_usage).level === 'excellent' && analyzeCPUUsage(serverStatus.cpu_usage_percent).level === 'excellent' 
                        ? '系统运行状态优秀，资源充足，可以稳定处理大量请求。'
                        : analyzeMemoryUsage(serverStatus.memory_usage).level === 'danger' || analyzeCPUUsage(serverStatus.cpu_usage_percent).level === 'danger'
                        ? '系统资源严重不足，建议立即采取措施优化或重启服务。'
                        : '系统运行状态一般，建议关注资源使用趋势，必要时进行优化。'
                      }
                    </p>
                    
                    {/* 趋势分析 */}
                    {resourceHistory.length >= 2 && (
                      <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                        <h5 className="text-sm font-semibold text-blue-700 mb-2 flex items-center gap-1">
                          <FaChartLine className="text-sm text-blue-600" />
                          趋势分析
                        </h5>
                        <div className="text-sm text-blue-800">
                          <p className="mb-2">{analyzeResourceTrend(resourceHistory).trendDescription}</p>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="flex items-center gap-1">
                              <span>内存变化:</span>
                              <span className={`font-medium ${
                                analyzeResourceTrend(resourceHistory).memoryTrend === 'increasing' ? 'text-red-600' :
                                analyzeResourceTrend(resourceHistory).memoryTrend === 'decreasing' ? 'text-green-600' : 'text-gray-600'
                              }`}>
                                {analyzeResourceTrend(resourceHistory).memoryChange}%
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span>CPU变化:</span>
                              <span className={`font-medium ${
                                analyzeResourceTrend(resourceHistory).cpuTrend === 'increasing' ? 'text-red-600' :
                                analyzeResourceTrend(resourceHistory).cpuTrend === 'decreasing' ? 'text-green-600' : 'text-gray-600'
                              }`}>
                                {analyzeResourceTrend(resourceHistory).cpuChange}%
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-gray-50 rounded-lg p-4 text-center text-gray-500">
            点击刷新获取服务器状态
          </div>
        )}
      </motion.div>

      {/* 命令队列 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-xl p-6 shadow-sm border border-gray-200"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <FaList className="w-5 h-5 text-green-500" />
            命令队列
          </h3>
          <div className="flex gap-2">
            {!queueLoaded && (
              <motion.button
                onClick={loadCommandQueue}
                disabled={isLoadingQueue}
                className="px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition disabled:opacity-50 text-sm font-medium flex items-center gap-2"
                whileTap={{ scale: 0.95 }}
              >
                <FaSync className={`w-4 h-4 ${isLoadingQueue ? 'animate-spin' : ''}`} />
                {isLoadingQueue ? '加载中...' : '加载队列'}
              </motion.button>
            )}
            <motion.button
              onClick={getNextCommand}
              className="px-3 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition text-sm font-medium flex items-center gap-2"
              whileTap={{ scale: 0.95 }}
            >
              <FaEye className="w-4 h-4" />
              查看下一个
            </motion.button>
          </div>
        </div>
        
        {!queueLoaded ? (
          <div className="text-center text-gray-500 py-8">
            <FaList className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>点击"加载队列"查看命令队列</p>
          </div>
        ) : commandQueue.length > 0 ? (
          <div className="space-y-2">
            {commandQueue.map((cmd, index) => (
              <div
                key={index}
                className="flex items-center justify-between bg-gray-50 rounded-lg p-3 gap-3"
              >
                <span className="font-mono text-sm text-gray-700 break-all flex-1">{cmd.command}</span>
                <motion.button
                  onClick={() => removeCommand(cmd.commandId)}
                  className="text-red-500 hover:text-red-700 transition-colors p-2 rounded-full hover:bg-red-50 flex items-center justify-center"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                >
                  <FaTrash className="w-4 h-4" />
                </motion.button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center text-gray-500 py-8">
            <FaList className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>命令队列为空</p>
          </div>
        )}
      </motion.div>

      {/* 执行历史 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-xl p-6 shadow-sm border border-gray-200"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <FaHistory className="w-5 h-5 text-blue-500" />
            执行历史
          </h3>
          <div className="flex gap-2">
            {!historyLoaded && (
              <motion.button
                onClick={loadExecutionHistory}
                disabled={isLoadingHistory}
                className="px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition disabled:opacity-50 text-sm font-medium flex items-center gap-2"
                whileTap={{ scale: 0.95 }}
              >
                <FaSync className={`w-4 h-4 ${isLoadingHistory ? 'animate-spin' : ''}`} />
                {isLoadingHistory ? '加载中...' : '加载历史'}
              </motion.button>
            )}
            <motion.button
              onClick={clearHistory}
              className="px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition text-sm font-medium flex items-center gap-2"
              whileTap={{ scale: 0.95 }}
            >
              <FaTrash className="w-4 h-4" />
              清空历史
            </motion.button>
          </div>
        </div>
        
        <AnimatePresence>
          {!historyLoaded ? (
            <div className="text-center text-gray-500 py-8">
              <FaHistory className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>点击"加载历史"查看执行历史</p>
            </div>
          ) : commandHistory.length > 0 ? (
            <div className="space-y-4">
              {commandHistory.map((item) => (
                <div
                  key={item.historyId}
                  className={`border rounded-lg p-4 ${
                    item.status === 'success' 
                      ? 'border-green-200 bg-green-50' 
                      : 'border-red-200 bg-red-50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <FaTerminal className={`w-4 h-4 ${
                        item.status === 'success' ? 'text-green-600' : 'text-red-600'
                      }`} />
                      <span className="font-mono text-sm font-medium">{item.command}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        item.status === 'success' 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {item.status === 'success' ? '成功' : '失败'}
                      </span>
                      <span className="text-xs text-gray-500">{item.executedAt}</span>
                    </div>
                  </div>
                  <div className="bg-white rounded p-3 border">
                    <pre className="text-sm text-gray-700 whitespace-pre-wrap overflow-x-auto">
                      {item.result}
                    </pre>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-gray-500 py-8">
              <FaHistory className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>暂无执行历史</p>
            </div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};

export default CommandManager; 
