import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  baseURL: '',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' }
});

const UserManagement: React.FC = () => {
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
      const token = localStorage.getItem('token') || '';
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
      const token = localStorage.getItem('token') || '';
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
      const token = localStorage.getItem('token') || '';
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
    <motion.div 
      className="max-w-4xl mx-auto bg-white rounded-2xl shadow-2xl p-10 mt-10 border border-blue-100"
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
    >
      <motion.h2 
        className="text-3xl font-extrabold mb-6 text-blue-700 flex items-center gap-2"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        <motion.i 
          className="fas fa-users-cog text-blue-500 text-2xl"
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ duration: 0.6, delay: 0.2, type: "spring", stiffness: 200 }}
          whileHover={{ scale: 1.1, rotate: 5 }}
        />
        用户管理
      </motion.h2>
      
      <motion.hr 
        className="mb-6 border-blue-200"
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.5, delay: 0.3 }}
      />
      
      <AnimatePresence>
        {error && (
          <motion.div 
            className="text-red-500 mb-2 font-semibold bg-red-50 border border-red-200 rounded-lg p-3"
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ duration: 0.3 }}
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>
      
      <motion.button
        className="mb-6 px-6 py-2 bg-gradient-to-r from-blue-500 to-blue-400 text-white rounded-lg shadow hover:from-blue-600 hover:to-blue-500 transition-all font-bold"
        onClick={() => { setShowForm(true); setEditingUser(null); setForm(emptyUser); }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.4 }}
        whileHover={{ scale: 1.05, y: -2 }}
        whileTap={{ scale: 0.95 }}
      >
        <motion.i 
          className="fas fa-user-plus mr-2"
          whileHover={{ scale: 1.1, rotate: 5 }}
        />
        添加用户
      </motion.button>
      
      <AnimatePresence>
        {showForm && (
          <motion.form 
            onSubmit={handleSubmit} 
            className="mb-8 space-y-3 bg-gradient-to-r from-blue-50 to-indigo-50 p-6 rounded-xl shadow-inner border border-blue-200"
            initial={{ opacity: 0, height: 0, scale: 0.95 }}
            animate={{ opacity: 1, height: "auto", scale: 1 }}
            exit={{ opacity: 0, height: 0, scale: 0.95 }}
            transition={{ duration: 0.4, type: "spring", stiffness: 100 }}
          >
            <motion.input 
              name="username" 
              value={form.username} 
              onChange={handleChange} 
              placeholder="用户名" 
              required 
              className="border-2 border-gray-200 p-3 rounded-lg w-full focus:ring-2 focus:ring-blue-300 focus:border-transparent transition-all duration-200 hover:border-gray-300"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.1 }}
              whileFocus={{ scale: 1.02 }}
            />
            <motion.input 
              name="email" 
              value={form.email} 
              onChange={handleChange} 
              placeholder="邮箱" 
              required 
              className="border-2 border-gray-200 p-3 rounded-lg w-full focus:ring-2 focus:ring-blue-300 focus:border-transparent transition-all duration-200 hover:border-gray-300"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.2 }}
              whileFocus={{ scale: 1.02 }}
            />
            <motion.input 
              name="password" 
              value={form.password} 
              onChange={handleChange} 
              placeholder="密码" 
              required 
              className="border-2 border-gray-200 p-3 rounded-lg w-full focus:ring-2 focus:ring-blue-300 focus:border-transparent transition-all duration-200 hover:border-gray-300"
              type="text"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.3 }}
              whileFocus={{ scale: 1.02 }}
            />
            <motion.select 
              name="role" 
              value={form.role} 
              onChange={handleChange} 
              className="border-2 border-gray-200 p-3 rounded-lg w-full focus:ring-2 focus:ring-blue-300 focus:border-transparent transition-all duration-200 hover:border-gray-300 appearance-none bg-white bg-no-repeat bg-right pr-10"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236B7280'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                backgroundSize: '1.5em 1.5em'
              }}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.4 }}
              whileFocus={{ scale: 1.02 }}
            >
              <option value="user">普通用户</option>
              <option value="admin">管理员</option>
            </motion.select>
            <motion.div 
              className="flex gap-3 mt-2"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.5 }}
            >
              <motion.button 
                type="submit" 
                className="px-5 py-2 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg font-bold shadow hover:from-green-600 hover:to-green-700 transition-all duration-200"
                whileHover={{ scale: 1.05, y: -1 }}
                whileTap={{ scale: 0.95 }}
              >
                {editingUser ? '保存修改' : '添加'}
              </motion.button>
              <motion.button 
                type="button" 
                className="px-5 py-2 bg-gray-300 rounded-lg font-bold hover:bg-gray-400 transition-all duration-200" 
                onClick={() => { setShowForm(false); setEditingUser(null); }}
                whileHover={{ scale: 1.05, y: -1 }}
                whileTap={{ scale: 0.95 }}
              >
                取消
              </motion.button>
            </motion.div>
          </motion.form>
        )}
      </AnimatePresence>
      
      <motion.div 
        className="overflow-x-auto"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.5 }}
      >
        <table className="w-full border mt-4 rounded-xl overflow-hidden shadow-md">
          <thead>
            <motion.tr 
              className="bg-gradient-to-r from-blue-100 to-indigo-100 text-blue-800"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.6 }}
            >
              <th className="p-3">用户名</th>
              <th className="p-3">邮箱</th>
              <th className="p-3">角色</th>
              <th className="p-3">创建时间</th>
              <th className="p-3">操作</th>
            </motion.tr>
          </thead>
          <tbody>
            {users.map((u, idx) => (
              <motion.tr 
                key={u.id} 
                className={idx % 2 === 0 ? 'bg-white' : 'bg-blue-50'}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.1 * idx }}
                whileHover={{ scale: 1.01, backgroundColor: '#f0f9ff' }}
              >
                <td className="p-3 font-medium">{u.username}</td>
                <td className="p-3">{u.email}</td>
                <td className="p-3">
                  {u.role === 'admin' ? (
                    <motion.span 
                      className="text-red-500 font-bold bg-red-50 px-2 py-1 rounded-full text-sm"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 300 }}
                    >
                      管理员
                    </motion.span>
                  ) : (
                    <span className="text-gray-600">普通用户</span>
                  )}
                </td>
                <td className="p-3">{new Date(u.createdAt).toLocaleString()}</td>
                <td className="p-3 flex gap-2">
                  <motion.button 
                    className="px-3 py-1 bg-gradient-to-r from-yellow-400 to-yellow-500 rounded-lg font-bold shadow hover:from-yellow-500 hover:to-yellow-600 transition-all duration-200" 
                    onClick={() => { setEditingUser(u); setForm(u); setShowForm(true); }}
                    whileHover={{ scale: 1.05, y: -1 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <motion.i 
                      className="fas fa-edit mr-1"
                      whileHover={{ rotate: 5 }}
                    />
                    编辑
                  </motion.button>
                  <motion.button 
                    className="px-3 py-1 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-lg font-bold shadow hover:from-red-600 hover:to-red-700 transition-all duration-200" 
                    onClick={() => handleDelete(u.id)}
                    whileHover={{ scale: 1.05, y: -1 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <motion.i 
                      className="fas fa-trash-alt mr-1"
                      whileHover={{ rotate: 5 }}
                    />
                    删除
                  </motion.button>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </motion.div>
      
      <AnimatePresence>
        {loading && (
          <motion.div 
            className="mt-4 text-blue-500 font-semibold flex items-center gap-2"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.3 }}
          >
            <motion.i 
              className="fas fa-spinner"
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            />
            操作中...
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default UserManagement; 