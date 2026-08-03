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

/* ─────────── Helpers ─────────── */

const API_BASE = "/api/ecoenchants/v1";

function statusBadgeTone(status: string): "emerald" | "amber" | "slate" | "rose" {
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
}

function SectionShell({
  title,
  description,
  icon: Icon,
  children,
  action,
}: {
  title: string;
  description?: string;
  icon: IconType;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-800">{title}</h3>
            {description && (
              <p className="mt-0.5 text-xs text-slate-500">{description}</p>
            )}
          </div>
        </div>
        {action && <div className="flex items-center gap-2">{action}</div>}
      </div>
      <div className="px-5 py-5">{children}</div>
    </div>
  );
}

/* ─────────── Ops Instances Panel ─────────── */

function OpsInstancesPanel({
  instances,
  loading,
  onRefresh,
  onSelectInstance,
}: {
  instances: OpsInstance[];
  loading: boolean;
  onRefresh: () => void;
  onSelectInstance: (id: string) => void;
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
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <FaRedo className={loading ? "animate-spin" : ""} />
          刷新
        </button>
      }
    >
      {instances.length === 0 && !loading ? (
        <div className="rounded-2xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-500">
          暂无已注册的运维实例
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {instances.map((inst) => (
            <button
              key={inst.instanceId}
              type="button"
              onClick={() => onSelectInstance(inst.instanceId)}
              className={`${logShareTileClass} w-full p-4 text-left transition hover:shadow-md`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold text-slate-900">
                      {inst.serverName || inst.instanceId.slice(0, 12)}
                    </span>
                    <InfoBadge tone={statusBadgeTone(inst.status)}>
                      {inst.status}
                    </InfoBadge>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {inst.platform} {inst.minecraftVersion}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                <span className="rounded-md bg-slate-100 px-2 py-1">
                  v{inst.version}
                </span>
                <span className="rounded-md bg-slate-100 px-2 py-1">
                  {inst.installationId.slice(0, 12)}...
                </span>
                <span className="rounded-md bg-slate-100 px-2 py-1">
                  {inst.lastSeenAt
                    ? new Date(inst.lastSeenAt).toLocaleDateString()
                    : "从未"}
                </span>
              </div>
              {inst.capabilities && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {inst.capabilities.fileOps && (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                      文件操作
                    </span>
                  )}
                  {inst.capabilities.backupArchive && (
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                      备份
                    </span>
                  )}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </SectionShell>
  );
}

/* ─────────── Instance Detail Panel ─────────── */

function OpsInstanceDetailPanel({
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
  const [fileReadPath, setFileReadPath] = useState("");
  const [fileWritePath, setFileWritePath] = useState("");
  const [fileWriteContent, setFileWriteContent] = useState("");
  const [fileDeletePath, setFileDeletePath] = useState("");
  const [fileOpsLoading, setFileOpsLoading] = useState(false);
  const [fileResult, setFileResult] = useState<string | null>(null);
  const [backups, setBackups] = useState<
    { backupId: string; sizeBytes: number; createdAt: string }[]
  >([]);
  const [backupsLoading, setBackupsLoading] = useState(false);
  const [restoringBackupId, setRestoringBackupId] = useState<string | null>(null);
  const [createJobMethod, setCreateJobMethod] = useState("ops.command.runManaged");
  const [createJobCommandId, setCreateJobCommandId] = useState("ecoenchants.reload");
  const [creatingJob, setCreatingJob] = useState(false);

  const fetchInstance = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`${API_BASE}/ops/instances/${instanceId}`);
      setInstance(res.data);
    } catch (e: any) {
      setNotification({
        message: e?.response?.data?.error?.message || "获取实例详情失败",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [instanceId, setNotification]);

  const fetchJobs = useCallback(async () => {
    setJobsLoading(true);
    try {
      const res = await api.get(`${API_BASE}/ops/instances/${instanceId}/jobs`);
      setJobs(res.data.jobs || []);
    } catch (e: any) {
      setNotification({
        message: e?.response?.data?.error?.message || "获取任务列表失败",
        type: "error",
      });
    } finally {
      setJobsLoading(false);
    }
  }, [instanceId, setNotification]);

  const fetchBackups = useCallback(async () => {
    setBackupsLoading(true);
    try {
      const res = await api.get(`${API_BASE}/ops/instances/${instanceId}/backups`);
      setBackups(res.data.backups || []);
    } catch (e: any) {
      setNotification({
        message: e?.response?.data?.error?.message || "获取备份列表失败",
        type: "error",
      });
    } finally {
      setBackupsLoading(false);
    }
  }, [instanceId, setNotification]);

  useEffect(() => {
    fetchInstance();
    fetchJobs();
  }, [fetchInstance, fetchJobs]);

  const handleFileRead = useCallback(async () => {
    if (!fileReadPath.trim()) return;
    setFileOpsLoading(true);
    setFileResult(null);
    try {
      const res = await api.post(
        `${API_BASE}/ops/instances/${instanceId}/files/read`,
        { path: fileReadPath.trim() },
      );
      setFileResult(
        typeof res.data.content === "string"
          ? res.data.content
          : JSON.stringify(res.data, null, 2),
      );
    } catch (e: any) {
      setNotification({
        message: e?.response?.data?.error?.message || "文件读取失败",
        type: "error",
      });
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
    } catch (e: any) {
      setNotification({
        message: e?.response?.data?.error?.message || "文件写入失败",
        type: "error",
      });
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
    } catch (e: any) {
      setNotification({
        message: e?.response?.data?.error?.message || "文件删除失败",
        type: "error",
      });
    } finally {
      setFileOpsLoading(false);
    }
  }, [instanceId, fileDeletePath, setNotification]);

  const handleCreateBackup = useCallback(async () => {
    try {
      await api.post(`${API_BASE}/ops/instances/${instanceId}/backups`);
      setNotification({ message: "备份创建请求已发送", type: "success" });
      await fetchBackups();
    } catch (e: any) {
      setNotification({
        message: e?.response?.data?.error?.message || "创建备份失败",
        type: "error",
      });
    }
  }, [instanceId, fetchBackups, setNotification]);

  const handleRestoreBackup = useCallback(
    async (backupId: string) => {
      if (!window.confirm(`确定恢复备份「${backupId}」？此操作不可撤销。`)) return;
      setRestoringBackupId(backupId);
      try {
        await api.post(
          `${API_BASE}/ops/instances/${instanceId}/backups/${backupId}/restore`,
        );
        setNotification({ message: "备份恢复请求已发送", type: "success" });
      } catch (e: any) {
        setNotification({
          message: e?.response?.data?.error?.message || "恢复备份失败",
          type: "error",
        });
      } finally {
        setRestoringBackupId(null);
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
    } catch (e: any) {
      setNotification({
        message: e?.response?.data?.error?.message || "创建任务失败",
        type: "error",
      });
    } finally {
      setCreatingJob(false);
    }
  }, [instanceId, createJobMethod, createJobCommandId, fetchJobs, setNotification]);

  if (loading && !instance) {
    return (
      <SectionShell title="实例详情" icon={FaServer} description={`ID: ${instanceId}`}>
        <div className="py-8 text-center text-sm text-slate-500">加载中...</div>
      </SectionShell>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200"
        >
          ← 返回列表
        </button>
        <h3 className="text-lg font-semibold text-slate-800">
          实例 {instance?.serverName || instanceId.slice(0, 12)}
        </h3>
        {instance && (
          <InfoBadge tone={statusBadgeTone(instance.status)}>
            {instance.status}
          </InfoBadge>
        )}
      </div>

      {instance && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <InfoMetricCard
            label="平台"
            value={`${instance.platform} ${instance.minecraftVersion}`}
          />
          <InfoMetricCard label="版本" value={instance.version} />
          <InfoMetricCard
            label="最后在线"
            value={
              instance.lastSeenAt
                ? new Date(instance.lastSeenAt).toLocaleString()
                : "-"
            }
          />
          <InfoMetricCard
            label="策略版本"
            value={instance.policyVersion || "-"}
          />
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
        {[
          { key: "jobs" as const, label: "任务", icon: FaClipboardList },
          { key: "files" as const, label: "文件操作", icon: FaFolderOpen },
          { key: "backups" as const, label: "备份", icon: FaCloudUploadAlt },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => {
              setActiveTab(tab.key);
              if (tab.key === "backups") fetchBackups();
            }}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
              activeTab === tab.key
                ? "bg-white text-slate-900 shadow-sm"
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
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <h4 className="mb-3 text-sm font-semibold text-slate-700">
              创建新任务
            </h4>
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-0 flex-1">
                <label className="mb-1 block text-xs text-slate-500">
                  Method
                </label>
                <select
                  value={createJobMethod}
                  onChange={(e) => setCreateJobMethod(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="ops.command.runManaged">
                    ops.command.runManaged
                  </option>
                  <option value="ops.diagnostics.snapshot">
                    ops.diagnostics.snapshot
                  </option>
                  <option value="ops.file.read">ops.file.read</option>
                  <option value="ops.file.write">ops.file.write</option>
                  <option value="ops.file.delete">ops.file.delete</option>
                  <option value="ops.backup.create">ops.backup.create</option>
                  <option value="ops.backup.restore">ops.backup.restore</option>
                </select>
              </div>
              <div className="min-w-0 flex-1">
                <label className="mb-1 block text-xs text-slate-500">
                  Command ID
                </label>
                <select
                  value={createJobCommandId}
                  onChange={(e) => setCreateJobCommandId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="ecoenchants.reload">
                    ecoenchants.reload
                  </option>
                  <option value="ecoenchants.services.status">
                    ecoenchants.services.status
                  </option>
                </select>
              </div>
              <button
                type="button"
                onClick={handleCreateJob}
                disabled={creatingJob}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-60"
              >
                <FaPlus />
                {creatingJob ? "创建中..." : "创建任务"}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {jobsLoading ? (
              <div className="py-4 text-center text-sm text-slate-500">
                加载中...
              </div>
            ) : jobs.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-500">
                暂无任务记录
              </div>
            ) : (
              jobs.map((job) => (
                <div
                  key={job.jobId}
                  className={`${logShareTileClass} p-4`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <InfoBadge tone={statusBadgeTone(job.status)}>
                      {job.status}
                    </InfoBadge>
                    <span className="font-mono text-xs text-slate-500">
                      {job.jobId.slice(0, 16)}...
                    </span>
                    <span className="text-sm font-medium text-slate-700">
                      {job.method}
                    </span>
                    {job.commandId && (
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                        {job.commandId}
                      </span>
                    )}
                  </div>
                  <div className="mt-2 text-xs text-slate-500">
                    {job.createdAt && (
                      <span>
                        创建于 {new Date(job.createdAt).toLocaleString()}
                      </span>
                    )}
                    {job.completedAt && (
                      <span className="ml-3">
                        完成于 {new Date(job.completedAt).toLocaleString()}
                      </span>
                    )}
                  </div>
                  {job.error && (
                    <div className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                      [{job.error.code}] {job.error.message}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Files Tab */}
      {activeTab === "files" && (
        <div className="space-y-4">
          {/* Read */}
          <div className="rounded-xl border border-slate-200 p-4">
            <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <FaDownload className="text-blue-500" /> 读取文件
            </h4>
            <div className="flex gap-2">
              <input
                type="text"
                value={fileReadPath}
                onChange={(e) => setFileReadPath(e.target.value)}
                placeholder="远程文件路径，如 /server/plugins/config.yml"
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={handleFileRead}
                disabled={fileOpsLoading || !fileReadPath.trim()}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
              >
                <FaRedo className={fileOpsLoading ? "animate-spin" : ""} />
                读取
              </button>
            </div>
            {fileResult && (
              <pre className="mt-3 max-h-64 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                {fileResult}
              </pre>
            )}
          </div>

          {/* Write */}
          <div className="rounded-xl border border-slate-200 p-4">
            <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <FaSave className="text-emerald-500" /> 写入文件
            </h4>
            <div className="space-y-2">
              <input
                type="text"
                value={fileWritePath}
                onChange={(e) => setFileWritePath(e.target.value)}
                placeholder="远程文件路径"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <textarea
                value={fileWriteContent}
                onChange={(e) => setFileWriteContent(e.target.value)}
                rows={4}
                placeholder="文件内容..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
              />
              <button
                type="button"
                onClick={handleFileWrite}
                disabled={fileOpsLoading || !fileWritePath.trim() || !fileWriteContent.trim()}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-60"
              >
                <FaSave />
                写入
              </button>
            </div>
          </div>

          {/* Delete */}
          <div className="rounded-xl border border-red-100 p-4">
            <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-red-700">
              <FaTrash className="text-red-500" /> 删除文件
            </h4>
            <div className="flex gap-2">
              <input
                type="text"
                value={fileDeletePath}
                onChange={(e) => setFileDeletePath(e.target.value)}
                placeholder="远程文件路径"
                className="flex-1 rounded-lg border border-red-300 px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={handleFileDelete}
                disabled={fileOpsLoading || !fileDeletePath.trim()}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-60"
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
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
            >
              <FaPlus />
              创建备份
            </button>
          </div>

          {backupsLoading ? (
            <div className="py-4 text-center text-sm text-slate-500">
              加载中...
            </div>
          ) : backups.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-500">
              暂无备份
            </div>
          ) : (
            <div className="space-y-2">
              {backups.map((bk) => (
                <div
                  key={bk.backupId}
                  className={`${logShareTileClass} flex items-center justify-between p-4`}
                >
                  <div>
                    <div className="font-mono text-sm text-slate-700">
                      {bk.backupId.slice(0, 20)}...
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {bk.createdAt
                        ? new Date(bk.createdAt).toLocaleString()
                        : "-"}
                      {bk.sizeBytes > 0 &&
                        ` · ${(bk.sizeBytes / 1024 / 1024).toFixed(2)} MB`}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRestoreBackup(bk.backupId)}
                    disabled={restoringBackupId === bk.backupId}
                    className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-amber-700 disabled:opacity-60"
                  >
                    <FaUndo />
                    {restoringBackupId === bk.backupId ? "恢复中..." : "恢复"}
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

/* ─────────── Ops Audit Logs Panel ─────────── */

function OpsAuditLogsPanel({
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
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
        >
          <FaRedo className={loading ? "animate-spin" : ""} />
          刷新
        </button>
      }
    >
      {logs.length === 0 && !loading ? (
        <div className="rounded-2xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-500">
          暂无审计记录
        </div>
      ) : (
        <div className="space-y-2">
          {logs.map((log) => (
            <div
              key={log.auditId}
              className={`${logShareTileClass} p-4`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <InfoBadge
                  tone={log.result === "success" ? "emerald" : "rose"}
                >
                  {log.result}
                </InfoBadge>
                <span className="font-medium text-slate-900">{log.action}</span>
                <span className="text-xs text-slate-500">
                  {log.actorType}:{log.actorId}
                </span>
                {log.instanceId && (
                  <span className="font-mono text-xs text-slate-400">
                    {log.instanceId.slice(0, 12)}...
                  </span>
                )}
              </div>
              <div className="mt-2 text-xs text-slate-500">
                {log.createdAt
                  ? new Date(log.createdAt).toLocaleString()
                  : "-"}
                {log.message && <span className="ml-2">· {log.message}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionShell>
  );
}

/* ─────────── Ops Command Policies Panel ─────────── */

function OpsCommandPoliciesPanel({
  policies,
  loading,
  onRefresh,
  onSave,
}: {
  policies: OpsCommandPolicy[];
  loading: boolean;
  onRefresh: () => void;
  onSave: (policy: Partial<OpsCommandPolicy>) => Promise<void>;
}) {
  const [editingPolicy, setEditingPolicy] = useState<Partial<OpsCommandPolicy> | null>(null);

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
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
        >
          <FaRedo className={loading ? "animate-spin" : ""} />
          刷新
        </button>
      }
    >
      {policies.length === 0 && !loading ? (
        <div className="rounded-2xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-500">
          暂无命令策略配置
        </div>
      ) : (
        <div className="space-y-3">
          {policies.map((p) => (
            <div key={p.commandId} className={`${logShareTileClass} p-4`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono font-semibold text-slate-900">
                  {p.commandId}
                </span>
                <InfoBadge
                  tone={
                    p.riskLevel === "high"
                      ? "rose"
                      : p.riskLevel === "medium"
                        ? "amber"
                        : "emerald"
                  }
                >
                  {p.riskLevel}
                </InfoBadge>
                {p.isActive ? (
                  <InfoBadge tone="emerald">启用</InfoBadge>
                ) : (
                  <InfoBadge tone="slate">停用</InfoBadge>
                )}
              </div>
              <p className="mt-2 text-sm text-slate-600">{p.description}</p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                <span>超时: {p.timeoutSeconds}s</span>
                <span>
                  最大输出:{" "}
                  {p.maxOutputBytes > 1024
                    ? `${(p.maxOutputBytes / 1024).toFixed(0)}KB`
                    : `${p.maxOutputBytes}B`}
                </span>
                {p.requiresApproval && (
                  <span className="text-amber-600">需要审批</span>
                )}
                <span>
                  角色: {p.allowedRoles.join(", ") || "无限制"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
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
    } catch (e: any) {
      setNotification({
        message: e?.response?.data?.error?.message || "获取实例列表失败",
        type: "error",
      });
    } finally {
      setInstancesLoading(false);
    }
  }, [setNotification]);

  const fetchAuditLogs = useCallback(async () => {
    setAuditLogsLoading(true);
    try {
      const res = await api.get(`${API_BASE}/ops/audit-logs?page=1&pageSize=20`);
      setAuditLogs(res.data.logs || []);
    } catch (e: any) {
      setNotification({
        message: e?.response?.data?.error?.message || "获取审计日志失败",
        type: "error",
      });
    } finally {
      setAuditLogsLoading(false);
    }
  }, [setNotification]);

  const fetchPolicies = useCallback(async () => {
    setPoliciesLoading(true);
    try {
      const res = await api.get(`${API_BASE}/ops/policies/commands`);
      setPolicies(res.data.policies || []);
    } catch (e: any) {
      setNotification({
        message: e?.response?.data?.error?.message || "获取命令策略失败",
        type: "error",
      });
    } finally {
      setPoliciesLoading(false);
    }
  }, [setNotification]);

  useEffect(() => {
    fetchInstances();
    fetchAuditLogs();
    fetchPolicies();
  }, [fetchInstances, fetchAuditLogs, fetchPolicies]);

  const handleSavePolicy = useCallback(
    async (policy: Partial<OpsCommandPolicy>) => {
      try {
        await api.post(`${API_BASE}/ops/policies/commands`, policy);
        setNotification({ message: "策略已保存", type: "success" });
        await fetchPolicies();
      } catch (e: any) {
        setNotification({
          message: e?.response?.data?.error?.message || "保存策略失败",
          type: "error",
        });
      }
    },
    [fetchPolicies, setNotification],
  );

  return (
    <div className="space-y-6">
      <InfoQueryHero
        title="EcoEnchants 远程运维"
        description="管理已注册的 Minecraft 服务器实例，执行远程命令、文件操作和备份恢复。"
        icon={FaTerminal}
      />

      {selectedInstanceId ? (
        <OpsInstanceDetailPanel
          instanceId={selectedInstanceId}
          onBack={() => setSelectedInstanceId(null)}
        />
      ) : (
        <OpsInstancesPanel
          instances={instances}
          loading={instancesLoading}
          onRefresh={fetchInstances}
          onSelectInstance={setSelectedInstanceId}
        />
      )}

      <OpsAuditLogsPanel
        logs={auditLogs}
        loading={auditLogsLoading}
        onRefresh={fetchAuditLogs}
      />

      <OpsCommandPoliciesPanel
        policies={policies}
        loading={policiesLoading}
        onRefresh={fetchPolicies}
        onSave={handleSavePolicy}
      />
    </div>
  );
}

export default EcoEnchantsOpsPanel;