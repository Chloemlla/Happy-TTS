import React, { useEffect, useState } from 'react';
import axios from 'axios';

interface User {
  id: string;
  username: string;
  email: string;
  password: string;
  role: string;
  createdAt: string;
}

const emptyUser = { id: '', username: '', email: '', password: '', role: 'user', createdAt: '' };

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'https://tts-api.hapxs.com',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' }
});

const UserManagement: React.FC<{ token: string }> = ({ token }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [form, setForm] = useState<User>(emptyUser);
  const [showForm, setShowForm] = useState(false);

  // 获取用户列表
  const fetchUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get<User[]>('/api/admin/users', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUsers(res.data);
    } catch (e: any) {
      setError(e.response?.data?.error || e.message || '获取用户失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  // 表单变更
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  // 添加或编辑用户
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const method = editingUser ? 'put' : 'post';
      const url = editingUser ? `/api/admin/users/${editingUser.id}` : '/api/admin/users';
      const res = await api.request({
        url,
        method,
        headers: { Authorization: `Bearer ${token}` },
        data: form
      });
      setShowForm(false);
      setEditingUser(null);
      setForm(emptyUser);
      fetchUsers();
    } catch (e: any) {
      setError(e.response?.data?.error || e.message || '操作失败');
    } finally {
      setLoading(false);
    }
  };

  // 删除用户
  const handleDelete = async (id: string) => {
    if (!window.confirm('确定要删除该用户吗？')) return;
    setLoading(true);
    setError('');
    try {
      await api.delete(`/api/admin/users/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchUsers();
    } catch (e: any) {
      setError(e.response?.data?.error || e.message || '删除失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-2xl p-10 mt-10 border border-blue-100">
      <h2 className="text-3xl font-extrabold mb-6 text-blue-700 flex items-center gap-2">
        <i className="fas fa-users-cog text-blue-500 text-2xl" /> 用户管理
      </h2>
      <hr className="mb-6 border-blue-200" />
      {error && <div className="text-red-500 mb-2 font-semibold">{error}</div>}
      <button
        className="mb-6 px-6 py-2 bg-gradient-to-r from-blue-500 to-blue-400 text-white rounded-lg shadow hover:from-blue-600 hover:to-blue-500 transition-all font-bold"
        onClick={() => { setShowForm(true); setEditingUser(null); setForm(emptyUser); }}
      >
        <i className="fas fa-user-plus mr-2" />添加用户
      </button>
      {showForm && (
        <form onSubmit={handleSubmit} className="mb-8 space-y-3 bg-blue-50 p-6 rounded-xl shadow-inner">
          <input name="username" value={form.username} onChange={handleChange} placeholder="用户名" required className="border p-2 rounded w-full focus:ring-2 focus:ring-blue-300" />
          <input name="email" value={form.email} onChange={handleChange} placeholder="邮箱" required className="border p-2 rounded w-full focus:ring-2 focus:ring-blue-300" />
          <input name="password" value={form.password} onChange={handleChange} placeholder="密码" required className="border p-2 rounded w-full focus:ring-2 focus:ring-blue-300" type="text" />
          <select name="role" value={form.role} onChange={handleChange} className="border p-2 rounded w-full focus:ring-2 focus:ring-blue-300">
            <option value="user">普通用户</option>
            <option value="admin">管理员</option>
          </select>
          <div className="flex gap-3 mt-2">
            <button type="submit" className="px-5 py-2 bg-green-500 text-white rounded-lg font-bold shadow hover:bg-green-600 transition-all">{editingUser ? '保存修改' : '添加'}</button>
            <button type="button" className="px-5 py-2 bg-gray-300 rounded-lg font-bold hover:bg-gray-400 transition-all" onClick={() => { setShowForm(false); setEditingUser(null); }}>取消</button>
          </div>
        </form>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border mt-4 rounded-xl overflow-hidden shadow-md">
          <thead>
            <tr className="bg-blue-100 text-blue-800">
              <th className="p-3">用户名</th>
              <th className="p-3">邮箱</th>
              <th className="p-3">角色</th>
              <th className="p-3">创建时间</th>
              <th className="p-3">操作</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u, idx) => (
              <tr key={u.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-blue-50'}>
                <td className="p-3 font-medium">{u.username}</td>
                <td className="p-3">{u.email}</td>
                <td className="p-3">{u.role === 'admin' ? <span className="text-red-500 font-bold">管理员</span> : '普通用户'}</td>
                <td className="p-3">{new Date(u.createdAt).toLocaleString()}</td>
                <td className="p-3 flex gap-2">
                  <button className="px-3 py-1 bg-yellow-400 rounded-lg font-bold shadow hover:bg-yellow-500 transition-all" onClick={() => { setEditingUser(u); setForm(u); setShowForm(true); }}><i className="fas fa-edit mr-1" />编辑</button>
                  <button className="px-3 py-1 bg-red-500 text-white rounded-lg font-bold shadow hover:bg-red-600 transition-all" onClick={() => handleDelete(u.id)}><i className="fas fa-trash-alt mr-1" />删除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {loading && <div className="mt-4 text-blue-500 font-semibold flex items-center gap-2"><i className="fas fa-spinner fa-spin" />操作中...</div>}
    </div>
  );
};

export default UserManagement; 