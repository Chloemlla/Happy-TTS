import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  FaBan,
  FaClipboardList,
  FaCloudUploadAlt,
  FaDownload,
  FaExclamationTriangle,
  FaFile,
  FaFolderOpen,
  FaHistory,
  FaList,
  FaPlus,
  FaRedo,
  FaSave,
  FaServer,
  FaShieldAlt,
  FaTerminal,
  FaTrash,
  FaUndo,
} from "react-icons/fa";
import type { IconType } from "react-icons";
import api from "../api/api";
import { useNotification } from "./Notification";
import {
  InfoBadge,
  InfoMetricCard,
  InfoPanel,
  InfoPrimaryButton,
  InfoQueryHero,
  InfoSectionTitle,
  logShareDangerButtonClass,
  logShareInputClass,
  logShareSecondaryButtonClass,
  logShareTileClass,
} from "./LogShareStyleScaffold";

/* ─────────── Types ─────────── */

interface OpsInstance {
  instanceId: string;
  installationId: string;
  status: "online" | "offline" | "registered";
  version: string;
  platform: string;
  minecraftVersion: string;
  serverName: string;
  lastSeenAt: string;
  registeredAt: string;
  policyVersion: string;
  capabilities: {
    fileOps: boolean;
    backupArchive: boolean;
    redactedExport: boolean;
    supportedMethods: string[];
  };
}

interface OpsJob {
  jobId: string;
  instanceId: string;
  method: string;
  commandId: string;
  status: "pending" | "accepted" | "running" | "succeeded" | "failed";
  requestId: string;
  createdAt: string;
  acceptedAt: string;
  completedAt: string;
  result: Record<string, unknown> | null;
  error: { code: string; message: string } | null;
}

interface OpsCommandPolicy {
  commandId: string;
  description: string;
  riskLevel: "low" | "medium" | "high";
  allowedRoles: string[];
  timeoutSeconds: number;
  maxOutputBytes: number;
  requiresApproval: boolean;
  minecraftConsoleTemplate: string;
  isActive: boolean;
  argumentSchema: Record<string, unknown>;
}

interface OpsAuditLog {
  auditId: string;
  instanceId: string;
  action: string;
  actorType: string;
  targetType: string;
  targetId: string;
  result: "success" | "failure";
  message: string;
  createdAt: string;
}

/* ─────────── Constants & Helpers ─────────── */

const API_BASE = "/api/ecoenchants/v1";

const labelClass = "text-xs font-semibold uppercase tracking-[0.18em] text-slate-500";
const inputClass = `${logShareInputClass} py-2.5`;

const statusBadgeTone = (status: string): "emerald" | "amber" | "slate" | "rose" => {
  switch (status) {
    case "online":
    case "succeeded":
    case "active":
      return "emerald";
    case "running":
    case "accepted":
      return "amber";
    case "offline":
    case "pending":
      return "slate";
    case "failed":
    case "suspended":
      return "rose";
    default:
      return "slate";
  }
};

const getErrorMessage = (error: unknown, fallback: string): string => {
  const anyError = error as any;
  return (
    anyError?.response?.data?.error?.message ||
    anyError?.response?.data?.message ||
    anyError?.message ||
    fallback
  );
};

/* ─────────── Sub-components ─────────── */

const Field: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}> = ({ label, value, onChange, placeholder, type = "text", required }) => (
  <label className="block space-y-2">
    <span className={labelClass}>{label}</span>
    <input
      className={inputClass}
      type={type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      required={required}
    />
  </label>
);

const TextAreaField: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
}> = ({ label, value, onChange, placeholder, rows = 3 }) => (
  <label className="block space-y-2">
    <span className={labelClass}>{label}</span>
    <textarea
      className={inputClass}
      rows={rows}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
    />
  </label>
);

const SelectField: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
}> = ({ label, value, onChange, options }) => (
  <label className="block space-y-2">
    <span className={labelClass}>{label}</span>
    <select
      className={inputClass}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  </label>
);

const SectionShell: React.FC<{
  title: string;
  description: string;
  icon: IconType;
  children: React.ReactNode;
  action?: React.ReactNode;
}> = ({ title, description, icon, children, action }) => (
  <InfoPanel>
    <InfoSectionTitle
      title={title}
      description={description}
      icon={icon}
      action={action}
    />
    {children}
  </InfoPanel>
);

/* ─────────── Ops Instances ─────────── */

function OpsInstancesSection({
  instances,
  loading,
  onRefresh,
  onSelect,
}: {
  instances: OpsInstance[];
  loading: boolean;
  onRefresh: () => void;
  onSelect: (id: string) => void;
}) {
  return (
    <SectionShell
      title="远程运维实例"
      description="已注册的 Minecraft 服务器实例，显示其在线状态和能力"
      icon={FaServer}
      action={
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <FaRedo className={loading ? "animate-spin" : ""} />
          刷新
        </button>
      }
    >
      {instances.length === 0 && !loading && (
        <div className="rounded-2xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-500">
          暂无已注册的运维实例
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {instances.map((inst) => (
          <button
            key={inst.instanceId}
            type="button"
            onClick={() => onSelect(inst.instanceId)}
            className={`${logShareTileClass} w-full p-4 text-left transition hover:shadow-md`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold text-slate-900">
                    {inst.serverName || inst.instanceId.slice(0, 12)}
                  </span>
                  <InfoBadge tone={statusBadgeTone(inst.status)}>
                    {inst.status}
                  </InfoBadge>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  {inst.platform} {inst.minecraftVersion}
                </p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                v{inst.version}
              </span>
              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                {inst.installationId.slice(0, 12)}...
              </span>
              {inst.lastSeenAt && (
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                  {new Date(inst.lastSeenAt).toLocaleDateString()}
                </span>
              )}
            </div>
            {inst.capabilities && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {inst.capabilities.fileOps && (
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                    文件操作
                  </span>
                )}
                {inst.capabilities.backupArchive && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                    备份
                  </span>
                )}
              </div>
            )}
          </button>
        ))}
      </div>
    </SectionShell>
  );
}

/* ─────────── Instance Detail ─────────── */

function InstanceDetailSection({
  instanceId,
  onBack,
}: {
  instanceId: string;
  onBack: () => void;
}) {
  const { setNotification } = useNotification();
  const [instance, setInstance] = useState<OpsInstance | null>(null);
  const [jobs, setJobs] = useState<OpsJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"jobs" | "files" | "backups">("jobs");

  /* File ops state */
  const [fileReadPath, setFileReadPath] = useState("");
  const [fileWritePath, setFileWritePath] = useState("");
  const [fileWriteContent, setFileWriteContent] = useState("");
  const [fileDeletePath, setFileDeletePath] = useState("");
  const [fileOpsLoading, setFileOpsLoading] = useState(false);
  const [fileResult, setFileResult] = useState<string | null>(null);

  /* Backups state */
  const [backups, setBackups] = useState<
    { backupId: string; sizeBytes: number; createdAt: string }[]
  >([]);
  const [backupsLoading, setBackupsLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  /* Create job */
  const [createJobMethod, setCreateJobMethod] = useState("ops.command.runManaged");
  const [createJobCommandId, setCreateJobCommandId] = useState("ecoenchants.reload");
  const [creatingJob, setCreatingJob] = useState(false);

  const fetchInstance = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`${API_BASE}/ops/instances/${instanceId}`);
      setInstance(res.data);
    } catch (e) {
      setNotification({ message: getErrorMessage(e, "获取实例详情失败"), type: "error" });
    } finally {
      setLoading(false);
    }
  }, [instanceId, setNotification]);

  const fetchJobs = useCallback(async () => {
    setJobsLoading(true);
    try {
      const res = await api.get(`${API_BASE}/ops/instances/${instanceId}/jobs`);
      setJobs(res.data.jobs || []);
    } catch (e) {
      setNotification({ message: getErrorMessage(e, "获取任务列表失败"), type: "error" });
    } finally {
      setJobsLoading(false);
    }
  }, [instanceId, setNotification]);

  const fetchBackups = useCallback(async () => {
    setBackupsLoading(true);
    try {
      const res = await api.get(`${API_BASE}/ops/instances/${instanceId}/backups`);
      setBackups(res.data.backups || []);
    } catch (e) {
      setNotification({ message: getErrorMessage(e, "获取备份列表失败"), type: "error" });
    } finally {
      setBackupsLoading(false);
    }
  }, [instanceId, setNotification]);

  useEffect(() => {
    fetchInstance();
    fetchJobs();
  }, [fetchInstance, fetchJobs]);

  /* File handlers */
  const handleFileRead = useCallback(async () => {
    if (!fileReadPath.trim()) return;
    setFileOpsLoading(true);
    setFileResult(null);
    try {
      const res = await api.post(`${API_BASE}/ops/instances/${instanceId}/files/read`, {
        path: fileReadPath.trim(),
      });
      setFileResult(
        typeof res.data.content === "string"
          ? res.data.content
          : JSON.stringify(res.data, null, 2),
      );
    } catch (e) {
      setNotification({ message: getErrorMessage(e, "文件读取失败"), type: "error" });
    } finally {
      setFileOpsLoading(false);
    }
  }, [instanceId, fileReadPath, setNotification]);

  const handleFileWrite = useCallback(async () => {
    if (!fileWritePath.trim() || !fileWriteContent.trim()) return;
    setFileOpsLoading(true);
    try {
      await api.post(`${API_BASE}/ops/instances/${instanceId}/files/write`, {
        path: fileWritePath.trim(),
        content: fileWriteContent,
      });
      setNotification({ message: "文件写入成功", type: "success" });
      setFileWritePath("");
      setFileWriteContent("");
    } catch (e) {
      setNotification({ message: getErrorMessage(e, "文件写入失败"), type: "error" });
    } finally {
      setFileOpsLoading(false);
    }
  }, [instanceId, fileWritePath, fileWriteContent, setNotification]);

  const handleFileDelete = useCallback(async () => {
    if (!fileDeletePath.trim()) return;
    if (!window.confirm(`确定删除远程文件「${fileDeletePath}」？`)) return;
    setFileOpsLoading(true);
    try {
      await api.post(`${API_BASE}/ops/instances/${instanceId}/files/delete`, {
        path: fileDeletePath.trim(),
      });
      setNotification({ message: "文件删除成功", type: "success" });
      setFileDeletePath("");
    } catch (e) {
      setNotification({ message: getErrorMessage(e, "文件删除失败"), type: "error" });
    } finally {
      setFileOpsLoading(false);
    }
  }, [instanceId, fileDeletePath, setNotification]);

  const handleCreateBackup = useCallback(async () => {
    try {
      await api.post(`${API_BASE}/ops/instances/${instanceId}/backups`);
      setNotification({ message: "备份创建请求已发送", type: "success" });
      await fetchBackups();
    } catch (e) {
      setNotification({ message: getErrorMessage(e, "创建备份失败"), type: "error" });
    }
  }, [instanceId, fetchBackups, setNotification]);

  const handleRestoreBackup = useCallback(
    async (backupId: string) => {
      if (!window.confirm(`确定恢复备份「${backupId.slice(0, 16)}...」？此操作不可撤销。`)) return;
      setRestoringId(backupId);
      try {
        await api.post(`${API_BASE}/ops/instances/${instanceId}/backups/${backupId}/restore`);
        setNotification({ message: "备份恢复请求已发送", type: "success" });
      } catch (e) {
        setNotification({ message: getErrorMessage(e, "恢复备份失败"), type: "error" });
      } finally {
        setRestoringId(null);
      }
    },
    [instanceId, setNotification],
  );

  const handleCreateJob = useCallback(async () => {
    setCreatingJob(true);
    try {
      await api.post(`${API_BASE}/ops/instances/${instanceId}/jobs`, {
        method: createJobMethod,
        commandId: createJobCommandId,
      });
      setNotification({ message: "任务已创建", type: "success" });
      await fetchJobs();
    } catch (e) {
      setNotification({ message: getErrorMessage(e, "创建任务失败"), type: "error" });
    } finally {
      setCreatingJob(false);
    }
  }, [instanceId, createJobMethod, createJobCommandId, fetchJobs, setNotification]);

  if (loading && !instance) {
    return (
      <SectionShell title="实例详情" description={`ID: ${instanceId}`} icon={FaServer}>
        <div className="py-8 text-center text-sm text-slate-500">加载中...</div>
      </SectionShell>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back button + header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-2xl bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200"
        >
          ← 返回列表
        </button>
        <h3 className="text-lg font-semibold text-slate-800">
          实例 {instance?.serverName || instanceId.slice(0, 12)}
        </h3>
        {instance && <InfoBadge tone={statusBadgeTone(instance.status)}>{instance.status}</InfoBadge>}
      </div>

      {/* Instance metrics */}
      {instance && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <InfoMetricCard label="平台" value={`${instance.platform} ${instance.minecraftVersion}`} icon={FaServer} />
          <InfoMetricCard label="版本" value={instance.version} icon={FaHistory} />
          <InfoMetricCard
            label="最后在线"
            value={instance.lastSeenAt ? new Date(instance.lastSeenAt).toLocaleString() : "-"}
            icon={FaHistory}
          />
          <InfoMetricCard label="策略版本" value={instance.policyVersion || "-"} icon={FaShieldAlt} />
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 rounded-2xl bg-slate-100 p-1">
        {([
          { key: "jobs" as const, label: "任务", icon: FaClipboardList },
          { key: "files" as const, label: "文件操作", icon: FaFolderOpen },
          { key: "backups" as const, label: "备份", icon: FaCloudUploadAlt },
        ] as const).map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => {
              setActiveTab(tab.key);
              if (tab.key === "backups") fetchBackups();
            }}
            className={`flex flex-1 items-center justify-center gap-2 rounded-2xl px-3 py-2 text-sm font-medium transition ${
              activeTab === tab.key
                ? "bg-white/80 backdrop-blur-xl text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Jobs Tab */}
      {activeTab === "jobs" && (
        <div className="space-y-4">
          {/* Create job */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-5">
            <span className={labelClass}>创建新任务</span>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <SelectField
                label="Method"
                value={createJobMethod}
                onChange={setCreateJobMethod}
                options={[
                  { label: "ops.command.runManaged", value: "ops.command.runManaged" },
                  { label: "ops.diagnostics.snapshot", value: "ops.diagnostics.snapshot" },
                  { label: "ops.file.read", value: "ops.file.read" },
                  { label: "ops.file.write", value: "ops.file.write" },
                  { label: "ops.file.delete", value: "ops.file.delete" },
                  { label: "ops.backup.create", value: "ops.backup.create" },
                  { label: "ops.backup.restore", value: "ops.backup.restore" },
                ]}
              />
              <SelectField
                label="Command ID"
                value={createJobCommandId}
                onChange={setCreateJobCommandId}
                options={[
                  { label: "ecoenchants.reload", value: "ecoenchants.reload" },
                  { label: "ecoenchants.services.status", value: "ecoenchants.services.status" },
                ]}
              />
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={handleCreateJob}
                  disabled={creatingJob}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-60"
                >
                  <FaPlus />
                  {creatingJob ? "创建中..." : "创建任务"}
                </button>
              </div>
            </div>
          </div>

          {/* Job list */}
          {jobsLoading ? (
            <div className="py-4 text-center text-sm text-slate-500">加载中...</div>
          ) : jobs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-500">
              暂无任务记录
            </div>
          ) : (
            <div className="space-y-2">
              {jobs.map((job) => (
                <div key={job.jobId} className={`${logShareTileClass} p-4`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <InfoBadge tone={statusBadgeTone(job.status)}>{job.status}</InfoBadge>
                    <span className="font-mono text-xs text-slate-400">{job.jobId.slice(0, 16)}...</span>
                    <span className="text-sm font-medium text-slate-700">{job.method}</span>
                    {job.commandId && (
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                        {job.commandId}
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 text-xs text-slate-500">
                    {job.createdAt && <span>创建于 {new Date(job.createdAt).toLocaleString()}</span>}
                    {job.completedAt && (
                      <span className="ml-3">完成于 {new Date(job.completedAt).toLocaleString()}</span>
                    )}
                  </div>
                  {job.error && (
                    <div className="mt-2 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                      [{job.error.code}] {job.error.message}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Files Tab */}
      {activeTab === "files" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white/80 backdrop-blur-xl p-5">
            <span className={labelClass}>读取文件</span>
            <div className="mt-3 flex gap-2">
              <input
                type="text"
                value={fileReadPath}
                onChange={(e) => setFileReadPath(e.target.value)}
                placeholder="远程文件路径，如 /server/plugins/config.yml"
                className={inputClass}
              />
              <button
                type="button"
                onClick={handleFileRead}
                disabled={fileOpsLoading || !fileReadPath.trim()}
                className="inline-flex shrink-0 items-center gap-2 rounded-2xl bg-slate-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60"
              >
                <FaDownload />
                读取
              </button>
            </div>
            {fileResult && (
              <pre className="mt-3 max-h-64 overflow-auto rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                {fileResult}
              </pre>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white/80 backdrop-blur-xl p-5">
            <span className={labelClass}>写入文件</span>
            <div className="mt-3 space-y-3">
              <input
                type="text"
                value={fileWritePath}
                onChange={(e) => setFileWritePath(e.target.value)}
                placeholder="远程文件路径"
                className={inputClass}
              />
              <textarea
                value={fileWriteContent}
                onChange={(e) => setFileWriteContent(e.target.value)}
                rows={4}
                placeholder="文件内容..."
                className={`${inputClass} font-mono`}
              />
              <button
                type="button"
                onClick={handleFileWrite}
                disabled={fileOpsLoading || !fileWritePath.trim() || !fileWriteContent.trim()}
                className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-60"
              >
                <FaSave />
                写入
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-red-200 bg-white/80 backdrop-blur-xl p-5">
            <span className={`${labelClass} text-red-600`}>删除文件</span>
            <div className="mt-3 flex gap-2">
              <input
                type="text"
                value={fileDeletePath}
                onChange={(e) => setFileDeletePath(e.target.value)}
                placeholder="远程文件路径"
                className={inputClass}
              />
              <button
                type="button"
                onClick={handleFileDelete}
                disabled={fileOpsLoading || !fileDeletePath.trim()}
                className="inline-flex shrink-0 items-center gap-2 rounded-2xl bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-60"
              >
                <FaTrash />
                删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Backups Tab */}
      {activeTab === "backups" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleCreateBackup}
              className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-700"
            >
              <FaPlus />
              创建备份
            </button>
          </div>

          {backupsLoading ? (
            <div className="py-4 text-center text-sm text-slate-500">加载中...</div>
          ) : backups.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-500">
              暂无备份
            </div>
          ) : (
            <div className="space-y-2">
              {backups.map((bk) => (
                <div key={bk.backupId} className={`${logShareTileClass} flex items-center justify-between p-4`}>
                  <div>
                    <div className="font-mono text-sm text-slate-700">{bk.backupId.slice(0, 20)}...</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {bk.createdAt ? new Date(bk.createdAt).toLocaleString() : "-"}
                      {bk.sizeBytes > 0 && ` · ${(bk.sizeBytes / 1024 / 1024).toFixed(2)} MB`}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRestoreBackup(bk.backupId)}
                    disabled={restoringId === bk.backupId}
                    className="inline-flex items-center gap-2 rounded-2xl bg-amber-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-amber-700 disabled:opacity-60"
                  >
                    <FaUndo />
                    {restoringId === bk.backupId ? "恢复中..." : "恢复"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─────────── Audit Logs ─────────── */

function OpsAuditLogsSection({
  logs,
  loading,
  onRefresh,
}: {
  logs: OpsAuditLog[];
  loading: boolean;
  onRefresh: () => void;
}) {
  return (
    <SectionShell
      title="运维审计日志"
      description="远程操作审计记录，包括文件操作、命令执行和备份恢复"
      icon={FaHistory}
      action={
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
        >
          <FaRedo className={loading ? "animate-spin" : ""} />
          刷新
        </button>
      }
    >
      {logs.length === 0 && !loading && (
        <div className="rounded-2xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-500">
          暂无审计记录
        </div>
      )}
      <div className="space-y-2">
        {logs.map((log) => (
          <div key={log.auditId} className={`${logShareTileClass} p-4`}>
            <div className="flex flex-wrap items-center gap-2">
              <InfoBadge tone={log.result === "success" ? "emerald" : "rose"}>{log.result}</InfoBadge>
              <span className="font-medium text-slate-900">{log.action}</span>
              <span className="text-xs text-slate-500">
                {log.actorType}
              </span>
              {log.instanceId && (
                <span className="font-mono text-xs text-slate-400">{log.instanceId.slice(0, 12)}...</span>
              )}
            </div>
            <div className="mt-1.5 text-xs text-slate-500">
              {log.createdAt ? new Date(log.createdAt).toLocaleString() : "-"}
              {log.message && <span className="ml-2">· {log.message}</span>}
            </div>
          </div>
        ))}
      </div>
    </SectionShell>
  );
}

/* ─────────── Command Policies ─────────── */

function OpsCommandPoliciesSection({
  policies,
  loading,
  onRefresh,
}: {
  policies: OpsCommandPolicy[];
  loading: boolean;
  onRefresh: () => void;
}) {
  return (
    <SectionShell
      title="命令策略"
      description="配置远程可执行的命令及其安全策略"
      icon={FaShieldAlt}
      action={
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
        >
          <FaRedo className={loading ? "animate-spin" : ""} />
          刷新
        </button>
      }
    >
      {policies.length === 0 && !loading && (
        <div className="rounded-2xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-500">
          暂无命令策略配置
        </div>
      )}
      <div className="space-y-3">
        {policies.map((p) => (
          <div key={p.commandId} className={`${logShareTileClass} p-4`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono font-semibold text-slate-900">{p.commandId}</span>
              <InfoBadge
                tone={p.riskLevel === "high" ? "rose" : p.riskLevel === "medium" ? "amber" : "emerald"}
              >
                {p.riskLevel}
              </InfoBadge>
              <InfoBadge tone={p.isActive ? "emerald" : "slate"}>{p.isActive ? "启用" : "停用"}</InfoBadge>
            </div>
            <p className="mt-2 text-sm text-slate-600">{p.description}</p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
              <span>超时: {p.timeoutSeconds}s</span>
              <span>
                最大输出: {p.maxOutputBytes > 1024 ? `${(p.maxOutputBytes / 1024).toFixed(0)}KB` : `${p.maxOutputBytes}B`}
              </span>
              <span>角色: {p.allowedRoles.join(", ") || "无限制"}</span>
              {p.requiresApproval && <span className="text-amber-600">需要审批</span>}
            </div>
          </div>
        ))}
      </div>
    </SectionShell>
  );
}

/* ─────────── Main Panel ─────────── */

export function EcoEnchantsOpsPanel() {
  const { setNotification } = useNotification();
  const [instances, setInstances] = useState<OpsInstance[]>([]);
  const [instancesLoading, setInstancesLoading] = useState(false);
  const [auditLogs, setAuditLogs] = useState<OpsAuditLog[]>([]);
  const [auditLogsLoading, setAuditLogsLoading] = useState(false);
  const [policies, setPolicies] = useState<OpsCommandPolicy[]>([]);
  const [policiesLoading, setPoliciesLoading] = useState(false);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);

  const fetchInstances = useCallback(async () => {
    setInstancesLoading(true);
    try {
      const res = await api.get(`${API_BASE}/ops/instances`);
      setInstances(res.data.instances || []);
    } catch (e) {
      setNotification({ message: getErrorMessage(e, "获取实例列表失败"), type: "error" });
    } finally {
      setInstancesLoading(false);
    }
  }, [setNotification]);

  const fetchAuditLogs = useCallback(async () => {
    setAuditLogsLoading(true);
    try {
      const res = await api.get(`${API_BASE}/ops/audit-logs?page=1&pageSize=20`);
      setAuditLogs(res.data.logs || []);
    } catch (e) {
      setNotification({ message: getErrorMessage(e, "获取审计日志失败"), type: "error" });
    } finally {
      setAuditLogsLoading(false);
    }
  }, [setNotification]);

  const fetchPolicies = useCallback(async () => {
    setPoliciesLoading(true);
    try {
      const res = await api.get(`${API_BASE}/ops/policies/commands`);
      setPolicies(res.data.policies || []);
    } catch (e) {
      setNotification({ message: getErrorMessage(e, "获取命令策略失败"), type: "error" });
    } finally {
      setPoliciesLoading(false);
    }
  }, [setNotification]);

  useEffect(() => {
    fetchInstances();
    fetchAuditLogs();
    fetchPolicies();
  }, [fetchInstances, fetchAuditLogs, fetchPolicies]);

  return (
    <div className="space-y-6">
      <InfoQueryHero
        eyebrow="EcoEnchants"
        title="EcoEnchants 远程运维"
        description="管理已注册的 Minecraft 服务器实例，执行远程命令、文件操作和备份恢复。"
        icon={FaTerminal}
      />

      {selectedInstanceId ? (
        <InstanceDetailSection
          instanceId={selectedInstanceId}
          onBack={() => setSelectedInstanceId(null)}
        />
      ) : (
        <OpsInstancesSection
          instances={instances}
          loading={instancesLoading}
          onRefresh={fetchInstances}
          onSelect={setSelectedInstanceId}
        />
      )}

      <OpsAuditLogsSection
        logs={auditLogs}
        loading={auditLogsLoading}
        onRefresh={fetchAuditLogs}
      />

      <OpsCommandPoliciesSection
        policies={policies}
        loading={policiesLoading}
        onRefresh={fetchPolicies}
      />
    </div>
  );
}

export default EcoEnchantsOpsPanel;