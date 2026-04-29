import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { ChangeEvent, MouseEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import CryptoJS from "crypto-js";
import { FaCode, FaEdit, FaEye, FaList, FaPlus, FaSyncAlt, FaTrash } from "react-icons/fa";
import { api } from "../api/api";
import { useAuth } from "../hooks/useAuth";
import { useNotification } from "./Notification";

interface ModItem {
  id: string;
  name: string;
  hash?: string;
  md5?: string;
}

interface EncryptedModListResponse {
  success?: boolean;
  data?: string;
  iv?: string;
  mods?: ModItem[];
}

interface MutationResponse {
  success?: boolean;
  error?: string;
  mod?: ModItem;
  added?: ModItem[];
  deletedCount?: number;
  failedIds?: string[];
}

interface DraftMod {
  name: string;
  hash: string;
  md5: string;
}

type ViewMode = "list" | "json";

const batchAddExample = `[
  {
    "name": "example-mod",
    "hash": "abc123",
    "md5": "d41d8cd98f00b204e9800998ecf8427e"
  },
  {
    "name": "example-mod-2",
    "hash": "def456"
  }
]`;

function decryptModsPayload(data: string, iv: string, token: string): ModItem[] {
  const key = CryptoJS.SHA256(token);
  const decrypted = CryptoJS.AES.decrypt(
    { ciphertext: CryptoJS.enc.Hex.parse(data) },
    key,
    {
      iv: CryptoJS.enc.Hex.parse(iv),
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    },
  );

  const raw = decrypted.toString(CryptoJS.enc.Utf8);
  if (!raw) {
    throw new Error("decrypt_failed");
  }

  const parsed = JSON.parse(raw) as { mods?: ModItem[] };
  return Array.isArray(parsed.mods) ? parsed.mods : [];
}

async function fetchModList(): Promise<ModItem[]> {
  const response = await api.get<EncryptedModListResponse>("/api/modlist", {
    params: { withHash: 1, withMd5: 1 },
  });

  if (Array.isArray(response.data.mods)) {
    return response.data.mods;
  }

  if (typeof response.data.data === "string" && typeof response.data.iv === "string") {
    const token = localStorage.getItem("token");
    if (!token) {
      throw new Error("missing_token");
    }
    return decryptModsPayload(response.data.data, response.data.iv, token);
  }

  return [];
}

async function fetchModListJson(): Promise<ModItem[]> {
  const response = await api.get<ModItem[]>("/api/modlist/json", {
    params: { withHash: 1, withMd5: 1 },
  });
  return Array.isArray(response.data) ? response.data : [];
}

async function createMod(payload: { name: string; code: string; hash?: string; md5?: string }) {
  const response = await api.post<MutationResponse>("/api/modlist", payload);
  return response.data;
}

async function editMod(id: string, payload: { name: string; code: string; hash?: string; md5?: string }) {
  const response = await api.put<MutationResponse>(`/api/modlist/${id}`, payload);
  return response.data;
}

async function removeMod(id: string, code: string) {
  const response = await api.delete<MutationResponse>(`/api/modlist/${id}`, {
    data: { code },
  });
  return response.data;
}

async function createModsBatch(mods: Array<Pick<ModItem, "name" | "hash" | "md5">>, code: string) {
  const response = await api.post<MutationResponse>("/api/modlist/batch-add", {
    mods,
    code,
  });
  return response.data;
}

async function removeModsBatch(ids: string[], code: string) {
  const response = await api.post<MutationResponse>("/api/modlist/batch-delete", {
    ids,
    code,
  });
  return response.data;
}

function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[99999] flex items-center justify-center bg-[#021522]/60 p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="w-full max-w-2xl rounded-[28px] border border-white/20 bg-white p-6 shadow-[0_25px_80px_rgba(2,48,71,0.22)]"
          initial={{ opacity: 0, y: 18, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 18, scale: 0.98 }}
          onClick={(event: MouseEvent<HTMLDivElement>) => event.stopPropagation()}
        >
          <div className="mb-5 flex items-center justify-between gap-4">
            <h3 className="text-xl font-semibold text-[#023047]">{title}</h3>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-[#8ECAE6]/40 px-3 py-1 text-sm text-[#023047]/70 transition hover:border-[#219EBC] hover:text-[#023047]"
            >
              关闭
            </button>
          </div>
          {children}
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: string;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-[#023047]">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-[#8ECAE6]/50 bg-white px-4 py-3 text-[#023047] outline-none transition focus:border-[#219EBC] focus:ring-2 focus:ring-[#8ECAE6]/40"
      />
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  rows = 10,
  readOnly = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  readOnly?: boolean;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-[#023047]">{label}</span>
      <textarea
        value={value}
        rows={rows}
        readOnly={readOnly}
        onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onChange(event.target.value)}
        className="min-h-[220px] w-full rounded-3xl border border-[#8ECAE6]/50 bg-[#F8FBFD] px-4 py-3 font-mono text-sm text-[#023047] outline-none transition focus:border-[#219EBC] focus:ring-2 focus:ring-[#8ECAE6]/40 read-only:bg-[#F1F6F9]"
      />
    </label>
  );
}

const ModListEditor: React.FC = () => {
  const { user } = useAuth();
  const { setNotification } = useNotification();

  const [mods, setMods] = useState<ModItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [jsonDraft, setJsonDraft] = useState("");
  const [jsonEditable, setJsonEditable] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const [draft, setDraft] = useState<DraftMod>({ name: "", hash: "", md5: "" });
  const [selectedMod, setSelectedMod] = useState<ModItem | null>(null);
  const [modifyCode, setModifyCode] = useState("");
  const [deleteCode, setDeleteCode] = useState("");
  const [batchCode, setBatchCode] = useState("");

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showBatchDeleteModal, setShowBatchDeleteModal] = useState(false);
  const [showExampleModal, setShowExampleModal] = useState(false);
  const [showBatchAddModal, setShowBatchAddModal] = useState(false);

  const isAdmin = user?.role === "admin";

  const notify = (type: "success" | "error" | "info" | "warning", message: string) => {
    setNotification({ type, message });
  };

  const resetDraft = () => {
    setDraft({ name: "", hash: "", md5: "" });
    setModifyCode("");
    setSelectedMod(null);
  };

  const closeAllModals = () => {
    setShowAddModal(false);
    setShowEditModal(false);
    setShowDeleteModal(false);
    setShowBatchDeleteModal(false);
    setShowExampleModal(false);
    setShowBatchAddModal(false);
    setDeleteCode("");
    setBatchCode("");
    resetDraft();
  };

  const loadData = async (mode: ViewMode = viewMode) => {
    setLoading(true);
    try {
      if (mode === "json") {
        const list = await fetchModListJson();
        setMods(list);
        setJsonDraft(JSON.stringify(list, null, 2));
      } else {
        const list = await fetchModList();
        setMods(list);
      }
    } catch (error: any) {
      notify("error", error?.response?.data?.error || "加载模组列表失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData(viewMode);
  }, [viewMode]);

  const filteredMods = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) {
      return mods;
    }
    return mods.filter((mod) => {
      const haystack = [mod.name, mod.hash, mod.md5].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(keyword);
    });
  }, [mods, search]);

  const selectedCount = selectedIds.length;

  const handleRefresh = async () => {
    await loadData(viewMode);
    notify("success", "模组列表已刷新");
  };

  const handleOpenAdd = () => {
    resetDraft();
    setShowAddModal(true);
  };

  const handleOpenEdit = (mod: ModItem) => {
    setSelectedMod(mod);
    setDraft({
      name: mod.name,
      hash: mod.hash || "",
      md5: mod.md5 || "",
    });
    setModifyCode("");
    setShowEditModal(true);
  };

  const handleOpenDelete = (mod: ModItem) => {
    setSelectedMod(mod);
    setDeleteCode("");
    setShowDeleteModal(true);
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const handleSubmitAdd = async () => {
    if (!draft.name.trim() || !draft.hash.trim() || !modifyCode.trim()) {
      notify("error", "新增时必须填写名称、Hash 和修改码");
      return;
    }

    setSubmitting(true);
    try {
      const result = await createMod({
        name: draft.name.trim(),
        hash: draft.hash.trim(),
        md5: draft.md5.trim() || undefined,
        code: modifyCode.trim(),
      });
      if (!result.success) {
        throw new Error(result.error || "新增失败");
      }
      closeAllModals();
      await loadData(viewMode);
      notify("success", "模组已新增");
    } catch (error: any) {
      notify("error", error?.response?.data?.error || error?.message || "新增失败");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitEdit = async () => {
    if (!selectedMod?.id || !draft.name.trim() || !modifyCode.trim()) {
      notify("error", "编辑时必须填写名称和修改码");
      return;
    }

    setSubmitting(true);
    try {
      const result = await editMod(selectedMod.id, {
        name: draft.name.trim(),
        hash: draft.hash.trim() || undefined,
        md5: draft.md5.trim() || undefined,
        code: modifyCode.trim(),
      });
      if (!result.success) {
        throw new Error(result.error || "更新失败");
      }
      closeAllModals();
      await loadData(viewMode);
      notify("success", "模组已更新");
    } catch (error: any) {
      notify("error", error?.response?.data?.error || error?.message || "更新失败");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitDelete = async () => {
    if (!selectedMod?.id || !deleteCode.trim()) {
      notify("error", "删除前必须输入修改码");
      return;
    }

    setSubmitting(true);
    try {
      const result = await removeMod(selectedMod.id, deleteCode.trim());
      if (!result.success) {
        throw new Error(result.error || "删除失败");
      }
      closeAllModals();
      setSelectedIds((current) => current.filter((id) => id !== selectedMod.id));
      await loadData(viewMode);
      notify("success", "模组已删除");
    } catch (error: any) {
      notify("error", error?.response?.data?.error || error?.message || "删除失败");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitBatchDelete = async () => {
    if (!selectedCount) {
      notify("error", "请先选择要删除的模组");
      return;
    }
    if (!batchCode.trim()) {
      notify("error", "批量删除必须输入修改码");
      return;
    }

    setSubmitting(true);
    try {
      const result = await removeModsBatch(selectedIds, batchCode.trim());
      if (!result.success) {
        throw new Error(result.error || "批量删除失败");
      }
      closeAllModals();
      setSelectedIds([]);
      await loadData(viewMode);
      notify("success", `批量删除完成，删除 ${result.deletedCount ?? selectedCount} 项`);
    } catch (error: any) {
      notify("error", error?.response?.data?.error || error?.message || "批量删除失败");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitBatchAdd = async () => {
    let payload: Array<Pick<ModItem, "name" | "hash" | "md5">>;

    try {
      const parsed = JSON.parse(jsonDraft) as unknown;
      if (!Array.isArray(parsed)) {
        throw new Error("invalid_json");
      }
      payload = parsed.map((item) => {
        const source = item as Record<string, unknown>;
        return {
          name: typeof source.name === "string" ? source.name.trim() : "",
          hash: typeof source.hash === "string" ? source.hash.trim() : undefined,
          md5: typeof source.md5 === "string" ? source.md5.trim() : undefined,
        };
      });
    } catch {
      notify("error", "JSON 格式无效，必须是对象数组");
      return;
    }

    if (!batchCode.trim()) {
      notify("error", "批量新增必须输入修改码");
      return;
    }

    setSubmitting(true);
    try {
      const result = await createModsBatch(payload, batchCode.trim());
      if (!result.success) {
        throw new Error(result.error || "批量新增失败");
      }
      closeAllModals();
      setJsonEditable(false);
      await loadData(viewMode);
      notify("success", `批量新增完成，新增 ${result.added?.length ?? 0} 项`);
    } catch (error: any) {
      notify("error", error?.response?.data?.error || error?.message || "批量新增失败");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(142,202,230,0.28),_transparent_38%),linear-gradient(180deg,_#f8fcff_0%,_#eef7fb_100%)] px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl space-y-6">
          <section className="overflow-hidden rounded-[32px] border border-[#8ECAE6]/30 bg-white/90 p-8 shadow-[0_24px_70px_rgba(2,48,71,0.10)] backdrop-blur">
            <div className="flex items-start gap-4">
              <div className="rounded-2xl bg-[#219EBC]/12 p-4 text-[#219EBC]">
                <FaEye className="h-6 w-6" />
              </div>
              <div className="space-y-3">
                <div>
                  <div className="text-sm font-semibold uppercase tracking-[0.24em] text-[#219EBC]">Public View</div>
                  <h2 className="mt-2 text-3xl font-semibold text-[#023047]">模组列表</h2>
                </div>
                <p className="max-w-3xl text-sm leading-7 text-[#023047]/72">
                  当前账号没有管理权限，因此页面只提供列表浏览。后端 `GET /api/modlist` 对普通用户返回明文数组，写操作需要修改码且由管理员执行。
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-[32px] border border-[#8ECAE6]/30 bg-white/92 p-6 shadow-[0_20px_60px_rgba(2,48,71,0.08)]">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-[#FFB703]/18 p-3 text-[#FB8500]">
                  <FaList className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-lg font-semibold text-[#023047]">浏览模组</div>
                  <div className="text-sm text-[#023047]/60">{mods.length} 项</div>
                </div>
              </div>
              <div className="flex gap-3">
                <input
                  value={search}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setSearch(event.target.value)}
                  placeholder="搜索名称 / Hash / MD5"
                  className="w-full rounded-2xl border border-[#8ECAE6]/50 px-4 py-3 text-sm text-[#023047] outline-none transition focus:border-[#219EBC] focus:ring-2 focus:ring-[#8ECAE6]/40 sm:w-80"
                />
                <button
                  type="button"
                  onClick={() => void handleRefresh()}
                  className="rounded-2xl border border-[#219EBC] px-4 py-3 text-sm font-medium text-[#023047] transition hover:bg-[#219EBC]/8"
                >
                  刷新
                </button>
              </div>
            </div>

            <div className="overflow-hidden rounded-[28px] border border-[#8ECAE6]/35">
              <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,2fr)] gap-4 bg-[#EAF6FB] px-5 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-[#023047]/65">
                <div>名称</div>
                <div>Hash</div>
                <div>MD5</div>
              </div>
              {loading ? (
                <div className="px-5 py-10 text-center text-sm text-[#023047]/60">加载中…</div>
              ) : filteredMods.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-[#023047]/60">没有匹配的模组</div>
              ) : (
                filteredMods.map((mod) => (
                  <div
                    key={mod.id}
                    className="grid grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,2fr)] gap-4 border-t border-[#8ECAE6]/25 px-5 py-4 text-sm text-[#023047]"
                  >
                    <div className="break-all font-medium">{mod.name}</div>
                    <div className="break-all text-[#023047]/72">{mod.hash || "-"}</div>
                    <div className="break-all text-[#023047]/72">{mod.md5 || "-"}</div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(33,158,188,0.18),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(255,183,3,0.16),_transparent_28%),linear-gradient(180deg,_#f8fcff_0%,_#eef6fb_100%)] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="overflow-hidden rounded-[36px] border border-white/40 bg-[linear-gradient(135deg,_rgba(255,255,255,0.96),_rgba(234,246,251,0.95))] p-8 shadow-[0_30px_90px_rgba(2,48,71,0.12)] backdrop-blur">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#219EBC]/20 bg-[#219EBC]/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-[#219EBC]">
                <FaCode className="h-3.5 w-3.5" />
                ModList Admin Surface
              </div>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-[#023047] sm:text-4xl">模组列表管理</h1>
                <p className="mt-3 text-sm leading-7 text-[#023047]/72 sm:text-base">
                  这个页面完全按后端接口重做：`GET /api/modlist` 负责管理员加密读，`GET /api/modlist/json` 负责纯 JSON，
                  写操作覆盖新增、编辑、删除、批量新增和批量删除，全部显式要求修改码。
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-[28px] border border-[#8ECAE6]/35 bg-white/85 px-5 py-4">
                <div className="text-xs uppercase tracking-[0.2em] text-[#023047]/45">Total</div>
                <div className="mt-2 text-3xl font-semibold text-[#023047]">{mods.length}</div>
              </div>
              <div className="rounded-[28px] border border-[#8ECAE6]/35 bg-white/85 px-5 py-4">
                <div className="text-xs uppercase tracking-[0.2em] text-[#023047]/45">Selected</div>
                <div className="mt-2 text-3xl font-semibold text-[#023047]">{selectedCount}</div>
              </div>
              <div className="rounded-[28px] border border-[#8ECAE6]/35 bg-white/85 px-5 py-4">
                <div className="text-xs uppercase tracking-[0.2em] text-[#023047]/45">View</div>
                <div className="mt-2 text-lg font-semibold text-[#023047]">{viewMode === "list" ? "List" : "JSON"}</div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
          <div className="space-y-6">
            <div className="rounded-[32px] border border-[#8ECAE6]/30 bg-white/92 p-6 shadow-[0_20px_60px_rgba(2,48,71,0.08)]">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => setViewMode("list")}
                    className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                      viewMode === "list"
                        ? "bg-[#023047] text-white"
                        : "border border-[#8ECAE6]/45 bg-white text-[#023047] hover:bg-[#EAF6FB]"
                    }`}
                  >
                    列表视图
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("json")}
                    className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                      viewMode === "json"
                        ? "bg-[#023047] text-white"
                        : "border border-[#8ECAE6]/45 bg-white text-[#023047] hover:bg-[#EAF6FB]"
                    }`}
                  >
                    JSON 视图
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleRefresh()}
                    className="inline-flex items-center gap-2 rounded-full border border-[#219EBC]/40 bg-white px-4 py-2 text-sm font-medium text-[#023047] transition hover:bg-[#EAF6FB]"
                  >
                    <FaSyncAlt className="h-3.5 w-3.5" />
                    刷新
                  </button>
                </div>

                <input
                  value={search}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setSearch(event.target.value)}
                  placeholder="搜索名称 / Hash / MD5"
                  className="w-full rounded-2xl border border-[#8ECAE6]/50 px-4 py-3 text-sm text-[#023047] outline-none transition focus:border-[#219EBC] focus:ring-2 focus:ring-[#8ECAE6]/40 lg:w-80"
                />
              </div>
            </div>

            {viewMode === "list" ? (
              <section className="overflow-hidden rounded-[32px] border border-[#8ECAE6]/30 bg-white/94 shadow-[0_20px_60px_rgba(2,48,71,0.08)]">
                <div className="flex flex-col gap-3 border-b border-[#8ECAE6]/25 bg-[#F5FBFE] px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-[#023047]">列表管理</h2>
                    <p className="mt-1 text-sm text-[#023047]/62">直接对应后端单条与批量写接口。</p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={handleOpenAdd}
                      className="inline-flex items-center gap-2 rounded-2xl bg-[#219EBC] px-4 py-3 text-sm font-medium text-white transition hover:bg-[#1A87A0]"
                    >
                      <FaPlus className="h-3.5 w-3.5" />
                      新增模组
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowBatchDeleteModal(true)}
                      disabled={!selectedCount}
                      className="inline-flex items-center gap-2 rounded-2xl bg-[#FB8500] px-4 py-3 text-sm font-medium text-white transition hover:bg-[#df7600] disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <FaTrash className="h-3.5 w-3.5" />
                      批量删除
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedIds(filteredMods.map((mod) => mod.id))}
                      className="rounded-2xl border border-[#8ECAE6]/40 px-4 py-3 text-sm font-medium text-[#023047] transition hover:bg-[#EAF6FB]"
                    >
                      选中筛选结果
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedIds([])}
                      className="rounded-2xl border border-[#8ECAE6]/40 px-4 py-3 text-sm font-medium text-[#023047] transition hover:bg-[#EAF6FB]"
                    >
                      清空选择
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-[56px_minmax(0,1.4fr)_minmax(0,1.3fr)_minmax(0,1.2fr)_144px] gap-4 bg-[#EAF6FB] px-6 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-[#023047]/65">
                  <div>选中</div>
                  <div>名称</div>
                  <div>Hash</div>
                  <div>MD5</div>
                  <div>操作</div>
                </div>

                {loading ? (
                  <div className="px-6 py-12 text-center text-sm text-[#023047]/60">加载中…</div>
                ) : filteredMods.length === 0 ? (
                  <div className="px-6 py-12 text-center text-sm text-[#023047]/60">没有匹配的模组</div>
                ) : (
                  filteredMods.map((mod) => (
                    <div
                      key={mod.id}
                      className="grid grid-cols-[56px_minmax(0,1.4fr)_minmax(0,1.3fr)_minmax(0,1.2fr)_144px] gap-4 border-t border-[#8ECAE6]/18 px-6 py-4 text-sm text-[#023047]"
                    >
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(mod.id)}
                          onChange={() => toggleSelected(mod.id)}
                          className="h-4 w-4 rounded border-[#8ECAE6] text-[#219EBC] focus:ring-[#219EBC]"
                        />
                      </div>
                      <div className="break-all font-medium">{mod.name}</div>
                      <div className="break-all text-[#023047]/72">{mod.hash || "-"}</div>
                      <div className="break-all text-[#023047]/72">{mod.md5 || "-"}</div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(mod)}
                          className="inline-flex items-center gap-1 rounded-xl border border-[#FFB703]/40 px-3 py-2 text-xs font-medium text-[#9A6700] transition hover:bg-[#FFB703]/10"
                        >
                          <FaEdit className="h-3 w-3" />
                          编辑
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenDelete(mod)}
                          className="inline-flex items-center gap-1 rounded-xl border border-[#FB8500]/40 px-3 py-2 text-xs font-medium text-[#B45309] transition hover:bg-[#FB8500]/10"
                        >
                          <FaTrash className="h-3 w-3" />
                          删除
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </section>
            ) : (
              <section className="rounded-[32px] border border-[#8ECAE6]/30 bg-white/94 p-6 shadow-[0_20px_60px_rgba(2,48,71,0.08)]">
                <div className="flex flex-col gap-3 border-b border-[#8ECAE6]/20 pb-5 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-[#023047]">JSON 工作区</h2>
                    <p className="mt-1 text-sm text-[#023047]/62">
                      对应后端 `GET /api/modlist/json` 与 `POST /api/modlist/batch-add`。这里只做批量新增，不做全量覆盖。
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => setJsonEditable((current) => !current)}
                      className="rounded-2xl border border-[#8ECAE6]/40 px-4 py-3 text-sm font-medium text-[#023047] transition hover:bg-[#EAF6FB]"
                    >
                      {jsonEditable ? "取消编辑" : "启用编辑"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowExampleModal(true)}
                      className="rounded-2xl border border-[#8ECAE6]/40 px-4 py-3 text-sm font-medium text-[#023047] transition hover:bg-[#EAF6FB]"
                    >
                      查看示例
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowBatchAddModal(true)}
                      disabled={!jsonEditable}
                      className="inline-flex items-center gap-2 rounded-2xl bg-[#219EBC] px-4 py-3 text-sm font-medium text-white transition hover:bg-[#1A87A0] disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <FaPlus className="h-3.5 w-3.5" />
                      批量新增
                    </button>
                  </div>
                </div>

                <div className="pt-5">
                  <TextAreaField label="模组 JSON" value={jsonDraft} onChange={setJsonDraft} readOnly={!jsonEditable} rows={18} />
                </div>
              </section>
            )}
          </div>

          <aside className="space-y-6">
            <section className="rounded-[32px] border border-[#8ECAE6]/30 bg-white/92 p-6 shadow-[0_20px_60px_rgba(2,48,71,0.08)]">
              <h2 className="text-xl font-semibold text-[#023047]">接口对照</h2>
              <div className="mt-5 space-y-3 text-sm text-[#023047]/72">
                <div className="rounded-2xl bg-[#F5FBFE] px-4 py-3">
                  <div className="font-semibold text-[#023047]">读取</div>
                  <div className="mt-1 font-mono text-xs">GET /api/modlist</div>
                  <div className="mt-1 font-mono text-xs">GET /api/modlist/json</div>
                </div>
                <div className="rounded-2xl bg-[#F5FBFE] px-4 py-3">
                  <div className="font-semibold text-[#023047]">单条写入</div>
                  <div className="mt-1 font-mono text-xs">POST /api/modlist</div>
                  <div className="mt-1 font-mono text-xs">PUT /api/modlist/:id</div>
                  <div className="mt-1 font-mono text-xs">DELETE /api/modlist/:id</div>
                </div>
                <div className="rounded-2xl bg-[#F5FBFE] px-4 py-3">
                  <div className="font-semibold text-[#023047]">批量写入</div>
                  <div className="mt-1 font-mono text-xs">POST /api/modlist/batch-add</div>
                  <div className="mt-1 font-mono text-xs">POST /api/modlist/batch-delete</div>
                </div>
              </div>
            </section>

            <section className="rounded-[32px] border border-[#8ECAE6]/30 bg-white/92 p-6 shadow-[0_20px_60px_rgba(2,48,71,0.08)]">
              <h2 className="text-xl font-semibold text-[#023047]">行为说明</h2>
              <div className="mt-5 space-y-3 text-sm leading-7 text-[#023047]/72">
                <p>管理员读取时，后端会把 `mods` 包成 AES-256-CBC 密文；这里按 token 派生密钥解密。</p>
                <p>JSON 工作区只用于整理和批量新增，不会执行“全量替换”。</p>
                <p>批量删除使用后端现成的 `ids + code` 契约，不再要求逐条删。</p>
                <p>这个页面没有引入任何远程字体，也没有使用 data URL 字体资源。</p>
              </div>
            </section>
          </aside>
        </section>
      </div>

      <Modal open={showAddModal} title="新增模组" onClose={closeAllModals}>
        <div className="space-y-4">
          <TextField label="名称" value={draft.name} onChange={(value) => setDraft((current) => ({ ...current, name: value }))} placeholder="例如：example-mod" />
          <TextField label="Hash" value={draft.hash} onChange={(value) => setDraft((current) => ({ ...current, hash: value }))} placeholder="请输入 Hash" />
          <TextField label="MD5" value={draft.md5} onChange={(value) => setDraft((current) => ({ ...current, md5: value }))} placeholder="可选" />
          <TextField label="修改码" value={modifyCode} onChange={setModifyCode} placeholder="请输入修改码" type="password" />
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={closeAllModals} className="rounded-2xl border border-[#8ECAE6]/40 px-4 py-3 text-sm font-medium text-[#023047]">
            取消
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => void handleSubmitAdd()}
            className="rounded-2xl bg-[#219EBC] px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
          >
            保存
          </button>
        </div>
      </Modal>

      <Modal open={showEditModal} title="编辑模组" onClose={closeAllModals}>
        <div className="space-y-4">
          <TextField label="名称" value={draft.name} onChange={(value) => setDraft((current) => ({ ...current, name: value }))} placeholder="请输入名称" />
          <TextField label="Hash" value={draft.hash} onChange={(value) => setDraft((current) => ({ ...current, hash: value }))} placeholder="留空则清除" />
          <TextField label="MD5" value={draft.md5} onChange={(value) => setDraft((current) => ({ ...current, md5: value }))} placeholder="留空则清除" />
          <TextField label="修改码" value={modifyCode} onChange={setModifyCode} placeholder="请输入修改码" type="password" />
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={closeAllModals} className="rounded-2xl border border-[#8ECAE6]/40 px-4 py-3 text-sm font-medium text-[#023047]">
            取消
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => void handleSubmitEdit()}
            className="rounded-2xl bg-[#FFB703] px-4 py-3 text-sm font-medium text-[#4A3200] disabled:opacity-50"
          >
            更新
          </button>
        </div>
      </Modal>

      <Modal open={showDeleteModal} title="删除模组" onClose={closeAllModals}>
        <div className="space-y-4">
          <div className="rounded-2xl bg-[#FFF5EB] px-4 py-3 text-sm text-[#9A3412]">
            即将删除：<span className="font-semibold">{selectedMod?.name || "-"}</span>
          </div>
          <TextField label="修改码" value={deleteCode} onChange={setDeleteCode} placeholder="请输入修改码" type="password" />
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={closeAllModals} className="rounded-2xl border border-[#8ECAE6]/40 px-4 py-3 text-sm font-medium text-[#023047]">
            取消
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => void handleSubmitDelete()}
            className="rounded-2xl bg-[#FB8500] px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
          >
            删除
          </button>
        </div>
      </Modal>

      <Modal open={showBatchDeleteModal} title="批量删除模组" onClose={closeAllModals}>
        <div className="space-y-4">
          <div className="rounded-2xl bg-[#FFF5EB] px-4 py-3 text-sm text-[#9A3412]">当前已选 {selectedCount} 项。</div>
          <TextField label="修改码" value={batchCode} onChange={setBatchCode} placeholder="请输入修改码" type="password" />
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={closeAllModals} className="rounded-2xl border border-[#8ECAE6]/40 px-4 py-3 text-sm font-medium text-[#023047]">
            取消
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => void handleSubmitBatchDelete()}
            className="rounded-2xl bg-[#FB8500] px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
          >
            执行批量删除
          </button>
        </div>
      </Modal>

      <Modal open={showBatchAddModal} title="批量新增模组" onClose={closeAllModals}>
        <div className="space-y-4">
          <div className="rounded-2xl bg-[#EAF6FB] px-4 py-3 text-sm text-[#023047]/72">
            这里会把当前 JSON 解析为数组并提交到 `POST /api/modlist/batch-add`。
          </div>
          <TextField label="修改码" value={batchCode} onChange={setBatchCode} placeholder="请输入修改码" type="password" />
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={closeAllModals} className="rounded-2xl border border-[#8ECAE6]/40 px-4 py-3 text-sm font-medium text-[#023047]">
            取消
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => void handleSubmitBatchAdd()}
            className="rounded-2xl bg-[#219EBC] px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
          >
            执行批量新增
          </button>
        </div>
      </Modal>

      <Modal open={showExampleModal} title="批量新增 JSON 示例" onClose={closeAllModals}>
        <div className="space-y-4">
          <pre className="overflow-x-auto rounded-3xl bg-[#F5FBFE] p-4 text-sm text-[#023047]">{batchAddExample}</pre>
          <div className="text-sm text-[#023047]/72">`id` 不需要传，后端会生成。重复名称会被跳过。</div>
        </div>
      </Modal>
    </div>
  );
};

export default ModListEditor;
