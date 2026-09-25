import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { isAdminRole } from '../utils/rbac';
import {
  authAlertClassName,
  authBrandTitleClassName,
  authFormClassName,
  authFrameClassName,
  authPageShellClassName,
  authPrimaryButtonClassName,
} from './authStudioTheme';
import { studioFieldClassName } from './studioTheme';

export default function AdminLogin() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { user, login } = useAuth();
  const navigate = useNavigate();

  // 如果已经登录且是管理员，直接跳转到管理页面
  if (isAdminRole(user?.role)) {
    navigate('/admin');
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const result = await login(username, password);

      // 检查是否是管理员
      if (result && result.user && !isAdminRole(result.user.role)) {
        setError('权限不足：非管理员账号');
        return;
      }

      navigate('/admin');
    } catch (err) {
      setError('登录失败：用户名或密码错误');
    }
  };

  return (
    <div className={authPageShellClassName}>
      <div className={`${authFrameClassName} space-y-8`}>
        <div>
          <h2 className={`${authBrandTitleClassName} text-center`}>
            管理员登录
          </h2>
        </div>
        <form className={`${authFormClassName} mt-8`} onSubmit={handleSubmit}>
          <div className={authFormClassName}>
            <div>
              <label htmlFor="username" className="sr-only">
                用户名
              </label>
              <input
                id="username"
                name="username"
                type="text"
                required
                className={studioFieldClassName}
                placeholder="用户名"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">
                密码
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                className={studioFieldClassName}
                placeholder="密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          {error && (
            <div className={`${authAlertClassName} text-center`}>{error}</div>
          )}

          <div>
            <button
              type="submit"
              className={authPrimaryButtonClassName}
            >
              登录
            </button>
          </div>
        </form>
      </div>
    </div>
  );
} 