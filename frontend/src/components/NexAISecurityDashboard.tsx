import React, { useState, useEffect } from 'react';
import { Line, Doughnut, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import axios from 'axios';
import getApiBaseUrl from '../api';
import { toast } from 'react-toastify';
import {
  ShieldCheckIcon,
  ShieldExclamationIcon,
  ExclamationTriangleIcon,
  DevicePhoneMobileIcon,
  UserGroupIcon,
  ChartBarIcon,
  ClockIcon,
  FunnelIcon
} from '@heroicons/react/24/outline';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface DeviceTracking {
  _id: string;
  userId: string;
  deviceFingerprint: string;
  riskScore: number;
  riskLevel: string;
  isCompromised: boolean;
  isRoot: boolean;
  isDebugger: boolean;
  isEmulator: boolean;
  isVpn: boolean;
  signatureValid: boolean;
  hashValid: boolean;
  appVersion?: string;
  appBuild?: string;
  firstSeen: string;
  lastSeen: string;
  requestCount: number;
  blockedCount: number;
  ipAddress?: string;
  userAgent?: string;
}

interface SecurityEvent {
  _id: string;
  deviceFingerprint: string;
  userId?: string;
  eventType: string;
  eventData?: any;
  riskScore?: number;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
}

interface DashboardStats {
  totalDevices: number;
  highRiskDevices: number;
  compromisedDevices: number;
  totalEvents: number;
  riskDistribution: {
    SAFE: number;
    LOW: number;
    MEDIUM: number;
    HIGH: number;
    CRITICAL: number;
  };
  eventTypeDistribution: Record<string, number>;
  recentEvents: SecurityEvent[];
  topRiskyDevices: DeviceTracking[];
}

const NexAISecurityDashboard: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [devices, setDevices] = useState<DeviceTracking[]>([]);
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState<'overview' | 'devices' | 'events'>('overview');
  const [timeRange, setTimeRange] = useState<'1h' | '24h' | '7d' | '30d'>('24h');
  const [filterRiskLevel, setFilterRiskLevel] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 30000); // 每30秒刷新
    return () => clearInterval(interval);
  }, [timeRange]);

  const fetchDashboardData = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        toast.error('请先登录');
        return;
      }

      const headers = { Authorization: `Bearer ${token}` };
      const baseUrl = getApiBaseUrl();

      // 获取统计数据
      const statsResponse = await axios.get(
        `${baseUrl}/nexai/security/stats?timeRange=${timeRange}`,
        { headers }
      );

      setStats(statsResponse.data);

      // 获取设备列表
      const devicesResponse = await axios.get(
        `${baseUrl}/nexai/security/devices?page=1&limit=20`,
        { headers }
      );
      setDevices(devicesResponse.data.devices || []);

      // 获取安全事件
      const eventsResponse = await axios.get(
        `${baseUrl}/nexai/security/events?page=1&limit=20`,
        { headers }
      );
      setEvents(eventsResponse.data.events || []);

      setLoading(false);
    } catch (error: any) {
      console.error('Failed to fetch dashboard data:', error);
      if (error.response?.status === 401) {
        toast.error('认证失败，请重新登录');
      } else {
        toast.error('加载数据失败');
      }
      setLoading(false);
    }
  };

  const getRiskLevelColor = (level: string) => {
    switch (level) {
      case 'SAFE': return 'text-green-600 bg-green-100';
      case 'LOW': return 'text-blue-600 bg-blue-100';
      case 'MEDIUM': return 'text-yellow-600 bg-yellow-100';
      case 'HIGH': return 'text-orange-600 bg-orange-100';
      case 'CRITICAL': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getRiskLevelBadge = (level: string) => {
    const colorClass = getRiskLevelColor(level);
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${colorClass}`}>
        {level}
      </span>
    );
  };

  // 风险分布饼图数据
  const riskDistributionData = {
    labels: ['安全', '低风险', '中风险', '高风险', '极高风险'],
    datasets: [{
      data: stats ? [
        stats.riskDistribution.SAFE,
        stats.riskDistribution.LOW,
        stats.riskDistribution.MEDIUM,
        stats.riskDistribution.HIGH,
        stats.riskDistribution.CRITICAL
      ] : [],
      backgroundColor: [
        'rgba(34, 197, 94, 0.8)',
        'rgba(59, 130, 246, 0.8)',
        'rgba(234, 179, 8, 0.8)',
        'rgba(249, 115, 22, 0.8)',
        'rgba(239, 68, 68, 0.8)'
      ],
      borderColor: [
        'rgb(34, 197, 94)',
        'rgb(59, 130, 246)',
        'rgb(234, 179, 8)',
        'rgb(249, 115, 22)',
        'rgb(239, 68, 68)'
      ],
      borderWidth: 2
    }]
  };

  // 事件类型分布柱状图数据
  const eventTypeData = {
    labels: stats ? Object.keys(stats.eventTypeDistribution) : [],
    datasets: [{
      label: '事件数量',
      data: stats ? Object.values(stats.eventTypeDistribution) : [],
      backgroundColor: 'rgba(99, 102, 241, 0.8)',
      borderColor: 'rgb(99, 102, 241)',
      borderWidth: 1
    }]
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* 页面标题 */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <ShieldCheckIcon className="w-8 h-8 text-indigo-600" />
            NexAI 安全监控中心
          </h1>
          <p className="mt-2 text-gray-600">实时监控设备安全状态、风险评估和异常行为</p>
        </div>

        {/* 时间范围选择器 */}
        <div className="mb-6 flex gap-2">
          {(['1h', '24h', '7d', '30d'] as const).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                timeRange === range
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              {range === '1h' && '最近1小时'}
              {range === '24h' && '最近24小时'}
              {range === '7d' && '最近7天'}
              {range === '30d' && '最近30天'}
            </button>
          ))}
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">总设备数</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{stats?.totalDevices || 0}</p>
              </div>
              <DevicePhoneMobileIcon className="w-12 h-12 text-indigo-600 opacity-80" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">高风险设备</p>
                <p className="text-3xl font-bold text-orange-600 mt-2">{stats?.highRiskDevices || 0}</p>
              </div>
              <ExclamationTriangleIcon className="w-12 h-12 text-orange-600 opacity-80" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">已攻破设备</p>
                <p className="text-3xl font-bold text-red-600 mt-2">{stats?.compromisedDevices || 0}</p>
              </div>
              <ShieldExclamationIcon className="w-12 h-12 text-red-600 opacity-80" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">安全事件</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{stats?.totalEvents || 0}</p>
              </div>
              <ChartBarIcon className="w-12 h-12 text-indigo-600 opacity-80" />
            </div>
          </div>
        </div>

        {/* 标签页导航 */}
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="border-b border-gray-200">
            <nav className="flex -mb-px">
              <button
                onClick={() => setSelectedTab('overview')}
                className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                  selectedTab === 'overview'
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                概览
              </button>
              <button
                onClick={() => setSelectedTab('devices')}
                className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                  selectedTab === 'devices'
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                设备管理
              </button>
              <button
                onClick={() => setSelectedTab('events')}
                className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                  selectedTab === 'events'
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                安全事件
              </button>
            </nav>
          </div>

          {/* 概览标签页 */}
          {selectedTab === 'overview' && (
            <div className="p-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 风险分布饼图 */}
                <div className="bg-gray-50 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">风险等级分布</h3>
                  <div className="h-64">
                    <Doughnut
                      data={riskDistributionData}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                          legend: {
                            position: 'bottom'
                          }
                        }
                      }}
                    />
                  </div>
                </div>

                {/* 事件类型分布柱状图 */}
                <div className="bg-gray-50 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">安全事件类型分布</h3>
                  <div className="h-64">
                    <Bar
                      data={eventTypeData}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                          legend: {
                            display: false
                          }
                        },
                        scales: {
                          y: {
                            beginAtZero: true
                          }
                        }
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* 高风险设备列表 */}
              <div className="mt-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">高风险设备 Top 10</h3>
                <div className="bg-gray-50 rounded-lg overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          设备指纹
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          风险评分
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          风险等级
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          状态
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          最后活跃
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {stats?.topRiskyDevices && stats.topRiskyDevices.length > 0 ? (
                        stats.topRiskyDevices.map((device) => (
                          <tr key={device._id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                              {device.deviceFingerprint.substring(0, 12)}...
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {device.riskScore}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              {getRiskLevelBadge(device.riskLevel)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              {device.isCompromised ? (
                                <span className="px-2 py-1 rounded-full text-xs font-semibold text-red-600 bg-red-100">
                                  已攻破
                                </span>
                              ) : (
                                <span className="px-2 py-1 rounded-full text-xs font-semibold text-green-600 bg-green-100">
                                  正常
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {new Date(device.lastSeen).toLocaleString('zh-CN')}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="px-6 py-4 text-center text-sm text-gray-500">
                            暂无数据
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* 设备管理标签页 */}
          {selectedTab === 'devices' && (
            <div className="p-6">
              {/* 搜索和筛选 */}
              <div className="mb-6 flex gap-4">
                <input
                  type="text"
                  placeholder="搜索设备指纹、用户ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
                <select
                  value={filterRiskLevel}
                  onChange={(e) => setFilterRiskLevel(e.target.value)}
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  <option value="all">所有风险等级</option>
                  <option value="SAFE">安全</option>
                  <option value="LOW">低风险</option>
                  <option value="MEDIUM">中风险</option>
                  <option value="HIGH">高风险</option>
                  <option value="CRITICAL">极高风险</option>
                </select>
              </div>

              {/* 设备列表 */}
              <div className="bg-gray-50 rounded-lg overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        设备指纹
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        用户ID
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        风险评分
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        特征
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        请求次数
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        最后活跃
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {devices && devices.length > 0 ? (
                      devices.map((device) => (
                        <tr key={device._id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                            {device.deviceFingerprint.substring(0, 12)}...
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {device.userId}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold">{device.riskScore}</span>
                              {getRiskLevelBadge(device.riskLevel)}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex gap-1 flex-wrap">
                              {device.isRoot && (
                                <span className="px-2 py-1 rounded text-xs bg-red-100 text-red-600">Root</span>
                              )}
                              {device.isDebugger && (
                                <span className="px-2 py-1 rounded text-xs bg-orange-100 text-orange-600">调试器</span>
                              )}
                              {device.isEmulator && (
                                <span className="px-2 py-1 rounded text-xs bg-yellow-100 text-yellow-600">模拟器</span>
                              )}
                              {device.isVpn && (
                                <span className="px-2 py-1 rounded text-xs bg-blue-100 text-blue-600">VPN</span>
                              )}
                              {!device.signatureValid && (
                                <span className="px-2 py-1 rounded text-xs bg-red-100 text-red-600">签名无效</span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {device.requestCount}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {new Date(device.lastSeen).toLocaleString('zh-CN')}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="px-6 py-4 text-center text-sm text-gray-500">
                          暂无数据
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 安全事件标签页 */}
          {selectedTab === 'events' && (
            <div className="p-6">
              <div className="space-y-4">
                {events && events.length > 0 ? (
                  events.map((event) => {
                    const getSeverityColor = (riskScore?: number) => {
                      if (!riskScore) return 'bg-gray-100 text-gray-600';
                      if (riskScore >= 80) return 'bg-red-100 text-red-600';
                      if (riskScore >= 50) return 'bg-orange-100 text-orange-600';
                      if (riskScore >= 30) return 'bg-yellow-100 text-yellow-600';
                      return 'bg-blue-100 text-blue-600';
                    };

                    const getEventTypeLabel = (type: string) => {
                      const labels: Record<string, string> = {
                        'integrity_fail': '完整性验证失败',
                        'root_detected': 'Root检测',
                        'debugger_detected': '调试器检测',
                        'emulator_detected': '模拟器检测',
                        'tamper_detected': '篡改检测',
                        'frida_detected': 'Frida框架检测',
                        'xposed_detected': 'Xposed框架检测'
                      };
                      return labels[type] || type;
                    };

                    const getTimeAgo = (dateString: string) => {
                      const now = new Date();
                      const eventTime = new Date(dateString);
                      const diffMs = now.getTime() - eventTime.getTime();
                      const diffMins = Math.floor(diffMs / 60000);

                      if (diffMins < 1) return '刚刚';
                      if (diffMins < 60) return `${diffMins}分钟前`;
                      const diffHours = Math.floor(diffMins / 60);
                      if (diffHours < 24) return `${diffHours}小时前`;
                      const diffDays = Math.floor(diffHours / 24);
                      return `${diffDays}天前`;
                    };

                    return (
                      <div key={event._id} className="bg-gray-50 rounded-lg p-4 hover:bg-gray-100 transition-colors">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getSeverityColor(event.riskScore)}`}>
                                {getEventTypeLabel(event.eventType)}
                              </span>
                              <span className="text-sm text-gray-500">{getTimeAgo(event.createdAt)}</span>
                            </div>
                            <p className="text-sm text-gray-700 mb-1">
                              设备 <span className="font-mono font-semibold">{event.deviceFingerprint.substring(0, 12)}...</span> 触发安全事件
                            </p>
                            {event.userId && (
                              <p className="text-xs text-gray-500">
                                用户ID: {event.userId}
                              </p>
                            )}
                            {event.ipAddress && (
                              <p className="text-xs text-gray-500">
                                IP地址: {event.ipAddress}
                              </p>
                            )}
                          </div>
                          <div className="text-right">
                            {event.riskScore !== undefined && (
                              <div className="text-sm font-semibold text-gray-900">
                                风险评分: {event.riskScore}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-12 text-gray-500">
                    暂无安全事件
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default NexAISecurityDashboard;
