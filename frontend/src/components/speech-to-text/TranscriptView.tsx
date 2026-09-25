import React, { useMemo, useState } from 'react';
import { FaClock, FaCopy, FaDownload } from 'react-icons/fa';
import type { TranscriptItem } from '../../api/transcribe';
import { cn } from '../../utils/cn';
import { studioSecondaryButtonClassName, studioSubPanelClassName } from '../studioTheme';

/** 与后端 fmtClock 对齐:mm:ss,超过一小时补时位。 */
function fmtClock(ms: number): string {
  const total = Math.floor(Math.max(0, ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${p(h)}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}

const DOWNLOAD_FORMATS: Array<['txt' | 'timed' | 'srt' | 'json', string]> = [
  ['txt', 'txt'],
  ['timed', '时间线'],
  ['srt', 'srt'],
  ['json', 'json'],
];

/**
 * 转写结果视图:同一份 segments 渲染两种形态 ——
 *   无时间线 = 纯文本(段落直接相接,与 .txt 产物一致)
 *   有时间线 = 逐段 [起 -> 止] + 说话人(与 .timed.txt / .srt 产物一致)
 * 展示什么与选了哪些产物无关:分段始终由接口返回,产物文件只决定可下载的内容。
 */
export const TranscriptView: React.FC<{
  item: TranscriptItem;
  onDownload?: (format: 'txt' | 'timed' | 'srt' | 'json') => void;
}> = ({ item, onDownload }) => {
  const [timed, setTimed] = useState(true);
  const [copied, setCopied] = useState(false);

  const plain = useMemo(() => item.segments.map((s) => s.onebest || '').join(''), [item.segments]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(plain);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // 剪贴板不可用(非安全上下文)时静默:文本本来就在页面上
    }
  };

  if (item.contentMissing) {
    return (
      <div className={cn(studioSubPanelClassName, 'border-rose-100 bg-rose-50 text-xs text-rose-700')}>
        转写正文不可读:服务端已没有该任务的正文记录,产物文件也已不在磁盘上。请联系管理员核查。
      </div>
    );
  }

  if (item.segments.length === 0) {
    return (
      <div className={cn(studioSubPanelClassName, 'text-xs text-slate-500')}>
        {item.ok ? '没有可显示的分段(识别结果为空,或本次音频里没有可转写的人声)。' : `转写失败:${item.error || '未知错误'}`}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl border border-slate-200 bg-white p-0.5">
          <button
            type="button"
            onClick={() => setTimed(false)}
            className={cn(
              'rounded-lg px-2.5 py-1 text-[11px] font-semibold transition',
              !timed ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-700',
            )}
          >
            无时间线
          </button>
          <button
            type="button"
            onClick={() => setTimed(true)}
            className={cn(
              'rounded-lg px-2.5 py-1 text-[11px] font-semibold transition',
              timed ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-700',
            )}
          >
            有时间线
          </button>
        </div>
        <span className="text-[11px] text-slate-400">
          {item.segmentCount} 段{item.durationSec ? ` · ${fmtClock(item.durationSec * 1000)}` : ''}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <button type="button" onClick={() => void copy()} className={cn(studioSecondaryButtonClassName, 'px-2.5 py-1 text-[11px]')}>
            <FaCopy className="text-[10px]" />
            {copied ? '已复制' : '复制纯文本'}
          </button>
          {onDownload
            ? DOWNLOAD_FORMATS.filter(([format]) => item.files[format]).map(([format, label]) => (
                <button
                  key={format}
                  type="button"
                  onClick={() => onDownload(format)}
                  className={cn(studioSecondaryButtonClassName, 'px-2.5 py-1 text-[11px]')}
                >
                  <FaDownload className="text-[10px]" />
                  {label}
                </button>
              ))
            : null}
        </div>
      </div>

      {timed ? (
        <div className="max-h-[360px] overflow-y-auto rounded-2xl border border-slate-100 bg-white">
          <table className="w-full text-left text-xs">
            <tbody>
              {item.segments.map((seg, i) => (
                <tr key={`${seg.bg}-${i}`} className="border-b border-slate-50 last:border-0">
                  <td className="w-32 whitespace-nowrap px-3 py-2 align-top font-mono text-[11px] text-slate-400">
                    <FaClock className="mr-1 inline text-[9px] text-slate-300" />
                    {fmtClock(seg.bg)}
                    <span className="text-slate-300"> → </span>
                    {fmtClock(seg.ed)}
                  </td>
                  <td className="w-16 whitespace-nowrap px-1 py-2 align-top text-[11px] text-violet-500">
                    {seg.speaker ? `说话人${seg.speaker}` : ''}
                  </td>
                  <td className="px-3 py-2 leading-6 text-slate-700">{seg.onebest}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="max-h-[360px] overflow-y-auto whitespace-pre-wrap rounded-2xl border border-slate-100 bg-white px-4 py-3 text-sm leading-7 text-slate-700">
          {plain}
        </div>
      )}
    </div>
  );
};

export default TranscriptView;
