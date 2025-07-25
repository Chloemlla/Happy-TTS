import React, { useEffect, useState } from 'react';
import { usePasskey } from '../hooks/usePasskey';
import { formatDate } from '../utils/date';
import { KeyRoundIcon, PlusIcon, Trash2Icon, AlertTriangle } from 'lucide-react';
import { useNotification } from './Notification';
import { motion, AnimatePresence } from 'framer-motion';
import { renderCredentialIdModal } from './ui/CredentialIdModal';

export const PasskeySetup: React.FC = () => {
    const {
        credentials,
        isLoading,
        loadCredentials,
        registerAuthenticator,
        removeAuthenticator,
        authenticateWithPasskey,
        showModal,
        setShowModal,
        currentCredentialId,
        setCurrentCredentialId
    } = usePasskey();
    const { setNotification } = useNotification();

    const [isOpen, setIsOpen] = useState(false);
    const [credentialName, setCredentialName] = useState('');
    const [removingId, setRemovingId] = useState<string | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

    // 浏览器Passkey支持性检测（异步）
    const [isPasskeySupported, setIsPasskeySupported] = useState<boolean | null>(null);
    useEffect(() => {
        if (typeof window !== 'undefined' && window.PublicKeyCredential && typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function') {
            window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
                .then((result: boolean) => setIsPasskeySupported(result))
                .catch(() => setIsPasskeySupported(false));
        } else {
            setIsPasskeySupported(false);
        }
    }, []);

    useEffect(() => {
        loadCredentials();
    }, [loadCredentials]);

    // 打印 credentials 用于线上排查
    useEffect(() => {
        console.log('credentials:', credentials);
    }, [credentials]);

    // 注册 Passkey
    const handleRegister = async () => {
        if (!credentialName.trim()) return;
        try {
            await registerAuthenticator(credentialName);
            setNotification({ message: 'Passkey 注册成功', type: 'success' });
        } catch {
            setNotification({ message: 'Passkey 注册失败', type: 'error' });
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
            setNotification({ message: 'Passkey 已删除', type: 'success' });
        } catch {
            setNotification({ message: '删除失败', type: 'error' });
        }
        setRemovingId(null);
        setConfirmDeleteId(null);
    };

    return (
        <>
            {isPasskeySupported === false && (
                <div className="bg-yellow-100 border border-yellow-300 text-yellow-800 rounded-lg p-4 mb-4 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-yellow-500" />
                    <span>当前浏览器不支持 Passkey（无密码认证）。请使用最新版 Chrome、Edge、Safari，且确保使用 HTTPS 访问。</span>
                </div>
            )}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
                className="space-y-4 bg-white rounded-2xl p-6 shadow-lg"
            >
                {/* 新增：Passkey唯一性提示 */}
                <div className="mb-4">
                    <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded-lg px-4 py-3 flex items-center gap-2">
                        <KeyRoundIcon className="w-5 h-5 text-blue-400" />
                        <div>
                            <span className="font-semibold block">每个账户仅允许设置<strong>一个</strong>Passkey作为无密码验证方式。</span>
                            <span className="text-xs text-blue-600 mt-1 block">如需更换设备或认证方式，请先删除原有Passkey后再注册新Passkey。</span>
                        </div>
                    </div>
                </div>
                <div className="flex justify-between items-center mb-2">
                    <h2 className="text-2xl font-bold flex items-center gap-2">
                        <KeyRoundIcon className="w-7 h-7 text-indigo-500" />
                        Passkey 无密码认证
                    </h2>
                    {/* 删除右侧添加按钮 */}
                </div>
                <div className="w-full flex flex-col items-center justify-center">
                    <div className="w-full flex justify-center">
                        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 w-full max-w-2xl justify-center items-center">
                            <AnimatePresence>
                                {Array.isArray(credentials) && credentials.length > 0 && credentials.map((credential) => (
                                    <motion.div
                                        key={credential.id}
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.95 }}
                                        transition={{ duration: 0.3 }}
                                        className="group bg-white rounded-xl shadow-md border hover:shadow-2xl transition-all p-5 flex flex-row justify-between items-start gap-2 min-h-[120px] mx-auto w-full max-w-xs"
                                        whileHover={{ scale: 1.03, boxShadow: '0 8px 32px 0 rgba(99,102,241,0.15)' }}
                                    >
                                        <div className="flex items-center gap-2 flex-1 min-w-0">
                                            <KeyRoundIcon className="w-5 h-5 text-indigo-500 flex-shrink-0" />
                                            <div className="min-w-0">
                                                <div className="font-semibold text-base truncate">{credential.name}</div>
                                                <div className="text-xs text-gray-400 mt-1 truncate">添加时间：{formatDate(credential.createdAt)}</div>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => handleRemove(credential.id)}
                                            disabled={isLoading || removingId === credential.id}
                                            className="ml-2 flex items-center justify-center bg-white rounded-full p-1 border border-red-100 hover:bg-red-50 text-red-500 hover:text-red-700 shadow-sm z-10"
                                            title="删除"
                                        >
                                            {removingId === credential.id ? (
                                                <span className="animate-spin w-4 h-4 sm:w-5 sm:h-5 border-2 border-red-500 border-t-transparent rounded-full"></span>
                                            ) : (
                                                <Trash2Icon className="w-4 h-4 sm:w-5 sm:h-5" />
                                            )}
                                        </button>
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        </div>
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
                                <motion.button
                                    onClick={() => setIsOpen(true)}
                                    className="mt-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-lg px-6 py-2 shadow-lg flex items-center gap-2 font-semibold"
                                    whileTap={{ scale: 0.97 }}
                                >
                                    <PlusIcon className="w-5 h-5" /> 立即添加 Passkey
                                </motion.button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
                {/* 删除确认弹窗 */}
                {confirmDeleteId && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.3 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
                    >
                        <motion.div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-2">
                            <div className="flex items-center gap-2 mb-4">
                                <AlertTriangle className="text-red-500 w-6 h-6" />
                                <span className="font-bold text-lg">确认删除</span>
                            </div>
                            <div className="text-gray-600 mb-6">确定要删除这个 Passkey 吗？此操作不可恢复。</div>
                            <div className="flex justify-end gap-2">
                                <motion.button
                                    onClick={() => setConfirmDeleteId(null)}
                                    disabled={isLoading}
                                    className="border border-indigo-200 text-indigo-600 hover:bg-indigo-50 rounded-lg px-4 py-2 transition disabled:opacity-50"
                                    whileTap={{ scale: 0.97 }}
                                >取消</motion.button>
                                <motion.button
                                    onClick={handleRemoveConfirm}
                                    disabled={isLoading}
                                    className="bg-red-600 hover:bg-red-700 text-white rounded-lg px-4 py-2 transition disabled:opacity-50"
                                    whileTap={{ scale: 0.97 }}
                                >
                                    {isLoading ? (
                                        <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"></span>
                                    ) : null}
                                    确认删除
                                </motion.button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
                {/* 添加 Passkey 弹窗 */}
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.3 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
                    >
                        <motion.div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-2">
                            <div className="flex items-center gap-2 mb-4">
                                <KeyRoundIcon className="text-indigo-500 w-6 h-6" />
                                <span className="font-bold text-lg">注册新的 Passkey</span>
                            </div>
                            <div className="mb-4 text-gray-700">
                                <div className="mb-2">Passkey 支持指纹、面容、Windows Hello、手机等安全认证方式。</div>
                                <div className="text-sm text-blue-700 bg-blue-50 rounded px-2 py-1 mt-2">
                                    <strong>注意：</strong>每个账户<strong>只能设置一个</strong>Passkey，注册新Passkey会覆盖旧的。<br/>
                                    建议在常用且安全的设备上设置。若设备丢失或更换，请及时删除原有Passkey并重新注册。
                                </div>
                            </div>
                            <div className="space-y-2 mb-6">
                                <label htmlFor="name" className="text-sm font-medium">Passkey 名称</label>
                                <input
                                    id="name"
                                    placeholder="例如：Google Password Manager"
                                    value={credentialName}
                                    onChange={(e) => setCredentialName(e.target.value)}
                                    autoFocus
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition-all"
                                />
                            </div>
                            <div className="flex justify-end gap-2">
                                <motion.button
                                    onClick={() => setIsOpen(false)}
                                    disabled={isLoading}
                                    className="border border-indigo-200 text-indigo-600 hover:bg-indigo-50 rounded-lg px-4 py-2 transition disabled:opacity-50"
                                    whileTap={{ scale: 0.97 }}
                                >取消</motion.button>
                                <motion.button
                                    onClick={handleRegister}
                                    disabled={isLoading || !credentialName.trim()}
                                    className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-4 py-2 transition disabled:opacity-50"
                                    whileTap={{ scale: 0.97 }}
                                >
                                    {isLoading ? (
                                        <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"></span>
                                    ) : null}
                                    注册
                                </motion.button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </motion.div>
            {/* 替换 CredentialIdModal 为 renderCredentialIdModal 渲染 */}
            {renderCredentialIdModal({ open: showModal, credentialId: currentCredentialId, onClose: () => setShowModal(false) })}
        </>
    );
}; 