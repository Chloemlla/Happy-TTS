import React, { useEffect, useState, ChangeEvent, useRef } from 'react';
import { useNotification } from './Notification';
import { motion } from 'framer-motion';
import VerifyCodeInput from './VerifyCodeInput';
import { LoadingSpinner } from './LoadingSpinner';
import getApiBaseUrl, { getApiBaseUrl as namedGetApiBaseUrl } from '../api';
import { openDB } from 'idb';

interface UserProfileData {
  id: string;
  username: string;
  email: string;
  avatarUrl?: string; // 新增avatarUrl字段
  role?: string;
}

const fetchProfile = async (): Promise<UserProfileData | null> => {
  try {
    const token = localStorage.getItem('token');
    if (!token) return null;
    const res = await fetch(getApiBaseUrl() + '/api/admin/user/profile', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data;
  } catch (e) {
    return null;
  }
};

const updateProfile = async (data: Partial<UserProfileData> & { password?: string; newPassword?: string; verificationCode?: string }) => {
  const token = localStorage.getItem('token');
  const res = await fetch(getApiBaseUrl() + '/api/admin/user/profile', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  const result = await res.json();
  return result;
};

const verifyUser = async (verificationCode: string) => {
  const token = localStorage.getItem('token');
  const user = await fetchProfile();
  if (!user) return { success: false };
  const res = await fetch(getApiBaseUrl() + '/api/user/verify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ userId: user.id, verificationCode }),
  });
  const result = await res.json();
  return result;
};

const AVATAR_DB = 'avatar-store';
const AVATAR_STORE = 'avatars';

async function getCachedAvatar(userId: string, avatarHash: string): Promise<string | undefined> {
  const db = await openDB(AVATAR_DB, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(AVATAR_STORE)) {
        db.createObjectStore(AVATAR_STORE);
      }
    },
  });
  const key = `${userId}:${avatarHash}`;
  return await db.get(AVATAR_STORE, key);
}

async function setCachedAvatar(userId: string, avatarHash: string, blobUrl: string) {
  const db = await openDB(AVATAR_DB, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(AVATAR_STORE)) {
        db.createObjectStore(AVATAR_STORE);
      }
    },
  });
  const key = `${userId}:${avatarHash}`;
  await db.put(AVATAR_STORE, blobUrl, key);
}

const UserProfile: React.FC = () => {
  const { setNotification } = useNotification();
  const [profile, setProfile] = useState<UserProfileData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadTimeout, setLoadTimeout] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [verified, setVerified] = useState(false);
  const [loading, setLoading] = useState(false);
  const [totpStatus, setTotpStatus] = useState<{ enabled: boolean; hasPasskey: boolean } | null>(null);
  const [changePwdMode, setChangePwdMode] = useState(false);
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  // 上传头像后本地预览并暂存，保存时一并提交
  const [pendingAvatar, setPendingAvatar] = useState<string | undefined>('');
  const [avatarImg, setAvatarImg] = useState<string | undefined>(undefined);
  const lastAvatarUrl = useRef<string | undefined>(undefined);
  const lastObjectUrl = useRef<string | undefined>(undefined);
  const [avatarHash, setAvatarHash] = useState<string | undefined>(undefined);

  useEffect(() => {
    let timeoutId: any = null;
    setLoadError(null);
    setLoadTimeout(false);
    setLoading(true);
    timeoutId = setTimeout(() => {
      setLoadTimeout(true);
      setLoading(false);
    }, 7500); // 7.5秒超时
    fetchProfile().then((data) => {
      clearTimeout(timeoutId);
      setLoading(false);
      if (data) {
        setProfile(data);
        setEmail(data.email);
      } else {
        setLoadError('加载失败，请刷新页面或重新登录');
      }
    }).catch((e) => {
      clearTimeout(timeoutId);
      setLoading(false);
      setLoadError('加载失败：' + (e instanceof Error ? e.message : (e && e.toString ? e.toString() : '未知错误')));
    });
    return () => clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    // 获取TOTP/Passkey状态
    const fetchStatus = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) return;
        const res = await fetch(getApiBaseUrl() + '/api/totp/status', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        setTotpStatus({ enabled: !!data.enabled, hasPasskey: !!data.hasPasskey });
      } catch {}
    };
    fetchStatus();
  }, []);

  // 登录/认证成功后自动刷新用户信息
  useEffect(() => {
    if (verified) {
      fetchProfile().then((data) => {
        if (data) {
          setProfile(data);
          setEmail(data.email);
        }
      });
    }
  }, [verified]);

  // 在 useEffect 里获取 profile 时，保存 avatarHash 到 state
  useEffect(() => {
    if (profile?.id) {
      fetch(getApiBaseUrl() + '/api/admin/user/profile', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      })
        .then(res => res.json())
        .then(data => setAvatarHash(data.avatarHash))
        .catch(() => setAvatarHash(undefined));
    }
  }, [profile?.id]);

  useEffect(() => {
    let cancelled = false;
    async function loadAvatar() {
      if (typeof profile?.avatarUrl === 'string' && typeof profile?.id === 'string' && typeof avatarHash === 'string') {
        if (lastAvatarUrl.current === avatarHash && avatarImg) {
          return;
        }
        // 先查IndexedDB
        const cached = await getCachedAvatar(profile.id as string, avatarHash as string);
        if (cached) {
          setAvatarImg(cached);
          lastAvatarUrl.current = avatarHash;
          return;
        }
        // 下载图片
        fetch(profile.avatarUrl)
          .then(res => res.blob())
          .then(async blob => {
            if (cancelled) return;
            const url = URL.createObjectURL(blob);
            setAvatarImg(url);
            lastAvatarUrl.current = avatarHash;
            lastObjectUrl.current = url;
            await setCachedAvatar(profile.id as string, avatarHash as string, url);
          })
          .catch(() => setAvatarImg(undefined));
      } else {
        setAvatarImg(undefined);
        lastAvatarUrl.current = undefined;
      }
    }
    loadAvatar();
    return () => {
      cancelled = true;
      if (lastObjectUrl.current) {
        URL.revokeObjectURL(lastObjectUrl.current);
        lastObjectUrl.current = undefined;
      }
    };
  }, [profile?.avatarUrl, profile?.id, avatarHash]);

  // 新增头像上传限制
  const MAX_AVATAR_SIZE = 2 * 1024 * 1024; // 2MB
  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

  // 优化头像上传逻辑
  const handleAvatarChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('avatar', file);
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(getApiBaseUrl() + '/api/admin/user/avatar', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      } as any);
      const result = await res.json();
      setLoading(false);
      if (result.success && result.avatarUrl) {
        setProfile((p) => p ? { ...p, avatarUrl: result.avatarUrl } : p);
        setNotification({ message: '头像上传成功', type: 'success' });
      } else {
        setNotification({ message: result.error || '头像上传失败', type: 'error' });
      }
    } catch (err) {
      setLoading(false);
      setNotification({ message: '头像上传失败，图床服务不可用或网络异常，请稍后重试。', type: 'error' });
    }
  };

  // 头像渲染兜底组件
  const Avatar = ({ src }: { src?: string }) => {
    const [error, setError] = useState(false);
    if (!src || error) {
      return (
        <span className="text-4xl text-gray-400 flex items-center justify-center h-full">👤</span>
      );
    }
    return (
      <img
        src={src}
        alt="头像"
        className="w-full h-full object-cover"
        onError={() => setError(true)}
        style={{ borderRadius: '50%' }}
      />
    );
  };

  const handleVerify = async () => {
    if (!verificationCode) {
      setNotification({ message: '请输入验证码', type: 'warning' });
      return;
    }
    setLoading(true);
    const res = await verifyUser(verificationCode);
    setLoading(false);
    if (res.success) {
      setVerified(true);
      setNotification({ message: '验证成功，请继续修改', type: 'success' });
    } else {
      setNotification({ message: res.error || '验证失败', type: 'error' });
    }
  };

  // 头像上传后只本地setAvatarBase64，保存profile时不再传avatarBase64，避免超大json
  const handleUpdate = async () => {
    if (totpStatus && !totpStatus.enabled && !totpStatus.hasPasskey) {
      if (!password) {
        setNotification({ message: '请输入当前密码', type: 'warning' });
        return;
      }
    } else {
      if (!verified) {
        setNotification({ message: '请先通过二次验证', type: 'warning' });
        return;
      }
    }
    setLoading(true);
    const res = await updateProfile({
      email,
      password: totpStatus && !totpStatus.enabled && !totpStatus.hasPasskey ? password : undefined,
      newPassword: newPassword || undefined,
      avatarUrl: pendingAvatar || undefined,
      verificationCode: totpStatus && (totpStatus.enabled || totpStatus.hasPasskey) ? verificationCode : undefined,
    });
    setLoading(false);
    if (res.error) {
      setNotification({ message: res.error, type: 'error' });
    } else {
      setNotification({ message: '信息修改成功', type: 'success' });
      // 修改成功后重新拉取后端最新profile，确保头像等最新
      const latest = await fetchProfile();
      if (latest) {
        setProfile(latest);
        setEmail(latest.email);
        setPendingAvatar('');
      }
      setPassword('');
      setNewPassword('');
      setVerified(false);
      setVerificationCode('');
    }
  };

  const handleChangePassword = async () => {
    if (!oldPwd || !newPwd) {
      setNotification({ message: '请输入旧密码和新密码', type: 'warning' });
      return;
    }
    setLoading(true);
    const res = await updateProfile({
      password: oldPwd,
      newPassword: newPwd
    });
    setLoading(false);
    if (res.error) {
      setNotification({ message: res.error, type: 'error' });
    } else {
      setNotification({ message: '密码修改成功', type: 'success' });
      setChangePwdMode(false);
      setOldPwd('');
      setNewPwd('');
    }
  };

  if (!localStorage.getItem('token')) {
    return <div className="p-8 text-center text-red-500">未登录或会话已过期，请重新登录。</div>;
  }
  if (loadError) {
    return (
      <div className="p-8 text-center text-red-500 whitespace-pre-line">
        加载失败，请刷新页面或重新登录。
        {typeof loadError === 'string' && loadError !== '加载失败，请刷新页面或重新登录' ? `\n详细信息：${loadError}` : ''}
      </div>
    );
  }
  if (loading || !profile) {
    if (loadTimeout) {
      return <div className="p-8 text-center text-red-500">加载超时，请检查网络或刷新页面</div>;
    }
    const scale = typeof window !== 'undefined' ? Math.max(0.7, Math.min(1.2, window.innerWidth / 1200)) : 1;
    return <LoadingSpinner size={scale} />;
  }

  return (
    <motion.div
      className="max-w-lg mx-auto bg-white rounded-xl shadow-lg p-8 mt-8"
      initial={{ opacity: 0, y: 30, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.6, type: 'spring', stiffness: 120 }}
    >
      <motion.h2
        className="text-2xl font-bold mb-6"
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.1, type: 'spring', stiffness: 200 }}
      >
        个人主页
      </motion.h2>
      <motion.div
        className="flex flex-col items-center mb-6"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        <motion.div
          className="w-24 h-24 rounded-full bg-gray-200 overflow-hidden mb-2 shadow-lg"
          whileHover={{ scale: 1.05, rotate: 2 }}
          whileTap={{ scale: 0.97, rotate: -2 }}
        >
          <Avatar src={avatarImg || profile?.avatarUrl} />
        </motion.div>
        <input
          type="file"
          accept="image/*"
          onChange={handleAvatarChange}
          className="mb-2"
          disabled={loading}
        />
        <div className="text-lg font-semibold">{profile.username}</div>
        <div className="text-gray-500 text-sm">{profile.role === 'admin' ? '管理员' : '普通用户'}</div>
      </motion.div>
      <motion.div className="mb-4" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, delay: 0.15 }}>
        <label className="block text-gray-700 mb-1">邮箱</label>
        <motion.input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          className="w-full border rounded px-3 py-2 focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition-all"
          whileFocus={{ scale: 1.03, borderColor: '#6366f1' }}
        />
      </motion.div>
      {totpStatus && !totpStatus.enabled && !totpStatus.hasPasskey ? (
        <motion.div className="mb-4" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, delay: 0.24 }}>
          <label className="block text-gray-700 mb-1">当前密码（未绑定二次认证时用于身份校验）</label>
          <motion.input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full border rounded px-3 py-2 focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition-all"
            whileFocus={{ scale: 1.03, borderColor: '#6366f1' }}
          />
        </motion.div>
      ) : (
        <motion.div className="mb-4" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, delay: 0.24 }}>
          <label className="block text-gray-700 mb-1">二次验证（TOTP/Passkey）</label>
          <VerifyCodeInput
            length={8}
            onComplete={setVerificationCode}
            loading={loading}
            error={undefined}
            inputClassName="bg-white border-2 border-blue-400 text-blue-700 focus:ring-2 focus:ring-blue-400 focus:border-blue-500 placeholder-blue-200 rounded-md px-3 py-2 text-lg transition-all outline-none mx-1"
          />
          <motion.button
            onClick={handleVerify}
            className="mt-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 shadow"
            disabled={loading || verificationCode.length !== 8}
            whileTap={{ scale: 0.97 }}
          >
            验证
          </motion.button>
        </motion.div>
      )}
      <div className="mb-6">
        <button
          className="px-4 py-2 bg-indigo-500 text-white rounded hover:bg-indigo-600 transition font-semibold shadow mr-2"
          onClick={() => setChangePwdMode(v => !v)}
        >{changePwdMode ? '取消修改密码' : '修改密码'}</button>
      </div>
      {changePwdMode && (
        <motion.div className="mb-4" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4 }}>
          <label className="block text-gray-700 mb-1">旧密码</label>
          <input
            type="password"
            value={oldPwd}
            onChange={e => setOldPwd(e.target.value)}
            className="w-full border rounded px-3 py-2 focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition-all mb-2"
          />
          <label className="block text-gray-700 mb-1">新密码</label>
          <input
            type="password"
            value={newPwd}
            onChange={e => setNewPwd(e.target.value)}
            className="w-full border rounded px-3 py-2 focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition-all mb-2"
          />
          <button
            className="w-full py-2 bg-green-600 text-white rounded hover:bg-green-700 font-bold shadow-lg mt-2"
            onClick={handleChangePassword}
            disabled={loading}
          >保存新密码</button>
        </motion.div>
      )}
      <motion.button
        onClick={handleUpdate}
        className="w-full py-2 bg-green-600 text-white rounded hover:bg-green-700 font-bold shadow-lg mt-2"
        disabled={loading}
        whileTap={{ scale: 0.97 }}
      >
        保存修改
      </motion.button>
    </motion.div>
  );
};

export default UserProfile; 