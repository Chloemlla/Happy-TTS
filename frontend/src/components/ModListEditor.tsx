import React, { useEffect, useState } from 'react';
import {
  Button,
  Card,
  Input
} from './ui';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from './ui/Dialog';
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

// 简单自定义Textarea
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
      ...props.style
    }}
  />
);

// 简单自定义Switch
const Switch: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label?: string }> = ({ checked, onChange, label }) => (
  <label style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
    <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ marginRight: 6 }} />
    {label}
  </label>
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
    <div style={{ maxWidth: 600, margin: '40px auto' }}>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>MOD列表管理</h2>
          <Switch checked={jsonMode} onChange={setJsonMode} label="JSON模式" />
        </div>
        {!jsonMode ? (
          <>
            <Button onClick={() => setShowAdd(true)} style={{ marginBottom: 16 }}>添加MOD</Button>
            <ul>
              {mods.map(mod => (
                <li key={mod.id} style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ flex: 1 }}>{mod.name}</span>
                  <Button size="sm" onClick={() => { setEditId(mod.id); setEditName(mod.name); setEditCode(''); }}>修改</Button>
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
            />
            <div style={{ marginTop: 8 }}>
              <Button onClick={handleJsonSave} disabled={!jsonEdit}>保存</Button>
              <Button onClick={() => setJsonEdit(e => !e)} style={{ marginLeft: 8 }}>{jsonEdit ? '取消编辑' : '编辑JSON'}</Button>
            </div>
          </>
        )}
      </Card>
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加MOD</DialogTitle>
          </DialogHeader>
          <Input placeholder="MOD名" value={addName} onChange={e => setAddName(e.target.value)} />
          <Input placeholder="修改码" value={addCode} onChange={e => setAddCode(e.target.value)} type="password" />
          <div style={{ marginTop: 16, textAlign: 'right' }}>
            <Button onClick={handleAdd}>确定</Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={!!editId} onOpenChange={v => { if (!v) setEditId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>修改MOD名</DialogTitle>
          </DialogHeader>
          <Input placeholder="新MOD名" value={editName} onChange={e => setEditName(e.target.value)} />
          <Input placeholder="修改码" value={editCode} onChange={e => setEditCode(e.target.value)} type="password" />
          <div style={{ marginTop: 16, textAlign: 'right' }}>
            <Button onClick={handleEdit}>确定</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ModListEditor; 