import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { getApiBaseUrl } from '../api/api';
import { useNotification } from './Notification';

interface WebhookEventItem {
  _id: string;
  provider?: string;
  eventId?: string;
  type: string;
  created_at?: string;
  to?: any;
  subject?: string;
  status?: string;
  data?: any;
  raw?: any;
  receivedAt?: string;
  updatedAt?: string;
}

const WebhookEventsManager: React.FC = () => {
  const [items, setItems] = useState<WebhookEventItem[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<WebhookEventItem | null>(null);
  const [editing, setEditing] = useState<WebhookEventItem | null>(null);
  const [creating, setCreating] = useState<boolean>(false);
  const { setNotification } = useNotification();

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);

  const fetchList = async (p = page, ps = pageSize) => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const res = await fetch(`${getApiBaseUrl()}/api/webhook-events?page=${p}&pageSize=${ps}` , {
        headers: {
          'Authorization': `Bearer ${token}`,
        }
      });
      if (!res.ok) throw new Error('获取列表失败');
      const data = await res.json();
      if (!data.success) throw new Error(data.error || '获取列表失败');
      setItems(data.items || []);
      setTotal(data.total || 0);
      setPage(data.page || p);
      setPageSize(data.pageSize || ps);
    } catch (e: any) {
      setNotification({ type: 'error', message: e.message || '获取列表失败' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchList(1, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('确认删除该事件记录？')) return;
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${getApiBaseUrl()}/api/webhook-events/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || '删除失败');
      setNotification({ type: 'success', message: '删除成功' });
      fetchList(page, pageSize);
    } catch (e: any) {
      setNotification({ type: 'error', message: e.message || '删除失败' });
    }
  };

  const handleSave = async () => {
    try {
      const token = localStorage.getItem('token');
      const body = JSON.stringify(editing);
      const res = await fetch(`${getApiBaseUrl()}/api/webhook-events/${editing!._id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || '保存失败');
      setNotification({ type: 'success', message: '保存成功' });
      setEditing(null);
      fetchList(page, pageSize);
    } catch (e: any) {
      setNotification({ type: 'error', message: e.message || '保存失败' });
    }
  };

  const handleCreate = async () => {
    try {
      const token = localStorage.getItem('token');
      const payload: Partial<WebhookEventItem> = creating ? editing || {} : {};
      const res = await fetch(`${getApiBaseUrl()}/api/webhook-events`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || '新增失败');
      setNotification({ type: 'success', message: '新增成功' });
      setCreating(false);
      setEditing(null);
      fetchList(1, pageSize);
    } catch (e: any) {
      setNotification({ type: 'error', message: e.message || '新增失败' });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="text-lg font-semibold text-gray-800">Webhook事件管理</div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchList(page, pageSize)}
            className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded"
          >刷新</button>
          <button
            onClick={() => { setCreating(true); setEditing({ _id: '', type: '', provider: 'resend' } as any); }}
            className="px-3 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded"
          >新增</button>
        </div>
      </div>

      <div className="bg-white/80 backdrop-blur-sm rounded-xl border p-4 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-gray-600">
              <th className="p-2">类型</th>
              <th className="p-2">事件ID</th>
              <th className="p-2">主题</th>
              <th className="p-2">收件人</th>
              <th className="p-2">状态</th>
              <th className="p-2">时间</th>
              <th className="p-2">操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map(it => (
              <tr key={it._id} className="border-t">
                <td className="p-2">{it.type}</td>
                <td className="p-2 truncate max-w-[200px]" title={it.eventId || ''}>{it.eventId || '-'}</td>
                <td className="p-2">{it.subject || '-'}</td>
                <td className="p-2 truncate max-w-[180px]" title={typeof it.to === 'string' ? it.to : JSON.stringify(it.to)}>
                  {typeof it.to === 'string' ? it.to : Array.isArray(it.to) ? it.to.join(', ') : '-' }
                </td>
                <td className="p-2">{it.status || '-'}</td>
                <td className="p-2">{it.receivedAt ? new Date(it.receivedAt).toLocaleString() : '-'}</td>
                <td className="p-2 space-x-2">
                  <button className="px-2 py-1 text-blue-600 hover:underline" onClick={() => setSelected(it)}>详情</button>
                  <button className="px-2 py-1 text-amber-600 hover:underline" onClick={() => setEditing(it)}>编辑</button>
                  <button className="px-2 py-1 text-red-600 hover:underline" onClick={() => handleDelete(it._id)}>删除</button>
                </td>
              </tr>
            ))}
            {!loading && items.length === 0 && (
              <tr>
                <td className="p-4 text-center text-gray-400" colSpan={7}>暂无数据</td>
              </tr>
            )}
          </tbody>
        </table>
        {loading && <div className="p-4 text-gray-400">加载中…</div>}
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-600">共 {total} 条</div>
        <div className="flex items-center gap-2">
          <button disabled={page <= 1} onClick={() => fetchList(page - 1, pageSize)} className="px-3 py-1 bg-gray-100 rounded disabled:opacity-50">上一页</button>
          <span className="text-sm">{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => fetchList(page + 1, pageSize)} className="px-3 py-1 bg-gray-100 rounded disabled:opacity-50">下一页</button>
        </div>
      </div>

      {/* 详情弹窗 */}
      {selected && (
        <motion.div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className="bg-white rounded-xl max-w-3xl w-full p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold">事件详情</div>
              <button onClick={() => setSelected(null)} className="text-gray-500 hover:text-gray-700">关闭</button>
            </div>
            <pre className="text-xs bg-gray-50 p-3 rounded overflow-auto max-h-[70vh]">{JSON.stringify(selected, null, 2)}</pre>
          </div>
        </motion.div>
      )}

      {/* 编辑/创建弹窗 */}
      {(editing || creating) && (
        <motion.div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className="bg-white rounded-xl max-w-2xl w-full p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-semibold">{creating ? '新增事件' : '编辑事件'}</div>
              <button onClick={() => { setEditing(null); setCreating(false); }} className="text-gray-500 hover:text-gray-700">关闭</button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-gray-600 mb-1">类型</label>
                <input className="w-full border rounded px-3 py-2" value={editing?.type || ''} onChange={e => setEditing({ ...(editing as any), type: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">事件ID</label>
                <input className="w-full border rounded px-3 py-2" value={editing?.eventId || ''} onChange={e => setEditing({ ...(editing as any), eventId: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">主题</label>
                <input className="w-full border rounded px-3 py-2" value={editing?.subject || ''} onChange={e => setEditing({ ...(editing as any), subject: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">状态</label>
                <input className="w-full border rounded px-3 py-2" value={editing?.status || ''} onChange={e => setEditing({ ...(editing as any), status: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm text-gray-600 mb-1">收件人(to)</label>
                <input className="w-full border rounded px-3 py-2" value={typeof editing?.to === 'string' ? (editing?.to || '') : JSON.stringify(editing?.to || '')} onChange={e => {
                  let value: any = e.target.value;
                  try { value = JSON.parse(e.target.value); } catch {}
                  setEditing({ ...(editing as any), to: value });
                }} />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm text-gray-600 mb-1">数据(data)</label>
                <textarea className="w-full border rounded px-3 py-2 h-32" value={JSON.stringify(editing?.data || {}, null, 2)} onChange={e => {
                  try {
                    const value = JSON.parse(e.target.value);
                    setEditing({ ...(editing as any), data: value });
                  } catch {
                    setEditing({ ...(editing as any), data: e.target.value });
                  }
                }} />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              {!creating && <button onClick={handleSave} className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">保存</button>}
              {creating && <button onClick={handleCreate} className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">创建</button>}
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default WebhookEventsManager;
