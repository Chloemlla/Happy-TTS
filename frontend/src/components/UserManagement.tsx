import React, { useEffect, useState } from 'react';
import { fetchWithFallback } from '../utils/fetchWithFallback';

interface User {
  id: string;
  username: string;
  email: string;
  password: string;
  role: string;
  createdAt: string;
}

const emptyUser = { id: '', username: '', email: '', password: '', role: 'user', createdAt: '' };

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
      const res = await fetchWithFallback('/api/admin/users', {
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
      });
      if (!res.ok) throw new Error('获取用户列表失败');
      setUsers(await res.json());
    } catch (e: any) {
      setError(e.message || '获取用户失败');
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
      const method = editingUser ? 'PUT' : 'POST';
      const url = editingUser ? `/api/admin/users/${editingUser.id}` : '/api/admin/users';
      const res = await fetchWithFallback(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(form),
        credentials: 'include',
      });
      if (!res.ok) throw new Error('操作失败');
      setShowForm(false);
      setEditingUser(null);
      setForm(emptyUser);
      fetchUsers();
    } catch (e: any) {
      setError(e.message || '操作失败');
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
      const res = await fetchWithFallback(`/api/admin/users/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
      });
      if (!res.ok) throw new Error('删除失败');
      fetchUsers();
    } catch (e: any) {
      setError(e.message || '删除失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-lg p-8 mt-8">
      <h2 className="text-2xl font-bold mb-4">用户管理</h2>
      {error && <div className="text-red-500 mb-2">{error}</div>}
      <button
        className="mb-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        onClick={() => { setShowForm(true); setEditingUser(null); setForm(emptyUser); }}
      >添加用户</button>
      {showForm && (
        <form onSubmit={handleSubmit} className="mb-6 space-y-2">
          <input name="username" value={form.username} onChange={handleChange} placeholder="用户名" required className="border p-2 rounded w-full" />
          <input name="email" value={form.email} onChange={handleChange} placeholder="邮箱" required className="border p-2 rounded w-full" />
          <input name="password" value={form.password} onChange={handleChange} placeholder="密码" required className="border p-2 rounded w-full" type="text" />
          <select name="role" value={form.role} onChange={handleChange} className="border p-2 rounded w-full">
            <option value="user">普通用户</option>
            <option value="admin">管理员</option>
          </select>
          <div className="flex gap-2">
            <button type="submit" className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600">{editingUser ? '保存修改' : '添加'}</button>
            <button type="button" className="px-4 py-2 bg-gray-300 rounded" onClick={() => { setShowForm(false); setEditingUser(null); }}>取消</button>
          </div>
        </form>
      )}
      <table className="w-full border mt-4">
        <thead>
          <tr className="bg-gray-100">
            <th className="p-2">用户名</th>
            <th className="p-2">邮箱</th>
            <th className="p-2">角色</th>
            <th className="p-2">创建时间</th>
            <th className="p-2">操作</th>
          </tr>
        </thead>
        <tbody>
          {users.map(u => (
            <tr key={u.id} className="border-t">
              <td className="p-2">{u.username}</td>
              <td className="p-2">{u.email}</td>
              <td className="p-2">{u.role}</td>
              <td className="p-2">{new Date(u.createdAt).toLocaleString()}</td>
              <td className="p-2 flex gap-2">
                <button className="px-2 py-1 bg-yellow-400 rounded" onClick={() => { setEditingUser(u); setForm(u); setShowForm(true); }}>编辑</button>
                <button className="px-2 py-1 bg-red-500 text-white rounded" onClick={() => handleDelete(u.id)}>删除</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {loading && <div className="mt-2 text-blue-500">操作中...</div>}
    </div>
  );
};

export default UserManagement; 