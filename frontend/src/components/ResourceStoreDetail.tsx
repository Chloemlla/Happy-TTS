import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { resourcesApi, Resource } from '../api/resources';
import { UnifiedLoadingSpinner } from './LoadingSpinner';

export default function ResourceStoreDetail() {
  const { id } = useParams<{ id: string }>();
  const [resource, setResource] = useState<Resource | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (id) {
      fetchResource(id);
    }
  }, [id]);

  const fetchResource = async (resourceId: string) => {
    try {
      const response = await resourcesApi.getResource(resourceId);
      setResource(response);
    } catch (error) {
      setError('获取资源详情失败');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <UnifiedLoadingSpinner size="lg" text="加载资源详情..." />
      </div>
    );
  }

  if (error || !resource) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error || '资源不存在'}</p>
          <Link
            to="/store"
            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
          >
            返回商店
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <Link
            to="/store"
            className="inline-flex items-center text-indigo-600 hover:text-indigo-500"
          >
            <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            返回商店
          </Link>
        </div>

        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          <div className="md:flex">
            <div className="md:w-1/2">
              <img
                src={resource.imageUrl || '/placeholder.jpg'}
                alt={resource.title}
                className="w-full h-64 md:h-full object-cover"
              />
            </div>
            <div className="md:w-1/2 p-8">
              <div className="mb-4">
                <span className="inline-block px-3 py-1 text-sm font-semibold text-indigo-600 bg-indigo-100 rounded-full">
                  {resource.category}
                </span>
              </div>
              
              <h1 className="text-3xl font-bold text-gray-900 mb-4">
                {resource.title}
              </h1>
              
              <p className="text-gray-600 mb-6 leading-relaxed">
                {resource.description}
              </p>
              
              <div className="mb-6">
                <span className="text-3xl font-bold text-indigo-600">
                  ¥{resource.price}
                </span>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-start">
                  <svg className="w-5 h-5 text-yellow-600 mt-0.5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <h3 className="text-sm font-medium text-yellow-800">
                      获取方式
                    </h3>
                    <p className="text-sm text-yellow-700 mt-1">
                      使用CDK兑换码获取此资源的下载链接
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-6 text-xs text-gray-500">
                <p>创建时间: {new Date(resource.createdAt).toLocaleDateString()}</p>
                <p>更新时间: {new Date(resource.updatedAt).toLocaleDateString()}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 