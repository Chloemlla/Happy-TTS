import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { FaEdit, FaList, FaPlus, FaTrash } from "react-icons/fa";
import CryptoJS from "crypto-js";
import getApiBaseUrl from "../api";
import { useAuth } from "../hooks/useAuth";
import { useNotification } from "./Notification";

interface Mod {
  id: string;
  name: string;
  hash?: string;
  md5?: string;
}

interface JsonResponse {
  success?: boolean;
  error?: string;
  data?: string;
  iv?: string;
  mods?: Mod[];
}

const batchAddExample = `[
  { "name": "mod1", "hash": "abc123", "md5": "d41d8cd98f00b204e9800998ecf8427e" },
  { "name": "mod2", "hash": "def456" }
]`;

function getAuthHeaders() {
  const token = localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function decryptAES256(encryptedData: string, iv: string, key: string): string {
  const keyBytes = CryptoJS.SHA256(key);
  const ivBytes = CryptoJS.enc.Hex.parse(iv);
  const encryptedBytes = CryptoJS.enc.Hex.parse(encryptedData);

  const decrypted = CryptoJS.AES.decrypt(
    { ciphertext: encryptedBytes },
    keyBytes,
    {
      iv: ivBytes,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    },
  );

  return decrypted.toString(CryptoJS.enc.Utf8);
}

async function fetchMods(withHash = false, withMd5 = false): Promise<Mod[]> {
  const params = new URLSearchParams();
  if (withHash) params.set("withHash", "1");
  if (withMd5) params.set("withMd5", "1");

  const url = `${getApiBaseUrl()}/api/modlist${params.size ? `?${params.toString()}` : ""}`;
  const res = await fetch(url, { headers: getAuthHeaders() });
  if (!res.ok) return [];

  const data = (await res.json()) as JsonResponse;
  if (typeof data.data === "string" && typeof data.iv === "string") {
    const token = localStorage.getItem("token") || "";
    if (!token) return [];

    try {
      const decryptedJson = decryptAES256(data.data, data.iv, token);
      const decryptedData = JSON.parse(decryptedJson) as { mods?: Mod[] };
      return Array.isArray(decryptedData.mods) ? decryptedData.mods : [];
    } catch {
      return [];
    }
  }

  return Array.isArray(data.mods) ? data.mods : [];
}

async function fetchModsJson(withHash = false, withMd5 = false): Promise<unknown> {
  const params = new URLSearchParams();
  if (withHash) params.set("withHash", "1");
  if (withMd5) params.set("withMd5", "1");

  const url = `${getApiBaseUrl()}/api/modlist/json${params.size ? `?${params.toString()}` : ""}`;
  const res = await fetch(url, { headers: getAuthHeaders() });
  if (!res.ok) return [];
  return await res.json();
}

async function addMod(name: string, code: string, hash?: string, md5?: string) {
  const res = await fetch(`${getApiBaseUrl()}/api/modlist`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ name, code, hash, md5 }),
  });
  return await res.json();
}

async function updateMod(id: string, name: string, code: string, hash?: string, md5?: string) {
  const res = await fetch(`${getApiBaseUrl()}/api/modlist/${id}`, {
    method: "PUT",
    headers: getAuthHeaders(),
    body: JSON.stringify({ name, code, hash, md5 }),
  });
  return await res.json();
}

async function deleteMod(id: string, code: string) {
  const res = await fetch(`${getApiBaseUrl()}/api/modlist/${id}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
    body: JSON.stringify({ code }),
  });
  return await res.json();
}

async function batchAddMods(mods: Mod[], code: string) {
  const res = await fetch(`${getApiBaseUrl()}/api/modlist/batch-add`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ mods, code }),
  });
  return await res.json();
}

function Modal({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  if (typeof document === "undefined") return null;

  return ReactDOM.createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-8 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)]"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="mb-6 text-xl font-bold text-gray-900">{title}</h3>
            {children}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

function Field({
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
    <div>
      <label className="mb-2 block text-sm font-semibold text-gray-700">{label}</label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border-2 border-gray-200 px-3 py-2 transition-all focus:outline-none focus:ring-2 focus:ring-blue-400"
      />
    </div>
  );
}

const ModListEditor: React.FC = () => {
  const { user } = useAuth();
  const { setNotification } = useNotification();

  const [mods, setMods] = useState<Mod[]>([]);
  const [jsonMode, setJsonMode] = useState(false);
  const [jsonEdit, setJsonEdit] = useState(false);
  const [jsonValue, setJsonValue] = useState("");

  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showExample, setShowExample] = useState(false);
  const [showBatchCode, setShowBatchCode] = useState(false);

  const [pendingBatchData, setPendingBatchData] = useState("");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [hash, setHash] = useState("");
  const [md5, setMd5] = useState("");
  const [deleteCode, setDeleteCode] = useState("");
  const [batchCode, setBatchCode] = useState("");

  const notifyError = (message: string) => setNotification({ message, type: "error" });
  const notifySuccess = (message: string) => setNotification({ message, type: "success" });
  const notifyInfo = (message: string) => setNotification({ message, type: "info" });

  const resetForm = () => {
    setSelectedId(null);
    setName("");
    setCode("");
    setHash("");
    setMd5("");
  };

  const loadMods = async () => {
    try {
      if (jsonMode) {
        const data = await fetchModsJson(true, true);
        setJsonValue(JSON.stringify(data, null, 2));
      } else {
        const data = await fetchMods(true, true);
        setMods(data);
      }
    } catch {
      setMods([]);
      setJsonValue("[]");
    }
  };

  useEffect(() => {
    loadMods();
  }, [jsonMode]);

  const handleAdd = async () => {
    if (!name.trim() || !code.trim() || !hash.trim()) {
      notifyError("Please provide name, code, and hash.");
      return;
    }

    const res = await addMod(name.trim(), code.trim(), hash.trim(), md5.trim() || undefined);
    if (res.success) {
      notifySuccess("Mod added.");
      setShowAdd(false);
      resetForm();
      await loadMods();
      return;
    }

    notifyError(res.error || "Add failed.");
  };

  const openEdit = (mod: Mod) => {
    setSelectedId(mod.id);
    setName(mod.name);
    setCode("");
    setHash(mod.hash || "");
    setMd5(mod.md5 || "");
    setShowEdit(true);
  };

  const handleEdit = async () => {
    if (!selectedId || !name.trim() || !code.trim() || !hash.trim()) {
      notifyError("Please fill all required fields.");
      return;
    }

    const res = await updateMod(selectedId, name.trim(), code.trim(), hash.trim(), md5.trim() || undefined);
    if (res.success) {
      notifySuccess("Mod updated.");
      setShowEdit(false);
      resetForm();
      await loadMods();
      return;
    }

    notifyError(res.error || "Update failed.");
  };

  const handleDelete = async () => {
    if (!selectedId || !deleteCode.trim()) {
      notifyError("Please enter the modify code.");
      return;
    }

    const res = await deleteMod(selectedId, deleteCode.trim());
    if (res.success) {
      notifySuccess("Mod deleted.");
      setShowDelete(false);
      setSelectedId(null);
      setDeleteCode("");
      await loadMods();
      return;
    }

    notifyError(res.error || "Delete failed.");
  };

  const handleBatchAddClick = () => {
    setPendingBatchData(jsonValue);
    setShowBatchCode(true);
  };

  const handleBatchAddSubmit = async () => {
    let parsed: Mod[];
    try {
      const payload = JSON.parse(pendingBatchData) as unknown;
      if (!Array.isArray(payload)) throw new Error("invalid");
      parsed = payload as Mod[];
    } catch {
      notifyError("Invalid JSON payload.");
      setShowBatchCode(false);
      setBatchCode("");
      return;
    }

    const res = await batchAddMods(parsed, batchCode.trim());
    if (res.success) {
      notifySuccess("Batch add completed.");
      setShowBatchCode(false);
      setBatchCode("");
      setJsonEdit(false);
      await loadMods();
      return;
    }

    notifyError(res.error || "Batch add failed.");
    setShowBatchCode(false);
    setBatchCode("");
  };

  if (!user || user.role !== "admin") {
    return (
      <motion.div className="space-y-6" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <motion.div className="rounded-xl border border-red-100 bg-gradient-to-r from-red-50 to-pink-50 p-6">
          <h2 className="mb-3 text-2xl font-bold text-red-700">Access denied</h2>
          <div className="space-y-2 text-gray-600">
            <p>This page is available to admins only.</p>
            <div className="text-sm italic text-red-500">Mod list management requires an admin account.</div>
          </div>
        </motion.div>
      </motion.div>
    );
  }

  return (
    <motion.div className="space-y-6" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
      <motion.div className="rounded-xl border border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 p-6">
        <h2 className="mb-3 text-2xl font-bold text-blue-700">Mod List Manager</h2>
        <div className="space-y-2 text-gray-600">
          <p>Manage mods, hashes, and MD5 values. Admin reads support the encrypted mod list response.</p>
          <ul className="list-disc list-inside space-y-1 text-sm">
            <li>Supports add, edit, and delete flows</li>
            <li>Supports JSON-based batch add</li>
            <li>JSON mode does not overwrite the full dataset</li>
          </ul>
        </div>
      </motion.div>

      <motion.div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-800">
            <FaList className="text-blue-500" />
            Mods
          </h3>
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-gray-700">
            <input type="checkbox" checked={jsonMode} onChange={(event) => setJsonMode(event.target.checked)} />
            JSON mode
          </label>
        </div>

        {!jsonMode ? (
          <div className="space-y-4">
            <div className="flex gap-3">
              <motion.button
                onClick={() => {
                  resetForm();
                  setShowAdd(true);
                }}
                className="flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 font-medium text-white transition hover:bg-blue-600"
                whileTap={{ scale: 0.95 }}
              >
                <FaPlus className="h-4 w-4" />
                Add mod
              </motion.button>
              <motion.button
                onClick={() => setShowExample(true)}
                className="rounded-lg bg-gray-500 px-4 py-2 font-medium text-white transition hover:bg-gray-600"
                whileTap={{ scale: 0.95 }}
              >
                Batch example
              </motion.button>
            </div>

            <div className="space-y-2">
              {mods.map((mod, idx) => (
                <motion.div
                  key={mod.id}
                  className="flex items-center justify-between rounded-lg border-2 border-gray-200 bg-gray-50 p-3"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: idx * 0.04 }}
                  whileHover={{ backgroundColor: "#f0f9ff" }}
                >
                  <div>
                    <div className="font-medium text-gray-800">{mod.name}</div>
                    <div className="mt-1 text-xs text-gray-500">
                      {mod.hash ? `Hash: ${mod.hash}` : "Hash: none"}
                      {mod.md5 ? ` | MD5: ${mod.md5}` : ""}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <motion.button
                      onClick={() => openEdit(mod)}
                      className="rounded bg-yellow-500 px-3 py-1 text-sm font-medium text-white transition hover:bg-yellow-600"
                      whileTap={{ scale: 0.95 }}
                    >
                      <span className="inline-flex items-center gap-1">
                        <FaEdit className="h-3 w-3" />
                        Edit
                      </span>
                    </motion.button>
                    <motion.button
                      onClick={() => {
                        setSelectedId(mod.id);
                        setDeleteCode("");
                        setShowDelete(true);
                      }}
                      className="rounded bg-red-500 px-3 py-1 text-sm font-medium text-white transition hover:bg-red-600"
                      whileTap={{ scale: 0.95 }}
                    >
                      <span className="inline-flex items-center gap-1">
                        <FaTrash className="h-3 w-3" />
                        Delete
                      </span>
                    </motion.button>
                  </div>
                </motion.div>
              ))}

              {mods.length === 0 ? (
                <div className="py-8 text-center text-gray-500">
                  <FaList className="mx-auto mb-4 h-12 w-12 text-gray-300" />
                  No mods found.
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <textarea
              value={jsonValue}
              onChange={(event) => setJsonValue(event.target.value)}
              rows={12}
              readOnly={!jsonEdit}
              className="min-h-[180px] w-full rounded-lg border-2 border-gray-200 px-3 py-2 font-mono text-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <div className="flex gap-3">
              <motion.button
                onClick={handleBatchAddClick}
                disabled={!jsonEdit}
                className="rounded-lg bg-blue-500 px-4 py-2 font-medium text-white transition hover:bg-blue-600 disabled:opacity-50"
                whileTap={{ scale: 0.95 }}
              >
                Batch add
              </motion.button>
              <motion.button
                onClick={() => setJsonEdit((current) => !current)}
                className={`rounded-lg px-4 py-2 font-medium text-white transition ${
                  jsonEdit ? "bg-gray-500 hover:bg-gray-600" : "bg-blue-500 hover:bg-blue-600"
                }`}
                whileTap={{ scale: 0.95 }}
              >
                {jsonEdit ? "Cancel edit" : "Edit JSON"}
              </motion.button>
              <motion.button
                onClick={() => notifyInfo("JSON mode is for batch add only and does not replace all existing mods.")}
                className="rounded-lg bg-slate-500 px-4 py-2 font-medium text-white transition hover:bg-slate-600"
                whileTap={{ scale: 0.95 }}
              >
                Notes
              </motion.button>
            </div>
          </div>
        )}
      </motion.div>

      <Modal open={showAdd} title="Add mod" onClose={() => setShowAdd(false)}>
        <div className="space-y-4">
          <Field label="Name" value={name} onChange={setName} placeholder="Enter mod name" />
          <Field label="Modify code" value={code} onChange={setCode} placeholder="Enter modify code" type="password" />
          <Field label="Hash" value={hash} onChange={setHash} placeholder="Enter hash" />
          <Field label="MD5" value={md5} onChange={setMd5} placeholder="Enter MD5 (optional)" />
        </div>
        <div className="mt-6 flex gap-3">
          <motion.button
            onClick={() => setShowAdd(false)}
            className="flex-1 rounded-lg bg-gray-500 px-4 py-2 font-medium text-white transition hover:bg-gray-600"
            whileTap={{ scale: 0.95 }}
          >
            Cancel
          </motion.button>
          <motion.button
            onClick={handleAdd}
            className="flex-1 rounded-lg bg-blue-500 px-4 py-2 font-medium text-white transition hover:bg-blue-600"
            whileTap={{ scale: 0.95 }}
          >
            Save
          </motion.button>
        </div>
      </Modal>

      <Modal
        open={showEdit}
        title="Edit mod"
        onClose={() => {
          setShowEdit(false);
          resetForm();
        }}
      >
        <div className="space-y-4">
          <Field label="Name" value={name} onChange={setName} placeholder="Enter mod name" />
          <Field label="Modify code" value={code} onChange={setCode} placeholder="Enter modify code" type="password" />
          <Field label="Hash" value={hash} onChange={setHash} placeholder="Enter hash" />
          <Field label="MD5" value={md5} onChange={setMd5} placeholder="Enter MD5 (optional)" />
        </div>
        <div className="mt-6 flex gap-3">
          <motion.button
            onClick={() => {
              setShowEdit(false);
              resetForm();
            }}
            className="flex-1 rounded-lg bg-gray-500 px-4 py-2 font-medium text-white transition hover:bg-gray-600"
            whileTap={{ scale: 0.95 }}
          >
            Cancel
          </motion.button>
          <motion.button
            onClick={handleEdit}
            className="flex-1 rounded-lg bg-blue-500 px-4 py-2 font-medium text-white transition hover:bg-blue-600"
            whileTap={{ scale: 0.95 }}
          >
            Save
          </motion.button>
        </div>
      </Modal>

      <Modal
        open={showDelete}
        title="Delete mod"
        onClose={() => {
          setShowDelete(false);
          setSelectedId(null);
          setDeleteCode("");
        }}
      >
        <div className="space-y-4">
          <p className="text-gray-600">Enter the modify code to confirm deletion.</p>
          <Field
            label="Modify code"
            value={deleteCode}
            onChange={setDeleteCode}
            placeholder="Enter modify code"
            type="password"
          />
        </div>
        <div className="mt-6 flex gap-3">
          <motion.button
            onClick={() => {
              setShowDelete(false);
              setSelectedId(null);
              setDeleteCode("");
            }}
            className="flex-1 rounded-lg bg-gray-500 px-4 py-2 font-medium text-white transition hover:bg-gray-600"
            whileTap={{ scale: 0.95 }}
          >
            Cancel
          </motion.button>
          <motion.button
            onClick={handleDelete}
            className="flex-1 rounded-lg bg-red-500 px-4 py-2 font-medium text-white transition hover:bg-red-600"
            whileTap={{ scale: 0.95 }}
          >
            Delete
          </motion.button>
        </div>
      </Modal>

      <Modal open={showBatchCode} title="Enter modify code" onClose={() => setShowBatchCode(false)}>
        <div className="space-y-4">
          <Field
            label="Modify code"
            value={batchCode}
            onChange={setBatchCode}
            placeholder="Enter modify code"
            type="password"
          />
        </div>
        <div className="mt-6 flex gap-3">
          <motion.button
            onClick={() => setShowBatchCode(false)}
            className="flex-1 rounded-lg bg-gray-500 px-4 py-2 font-medium text-white transition hover:bg-gray-600"
            whileTap={{ scale: 0.95 }}
          >
            Cancel
          </motion.button>
          <motion.button
            onClick={handleBatchAddSubmit}
            className="flex-1 rounded-lg bg-blue-500 px-4 py-2 font-medium text-white transition hover:bg-blue-600"
            whileTap={{ scale: 0.95 }}
          >
            Run
          </motion.button>
        </div>
      </Modal>

      <Modal open={showExample} title="Batch add example" onClose={() => setShowExample(false)}>
        <div className="space-y-4">
          <div className="font-medium text-gray-700">JSON payload</div>
          <pre className="overflow-x-auto rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm font-mono">
            {batchAddExample}
          </pre>
          <div className="text-sm text-gray-600">`id` is optional and will be generated by the server.</div>
        </div>
        <div className="mt-6 text-right">
          <motion.button
            onClick={() => setShowExample(false)}
            className="rounded-lg bg-blue-500 px-6 py-2 font-medium text-white transition hover:bg-blue-600"
            whileTap={{ scale: 0.95 }}
          >
            Close
          </motion.button>
        </div>
      </Modal>
    </motion.div>
  );
};

export default ModListEditor;
