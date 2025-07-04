import React, { useEffect, useState } from 'react';
import { usePasskey } from '../hooks/usePasskey';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Card } from './ui/Card';
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription } from './ui/Dialog';
import { formatDate } from '../utils/date';
import { KeyRoundIcon, PlusIcon, Trash2Icon, AlertTriangle } from 'lucide-react';
import { useToast } from '../hooks/useToast';
import { motion, AnimatePresence } from 'framer-motion';

export const PasskeySetup: React.FC = () => {
    const {
        credentials,
        isLoading,
        loadCredentials,
        registerAuthenticator,
        removeAuthenticator
    } = usePasskey();
    const { showToast } = useToast();

    const [isOpen, setIsOpen] = useState(false);
    const [credentialName, setCredentialName] = useState('');
    const [removingId, setRemovingId] = useState<string | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

    useEffect(() => {
        loadCredentials();
    }, [loadCredentials]);

    // 注册 Passkey
    const handleRegister = async () => {
        if (!credentialName.trim()) return;
        try {
            await registerAuthenticator(credentialName);
            showToast('Passkey 注册成功', 'success');
        } catch {
            showToast('Passkey 注册失败', 'error');
        }
        setCredentialName('');
        setIsOpen(false);
    };

    // 删除 Passkey（弹窗确认）
    const handleRemove = (id: string) => {
        setConfirmDeleteId(id);
    };

    const handleRemoveConfirm = async () => {
        if (!confirmDeleteId) return;
        setRemovingId(confirmDeleteId);
        try {
            await removeAuthenticator(confirmDeleteId);
            showToast('Passkey 已删除', 'success');
        } catch {
            showToast('删除失败', 'error');
        }
        setRemovingId(null);
        setConfirmDeleteId(null);
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="space-y-4 bg-white rounded-2xl p-6 shadow-lg"
        >
            <div className="flex justify-between items-center mb-2">
                <h2 className="text-2xl font-bold flex items-center gap-2">
                    <KeyRoundIcon className="w-7 h-7 text-indigo-500" />
                    Passkey 无密码认证
                </h2>
                <Button onClick={() => setIsOpen(true)} disabled={isLoading} className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-lg px-5 py-2 shadow-lg flex items-center gap-2 font-semibold">
                    <PlusIcon className="w-5 h-5" /> 添加 Passkey
                </Button>
            </div>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                <AnimatePresence>
                    {credentials.length > 0 && credentials.map((credential) => (
                        <motion.div
                            key={credential.id}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={{ duration: 0.3 }}
                            className="relative group bg-white rounded-xl shadow-md border hover:shadow-2xl transition-all p-5 flex flex-col gap-2 min-h-[120px]"
                            whileHover={{ scale: 1.03, boxShadow: '0 8px 32px 0 rgba(99,102,241,0.15)' }}
                        >
                            <div className="flex items-center gap-2">
                                <KeyRoundIcon className="w-5 h-5 text-indigo-500" />
                                <div>
                                    <div className="font-semibold text-base">{credential.name}</div>
                                    <div className="text-xs text-gray-400 mt-1">添加时间：{formatDate(credential.createdAt)}</div>
                                </div>
                            </div>
                            <button
                                onClick={() => handleRemove(credential.id)}
                                disabled={isLoading || removingId === credential.id}
                                className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity bg-white rounded-full p-1 border border-red-100 hover:bg-red-50 text-red-500 hover:text-red-700 shadow-sm"
                                title="删除"
                            >
                                {removingId === credential.id ? (
                                    <span className="animate-spin w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full"></span>
                                ) : (
                                    <Trash2Icon className="w-5 h-5" />
                                )}
                            </button>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>
            <AnimatePresence>
                {credentials.length === 0 && !isLoading && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        transition={{ duration: 0.5 }}
                        className="flex flex-col items-center py-12 text-gray-400"
                    >
                        <KeyRoundIcon className="w-14 h-14 mb-3" />
                        <div className="mb-2 text-lg">还没有添加任何 Passkey</div>
                        <Button onClick={() => setIsOpen(true)} className="mt-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-lg px-6 py-2 shadow-lg flex items-center gap-2 font-semibold">
                            <PlusIcon className="w-5 h-5" /> 立即添加 Passkey
                        </Button>
                    </motion.div>
                )}
            </AnimatePresence>
            {/* 删除确认弹窗 */}
            <Dialog open={!!confirmDeleteId} onOpenChange={v => !v && setConfirmDeleteId(null)}>
                <AnimatePresence>
                    {confirmDeleteId && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={{ duration: 0.3 }}
                        >
                            <DialogContent>
                                <DialogHeader>
                                    <div className="flex items-center gap-2">
                                        <AlertTriangle className="text-red-500 w-6 h-6" />
                                        <DialogTitle>确认删除</DialogTitle>
                                    </div>
                                    <DialogDescription>确定要删除这个 Passkey 吗？此操作不可恢复。</DialogDescription>
                                </DialogHeader>
                                <DialogFooter>
                                    <Button variant="outline" onClick={() => setConfirmDeleteId(null)} className="border-indigo-200 text-indigo-600 hover:bg-indigo-50">取消</Button>
                                    <Button onClick={handleRemoveConfirm} disabled={isLoading} className="bg-red-600 hover:bg-red-700 text-white">
                                        {isLoading ? (
                                            <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"></span>
                                        ) : null}
                                        确认删除
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </motion.div>
                    )}
                </AnimatePresence>
            </Dialog>
            {/* 添加 Passkey 弹窗 */}
            <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <AnimatePresence>
                    {isOpen && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={{ duration: 0.3 }}
                        >
                            <DialogContent>
                                <DialogHeader>
                                    <div className="flex items-center gap-2">
                                        <KeyRoundIcon className="text-indigo-500 w-6 h-6" />
                                        <DialogTitle>注册新的 Passkey</DialogTitle>
                                    </div>
                                    <DialogDescription>
                                        支持指纹、面容、Windows Hello、手机等安全认证
                                    </DialogDescription>
                                </DialogHeader>
                                <div className="space-y-4 py-4">
                                    <div className="space-y-2">
                                        <label htmlFor="name" className="text-sm font-medium">
                                            Passkey 名称
                                        </label>
                                        <Input
                                            id="name"
                                            placeholder="例如：Google Password Manager"
                                            value={credentialName}
                                            onChange={(e) => setCredentialName(e.target.value)}
                                            autoFocus
                                        />
                                    </div>
                                </div>
                                <DialogFooter>
                                    <Button
                                        variant="outline"
                                        onClick={() => setIsOpen(false)}
                                        disabled={isLoading}
                                        className="border-indigo-200 text-indigo-600 hover:bg-indigo-50"
                                    >
                                        取消
                                    </Button>
                                    <Button
                                        onClick={handleRegister}
                                        disabled={isLoading || !credentialName.trim()}
                                        className="bg-indigo-600 hover:bg-indigo-700 text-white"
                                    >
                                        {isLoading ? (
                                            <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"></span>
                                        ) : null}
                                        注册
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </motion.div>
                    )}
                </AnimatePresence>
            </Dialog>
        </motion.div>
    );
}; 