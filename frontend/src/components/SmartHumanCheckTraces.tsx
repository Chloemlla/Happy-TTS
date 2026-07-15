import React, { useCallback, useEffect, useMemo, useRef, useState, memo, useReducer } from 'react';
import ReactDOM from 'react-dom';
import { getApiBaseUrl } from '../api/api';
import { motion } from 'framer-motion';
import { useNotification } from './Notification';
import { FaListAlt, FaSync, FaSearch, FaEye, FaTimes, FaTrash, FaCopy, FaClipboard } from 'react-icons/fa';
import { handleSourceClick, handleSourceModalClose } from './EnvManager';
import {
import { getAuthToken } from '../utils/authSession';

  InfoPanel,
  InfoSectionTitle,
  logShareDangerButtonClass,
  logShareInputClass,
  logSharePanelClass,
  logShareSecondaryButtonClass,
} from './LogShareStyleScaffold';

type TraceItem = {
  traceId: string;
  time: string;
  ip?: string;
  ua?: string;
  success: boolean;
  reason?: string;
  errorCode?: string;
  errorMessage?: string;
  score?: number;
  thresholdBase?: number;
  thresholdUsed?: number;
  passRateIp?: number;
  passRateUa?: number;
  policy?: string;
  riskLevel?: string;
  riskScore?: number;
  riskReasons?: string[];
  challengeRequired?: boolean;
};

// 优化的表格行组件
const TraceTableRow = memo(({ 
  item, 
  isSelected, 
  onToggleSelect, 
  onOpenDetail 
}: {
  item: TraceItem;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onOpenDetail: (id: string) => void;
}) => {
  const time = useMemo(() => new Date(item.time).toLocaleString('zh-CN'), [item.time]);
  
  return (
    <tr className="border-t border-slate-100 text-slate-600 transition-colors duration-150 hover:bg-slate-50/70">
      <td className="p-3 text-center">
        <input 
          type="checkbox" 
          checked={isSelected} 
          onChange={() => onToggleSelect(item.traceId)} 
        />
      </td>
      <td className="p-3 whitespace-nowrap">{time}</td>
      <td className="p-3 truncate font-mono" title={item.traceId}>{item.traceId}</td>
      <td className="p-3 whitespace-nowrap">{item.ip || '-'}</td>
      <td className="p-3 truncate" title={item.ua || ''}>{item.ua || '-'}</td>
      <td className="p-3 whitespace-nowrap">{item.success ? '成功' : '失败'}</td>
      <td className="p-3 truncate" title={item.reason || ''}>{item.reason || '-'}</td>
      <td className="p-3 whitespace-nowrap">{typeof item.score === 'number' ? item.score.toFixed(3) : '-'}</td>
      <td className="p-3 whitespace-nowrap">{typeof item.thresholdUsed === 'number' ? item.thresholdUsed.toFixed(3) : '-'}</td>
      <td className="p-3 whitespace-nowrap">{item.riskLevel || '-'}</td>
      <td className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <button 
            className={logShareSecondaryButtonClass}
            onClick={() => onOpenDetail(item.traceId)}
          >
            <FaEye className="w-3.5 h-3.5" /> <span className="hidden sm:inline">详情</span>
          </button>
        </div>
      </td>
    </tr>
  );
});

// 优化的移动端卡片组件
const TraceMobileCard = memo(({ 
  item, 
  isSelected, 
  onToggleSelect, 
  onOpenDetail 
}: {
  item: TraceItem;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onOpenDetail: (id: string) => void;
}) => {
  const time = useMemo(() => new Date(item.time).toLocaleString('zh-CN'), [item.time]);
  
  return (
    <div className="p-4 text-slate-600">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <input 
              type="checkbox" 
              className="mr-1" 
              checked={isSelected} 
              onChange={() => onToggleSelect(item.traceId)} 
            />
            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${item.success ? 'border-emerald-200 bg-emerald-50 text-emerald-700':'border-rose-200 bg-rose-50 text-rose-700'}`}>
              {item.success ? '成功':'失败'}
            </span>
            {item.reason && (
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                {item.reason}
              </span>
            )}
            <span 
              className="inline-flex max-w-[60%] items-center truncate rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[10px] font-semibold text-slate-600"
              title={item.traceId}
            >
              #{item.traceId}
            </span>
          </div>
          <div className="text-xs text-slate-500 mt-1">{time}</div>
          <div className="text-xs text-slate-600 mt-1 truncate">IP：{item.ip || '-'}</div>
          <div className="text-xs text-slate-600 mt-1 truncate" title={item.ua}>UA：{item.ua || '-'}</div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-row sm:grid-cols-none">
        <button 
          className={logShareSecondaryButtonClass}
          onClick={() => onOpenDetail(item.traceId)}
        >
          <FaEye className="w-3.5 h-3.5" /> 详情
        </button>
      </div>
    </div>
  );
});

const SmartHumanCheckTraces: React.FC = () => {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<TraceItem[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchView, setBatchView] = useState<null | { ids: string[]; items: any[] }>(null);
  const { setNotification } = useNotification();
  // Zoom and auto-fit
  const [zoom, setZoom] = useState<number>(1);
  const [autoFit] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [success, setSuccess] = useState<string>(''); // '', 'true', 'false'
  const [reason, setReason] = useState('');
  const [traceId, setTraceId] = useState('');
  const [ip, setIp] = useState('');
  const [ua, setUa] = useState('');

  // 防抖搜索
  const [debouncedFilters, setDebouncedFilters] = useState({
    reason: '',
    traceId: '',
    ip: '',
    ua: ''
  });

  // 防抖效果
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedFilters({ reason, traceId, ip, ua });
    }, 300);
    return () => clearTimeout(timer);
  }, [reason, traceId, ip, ua]);

  const pages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);
  
  // 优化的选择状态计算
  const selectedIdsSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  
  // 虚拟滚动优化 - 当数据量大时启用
  const shouldUseVirtualScroll = useMemo(() => items.length > 100, [items.length]);
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 50 });
  
  // 计算可见项目
  const visibleItems = useMemo(() => {
    if (!shouldUseVirtualScroll) return items;
    return items.slice(visibleRange.start, visibleRange.end);
  }, [items, visibleRange, shouldUseVirtualScroll]);

  const fetchList = useCallback(async (p = page, ps = pageSize, useDebounced = true) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('page', String(p));
      params.set('pageSize', String(ps));
      if (success !== '') params.set('success', success);
      
      // 使用防抖的过滤器或直接使用当前值
      const filters = useDebounced ? debouncedFilters : { reason, traceId, ip, ua };
      if (filters.reason) params.set('reason', filters.reason);
      if (filters.traceId) params.set('traceId', filters.traceId);
      if (filters.ip) params.set('ip', filters.ip);
      if (filters.ua) params.set('ua', filters.ua);

      const token = getAuthToken();
      const res = await fetch(`${getApiBaseUrl()}/api/human-check/traces?${params.toString()}` , {
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
        }
      });
      if (!res.ok) throw new Error(`加载失败: ${res.status}`);
      const data = await res.json();
      setItems(data.items || []);
      setTotal(data.total || 0);
      setPage(data.page || p);
      setPageSize(data.pageSize || ps);
    } catch (e: any) {
      setNotification({ type: 'error', message: e?.message || '加载失败' });
    } finally {
      setLoading(false);
      // 切页后清空选择，避免跨页误操作
      if (p !== page || ps !== pageSize) {
        setSelectedIds([]);
      }
    }
  }, [page, pageSize, success, debouncedFilters, reason, traceId, ip, ua, setNotification]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  // 防抖搜索触发
  useEffect(() => {
    if (debouncedFilters.reason !== reason || 
        debouncedFilters.traceId !== traceId || 
        debouncedFilters.ip !== ip || 
        debouncedFilters.ua !== ua) {
      fetchList(1, pageSize, true);
    }
  }, [debouncedFilters, reason, traceId, ip, ua, pageSize, fetchList]);

  // 性能监控
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[SmartHumanCheckTraces] 性能统计:`, {
        itemsCount: items.length,
        selectedCount: selectedIds.length,
        shouldUseVirtualScroll,
        visibleItemsCount: visibleItems.length,
        renderTime: performance.now()
      });
    }
  }, [items.length, selectedIds.length, shouldUseVirtualScroll, visibleItems.length]);

  // 内存优化 - 组件卸载时清理
  useEffect(() => {
    return () => {
      // 清理定时器
      const timers = document.querySelectorAll('[data-timer]');
      timers.forEach(timer => clearTimeout(Number(timer.getAttribute('data-timer'))));
      
      // 清理事件监听器
      window.removeEventListener('resize', () => {});
    };
  }, []);

  // Auto-fit zoom based on container width (target width: 1200px)
  useEffect(() => {
    if (!autoFit) return;
    const update = () => {
      const w = containerRef.current?.clientWidth || window.innerWidth;
      const target = 1024; // friendlier base width like UserManagement
      // Only downscale if smaller than target; keep at least 95% to avoid tiny UI
      const scale = w < target ? Math.max(0.95, w / target) : 1;
      setZoom(Number(scale.toFixed(2)));
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [autoFit]);

  const openDetail = async (id: string) => {
    try {
      const token = getAuthToken();
      const res = await fetch(`${getApiBaseUrl()}/api/human-check/trace/${id}`, {
        headers: { 'Authorization': token ? `Bearer ${token}` : '' }
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || '获取详情失败');
      
      // 使用 handleSourceClick 打开弹窗
      handleSourceClick(
        'trace-detail', // source 参数
        (item: any) => setSelected(item), // setSelectedSource 函数
        (show: boolean) => setSelected(show ? data.item : null), // setShowSourceModal 函数
        {
          storageKey: 'humanCheckTracesScrollPosition',
          getStorageValue: () => JSON.stringify({
            scrollY: window.scrollY,
            timestamp: Date.now(),
            traceId: id
          }),
          onBeforeOpen: () => {
            console.log('即将打开人机验证日志详情弹窗');
          },
          onAfterOpen: () => {
            console.log('人机验证日志详情弹窗已打开');
          }
        }
      );
    } catch (e: any) {
      setNotification({ type: 'error', message: e?.message || '获取详情失败' });
    }
  };

  const resetAndSearch = useCallback(() => { 
    setSuccess(''); 
    setReason(''); 
    setTraceId(''); 
    setIp(''); 
    setUa(''); 
    fetchList(1, pageSize, false); // 不使用防抖，立即搜索
  }, [pageSize, fetchList]);

  // 使用 handleSourceModalClose 关闭详情弹窗
  const closeDetailModal = useCallback(() => {
    handleSourceModalClose(
      (show: boolean) => setSelected(show ? selected : null),
      {
        storageKey: 'humanCheckTracesScrollPosition',
        getRestoreValue: () => {
          const saved = sessionStorage.getItem('humanCheckTracesScrollPosition');
          if (saved) {
            try {
              const data = JSON.parse(saved);
              // 检查时间戳，5秒内才恢复位置
              if (Date.now() - data.timestamp < 5000) {
                return data.scrollY;
              }
            } catch (e) {
              // 解析失败，尝试直接解析为数字
              const scrollY = parseInt(saved, 10);
              if (!isNaN(scrollY)) return scrollY;
            }
          }
          return 0;
        },
        onBeforeClose: () => {
          console.log('即将关闭人机验证日志详情弹窗');
        },
        onAfterClose: () => {
          console.log('人机验证日志详情弹窗已关闭');
        }
      }
    );
  }, [selected]);

  // 使用 handleSourceModalClose 关闭批量查看弹窗
  const closeBatchModal = useCallback(() => {
    handleSourceModalClose(
      (show: boolean) => setBatchView(show ? batchView : null),
      {
        storageKey: 'humanCheckTracesBatchScrollPosition',
        getRestoreValue: () => {
          const saved = sessionStorage.getItem('humanCheckTracesBatchScrollPosition');
          if (saved) {
            try {
              const data = JSON.parse(saved);
              // 检查时间戳，5秒内才恢复位置
              if (Date.now() - data.timestamp < 5000) {
                return data.scrollY;
              }
            } catch (e) {
              // 解析失败，尝试直接解析为数字
              const scrollY = parseInt(saved, 10);
              if (!isNaN(scrollY)) return scrollY;
            }
          }
          return 0;
        },
        onBeforeClose: () => {
          console.log('即将关闭批量日志查看弹窗');
        },
        onAfterClose: () => {
          console.log('批量日志查看弹窗已关闭');
        }
      }
    );
  }, [batchView]);

  // 选择相关 - 使用 useCallback 优化
  const isAllSelected = useMemo(() => 
    items.length > 0 && items.every(it => selectedIdsSet.has(it.traceId)), 
    [items, selectedIds]
  );
  
  const toggleSelectAll = useCallback(() => {
    if (isAllSelected) setSelectedIds([]);
    else setSelectedIds(items.map(it => it.traceId));
  }, [isAllSelected, items]);
  
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }, []);
  const requireSelection = useCallback((): string[] | null => {
    if (!selectedIds.length) {
      setNotification({ type: 'warning', message: '请先选择要操作的日志' });
      return null;
    }
    return selectedIds;
  }, [selectedIds, setNotification]);

  // 批量复制 TraceID
  const copySelectedIds = useCallback(async () => {
    const ids = requireSelection();
    if (!ids) return;
    try {
      await navigator.clipboard.writeText(ids.join('\n'));
      setNotification({ type: 'success', message: `已复制 ${ids.length} 个 TraceID` });
    } catch (e: any) {
      setNotification({ type: 'error', message: e?.message || '复制失败' });
    }
  }, [requireSelection, setNotification]);

  // 拉取详情 - 使用并发请求优化
  const fetchDetailsByIds = useCallback(async (ids: string[]) => {
    const token = getAuthToken();
    const headers = { 'Authorization': token ? `Bearer ${token}` : '' };
    
    // 使用 Promise.allSettled 进行并发请求
    const promises = ids.map(async (id) => {
      try {
        const res = await fetch(`${getApiBaseUrl()}/api/human-check/trace/${id}`, { headers });
        const data = await res.json();
        if (res.ok && data?.success && data?.item) return data.item;
        else return { traceId: id, error: data?.error || 'not_ok' };
      } catch (e: any) {
        return { traceId: id, error: e?.message || 'fetch_error' };
      }
    });
    
    const results = await Promise.allSettled(promises);
    return results.map(result => 
      result.status === 'fulfilled' ? result.value : { error: 'promise_rejected' }
    );
  }, []);

  // 批量查看合并
  const viewSelectedLogs = useCallback(async () => {
    const ids = requireSelection();
    if (!ids) return;
    setBatchLoading(true);
    try {
      const details = await fetchDetailsByIds(ids);
      
      // 使用 handleSourceClick 打开批量查看弹窗
      handleSourceClick(
        'batch-trace-detail', // source 参数
        (data: any) => setBatchView(data), // setSelectedSource 函数
        (show: boolean) => setBatchView(show ? { ids, items: details } : null), // setShowSourceModal 函数
        {
          storageKey: 'humanCheckTracesBatchScrollPosition',
          getStorageValue: () => JSON.stringify({
            scrollY: window.scrollY,
            timestamp: Date.now(),
            traceIds: ids,
            count: ids.length
          }),
          onBeforeOpen: () => {
            console.log('即将打开批量日志查看弹窗');
          },
          onAfterOpen: () => {
            console.log('批量日志查看弹窗已打开');
          }
        }
      );
    } catch (e: any) {
      setNotification({ type: 'error', message: e?.message || '加载日志失败' });
    } finally {
      setBatchLoading(false);
    }
  }, [requireSelection, fetchDetailsByIds, setNotification]);

  // 一键复制日志（JSON）
  const copySelectedLogs = useCallback(async () => {
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
  }, [requireSelection, fetchDetailsByIds, setNotification]);

  // 删除（已接入后端接口）
  const deleteSelected = useCallback(async () => {
    const ids = requireSelection();
    if (!ids) return;
    if (!window.confirm(`确定删除选中的 ${ids.length} 条日志吗？该操作不可恢复。`)) return;
    setBatchLoading(true);
    try {
      const token = getAuthToken();
      const res = await fetch(`${getApiBaseUrl()}/api/human-check/traces`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify({ ids })
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || `删除失败: ${res.status}`);
      const deleted = Number(data.deletedCount || 0);
      const notFound = (data.notFound || []) as string[];
      const msgParts: string[] = [];
      if (deleted > 0) msgParts.push(`已删除 ${deleted} 条`);
      if (notFound.length > 0) msgParts.push(`未找到 ${notFound.length} 条`);
      setNotification({ type: 'success', message: msgParts.join('，') || '操作完成' });
      // 刷新当前页并清空选择
      await fetchList(page, pageSize);
      setSelectedIds([]);
    } catch (e: any) {
      setNotification({ type: 'error', message: e?.message || '删除失败' });
    } finally {
      setBatchLoading(false);
    }
  }, [requireSelection, page, pageSize, fetchList, setNotification]);

  return (
    <div
      ref={containerRef}
      className="mx-auto max-w-7xl space-y-6 px-2 sm:px-4"
    >
      <InfoPanel>
        <InfoSectionTitle
          eyebrow="Human Check"
          title="人机验证日志"
          description="按结果、原因、Trace ID、IP 和 UA 筛选验证链路记录，并支持批量复制与合并查看。"
          icon={FaListAlt}
          action={
            <div className="flex flex-wrap gap-2">
              <button onClick={() => fetchList(page, pageSize)} className={logShareSecondaryButtonClass} title="刷新">
                <FaSync className="w-4 h-4" /> 刷新
              </button>
              <button onClick={resetAndSearch} className={logShareSecondaryButtonClass}>
                <FaSearch className="w-4 h-4" /> 重置筛选
              </button>
            </div>
          }
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
          <label className="space-y-2 text-sm font-semibold text-slate-700">
            <span>结果</span>
            <select value={success} onChange={e => { setSuccess(e.target.value); fetchList(1, pageSize); }} className={logShareInputClass}>
              <option value="">全部</option>
              <option value="true">成功</option>
              <option value="false">失败</option>
            </select>
          </label>
          <label className="space-y-2 text-sm font-semibold text-slate-700">
            <span>原因</span>
            <input value={reason} onChange={e => setReason(e.target.value)} placeholder="low_score / bad_token_sig ..." className={logShareInputClass} />
          </label>
          <label className="space-y-2 text-sm font-semibold text-slate-700">
            <span>Trace ID</span>
            <input value={traceId} onChange={e => setTraceId(e.target.value)} placeholder="traceId" className={logShareInputClass} />
          </label>
          <label className="space-y-2 text-sm font-semibold text-slate-700">
            <span>IP</span>
            <input value={ip} onChange={e => setIp(e.target.value)} placeholder="ip" className={logShareInputClass} />
          </label>
          <label className="space-y-2 text-sm font-semibold text-slate-700">
            <span>UA 包含</span>
            <input value={ua} onChange={e => setUa(e.target.value)} placeholder="user-agent 关键字" className={logShareInputClass} />
          </label>
          <label className="space-y-2 text-sm font-semibold text-slate-700">
            <span>每页</span>
            <select value={pageSize} onChange={(e)=>fetchList(1, Number(e.target.value))} className={logShareInputClass}>
              {[20,50,100,200].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        </div>
      </InfoPanel>

      {/* List & Table */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`${logSharePanelClass} overflow-hidden`}>
        {/* 批量操作工具栏 */}
        <div className="flex flex-col gap-3 border-b border-slate-100 bg-white/70 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-slate-500">已选 {selectedIds.length} 条</div>
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-slate-200 bg-white/80 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300">
              <input type="checkbox" checked={isAllSelected} onChange={toggleSelectAll} />
              <span>本页全选</span>
            </label>
            <button onClick={() => setSelectedIds([])} className={logShareSecondaryButtonClass}>清空选择</button>
            <button onClick={viewSelectedLogs} disabled={!selectedIds.length || batchLoading} className={logShareSecondaryButtonClass}>
              <FaEye className="w-4 h-4" /> 查看合并
            </button>
            <button onClick={copySelectedIds} disabled={!selectedIds.length} className={logShareSecondaryButtonClass}>
              <FaCopy className="w-4 h-4" /> 复制 TraceID
            </button>
            <button onClick={copySelectedLogs} disabled={!selectedIds.length || batchLoading} className={logShareSecondaryButtonClass}>
              <FaClipboard className="w-4 h-4" /> 一键复制日志
            </button>
            <button onClick={deleteSelected} disabled={!selectedIds.length || batchLoading} className={logShareDangerButtonClass}>
              <FaTrash className="w-4 h-4" /> 删除
            </button>
          </div>
        </div>
        {/* Mobile Cards */}
        <div className="block divide-y divide-slate-100 md:hidden">
          {visibleItems.map(it => (
            <TraceMobileCard
              key={it.traceId}
              item={it}
              isSelected={selectedIdsSet.has(it.traceId)}
              onToggleSelect={toggleSelect}
              onOpenDetail={openDetail}
            />
          ))}
          {!loading && items.length === 0 && (
            <div className="p-6 text-center text-slate-400">暂无数据</div>
          )}
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="min-w-full table-fixed text-xs sm:text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                <th className="p-3 w-10"><input type="checkbox" checked={isAllSelected} onChange={toggleSelectAll} /></th>
                <th className="p-3 w-44">时间</th>
                <th className="p-3 w-48">TraceID</th>
                <th className="p-3 w-32">IP</th>
                <th className="p-3 w-72">UA</th>
                <th className="p-3 w-20">结果</th>
                <th className="p-3 w-40">原因</th>
                <th className="p-3 w-28">分数</th>
                <th className="p-3 w-28">阈值</th>
                <th className="p-3 w-40">风险</th>
                <th className="p-3 w-32">操作</th>
              </tr>
            </thead>
            <tbody>
              {visibleItems.map(it => (
                <TraceTableRow
                  key={it.traceId}
                  item={it}
                  isSelected={selectedIdsSet.has(it.traceId)}
                  onToggleSelect={toggleSelect}
                  onOpenDetail={openDetail}
                />
              ))}
              {!loading && items.length === 0 && (
                <tr>
                  <td className="p-6 text-center text-slate-400" colSpan={10}>暂无数据</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {loading && <div className="p-4 text-slate-400">加载中…</div>}
      </motion.div>

      {/* Pagination */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-slate-500">共 {total} 条 • 第 {page}/{pages} 页</div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <button disabled={page <= 1} onClick={() => fetchList(page - 1, pageSize)} className={`${logShareSecondaryButtonClass} w-full sm:w-auto`}>上一页</button>
          <button disabled={page >= pages} onClick={() => fetchList(page + 1, pageSize)} className={`${logShareSecondaryButtonClass} w-full sm:w-auto`}>下一页</button>
        </div>
      </div>

      {/* 详情弹窗 — Portal 到 body */}
      {ReactDOM.createPortal(selected && (
        <motion.div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[9999]" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <div className={`${logSharePanelClass} max-w-3xl w-[95vw] p-4 sm:p-6`} data-source-modal="trace-detail">
          <div className="flex items-center justify-between mb-3">
            <div className="font-semibold text-slate-900">日志详情</div>
            <div className="flex items-center gap-2">
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(JSON.stringify(selected, null, 2));
                    setNotification({ type: 'success', message: '已复制' });
                  } catch (e: any) {
                    setNotification({ type: 'error', message: e?.message || '复制失败' });
                  }
                }}
                className={logShareSecondaryButtonClass}
              >
                <FaClipboard className="w-4 h-4" /> 复制
              </button>
              <button
                onClick={async () => {
                  try {
                    const id = (selected as any)?.traceId || '';
                    if (!id) {
                      setNotification({ type: 'warning', message: '无 TraceID 可复制' });
                      return;
                    }
                    await navigator.clipboard.writeText(String(id));
                    setNotification({ type: 'success', message: 'TraceID 已复制' });
                  } catch (e: any) {
                    setNotification({ type: 'error', message: e?.message || '复制失败' });
                  }
                }}
                className={logShareSecondaryButtonClass}
              >
                <FaCopy className="w-4 h-4" /> 复制ID
              </button>
              <button onClick={closeDetailModal} className={logShareSecondaryButtonClass}>
                <FaTimes className="w-4 h-4" /> 关闭
              </button>
            </div>
          </div>
          <pre className="max-h-[70vh] overflow-auto rounded-2xl bg-slate-950 p-3 text-xs text-slate-100">{JSON.stringify(selected, null, 2)}</pre>
        </div>
      </motion.div>
      ), document.body)}

      {/* 批量合并查看弹窗 — Portal 到 body */}
      {ReactDOM.createPortal(batchView && (
        <motion.div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[9999]" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className={`${logSharePanelClass} max-w-5xl w-[95vw] p-4 sm:p-6`} data-source-modal="batch-trace-detail">
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold text-slate-900">合并日志（{batchView.ids.length} 条）</div>
              <div className="flex items-center gap-2">
                <button onClick={async ()=>{ try { await navigator.clipboard.writeText(JSON.stringify(batchView, null, 2)); setNotification({ type:'success', message:'已复制' }); } catch(e:any){ setNotification({ type:'error', message:e?.message||'复制失败' }); } }} className={logShareSecondaryButtonClass}>
                  <FaClipboard className="w-4 h-4" /> 复制
                </button>
                <button onClick={closeBatchModal} className={logShareSecondaryButtonClass}>
                  <FaTimes className="w-4 h-4" /> 关闭
                </button>
              </div>
            </div>
            <pre className="max-h-[70vh] overflow-auto rounded-2xl bg-slate-950 p-3 text-xs text-slate-100">{JSON.stringify(batchView, null, 2)}</pre>
          </div>
        </motion.div>
      ), document.body)}
    </div>
  );
};

export default SmartHumanCheckTraces;
