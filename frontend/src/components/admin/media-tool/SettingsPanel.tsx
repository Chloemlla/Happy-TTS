import React, { useCallback, useEffect, useState } from 'react';
import { FaCheck, FaExclamationTriangle, FaSave, FaSlidersH } from 'react-icons/fa';
import { mediaToolApi } from '../../../api/mediaTool';
import type { MediaTarget, MediaToolSettings } from '../../../api/mediaTool';
import { InfoSectionTitle, logSharePanelClass } from '../../LogShareStyleScaffold';
import { SimpleLoadingSpinner } from '../../LoadingSpinner';
import { btnIndigo, ErrLine, Field, OkLine, Toggle, inputCls, cx } from './ui';

const SECRET_MASK = '********';

const clone = (s: MediaToolSettings): MediaToolSettings => JSON.parse(JSON.stringify(s)) as MediaToolSettings;

const NumInput: React.FC<{
  value: number;
  min?: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}> = ({ value, min = 0, onChange, disabled }) => (
  <input
    type="number"
    min={min}
    value={String(value)}
    disabled={disabled}
    onChange={(e) => {
      const v = Number(e.target.value);
      onChange(Number.isFinite(v) ? Math.max(min, v) : min);
    }}
    className={inputCls}
  />
);

const secretField = (s: string): boolean => s === SECRET_MASK;

/**
 * 媒体工具设置(engine 参数 / vivo 账号 / 工具路径 / 并发)。密钥字段以占位展示,
 * 不修改直接保存时后端会保留原值;输入新值即为覆盖。
 */
export const SettingsPanel: React.FC<{ target: MediaTarget }> = ({ target }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [form, setForm] = useState<MediaToolSettings | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const health = await mediaToolApi.health(target);
      setForm(clone(health.settings));
    } catch (err) {
      setError('读取设置失败:请确认目标后端已启动且本页连接正确。');
      console.error('加载媒体工具设置失败:', err);
    } finally {
      setLoading(false);
    }
  }, [target]);

  useEffect(() => {
    void load();
  }, [load]);

  const setL = (patch: Partial<MediaToolSettings['lasr']>) =>
    setForm((f) => (f ? { ...f, lasr: { ...f.lasr, ...patch } } : f));
  const setB = (patch: Partial<MediaToolSettings['bili']>) =>
    setForm((f) => (f ? { ...f, bili: { ...f.bili, ...patch } } : f));

  const save = async () => {
    if (!form) return;
    setSaving(true);
    setError(null);
    setOk(null);
    try {
      const next = await mediaToolApi.updateSettings(target, {
        enabled: form.enabled,
        workDir: form.workDir,
        maxUploadBytes: form.maxUploadBytes,
        maxJobLogLines: form.maxJobLogLines,
        lasr: { ...form.lasr },
        bili: { ...form.bili },
      });
      setForm(clone(next));
      setOk('设置已保存。密钥字段未改动时保持原值。');
    } catch (err) {
      setError('保存失败:可能是权限不足(需超级管理员)或后端校验未通过。');
      console.error('保存媒体工具设置失败:', err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <SimpleLoadingSpinner size={1} />
      </div>
    );
  }

  if (!form) {
    return <ErrLine>无法加载设置</ErrLine>;
  }

  const hasMaskedLasr =
    secretField(form.lasr.appKey) || secretField(form.lasr.token) || secretField(form.lasr.openid);

  return (
    <div className="space-y-4">
      <InfoSectionTitle
        title="媒体工具设置"
        description="vivo 录音转写接口参数、yt-dlp / cookies 路径、并发与输出格式。密钥输入框显示 ******** 表示沿用当前值。"
        icon={FaSlidersH}
        tone="slate"
      />

      {error ? <ErrLine>{error}</ErrLine> : null}
      {ok ? <OkLine>{ok}</OkLine> : null}

      <div className={cx(logSharePanelClass, 'space-y-5 p-5')}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-800">启用媒体工具</div>
            <div className="text-xs text-slate-500">关闭后新任务会被拒;运行中任务不受影响</div>
          </div>
          <Toggle checked={form.enabled} onChange={(v) => setForm((f) => (f ? { ...f, enabled: v } : f))} label="" />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="工作目录(workDir)" hint="文件浏览/上传/转写的安全根目录;留空=进程工作目录下 data/media-tool">
            <input
              className={inputCls}
              value={form.workDir}
              onChange={(e) => setForm((f) => (f ? { ...f, workDir: e.target.value } : f))}
              placeholder="例如 /srv/media-tool 或 C:\\media-tool"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="上传上限(MB)">
              <NumInput
                min={1}
                value={Math.round(form.maxUploadBytes / (1024 * 1024))}
                onChange={(v) => setForm((f) => (f ? { ...f, maxUploadBytes: v * 1024 * 1024 } : f))}
              />
            </Field>
            <Field label="日志条数上限">
              <NumInput min={50} value={form.maxJobLogLines} onChange={(v) => setForm((f) => (f ? { ...f, maxJobLogLines: v } : f))} />
            </Field>
          </div>
        </div>
      </div>

      <div className={cx(logSharePanelClass, 'space-y-4 p-5')}>
        <div className="text-sm font-semibold text-slate-800">vivo 录音转写(LASR)</div>
        {hasMaskedLasr ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            检测到密钥以占位符展示。若沿用当前密钥,请勿改动该输入框。
          </div>
        ) : null}
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="接口地址">
            <input className={inputCls} value={form.lasr.serverUrl} onChange={(e) => setL({ serverUrl: e.target.value })} />
          </Field>
          <Field label="AppId">
            <input className={inputCls} value={form.lasr.appId} onChange={(e) => setL({ appId: e.target.value })} />
          </Field>
          <Field label="AppKey(密钥)">
            <input
              className={inputCls}
              type="password"
              value={form.lasr.appKey}
              onChange={(e) => setL({ appKey: e.target.value })}
              placeholder="********"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="语种">
              <input className={inputCls} value={form.lasr.language} onChange={(e) => setL({ language: e.target.value })} />
            </Field>
            <Field label="场景">
              <input className={inputCls} value={form.lasr.scene} onChange={(e) => setL({ scene: e.target.value })} />
            </Field>
          </div>
          <Field label="token(vivo 账号)" hint="留空走未登录;填入后为登录态">
            <input
              className={inputCls}
              type="password"
              value={form.lasr.token}
              onChange={(e) => setL({ token: e.target.value })}
              placeholder="********"
            />
          </Field>
          <Field label="openid">
            <input
              className={inputCls}
              type="password"
              value={form.lasr.openid}
              onChange={(e) => setL({ openid: e.target.value })}
              placeholder="********"
            />
          </Field>
          <Field label="转写并发">
            <NumInput min={1} value={form.lasr.concurrency} onChange={(v) => setL({ concurrency: v })} />
          </Field>
          <div className="flex items-end pb-1">
            <Toggle
              checked={form.lasr.saveSrt}
              onChange={(v) => setL({ saveSrt: v })}
              label="默认同时输出 SRT 字幕(单条任务可覆盖)"
            />
          </div>
        </div>
      </div>

      <div className={cx(logSharePanelClass, 'space-y-4 p-5')}>
        <div className="text-sm font-semibold text-slate-800">哔哩哔哩下载(yt-dlp)</div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="yt-dlp 路径" hint="留空自动探测 PATH;Windows 常需填绝对路径">
            <input className={inputCls} value={form.bili.ytDlpPath} onChange={(e) => setB({ ytDlpPath: e.target.value })} />
          </Field>
          <Field label="cookies 文件" hint="下载需登录/会员内容时填 Netscape cookies 文件路径">
            <input className={inputCls} value={form.bili.cookiesFile} onChange={(e) => setB({ cookiesFile: e.target.value })} />
          </Field>
          <Field label="下载目录(downloadDir)" hint="留空=与 workDir 相同">
            <input className={inputCls} value={form.bili.downloadDir} onChange={(e) => setB({ downloadDir: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="音频格式">
              <input className={inputCls} value={form.bili.audioFormat} onChange={(e) => setB({ audioFormat: e.target.value })} />
            </Field>
            <Field label="下载并发">
              <NumInput min={1} max={8} value={form.bili.concurrency} onChange={(v) => setB({ concurrency: v })} />
            </Field>
          </div>
          <div className="flex items-end gap-6 pb-1">
            <Toggle checked={form.bili.videoMode} onChange={(v) => setB({ videoMode: v })} label="默认下载完整视频" />
            <Toggle checked={form.bili.transcribeAfter} onChange={(v) => setB({ transcribeAfter: v })} label="默认下载后自动转写" />
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button onClick={() => void save()} disabled={saving} className={btnIndigo}>
          {saving ? <SimpleLoadingSpinner size={0.7} /> : <FaSave className="text-xs" />}
          保存设置
        </button>
      </div>

      <div className="flex items-start gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-500">
        <FaCheck className="mt-0.5 shrink-0 text-slate-400" />
        <span>
          保存的密钥以明文写回后端配置(内置态走超级管理员接口)。工作目录与下载目录通常指向服务器本机路径,浏览器上传文件会落到
          workDir/inbox。
        </span>
      </div>
    </div>
  );
};

export default SettingsPanel;
