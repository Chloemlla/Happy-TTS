import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { resourcesApi } from '../api/resources';
import { cdksApi, CDKStats } from '../api/cdks';

interface Stats {
  resources: {
    total: number;
  };
  cdks: CDKStats;
}

export default function AdminStoreDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const [resourceStats, cdkStats] = await Promise.all([
        resourcesApi.getResourceStats(),
        cdksApi.getCDKStats()
      ]);

      setStats({
        resources: resourceStats,
        cdks: cdkStats
      });
    } catch (error) {
      console.error('获取统计信息失败:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
      <div className="px-4 py-6 sm:px-0">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">资源商店管理</h1>

        {/* 统计卡片 */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <dt className="text-sm font-medium text-gray-500 truncate">
                总资源数量
              </dt>
              <dd className="mt-1 text-3xl font-semibold text-gray-900">
                {stats?.resources.total ?? '-'}
              </dd>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <dt className="text-sm font-medium text-gray-500 truncate">
                总CDK数量
              </dt>
              <dd className="mt-1 text-3xl font-semibold text-gray-900">
                {stats?.cdks.total ?? '-'}
              </dd>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <dt className="text-sm font-medium text-gray-500 truncate">
                已使用CDK
              </dt>
              <dd className="mt-1 text-3xl font-semibold text-red-600">
                {stats?.cdks.used ?? '-'}
              </dd>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <dt className="text-sm font-medium text-gray-500 truncate">
                可用CDK
              </dt>
              <dd className="mt-1 text-3xl font-semibold text-green-600">
                {stats?.cdks.available ?? '-'}
              </dd>
            </div>
          </div>
        </div>

        {/* 导航链接 */}
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Link
            to="/admin/resources"
            className="bg-white overflow-hidden shadow rounded-lg p-6 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg className="h-8 w-8 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <div className="ml-4">
                <h3 className="text-lg font-medium text-gray-900">资源管理</h3>
                <p className="mt-1 text-sm text-gray-500">
                  管理资源列表，添加、编辑或删除资源
                </p>
              </div>
            </div>
          </Link>

          <Link
            to="/admin/cdks"
            className="bg-white overflow-hidden shadow rounded-lg p-6 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg className="h-8 w-8 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
              </div>
              <div className="ml-4">
                <h3 className="text-lg font-medium text-gray-900">CDK管理</h3>
                <p className="mt-1 text-sm text-gray-500">
                  管理CDK，生成新的CDK或查看使用情况
                </p>
              </div>
            </div>
          </Link>
        </div>

        {/* 快速访问链接 */}
        <div className="mt-8 bg-indigo-50 rounded-lg p-6">
          <h2 className="text-lg font-medium text-indigo-900 mb-4">快速访问</h2>
          <div className="flex flex-wrap gap-4">
            <Link
              to="/store"
              className="inline-flex items-center px-4 py-2 border border-indigo-300 rounded-md text-sm font-medium text-indigo-700 bg-white hover:bg-indigo-50"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
              查看商店
            </Link>
            <Link
              to="/admin"
              className="inline-flex items-center px-4 py-2 border border-indigo-300 rounded-md text-sm font-medium text-indigo-700 bg-white hover:bg-indigo-50"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z" />
              </svg>
              主控制台
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
} 