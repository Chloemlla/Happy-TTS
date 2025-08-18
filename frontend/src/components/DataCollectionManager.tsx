import React, { useEffect, useMemo, useState, useDeferredValue, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { getApiBaseUrl } from '../api/api';
import { FaChartBar, FaSync, FaSearch, FaRedo, FaTrash, FaEye, FaTimes, FaPlus, FaClipboard, FaCopy } from 'react-icons/fa';
import { useNotification } from './Notification';
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import jsonLang from 'react-syntax-highlighter/dist/esm/languages/prism/json';
import jsLang from 'react-syntax-highlighter/dist/esm/languages/prism/javascript';

SyntaxHighlighter.registerLanguage('json', jsonLang);
SyntaxHighlighter.registerLanguage('javascript', jsLang);

interface Item {
    _id: string;
    userId: string;
    action: string;
    timestamp: string;
    hash?: string;
    details?: any;
}

type SortOrder = 'asc' | 'desc';

const jsonPretty = (obj: any) => {
    try { return JSON.stringify(obj, null, 2); } catch { return String(obj); }
};

// Memoized desktop row
const DataRow = React.memo(({ item, checked, onToggle, onView, onDelete }: {
    item: Item; checked: boolean; onToggle: (id: string) => void; onView: (it: Item) => void; onDelete: (id: string) => void;
}) => {
    const { setNotification } = useNotification();
    return (
        <tr className="border-t border-gray-100 hover:bg-gray-50">
            <td className="p-3"><input type="checkbox" checked={checked} onChange={() => onToggle(item._id)} /></td>
            <td className="p-3 whitespace-nowrap">{new Date(item.timestamp).toLocaleString('zh-CN')}</td>
            <td className="p-3 break-words whitespace-normal" title={item.userId}>{item.userId}</td>
            <td className="p-3">
                <div className="flex items-center gap-2">
                    <span className="break-all font-mono flex-1" title={item._id}>{item._id}</span>
                    <button
                        className="inline-flex items-center justify-center w-5 h-5 rounded bg-gray-100 hover:bg-gray-200 text-gray-700"
                        title="复制ID"
                        onClick={async (e) => {
                            e.stopPropagation();
                            try {
                                await navigator.clipboard.writeText(item._id);
                                setNotification({ type: 'success', message: 'ID 已复制' });
                            } catch (err: any) {
                                setNotification({ type: 'error', message: err?.message || '复制失败' });
                            }
                        }}
                    >
                        <FaCopy className="w-3 h-3" />
                    </button>
                </div>
            </td>
            <td className="p-3 break-words whitespace-normal" title={item.action}>{item.action}</td>
            <td className="p-3">
                <div className="flex flex-wrap gap-2">
                    <button className="px-2 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-medium flex items-center gap-2" onClick={() => onView(item)}>
                        <FaEye className="w-3.5 h-3.5" /> 查看
                    </button>
                    <button className="px-2 py-1 rounded-lg bg-red-500 text-white hover:bg-red-600 text-xs font-medium" onClick={() => onDelete(item._id)}>
                        删除
                    </button>
                </div>
            </td>
        </tr>
    );
});

// Memoized mobile card
const DataCard = React.memo(({ item, checked, onToggle, onView, onDelete }: {
    item: Item; checked: boolean; onToggle: (id: string) => void; onView: (it: Item) => void; onDelete: (id: string) => void;
}) => {
    const { setNotification } = useNotification();
    return (
        <div className="p-4">
            <div className="flex items-start gap-3">
                <input type="checkbox" className="mt-1 flex-shrink-0" checked={checked} onChange={() => onToggle(item._id)} />
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-indigo-100 text-indigo-700" title={item.action}>动作</span>
                        <span className="inline-block px-2 py-0.5 rounded text-[10px] font-mono bg-gray-100 text-gray-700 break-words whitespace-normal max-w-full" title={item.action}>{item.action}</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">{new Date(item.timestamp).toLocaleString('zh-CN')}</div>
                    <div className="text-xs text-gray-600 mt-1 break-words whitespace-normal" title={item.userId}>用户：{item.userId || '-'}</div>
                    <div className="text-[10px] text-gray-600 mt-1 font-mono flex items-center gap-1" title={item._id}>
                        <span className="text-gray-500 flex-shrink-0">ID：</span>
                        <span className="break-all flex-1">{item._id}</span>
                        <button
                            className="inline-flex items-center justify-center w-5 h-5 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 flex-shrink-0"
                            onClick={async (e) => {
                                e.stopPropagation();
                                try {
                                    await navigator.clipboard.writeText(item._id);
                                    setNotification({ type: 'success', message: 'ID 已复制' });
                                } catch (err: any) {
                                    setNotification({ type: 'error', message: err?.message || '复制失败' });
                                }
                            }}
                            title="复制ID"
                        >
                            <FaCopy className="w-3 h-3" />
                        </button>
                    </div>
                </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
                <button className="w-full px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-medium flex items-center justify-center gap-1" onClick={() => onView(item)}>
                    <FaEye className="w-3.5 h-3.5" /> 查看
                </button>
                <button className="w-full px-3 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 text-xs font-medium" onClick={() => onDelete(item._id)}>
                    删除
                </button>
            </div>
        </div>
    );
});

const DataCollectionManager: React.FC = () => {
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(20);
    const [sort, setSort] = useState<SortOrder>('desc');
    const [userId, setUserId] = useState('');
    const [action, setAction] = useState('');
    const [start, setStart] = useState('');
    const [end, setEnd] = useState('');
    const [loading, setLoading] = useState(false);
    const [items, setItems] = useState<Item[]>([]);
    const [total, setTotal] = useState(0);
    const [stats, setStats] = useState<any>(null);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [viewItem, setViewItem] = useState<Item | null>(null);
    const [batchLoading, setBatchLoading] = useState(false);
    const [batchView, setBatchView] = useState<null | { ids: string[]; items: any[] }>(null);
    // Create modal state
    const [creating, setCreating] = useState(false);
    const [newUserId, setNewUserId] = useState('');
    const [newAction, setNewAction] = useState('');
    const [newTsLocal, setNewTsLocal] = useState(''); // datetime-local string
    const [newDetailsRaw, setNewDetailsRaw] = useState(''); // string or JSON text
    const base = getApiBaseUrl();
    const { setNotification } = useNotification();

    // Abort controllers
    const listAbortRef = useRef<AbortController | null>(null);
    const statsAbortRef = useRef<AbortController | null>(null);

    const buildHeaders = (): HeadersInit => {
        const token = localStorage.getItem('token');
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        return headers;
    };

    const handleCreate = async () => {
        try {
            const payload: any = {
                userId: newUserId.trim(),
                action: newAction.trim(),
                timestamp: newTsLocal ? new Date(newTsLocal).toISOString() : new Date().toISOString(),
            };
            if (!payload.userId || !payload.action) {
                setNotification({ type: 'error', message: '请填写 userId 与 action' });
                return;
            }
            // parse details if JSON, otherwise keep string
            if (newDetailsRaw.trim()) {
                try {
                    payload.details = JSON.parse(newDetailsRaw);
                } catch {
                    payload.details = newDetailsRaw;
                }
            } else {
                payload.details = {};
            }
            const res = await fetch(`${base}/api/data-collection/admin`, {
                method: 'POST',
                headers: buildHeaders(),
                body: JSON.stringify(payload),
            });
            if (res.status === 401) {
                setNotification({ type: 'error', message: '未授权或登录已过期，请重新登录' });
                return;
            }
            const data = await res.json();
            if (!res.ok || data.success === false) throw new Error(data.message || '创建失败');
            setCreating(false);
            setNewUserId(''); setNewAction(''); setNewTsLocal(''); setNewDetailsRaw('');
            setPage(1);
            await fetchList();
            setNotification({ type: 'success', message: '创建成功' });
        } catch (e: any) {
            setNotification({ type: 'error', message: e?.message || '创建失败' });
        }
    };

    const fetchList = useCallback(async () => {
        setLoading(true);
        // cancel previous
        if (listAbortRef.current) listAbortRef.current.abort();
        const aborter = new AbortController();
        listAbortRef.current = aborter;
        try {
            const params = new URLSearchParams();
            params.set('page', String(page));
            params.set('limit', String(limit));
            params.set('sort', sort);
            if (userId) params.set('userId', userId.trim());
            if (action) params.set('action', action.trim());
            if (start) params.set('start', new Date(start).toISOString());
            if (end) params.set('end', new Date(end).toISOString());
            const res = await fetch(`${base}/api/data-collection/admin?${params.toString()}`, {
                headers: buildHeaders(),
                signal: aborter.signal,
            });
            if (res.status === 401) {
                setNotification({ type: 'error', message: '未授权或登录已过期，请重新登录' });
                return;
            }
            const data = await res.json();
            if (!res.ok || data.success === false) throw new Error(data.message || '加载失败');
            setItems(data.items || []);
            setTotal(data.total || 0);
        } catch (e: any) {
            if (e?.name !== 'AbortError') console.error('[DataCollectionManager] list error', e);
        } finally {
            setLoading(false);
        }
    }, [base, page, limit, sort, userId, action, start, end, setNotification]);

    const fetchStats = useCallback(async () => {
        if (statsAbortRef.current) statsAbortRef.current.abort();
        const aborter = new AbortController();
        statsAbortRef.current = aborter;
        try {
            const res = await fetch(`${base}/api/data-collection/admin/stats`, {
                headers: buildHeaders(),
                signal: aborter.signal,
            });
            if (res.status === 401) {
                setNotification({ type: 'error', message: '未授权或登录已过期，请重新登录' });
                return;
            }
            const data = await res.json();
            if (res.ok && data.success !== false) setStats(data.data);
        } catch (e: any) {
            if (e?.name !== 'AbortError') console.error('[DataCollectionManager] stats error', e);
        }
    }, [base, setNotification]);

    useEffect(() => {
        fetchList();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, limit, sort, userId, action, start, end]);

    useEffect(() => {
        fetchStats();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        return () => {
            if (listAbortRef.current) listAbortRef.current.abort();
            if (statsAbortRef.current) statsAbortRef.current.abort();
        };
    }, []);

    const totalPages = Math.max(1, Math.ceil(total / Math.max(1, limit)));
    const allChecked = items.length > 0 && items.every(i => selected.has(i._id));
    const toggleAll = () => {
        if (allChecked) setSelected(new Set());
        else setSelected(new Set(items.map(i => i._id)));
    };

    const toggleOne = useCallback((id: string) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    }, []);

    const deferredItems = useDeferredValue(items);

    const deleteOne = useCallback(async (id: string) => {
        if (!confirm('确认删除该记录？')) return;
        try {
            const res = await fetch(`${base}/api/data-collection/admin/${id}`, {
                method: 'DELETE',
                headers: buildHeaders(),
            });
            if (res.status === 401) {
                setNotification({ type: 'error', message: '未授权或登录已过期，请重新登录' });
                return;
            }
            const data = await res.json();
            if (!res.ok || data.success === false) throw new Error(data.message || '删除失败');
            await fetchList();
            setSelected(prev => { const s = new Set(prev); s.delete(id); return s; });
        } catch (e) {
            setNotification({ type: 'error', message: '删除失败' });
        }
    }, [base, fetchList, setNotification]);

    const deleteBatch = async () => {
        const ids = Array.from(selected);
        if (ids.length === 0) return alert('请先选择要删除的记录');
        if (!confirm(`确认批量删除 ${ids.length} 条记录？`)) return;
        try {
            const res = await fetch(`${base}/api/data-collection/admin/delete-batch`, {
                method: 'POST',
                headers: buildHeaders(),
                body: JSON.stringify({ ids }),
            });
            if (res.status === 401) {
                alert('未授权或登录已过期，请重新登录');
                return;
            }
            const data = await res.json();
            if (!res.ok || data.success === false) throw new Error(data.message || '批量删除失败');
            await fetchList();
            setSelected(new Set());
        } catch (e) {
            setNotification({ type: 'error', message: '批量删除失败' });
        }
    };

    // 选择与聚合辅助
    const requireSelection = (): string[] | null => {
        const ids = Array.from(selected);
        if (!ids.length) {
            setNotification({ type: 'warning', message: '请先选择要操作的记录' });
            return null;
        }
        return ids;
    };

    const copySelectedIds = async () => {
        const ids = requireSelection();
        if (!ids) return;
        try {
            await navigator.clipboard.writeText(ids.join('\n'));
            setNotification({ type: 'success', message: `已复制 ${ids.length} 个ID` });
        } catch (e: any) {
            setNotification({ type: 'error', message: e?.message || '复制失败' });
        }
    };

    const fetchDetailsByIds = async (ids: string[]) => {
        const results: any[] = [];
        for (const id of ids) {
            try {
                const res = await fetch(`${base}/api/data-collection/admin/${id}`, { headers: buildHeaders() });
                const data = await res.json();
                if (res.ok && data?.success !== false && data?.data) results.push(data.data);
                else results.push({ _id: id, error: data?.message || 'not_ok' });
            } catch (e: any) {
                results.push({ _id: id, error: e?.message || 'fetch_error' });
            }
        }
        return results;
    };

    const viewSelectedLogs = async () => {
        const ids = requireSelection();
        if (!ids) return;
        setBatchLoading(true);
        try {
            const details = await fetchDetailsByIds(ids);
            setBatchView({ ids, items: details });
        } catch (e: any) {
            setNotification({ type: 'error', message: e?.message || '加载日志失败' });
        } finally {
            setBatchLoading(false);
        }
    };

    const copySelectedLogs = async () => {
        const ids = requireSelection();
        if (!ids) return;
        setBatchLoading(true);
        try {
            const details = await fetchDetailsByIds(ids);
            const text = JSON.stringify({ ids, items: details }, null, 2);
            await navigator.clipboard.writeText(text);
            setNotification({ type: 'success', message: `已复制 ${ids.length} 条日志 JSON` });
        } catch (e: any) {
            setNotification({ type: 'error', message: e?.message || '复制失败' });
        } finally {
            setBatchLoading(false);
        }
    };

    const onView = useCallback((it: Item) => setViewItem(it), []);

    return (
        <div className="max-w-7xl mx-auto px-4 space-y-6">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-2xl shadow-xl border border-white/20 p-4 sm:p-6"
            >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shadow">
                            <FaChartBar className="w-5 h-5" />
                        </div>
                        <div>
                            <div className="text-xl sm:text-2xl font-semibold">数据收集管理</div>
                            <div className="text-white/80 text-sm">统一的管理与统计视图</div>
                        </div>
                    </div>
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                        <button
                            onClick={() => { setPage(1); fetchList(); }}
                            className="w-full sm:w-auto px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-medium flex items-center gap-2"
                        >
                            <FaSync className="w-4 h-4" /> 刷新列表
                        </button>
                        <button
                            onClick={fetchStats}
                            className="w-full sm:w-auto px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-medium flex items-center gap-2"
                        >
                            <FaSync className="w-4 h-4" /> 刷新统计
                        </button>
                        <button
                            onClick={() => { setCreating(true); setNewUserId(''); setNewAction(''); setNewTsLocal(new Date().toISOString().slice(0, 16)); setNewDetailsRaw(''); }}
                            className="w-full sm:w-auto px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-medium flex items-center gap-2"
                        >
                            <FaPlus className="w-4 h-4" /> 新增记录
                        </button>
                        <button onClick={viewSelectedLogs} disabled={batchLoading || selected.size === 0} className="w-full sm:w-auto px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-medium flex items-center gap-2">
                          <FaEye className="w-4 h-4" /> 查看合并
                        </button>
                        <button onClick={copySelectedIds} disabled={selected.size === 0} className="w-full sm:w-auto px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-medium flex items-center gap-2">
                          <FaCopy className="w-4 h-4" /> 复制ID
                        </button>
                        <button onClick={copySelectedLogs} disabled={batchLoading || selected.size === 0} className="w-full sm:w-auto px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-medium flex items-center gap-2">
                          <FaClipboard className="w-4 h-4" /> 一键复制日志
                        </button>
                        <button
                            onClick={async () => {
                                if (!confirm('确认删除全部数据收集记录？该操作不可恢复。')) return;
                                try {
                                    const res = await fetch(`${base}/api/data-collection/admin/all`, {
                                        method: 'DELETE',
                                        headers: buildHeaders(),
                                        body: JSON.stringify({ confirm: true })
                                    });
                                    const data = await res.json();
                                    if (!res.ok || data.success === false) throw new Error(data.message || '删除失败');
                                    setNotification({ type: 'success', message: `已删除 ${data.deletedCount || 0} 条记录` });
                                    setSelected(new Set());
                                    setPage(1);
                                    await fetchList();
                                } catch (e: any) {
                                    setNotification({ type: 'error', message: e?.message || '删除失败' });
                                }
                            }}
                            className="w-full sm:w-auto px-3 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium flex items-center gap-2"
                        >
                            <FaTrash className="w-4 h-4" /> 删除全部
                        </button>
                    </div>
                </div>
            </motion.div>

            {/* Stats */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 p-4 sm:p-6"
            >
                <div className="flex items-center justify-between">
                    <div className="text-lg font-semibold text-gray-900">数据收集统计</div>
                    <button className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium flex items-center gap-2" onClick={fetchStats}>
                        <FaSync className="w-4 h-4" /> 刷新
                    </button>
                </div>
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="rounded-xl bg-gray-50 p-4 border border-gray-100">
                        <div className="text-xs text-gray-500">总记录</div>
                        <div className="text-2xl font-bold text-gray-900">{stats?.total ?? '-'}</div>
                    </div>
                    <div className="rounded-xl bg-gray-50 p-4 border border-gray-100">
                        <div className="text-xs text-gray-500">动作种类</div>
                        <div className="text-2xl font-bold text-gray-900">{Array.isArray(stats?.byAction) ? stats.byAction.length : '-'}</div>
                    </div>
                    <div className="rounded-xl bg-gray-50 p-4 border border-gray-100">
                        <div className="text-xs text-gray-500">近7日</div>
                        <div className="text-sm whitespace-pre-wrap text-gray-700">
                            {Array.isArray(stats?.last7days)
                                ? stats.last7days.map((d: any) => `${d._id}:${d.count}`).join('  ')
                                : '-'}
                        </div>
                    </div>
                </div>
            </motion.div>

            {/* Filters */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 p-4 sm:p-6"
            >
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <input className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-400" placeholder="userId" value={userId} onChange={e => setUserId(e.target.value)} />
                    <input className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-400" placeholder="action" value={action} onChange={e => setAction(e.target.value)} />
                    <input className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-400" type="datetime-local" value={start} onChange={e => setStart(e.target.value)} />
                    <input className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-400" type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} />
                </div>
                <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                        <select className="w-full sm:w-auto px-3 py-2 rounded-lg bg-gray-50 border border-gray-200" value={limit} onChange={e => { setPage(1); setLimit(Number(e.target.value)); }}>
                            {[10, 20, 50, 100].map(v => <option key={v} value={v}>{v}/页</option>)}
                        </select>
                        <select className="w-full sm:w-auto px-3 py-2 rounded-lg bg-gray-50 border border-gray-200" value={sort} onChange={e => setSort(e.target.value as SortOrder)}>
                            <option value="desc">时间倒序</option>
                            <option value="asc">时间正序</option>
                        </select>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                        <button className="w-full sm:w-auto px-4 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 text-white font-medium flex items-center justify-center gap-2" onClick={() => { setPage(1); fetchList(); }}>
                            <FaSearch className="w-4 h-4" /> 查询
                        </button>
                        <button className="w-full sm:w-auto px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-800 font-medium flex items-center justify-center gap-2" onClick={() => { setUserId(''); setAction(''); setStart(''); setEnd(''); setPage(1); fetchList(); }}>
                            <FaRedo className="w-4 h-4" /> 重置
                        </button>
                    </div>
                    <div className="sm:ml-auto flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
                        <button className="w-full sm:w-auto px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 font-medium flex items-center justify-center gap-2" onClick={deleteBatch}>
                            <FaTrash className="w-4 h-4" /> 批量删除
                        </button>
                    </div>
                </div>
            </motion.div>

            {/* List & Table */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 overflow-hidden"
            >
                {/* Mobile Select All */}
                <div className="block md:hidden p-3 border-b border-gray-100 bg-gray-50">
                    <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                        <input type="checkbox" checked={allChecked} onChange={toggleAll} />
                        <span>全选</span>
                    </label>
                </div>

                {/* Mobile Cards */}
                <div className="block md:hidden divide-y divide-gray-100">
                    {deferredItems.map(item => (
                        <DataCard key={item._id} item={item} checked={selected.has(item._id)} onToggle={toggleOne} onView={onView} onDelete={deleteOne} />
                    ))}
                    {deferredItems.length === 0 && (
                        <div className="p-6 text-center text-gray-400">{loading ? '加载中…' : '暂无数据'}</div>
                    )}
                </div>

                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto">
                    <table className="min-w-full text-sm table-fixed">
                        <thead className="bg-gray-50">
                            <tr className="text-gray-600">
                                <th className="p-3 text-left w-10"><input type="checkbox" checked={allChecked} onChange={toggleAll} /></th>
                                <th className="p-3 text-left w-44">时间</th>
                                <th className="p-3 text-left w-56">用户</th>
                                <th className="p-3 text-left w-72">ID</th>
                                <th className="p-3 text-left w-56">动作</th>
                                <th className="p-3 text-left w-48">操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            {deferredItems.map(item => (
                                <DataRow key={item._id} item={item} checked={selected.has(item._id)} onToggle={toggleOne} onView={onView} onDelete={deleteOne} />
                            ))}
                            {deferredItems.length === 0 && (
                                <tr><td className="p-6 text-center text-gray-400" colSpan={6}>{loading ? '加载中…' : '暂无数据'}</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 bg-gray-50 border-t border-gray-100">
                    <div className="text-gray-500">共 {total} 条 • 第 {page}/{totalPages} 页</div>
                    <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                        <button className="w-full sm:w-auto px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-50" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>上一页</button>
                        <button className="w-full sm:w-auto px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-50" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>下一页</button>
                    </div>
                </div>
            </motion.div>

            {/* View Modal */}
            {viewItem && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setViewItem(null)}>
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="w-[95vw] max-w-5xl max-h-[80vh] overflow-auto rounded-2xl bg-white/90 backdrop-blur p-4 sm:p-6 border border-white/20 shadow-xl"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-3">
                            <div className="font-semibold text-gray-900">记录详情</div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={async () => {
                                  try {
                                    await navigator.clipboard.writeText(JSON.stringify(viewItem, null, 2));
                                    setNotification({ type: 'success', message: '已复制' });
                                  } catch (e: any) {
                                    setNotification({ type: 'error', message: e?.message || '复制失败' });
                                  }
                                }}
                                className="px-3 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-800 text-sm font-medium flex items-center gap-2"
                              >
                                <FaClipboard className="w-4 h-4" /> 复制
                              </button>
                              <button
                                onClick={async () => {
                                  try {
                                    const id = (viewItem as any)?._id || '';
                                    if (!id) { setNotification({ type: 'warning', message: '无ID可复制' }); return; }
                                    await navigator.clipboard.writeText(String(id));
                                    setNotification({ type: 'success', message: 'ID 已复制' });
                                  } catch (e: any) {
                                    setNotification({ type: 'error', message: e?.message || '复制失败' });
                                  }
                                }}
                                className="px-3 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-800 text-sm font-medium flex items-center gap-2"
                              >
                                <FaCopy className="w-4 h-4" /> 复制ID
                              </button>
                              <button className="px-3 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-800 text-sm font-medium flex items-center gap-2" onClick={() => setViewItem(null)}>
                                  <FaTimes className="w-4 h-4" /> 关闭
                              </button>
                            </div>
                        </div>
                        <div className="mb-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-gray-700">
                            <div>
                                <span className="text-gray-500">ID：</span>
                                <span className="font-mono break-all">{(viewItem as any)?._id || '-'}</span>
                            </div>
                            <div>
                                <span className="text-gray-500">时间：</span>
                                <span className="font-mono">{(() => { try { return new Date((viewItem as any)?.timestamp).toLocaleString('zh-CN'); } catch { return String((viewItem as any)?.timestamp || '-') } })()}</span>
                            </div>
                            <div>
                                <span className="text-gray-500">Hash：</span>
                                <span className="font-mono break-all">{(viewItem as any)?.hash || '-'}</span>
                            </div>
                            <div>
                                <span className="text-gray-500">动作：</span>
                                <span className="font-mono break-all">{(viewItem as any)?.action || '-'}</span>
                            </div>
                        </div>
                        {(() => {
                            const raw: any = (viewItem as any)?.details?.payload?.raw_data;
                            if (typeof raw === 'string') {
                                let txt = String(raw)
                                    .replace(/\r\n?/g, '\n');
                                let lang: any = 'javascript';
                                let t = txt.trim();

                                // 解析代码围栏 ```lang\n...\n```
                                if (t.startsWith('```')) {
                                    const firstNl = t.indexOf('\n');
                                    const firstLine = firstNl !== -1 ? t.slice(0, firstNl) : t;
                                    const label = firstLine.replace(/^```/, '').trim().toLowerCase();
                                    const aliasMap: Record<string, string> = {
                                      js: 'javascript', javascript: 'javascript', node: 'javascript', mjs: 'javascript', cjs: 'javascript',
                                      ts: 'javascript', typescript: 'javascript',
                                      tsx: 'javascript', jsx: 'javascript',
                                      tsreact: 'javascript', typescriptreact: 'javascript', javascriptreact: 'javascript',
                                      java: 'javascript', json: 'json', jsonc: 'json'
                                    };
                                    if (label && aliasMap[label]) lang = aliasMap[label];
                                    const rest = firstNl !== -1 ? t.slice(firstNl + 1) : '';
                                    t = rest.endsWith('```') ? rest.slice(0, -3).trimEnd() : rest;
                                    txt = t;
                                }

                                // JSON 自动检测与美化（若未由围栏指定语言）
                                if (lang === 'javascript') {
                                    const tt = t.trim();
                                    if ((tt.startsWith('{') && tt.endsWith('}')) || (tt.startsWith('[') && tt.endsWith(']'))) {
                                        try {
                                            txt = JSON.stringify(JSON.parse(t), null, 2);
                                            lang = 'json';
                                        } catch {}
                                    }
                                }

                                return (
                                    <SyntaxHighlighter
                                        language={lang}
                                        style={vscDarkPlus}
                                        wrapLongLines
                                        customStyle={{ background: '#1e1e1e', borderRadius: '0.5rem', maxHeight: '70vh' }}
                                    >
                                        {txt}
                                    </SyntaxHighlighter>
                                );
                            }
                            return (
                                <SyntaxHighlighter
                                    language={'json'}
                                    style={vscDarkPlus}
                                    wrapLongLines
                                    customStyle={{ background: '#1e1e1e', borderRadius: '0.5rem', maxHeight: '70vh' }}
                                >
                                    {jsonPretty(viewItem)}
                                </SyntaxHighlighter>
                            );
                        })()}
                    </motion.div>
                </div>
            )}

            {/* Create Modal */}
            {creating && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setCreating(false)}>
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="w-[95vw] max-w-2xl max-h-[80vh] overflow-auto rounded-2xl bg-white/90 backdrop-blur p-4 sm:p-6 border border-white/20 shadow-xl"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-3">
                            <div className="font-semibold text-gray-900">新增数据收集记录</div>
                            <button className="px-3 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-800 text-sm font-medium flex items-center gap-2" onClick={() => setCreating(false)}>
                                <FaTimes className="w-4 h-4" /> 关闭
                            </button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-sm text-gray-600 mb-1">userId</label>
                                <input className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200" value={newUserId} onChange={e => setNewUserId(e.target.value)} />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-600 mb-1">action</label>
                                <input className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200" value={newAction} onChange={e => setNewAction(e.target.value)} />
                            </div>
                            <div className="sm:col-span-2">
                                <label className="block text-sm text-gray-600 mb-1">时间(timestamp)</label>
                                <input type="datetime-local" className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200" value={newTsLocal} onChange={e => setNewTsLocal(e.target.value)} />
                            </div>
                            <div className="sm:col-span-2">
                                <label className="block text-sm text-gray-600 mb-1">详情(details)</label>
                                <textarea className="w-full px-3 py-2 h-32 rounded-lg bg-gray-50 border border-gray-200" value={newDetailsRaw} onChange={e => setNewDetailsRaw(e.target.value)} placeholder="可填写纯文本或 JSON" />
                            </div>
                        </div>
                        <div className="flex items-center justify-end gap-2 mt-3">
                            <button className="px-3 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 text-white text-sm font-medium flex items-center gap-2" onClick={handleCreate}>
                                <FaPlus className="w-4 h-4" /> 创建
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}

            {/* Batch View Modal */}
            {batchView && (
              <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setBatchView(null)}>
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-[95vw] max-w-5xl max-h-[80vh] overflow-auto rounded-2xl bg-white/90 backdrop-blur p-4 sm:p-6 border border-white/20 shadow-xl" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="font-semibold text-gray-900">合并日志（{batchView.ids.length} 条）</div>
                    <div className="flex items-center gap-2">
                      <button onClick={async ()=>{ try { await navigator.clipboard.writeText(JSON.stringify(batchView, null, 2)); setNotification({ type:'success', message:'已复制' }); } catch(e:any){ setNotification({ type:'error', message:e?.message||'复制失败' }); } }} className="px-3 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-800 text-sm font-medium flex items-center gap-2">
                        <FaClipboard className="w-4 h-4" /> 复制
                      </button>
                      <button onClick={() => setBatchView(null)} className="px-3 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-800 text-sm font-medium flex items-center gap-2">
                        <FaTimes className="w-4 h-4" /> 关闭
                      </button>
                    </div>
                  </div>
                  <SyntaxHighlighter language={'json'} style={vscDarkPlus} wrapLongLines customStyle={{ background: '#1e1e1e', borderRadius: '0.5rem', maxHeight: '70vh' }}>
                    {JSON.stringify(batchView, null, 2)}
                  </SyntaxHighlighter>
                </motion.div>
              </div>
            )}
        </div>
    );
};

export default DataCollectionManager;
