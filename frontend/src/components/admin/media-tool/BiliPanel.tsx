import React, { useMemo, useState } from 'react';
import { FaDownload, FaExclamationTriangle, FaPlay, FaYoutube } from 'react-icons/fa';
import { mediaToolApi } from '../../../api/mediaTool';
import type { MediaJobRecord, MediaTarget, MediaToolSettings } from '../../../api/mediaTool';
import { InfoSectionTitle, logSharePanelClass } from '../../LogShareStyleScaffold';
import { SimpleLoadingSpinner } from '../../LoadingSpinner';
import { btnIndigo, ErrLine, Field, OkLine, Toggle, inputCls, textareaCls } from './ui';

const segBtn = (active: boolean) =>
  `inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
    active ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
  }`;

/**
 * B 站下载:BV 号/链接/合集(逐行),音频或完整视频。可联动 vivo 转写。
 */
export const BiliPanel: React.FC<{ target: MediaTarget; settings: MediaToolSettings }> = ({ target, settings }) => {
  const [urls, setUrls] = useState('');
  const [mode, setMode] = useState<'audio' | 'video'>(settings.bili.videoMode ? 'video' : 'audio');
  const [audioFormat, setAudioFormat] = useState('');
  const [transcribeAfter, setTranscribeAfter] = useState(settings.bili.transcribeAfter);
  const [saveSrt, setSaveSrt] = useState(settings.lasr.saveSrt);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<MediaJobRecord | null>(null);

  const lines = useMemo(
    () =>
      urls
        .split(/[\r\n]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    [urls],
  );

  const start = async () => {
    if (lines.length === 0) return;
    setBusy(true);
    setError(null);
    setCreated(null);
    try {
      const job = await mediaToolApi.createJob(target, 'bili-download', {
        urls: lines,
        mode,
        audioFormat: audioFormat.trim() ? audioFormat.trim() : undefined,
        transcribeAfter,
        saveSrt,
      });
      setCreated(job);
      setUrls('');
    } catch (err) {
      setError('提交下载任务失败:请检查后端可达性与连接配置。');
      console.error('提交 B 站下载任务失败:', err);
    } finally {
      setBusy(false);
    }
  };

  const disabled = !settings.enabled || busy;

  return (
    <div className="space-y-4">
      <InfoSectionTitle
        title="哔哩哔哩下载"
        description="粘贴 BV 号 / 完整链接 / 合集地址,支持一行一个批量。默认音频(mp3),可切完整视频;勾选联动转写则下载完自动识别。"
        icon={FaDownload}
        tone="sky"
      />

      {!settings.enabled ? (
        <ErrLine>媒体工具当前处于停用状态,请在「设置」页启用后再提交。</ErrLine>
      ) : null}

      <div className={`${logSharePanelClass} space-y-4 p-5`}>
        <Field
          label={`下载目标(已识别 ${lines.length} 项)`}
          hint="示例: BV1xx411c7mD / https://www.bilibili.com/video/BV1xx411c7mD / 合集列表页。yt-dlp 会自动展开合集。"
        >
          <textarea
            rows={5}
            className={textareaCls}
            value={urls}
            onChange={(e) => setUrls(e.target.value)}
            placeholder={'BV1xx411c7mD\nhttps://www.bilibili.com/video/BV1yy411c7mD'}
          />
        </Field>

        <div className="flex flex-wrap gap-3">
          <div className="inline-flex rounded-2xl border border-slate-200 bg-slate-50 p-1">
            <button type="button" onClick={() => setMode('audio')} className={segBtn(mode === 'audio')}>
              <FaPlay className="text-[10px]" />
              仅音频 ({settings.bili.audioFormat || 'mp3'})
            </button>
            <button type="button" onClick={() => setMode('video')} className={segBtn(mode === 'video')}>
              <FaYoutube className="text-[10px]" />
              完整视频
            </button>
          </div>
          {mode === 'audio' ? (
            <input
              className={`${inputCls} max-w-[140px]`}
              value={audioFormat}
              onChange={(e) => setAudioFormat(e.target.value)}
              placeholder={`格式(默认 ${settings.bili.audioFormat})`}
            />
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-6">
          <Toggle checked={transcribeAfter} onChange={setTranscribeAfter} label="下载完成后自动转写(vivo)" />
          {transcribeAfter ? (
            <Toggle checked={saveSrt} onChange={setSaveSrt} label="顺带生成 SRT 字幕" />
          ) : null}
          <span className="text-[11px] text-slate-400">下载并发 {settings.bili.concurrency}</span>
        </div>

        {error ? <ErrLine><FaExclamationTriangle className="text-rose-500" />{error}</ErrLine> : null}
        {created ? (
          <OkLine>
            任务已入队(#{created.id}, createdBy {created.createdBy})。可在「任务历史」查看进度与下载产物。
          </OkLine>
        ) : null}

        <div className="flex justify-end">
          <button onClick={() => void start()} disabled={disabled || lines.length === 0} className={btnIndigo}>
            {busy ? <SimpleLoadingSpinner size={0.7} /> : <FaDownload className="text-xs" />}
            开始下载 {lines.length > 0 ? `(${lines.length})` : ''}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BiliPanel;
