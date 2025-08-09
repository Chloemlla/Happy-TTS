import React, { Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { UnifiedLoadingSpinner } from './LoadingSpinner';

// 受保护的路由组件
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  if (!user || user.role !== 'admin') {
    return <Navigate to="/admin/login" />;
  }
  return <>{children}</>;
};

// 懒加载组件
const ResourceStoreList = React.lazy(() => import('./ResourceStoreList'));
const ResourceStoreDetail = React.lazy(() => import('./ResourceStoreDetail'));
const AuthForm = React.lazy(() => import('./AuthForm').then(module => ({ default: module.AuthForm })));
const AdminStoreDashboard = React.lazy(() => import('./AdminStoreDashboard'));
const ResourceStoreManager = React.lazy(() => import('./ResourceStoreManager'));
const CDKStoreManager = React.lazy(() => import('./CDKStoreManager'));

// 简单加载组件
const SimpleLoadingSpinner = () => (
  <div className="flex items-center justify-center min-h-screen">
    <UnifiedLoadingSpinner size="lg" text="加载中..." />
  </div>
);

export default function ResourceStoreApp() {
  return (
    <Router>
      <Routes>
        {/* 公共路由 */}
        <Route path="/store" element={
          <Suspense fallback={<SimpleLoadingSpinner />}>
            <ResourceStoreList />
          </Suspense>
        } />
        <Route path="/store/resources/:id" element={
          <Suspense fallback={<SimpleLoadingSpinner />}>
            <ResourceStoreDetail />
          </Suspense>
        } />
        <Route path="/admin/login" element={
          <Suspense fallback={<SimpleLoadingSpinner />}>
            <AuthForm />
          </Suspense>
        } />

        {/* 管理员路由 */}
        <Route
          path="/admin/store"
          element={
            <ProtectedRoute>
              <Suspense fallback={<SimpleLoadingSpinner />}>
                <AdminStoreDashboard />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/store/resources"
          element={
            <ProtectedRoute>
              <Suspense fallback={<SimpleLoadingSpinner />}>
                <ResourceStoreManager />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/store/cdks"
          element={
            <ProtectedRoute>
              <Suspense fallback={<SimpleLoadingSpinner />}>
                <CDKStoreManager />
              </Suspense>
            </ProtectedRoute>
          }
        />
        
        {/* 默认重定向 */}
        <Route path="/" element={<Navigate to="/store" />} />
      </Routes>
    </Router>
  );
} 