import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence, HTMLMotionProps } from 'framer-motion';
import { useNotification } from './Notification';

// Mod 类型扩展
interface Mod {
  id: string;
  name: string;
  hash?: string;
  md5?: string;
}

const fetchMods = async (withHash = false, withMd5 = false) => {
  let url = '/api/modlist';
  const params = [];
  if (withHash) params.push('withHash=1');
  if (withMd5) params.push('withMd5=1');
  if (params.length) url += '?' + params.join('&');
  const res = await fetch(url);
  return (await res.json()).mods as Mod[];
};

const fetchModsJson = async (withHash = false, withMd5 = false) => {
  let url = '/api/modlist/json';
  const params = [];
  if (withHash) params.push('withHash=1');
  if (withMd5) params.push('withMd5=1');
  if (params.length) url += '?' + params.join('&');
  const res = await fetch(url);
  return await res.json();
};

const addMod = async (name: string, code: string, hash?: string, md5?: string) => {
  const res = await fetch('/api/modlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, code, hash, md5 })
  });
  return await res.json();
};

const updateMod = async (id: string, name: string, code: string) => {
  const res = await fetch(`/api/modlist/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, code })
  });
  return await res.json();
};

const deleteMod = async (id: string) => {
  const res = await fetch(`/api/modlist/${id}`, { method: 'DELETE' });
  return await res.json();
};

const batchAddMods = async (mods: Mod[]) => {
  const res = await fetch('/api/modlist/batch-add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(mods)
  });
  return await res.json();
};

const batchDeleteMods = async (ids: string[]) => {
  const res = await fetch('/api/modlist/batch-delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ids)
  });
  return await res.json();
};

// 自定义Textarea
const Textarea = (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea
    {...props}
    style={{
      width: '100%',
      border: '1px solid #ddd',
      borderRadius: 6,
      padding: 8,
      fontFamily: 'monospace',
      fontSize: 14,
      boxSizing: 'border-box',
      ...props.style
    }}
  />
);

// 自定义Switch
const Switch: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label?: string }> = ({ checked, onChange, label }) => (
  <label style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer', fontSize: 15 }}>
    <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ marginRight: 6 }} />
    {label}
  </label>
);

// 自定义按钮
const MyButton: React.FC<HTMLMotionProps<'button'>> = ({ children, style, ...props }) => (
  <motion.button
    whileTap={{ scale: 0.96 }}
    style={{
      background: '#2563eb',
      color: '#fff',
      border: 'none',
      borderRadius: 6,
      padding: '8px 18px',
      fontSize: 15,
      cursor: 'pointer',
      margin: 0,
      transition: 'background 0.2s',
      ...style
    }}
    {...props}
  >
    {children}
  </motion.button>
);

// 自定义输入框
const MyInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => (
  <input
    {...props}
    style={{
      width: '100%',
      padding: '8px 10px',
      border: '1px solid #ddd',
      borderRadius: 6,
      fontSize: 15,
      marginBottom: 10,
      boxSizing: 'border-box',
      ...props.style
    }}
  />
);

// 卡片容器
const Card: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div
    style={{
      background: '#fff',
      borderRadius: 12,
      boxShadow: '0 2px 16px 0 rgba(0,0,0,0.07)',
      padding: 24,
      margin: '0 auto',
      width: '100%',
      maxWidth: 600,
      ...style
    }}
  >
    {children}
  </div>
);

// 弹窗组件
const Modal: React.FC<{ open: boolean; onClose: () => void; children: React.ReactNode; title?: string }> = ({ open, onClose, children, title }) => (
  <AnimatePresence>
    {open && (
      <motion.div
        className="modal-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.18)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          style={{
            background: '#fff',
            borderRadius: 12,
            boxShadow: '0 4px 32px 0 rgba(0,0,0,0.13)',
            padding: 24,
            minWidth: 260,
            maxWidth: '90vw',
            width: 380,
            position: 'relative',
            zIndex: 1001,
          }}
          onClick={e => e.stopPropagation()}
        >
          {title && <div style={{ fontWeight: 600, fontSize: 18, marginBottom: 16 }}>{title}</div>}
          {children}
          <MyButton style={{ position: 'absolute', top: 12, right: 12, background: '#eee', color: '#333', padding: '2px 10px', fontSize: 18 }} onClick={onClose}>×</MyButton>
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
);

// 批量添加示例JSON
const batchAddExample = `[
  { "name": "mod1", "hash": "abc123", "md5": "d41d8cd98f00b204e9800998ecf8427e" },
  { "name": "mod2", "hash": "def456" }
]
// id 可省略，系统自动生成
`;

const ModListEditor: React.FC = () => {
  const [mods, setMods] = useState<Mod[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState('');
  const [addCode, setAddCode] = useState('');
  const [addHash, setAddHash] = useState('');
  const [addMd5, setAddMd5] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editCode, setEditCode] = useState('');
  const [jsonMode, setJsonMode] = useState(false);
  const [jsonValue, setJsonValue] = useState('');
  const [jsonEdit, setJsonEdit] = useState(false);
  const [showExample, setShowExample] = useState(false);
  const [showBatchCode, setShowBatchCode] = useState(false);
  const [batchCode, setBatchCode] = useState('');
  const [pendingBatchAction, setPendingBatchAction] = useState<'add' | 'delete' | null>(null);
  const [pendingBatchData, setPendingBatchData] = useState<any>(null);
  const { setNotification } = useNotification();

  const loadMods = async () => {
    if (jsonMode) {
      const data = await fetchModsJson();
      setJsonValue(JSON.stringify(data, null, 2));
    } else {
      setMods(await fetchMods());
    }
  };

  useEffect(() => {
    loadMods();
    // eslint-disable-next-line
  }, [jsonMode]);

  const handleAdd = async () => {
    if (!addName || !addCode || !addHash) {
      setNotification({ message: '请填写MOD名、修改码和Hash', type: 'error' });
      return;
    }
    const res = await addMod(addName, addCode, addHash, addMd5 || undefined);
    if (res.success) {
      setNotification({ message: '添加成功', type: 'success' });
      setShowAdd(false);
      setAddName('');
      setAddCode('');
      setAddHash('');
      setAddMd5('');
      loadMods();
    } else {
      setNotification({ message: res.error || '添加失败', type: 'error' });
    }
  };

  const handleEdit = async () => {
    if (!editId || !editName || !editCode) {
      setNotification({ message: '请填写完整', type: 'error' });
      return;
    }
    const res = await updateMod(editId, editName, editCode);
    if (res.success) {
      setNotification({ message: '修改成功', type: 'success' });
      setEditId(null);
      setEditName('');
      setEditCode('');
      loadMods();
    } else {
      setNotification({ message: res.error || '修改失败', type: 'error' });
    }
  };

  const handleJsonSave = async () => {
    setNotification({ message: '请通过UI方式修改，JSON仅供查看。', type: 'info' });
  };

  // 批量添加保存按钮点击
  const handleBatchAddClick = () => {
    setPendingBatchAction('add');
    setPendingBatchData(jsonValue);
    setShowBatchCode(true);
  };

  // 批量添加真正提交
  const handleBatchAddSubmit = async () => {
    let mods: Mod[] = [];
    try {
      mods = JSON.parse(pendingBatchData);
      if (!Array.isArray(mods)) throw new Error('格式错误');
    } catch {
      setNotification({ message: 'JSON格式错误', type: 'error' });
      setShowBatchCode(false);
      return;
    }
    // 给每个mod加code
    const modsWithCode = mods.map(m => ({ ...m, code: batchCode }));
    const res = await batchAddMods(modsWithCode);
    if (res.success) {
      setNotification({ message: '批量添加成功', type: 'success' });
      setShowBatchCode(false);
      setBatchCode('');
      setJsonEdit(false);
      loadMods();
    } else {
      setNotification({ message: res.error || '批量添加失败', type: 'error' });
      setShowBatchCode(false);
      setBatchCode('');
    }
  };

  return (
    <div style={{ maxWidth: 700, width: '95vw', margin: '40px auto', padding: '0 8px' }}>
      <Card>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>MOD列表管理</h2>
          <Switch checked={jsonMode} onChange={setJsonMode} label="JSON模式" />
        </div>
        {!jsonMode ? (
          <>
            <MyButton onClick={() => setShowAdd(true)} style={{ margin: '18px 0 16px 0' }}>添加MOD</MyButton>
            <MyButton style={{ marginLeft: 12, background: '#f1f5fa', color: '#2563eb', fontWeight: 500 }} onClick={() => setShowExample(true)}>批量添加示例</MyButton>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {mods.map(mod => (
                <li key={mod.id} style={{ display: 'flex', alignItems: 'center', marginBottom: 10, borderBottom: '1px solid #f0f0f0', padding: '8px 0' }}>
                  <span style={{ flex: 1, fontSize: 16 }}>{mod.name}</span>
                  <MyButton style={{ fontSize: 14, padding: '4px 14px', marginRight: 8 }} onClick={() => { setEditId(mod.id); setEditName(mod.name); setEditCode(''); }}>修改</MyButton>
                  <MyButton style={{ fontSize: 14, padding: '4px 14px', background: '#e11d48' }} onClick={async () => {
                    if (window.confirm('确定要删除该MOD吗？')) {
                      const res = await deleteMod(mod.id);
                      if (res.success) {
                        setNotification({ message: '删除成功', type: 'success' });
                        loadMods();
                      } else {
                        setNotification({ message: res.error || '删除失败', type: 'error' });
                      }
                    }
                  }}>删除</MyButton>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <Textarea
              value={jsonValue}
              onChange={e => setJsonValue((e.target as HTMLTextAreaElement).value)}
              rows={12}
              readOnly={!jsonEdit}
              style={{ fontSize: 15, minHeight: 180, marginTop: 16 } as React.CSSProperties}
            />
            <div style={{ marginTop: 8, display: 'flex', gap: 10 }}>
              <MyButton onClick={handleBatchAddClick} disabled={!jsonEdit}>保存</MyButton>
              <MyButton onClick={() => setJsonEdit(e => !e)} style={{ background: jsonEdit ? '#eee' : '#2563eb', color: jsonEdit ? '#333' : '#fff' }}>{jsonEdit ? '取消编辑' : '编辑JSON'}</MyButton>
            </div>
          </>
        )}
      </Card>
      {/* 添加MOD弹窗 */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="添加MOD">
        <MyInput placeholder="MOD名" value={addName} onChange={e => setAddName(e.target.value)} />
        <MyInput placeholder="修改码" value={addCode} onChange={e => setAddCode(e.target.value)} type="password" />
        <MyInput placeholder="Hash (必填)" value={addHash} onChange={e => setAddHash(e.target.value)} />
        <MyInput placeholder="MD5 (可选)" value={addMd5} onChange={e => setAddMd5(e.target.value)} />
        <div style={{ marginTop: 16, textAlign: 'right' }}>
          <MyButton onClick={handleAdd}>确定</MyButton>
        </div>
      </Modal>
      {/* 修改MOD弹窗 */}
      <Modal open={!!editId} onClose={() => setEditId(null)} title="修改MOD名">
        <MyInput placeholder="新MOD名" value={editName} onChange={e => setEditName(e.target.value)} />
        <MyInput placeholder="修改码" value={editCode} onChange={e => setEditCode(e.target.value)} type="password" />
        <div style={{ marginTop: 16, textAlign: 'right' }}>
          <MyButton onClick={handleEdit}>确定</MyButton>
        </div>
      </Modal>
      {/* 批量添加示例弹窗 */}
      <Modal open={showExample} onClose={() => setShowExample(false)} title="批量添加示例">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, type: 'spring', stiffness: 120 }}
          style={{ color: '#888', fontSize: 15 }}
        >
          <div style={{ fontWeight: 500, marginBottom: 8 }}>JSON格式：</div>
          <motion.pre
            whileHover={{ scale: 1.02, boxShadow: '0 4px 24px 0 rgba(37,99,235,0.10)' }}
            style={{ background: '#f8f8f8', padding: 14, borderRadius: 10, whiteSpace: 'pre-wrap', boxShadow: '0 2px 12px 0 rgba(0,0,0,0.04)', transition: 'box-shadow 0.2s', fontSize: 15 }}
          >
            {batchAddExample}
          </motion.pre>
          <div style={{ marginTop: 8 }}>说明：<span style={{ color: '#2563eb' }}>id 可省略，系统自动生成。</span></div>
        </motion.div>
      </Modal>
      {/* 批量操作修改码弹窗 */}
      <Modal open={showBatchCode} onClose={() => setShowBatchCode(false)} title="请输入修改码">
        <MyInput
          placeholder="请输入修改码"
          value={batchCode}
          onChange={e => setBatchCode(e.target.value)}
          type="password"
          style={{ marginBottom: 16 }}
        />
        <div style={{ textAlign: 'right' }}>
          <MyButton onClick={handleBatchAddSubmit} style={{ minWidth: 80 }}>确定</MyButton>
        </div>
      </Modal>
    </div>
  );
};

export default ModListEditor; 