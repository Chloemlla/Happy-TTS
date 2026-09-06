import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FaFileAudio,
  FaChevronRight,
  FaExclamationTriangle,
  FaFileAlt,
  FaFolder,
  FaFolderOpen,
  FaPlay,
  FaTimes,
  FaUpload,
} from 'react-icons/fa';
import { mediaToolApi } from '../../../api/mediaTool';
import type { MediaDirEntry, MediaJobRecord, MediaTarget, MediaToolSettings } from '../../../api/mediaTool';
import { InfoSectionTitle, logSharePanelClass } from '../../LogShareStyleScaffold';
import { SimpleLoadingSpinner } from '../../LoadingSpinner';
import {
  btnIndigo,
  btnTiny,
  cx,
  ErrLine,
  OkLine,
  Toggle,
  fmtBytes,
} from './ui';

/**
 * 音频转写:两类来源 —— 浏览器直接上传(进 workDir/inbox)与浏览服务端已有文件。
 * 汇入「待转写」清单后统一提交给 vivo LASR。
 */
export const TranscribePanel: React.FC<{ target: MediaTarget; settings: MediaToolSettings }> = ({ target, settings }) => {
  const [sub, setSub] = useState('');
  const [entries, setEntries] = useState<MediaDirEntry[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [saveSrt, setSaveSrt] = useState(settings.lasr.saveSrt);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [uploadName, setUploadName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const loadDir = useCallback(
    async (folder: string) => {
      setLoading(true);
      setError(null);
      try {
        const res = await mediaToolApi.listFiles(target, folder);
        setEntries(res.entries);
      } catch (err) {
        setError('读取目录失败,请检查连接。');
        console.error('读取媒体工具目录失败:', err);
      } finally {
        setLoading(false);
      }
    },
    [target],
  );

  useEffect(() => {
    void loadDir(sub);
  }, [sub, loadDir]);

  const segs = sub ? sub.split('/').filter(Boolean) : [];

  const addChosen = (rel: string) => setChosen((prev) => (prev.includes(rel) ? prev : [...prev, rel]));
  const removeChosen = (rel: string) => setChosen((prev) => prev.filter((r) => r !== rel));

  const pickFiles = () => {
    if (busy) return;
    const input = fileRef.current;
    if (input) {
      input.value = '';
      input.click();
    }
  };

  const onFilesChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      for (const file of files) {
        setUploadName(file.name);
        const up = await mediaToolApi.uploadAudio(target, file);
        addChosen(up.rel);
      }
      setOk(`已上传 ${files.length} 个音频到服务器 inbox,已加入待转写。`);
      if (sub !== 'inbox') setSub('inbox');
      else await loadDir('inbox');
    } catch (err) {
      setError('上传失败:请确认文件为受支持音频且未超过大小上限。');
      console.error('上传音频失败:', err);
    } finally {
      setUploadName(null);
      setBusy(false);
    }
  };

  const start = async () => {
    if (chosen.length === 0) return;
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const job: MediaJobRecord = await mediaToolApi.createJob(target, 'transcribe', {
        files: chosen,
        saveSrt,
      });
      setOk(`转写任务已提交(${job.id})。结果 txt${saveSrt ? ' + srt' : ''} 会写到源文件旁。`);
      setChosen([]);
    } catch (err) {
      setError('提交转写失败:请检查后端与文件状态。');
      console.error('提交转写任务失败:', err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <InfoSectionTitle
        title="音频转写(vivo 录音接口)"
        description="浏览器直接上传音频,或浏览服务器工作目录挑选已下载的音频;汇入清单后统一识别,每段输出 .txt(可选 .srt)。"
        icon={FaPlay}
        tone="violet"
      />

      {!settings.enabled ? (
        <ErrLine>媒体工具当前处于停用状态,请在「设置」页启用后再提交。</ErrLine>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={`${logSharePanelClass} space-y-3 p-5`}>
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-800">浏览器上传</div>
            <span className="text-[11px] text-slate-400">上限 {fmtBytes(settings.maxUploadBytes)} · 单文件</span>
          </div>
          <input ref={fileRef} type="file" multiple hidden accept="audio/*" onChange={(e) => void onFilesChosen(e)} />
          <button onClick={pickFiles} disabled={busy || !settings.enabled} className={cx(btnIndigo, 'w-full')}>
            {busy && uploadName ? <SimpleLoadingSpinner size={0.7} /> : <FaUpload className="text-xs" />}
            {busy && uploadName ? `上传中 ${uploadName}…` : '选择音频文件上传'}
          </button>
          <p className="text-[11px] leading-4 text-slate-400">
            支持 mp3 / m4a / wav / aac / flac / amr / ogg / opus 等音频;上传会落到服务器 workDir/inbox,再进入下方清单转写。
          </p>

          <div className="border-t border-slate-100 pt-3">
            <div className="mb-2 flex items-center gap-1 text-sm font-semibold text-slate-700">
              <FaFolderOpen className="text-slate-400" />
              服务器文件
            </div>
            <div className="flex flex-wrap items-center gap-1 pb-2 text-xs text-slate-500">
              <button
                className={cx('rounded px-1.5 py-0.5', !sub ? 'bg-indigo-50 font-semibold text-indigo-700' : 'hover:bg-slate-100')}
                onClick={() => setSub('')}
              >
                workDir 根目录
              </button>
              {segs.map((s, i) => (
                <React.Fragment key={`${i}-${s}`}>
                  <FaChevronRight className="text-[9px] text-slate-300" />
                  <button
                    className="rounded px-1.5 py-0.5 hover:bg-slate-100"
                    onClick={() => setSub(segs.slice(0, i + 1).join('/'))}
                  >
                    {s}
                  </button>
                </React.Fragment>
              ))}
            </div>
            <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-100">
              {loading ? (
                <div className="flex justify-center py-8">
                  <SimpleLoadingSpinner size={0.9} />
                </div>
              ) : entries.length === 0 ? (
                <div className="px-4 py-8 text-center text-xs text-slate-400">
                  {sub ? '该目录为空' : '工作目录为空,可先上传音频或下载 B 站音频'}
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <tbody>
                    {entries.map((ent) => (
                      <tr key={ent.rel} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                        <td className="w-1/2 px-3 py-2">
                          {ent.dir ? (
                            <button
                              className="flex items-center gap-2 text-slate-700 hover:text-indigo-600"
                              onClick={() => setSub(ent.rel)}
                            >
                              <FaFolder className="text-amber-400" />
                              <span className="truncate font-medium">{ent.name}</span>
                            </button>
                          ) : (
                            <span className="flex items-center gap-2 text-slate-600">
                              {ent.text ? (
                                <FaFileAlt className="shrink-0 text-slate-300" />
                              ) : (
                                <FaFileAudio className="shrink-0 text-emerald-400" />
                              )}
                              <span className="truncate">{ent.name}</span>
                            </span>
                          )}
                        </td>
                        <td className="w-24 px-3 py-2 text-right text-slate-400">{ent.dir ? '' : fmtBytes(ent.size)}</td>
                        <td className="w-20 px-3 py-2 text-right">
                          {!ent.dir && ent.audio ? (
                            <button
                              disabled={busy || !settings.enabled || chosen.includes(ent.rel)}
                              onClick={() => addChosen(ent.rel)}
                              className={cx(
                                btnTiny,
                                chosen.includes(ent.rel)
                                  ? 'border border-emerald-200 bg-emerald-50 text-emerald-600'
                                  : 'border border-indigo-200 bg-indigo-50 text-indigo-600 hover:bg-indigo-100',
                              )}
                            >
                              {chosen.includes(ent.rel) ? '已加入' : '加入'}
                            </button>
                          ) : ent.dir ? null : (
                            <span className="text-[10px] text-slate-300">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        <div className={`${logSharePanelClass} flex flex-col gap-3 p-5`}>
          <div className="text-sm font-semibold text-slate-800">
            待转写文件 <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] text-violet-700">{chosen.length}</span>
          </div>

          <div className="flex min-h-[120px] flex-1 flex-col gap-1.5">
            {chosen.length === 0 ? (
              <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-200 py-8 text-xs text-slate-400">
                从左侧「加入」服务器音频,或直接上传后自动进入清单
              </div>
            ) : (
              chosen.map((rel) => (
                <div key={rel} className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-1.5">
                  <FaFileAudio className="shrink-0 text-emerald-500" />
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-slate-600">{rel}</span>
                  <button
                    onClick={() => removeChosen(rel)}
                    disabled={busy}
                    className="text-slate-400 transition hover:text-rose-500"
                    aria-label={`移除 ${rel}`}
                  >
                    <FaTimes className="text-xs" />
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="flex flex-wrap items-center gap-6 pt-1">
            <Toggle checked={saveSrt} onChange={setSaveSrt} label="同时生成 SRT 字幕" />
          </div>

          {error ? (
            <ErrLine>
              <FaExclamationTriangle className="text-rose-500" />
              {error}
            </ErrLine>
          ) : null}
          {ok ? <OkLine>{ok}</OkLine> : null}

          <div className="flex justify-end">
            <button
              onClick={() => void start()}
              disabled={busy || chosen.length === 0 || !settings.enabled}
              className={btnIndigo}
            >
              {busy ? <SimpleLoadingSpinner size={0.7} /> : <FaPlay className="text-xs" />}
              开始转写 ({chosen.length})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TranscribePanel;
