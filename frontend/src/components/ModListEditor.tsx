import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence, HTMLMotionProps } from 'framer-motion';
import { useNotification } from './Notification';

interface Mod {
  id: string;
  name: string;
}

const fetchMods = async () => {
  const res = await fetch('/api/modlist');
  return (await res.json()).mods as Mod[];
};

const fetchModsJson = async () => {
  const res = await fetch('/api/modlist/json');
  return await res.json();
};

const addMod = async (name: string, code: string) => {
  const res = await fetch('/api/modlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, code })
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

const ModListEditor: React.FC = () => {
  const [mods, setMods] = useState<Mod[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState('');
  const [addCode, setAddCode] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editCode, setEditCode] = useState('');
  const [jsonMode, setJsonMode] = useState(false);
  const [jsonValue, setJsonValue] = useState('');
  const [jsonEdit, setJsonEdit] = useState(false);
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
    if (!addName || !addCode) {
      setNotification({ message: '请填写MOD名和修改码', type: 'error' });
      return;
    }
    const res = await addMod(addName, addCode);
    if (res.success) {
      setNotification({ message: '添加成功', type: 'success' });
      setShowAdd(false);
      setAddName('');
      setAddCode('');
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
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {mods.map(mod => (
                <li key={mod.id} style={{ display: 'flex', alignItems: 'center', marginBottom: 10, borderBottom: '1px solid #f0f0f0', padding: '8px 0' }}>
                  <span style={{ flex: 1, fontSize: 16 }}>{mod.name}</span>
                  <MyButton style={{ fontSize: 14, padding: '4px 14px' }} onClick={() => { setEditId(mod.id); setEditName(mod.name); setEditCode(''); }}>修改</MyButton>
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
              style={{ fontSize: 15, minHeight: 180, marginTop: 16 }}
            />
            <div style={{ marginTop: 8, display: 'flex', gap: 10 }}>
              <MyButton onClick={handleJsonSave} disabled={!jsonEdit}>保存</MyButton>
              <MyButton onClick={() => setJsonEdit(e => !e)} style={{ background: jsonEdit ? '#eee' : '#2563eb', color: jsonEdit ? '#333' : '#fff' }}>{jsonEdit ? '取消编辑' : '编辑JSON'}</MyButton>
            </div>
          </>
        )}
      </Card>
      {/* 添加MOD弹窗 */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="添加MOD">
        <MyInput placeholder="MOD名" value={addName} onChange={e => setAddName(e.target.value)} />
        <MyInput placeholder="修改码" value={addCode} onChange={e => setAddCode(e.target.value)} type="password" />
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
    </div>
  );
};

export default ModListEditor; 