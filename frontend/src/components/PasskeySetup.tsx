import React, { useEffect, useState } from 'react';
import { usePasskey } from '../hooks/usePasskey';
import { formatDate } from '../utils/date';
import { FaKey, FaPlus, FaTrash, FaExclamationTriangle, FaTimes, FaBan, FaUserPlus } from 'react-icons/fa';
import { useNotification } from './Notification';
import { motion, AnimatePresence } from 'framer-motion';
import { renderCredentialIdModal } from './ui/CredentialIdModal';

interface PasskeySetupProps {
    onClose?: () => void;
}

export const PasskeySetup: React.FC<PasskeySetupProps> = ({ onClose }) => {
    const {
        credentials,
        isLoading,
        loadCredentials,
        registerAuthenticator,
        removeAuthenticator,
        showModal,
        setShowModal,
        currentCredentialId
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
        } catch (error) {
            console.error('Passkey registration failed:', error);
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
        } catch (error) {
            console.error('Passkey removal failed:', error);
            setNotification({ message: '删除失败', type: 'error' });
        }
        setRemovingId(null);
        setConfirmDeleteId(null);
    };

    return (
        <>
            {isPasskeySupported === false && (
                <motion.div 
                    className="bg-yellow-100 border border-yellow-300 text-yellow-800 rounded-lg p-3 sm:p-4 mb-4 flex items-start gap-2 sm:gap-3"
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                >
                    <FaExclamationTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                    <span className="text-xs sm:text-sm md:text-base leading-relaxed">当前浏览器不支持 Passkey（无密码认证）。请使用最新版 Chrome、Edge、Safari，且确保使用 HTTPS 访问。</span>
                </motion.div>
            )}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
                className="space-y-3 sm:space-y-4 bg-white rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-lg"
            >
                {/* 新增：Passkey唯一性提示 */}
                <motion.div 
                    className="mb-4"
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.1 }}
                >
                    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 text-blue-800 rounded-lg sm:rounded-xl px-3 sm:px-4 py-2 sm:py-3 flex items-start gap-2 sm:gap-3 shadow-sm">
                        <motion.div
                            whileHover={{ scale: 1.1, rotate: 5 }}
                            transition={{ type: "spring", stiffness: 300 }}
                        >
                            <FaKey className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                        </motion.div>
                        <div className="flex-1 min-w-0">
                            <span className="font-semibold block text-xs sm:text-sm md:text-base leading-relaxed">每个账户仅允许设置<strong>一个</strong>Passkey作为无密码验证方式。</span>
                            <span className="text-xs sm:text-sm text-blue-600 mt-0.5 sm:mt-1 block leading-relaxed">如需更换设备或认证方式，请先删除原有Passkey后再注册新Passkey。</span>
                        </div>
                    </div>
                </motion.div>
                <div className="mb-2">
                    <h2 className="text-lg sm:text-xl md:text-2xl font-bold flex items-center gap-2">
                        <FaKey className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7 text-indigo-500" />
                        <span className="truncate">Passkey 无密码认证</span>
                    </h2>
                </div>
                <div className="w-full flex flex-col items-center justify-center">
                    <div className="w-full flex justify-center px-2 sm:px-4">
                        <div className="grid gap-3 sm:gap-4 md:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 w-full max-w-7xl auto-rows-fr place-items-stretch">
                            <AnimatePresence>
                                {Array.isArray(credentials) && credentials.length > 0 ? credentials.map((credential, index) => (
                                    <motion.div
                                        key={credential.id}
                                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                                        animate={{ opacity: 1, scale: 1, y: 0 }}
                                        exit={{ opacity: 0, scale: 0.95, y: -20 }}
                                        transition={{ duration: 0.4, delay: index * 0.1 }}
                                        className="group bg-gradient-to-br from-white to-gray-50 rounded-lg sm:rounded-xl shadow-lg border border-gray-100 hover:shadow-2xl hover:border-indigo-200 transition-all duration-300 p-3 sm:p-4 md:p-5 flex flex-col gap-3 sm:gap-4 min-h-[100px] sm:min-h-[120px] md:min-h-[140px] w-full h-full"
                                        whileHover={{ scale: 1.03, y: -2, boxShadow: '0 12px 40px 0 rgba(99,102,241,0.2)' }}
                                    >
                                        <div className="flex items-center justify-center">
                                            <motion.div
                                                whileHover={{ scale: 1.2, rotate: 10 }}
                                                transition={{ type: "spring", stiffness: 400 }}
                                                className="p-2 sm:p-3 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-lg sm:rounded-xl"
                                            >
                                                <FaKey className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-600" />
                                            </motion.div>
                                        </div>
                                        <div className="text-center flex-1">
                                            <div className="font-semibold text-sm sm:text-base md:text-lg text-gray-800 mb-1">{credential.name}</div>
                                            <div className="text-xs sm:text-sm text-gray-500">添加时间：{formatDate(credential.createdAt)}</div>
                                        </div>
                                        <div className="flex justify-center">
                                            <motion.button
                                                onClick={() => handleRemove(credential.id)}
                                                disabled={isLoading || removingId === credential.id}
                                                className="flex items-center justify-center bg-white rounded-lg p-2 sm:p-2.5 border border-red-200 hover:bg-red-50 text-red-500 hover:text-red-700 shadow-sm transition-all duration-200"
                                                title="删除"
                                                whileHover={{ scale: 1.1 }}
                                                whileTap={{ scale: 0.95 }}
                                            >
                                                {removingId === credential.id ? (
                                                    <motion.span 
                                                        className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full"
                                                        animate={{ rotate: 360 }}
                                                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                                                    />
                                                ) : (
                                                    <FaTrash className="w-4 h-4" />
                                                )}
                                            </motion.button>
                                        </div>
                                    </motion.div>
                                )) : null}
                            </AnimatePresence>
                        </div>
                    </div>
                    <AnimatePresence>
                        {(!Array.isArray(credentials) || credentials.length === 0) && !isLoading && (
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 20 }}
                                transition={{ duration: 0.5 }}
                                className="flex flex-col items-center py-8 sm:py-12 text-gray-400"
                            >
                                <FaKey className="w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 mb-2 sm:mb-3" />
                                <div className="mb-2 text-base sm:text-lg text-center px-4">还没有添加任何 Passkey</div>
                                <motion.button
                                    onClick={() => setIsOpen(true)}
                                    className="mt-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-lg px-4 sm:px-6 py-2 sm:py-3 shadow-lg hover:shadow-xl flex items-center gap-2 font-semibold transition-all duration-200 text-sm sm:text-base"
                                    whileHover={{ scale: 1.05, y: -2 }}
                                    whileTap={{ scale: 0.97 }}
                                >
                                    <FaPlus className="w-3 h-3 sm:w-4 sm:h-4" /> <span className="whitespace-nowrap">立即添加 Passkey</span>
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
                        <motion.div className="bg-white rounded-2xl shadow-2xl p-6 sm:p-8 max-w-sm sm:max-w-md lg:max-w-lg w-full mx-4">
                            <div className="flex items-center gap-2 mb-3 sm:mb-4">
                                <FaExclamationTriangle className="text-red-500 w-5 h-5 sm:w-6 sm:h-6 flex-shrink-0" />
                                <span className="font-bold text-base sm:text-lg">确认删除</span>
                            </div>
                            <div className="text-gray-600 mb-4 sm:mb-6 text-sm sm:text-base leading-relaxed">确定要删除这个 Passkey 吗？此操作不可恢复。</div>
                            <div className="flex justify-end gap-2">
                                <motion.button
                                    onClick={() => setConfirmDeleteId(null)}
                                    disabled={isLoading}
                                    className="border border-indigo-200 text-indigo-600 hover:bg-indigo-50 rounded-lg px-4 py-2 transition disabled:opacity-50 flex items-center gap-2"
                                    whileTap={{ scale: 0.97 }}
                                >
                                    <FaBan className="w-4 h-4" />
                                    取消
                                </motion.button>
                                <motion.button
                                    onClick={handleRemoveConfirm}
                                    disabled={isLoading}
                                    className="bg-red-600 hover:bg-red-700 text-white rounded-lg px-3 sm:px-4 py-2 transition disabled:opacity-50 flex items-center justify-center gap-2 text-sm sm:text-base order-1 sm:order-2"
                                    whileTap={{ scale: 0.97 }}
                                >
                                    {isLoading ? (
                                        <motion.span 
                                            className="w-3 h-3 sm:w-4 sm:h-4 border-2 border-white border-t-transparent rounded-full"
                                            animate={{ rotate: 360 }}
                                            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                                        />
                                    ) : (
                                        <FaTrash className="w-4 h-4" />
                                    )}
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
                        <motion.div className="bg-white rounded-2xl shadow-2xl p-6 sm:p-8 max-w-sm sm:max-w-md lg:max-w-lg w-full mx-4">
                            <div className="flex items-center gap-2 mb-3 sm:mb-4">
                                <FaKey className="text-indigo-500 w-5 h-5 sm:w-6 sm:h-6 flex-shrink-0" />
                                <span className="font-bold text-base sm:text-lg">注册新的 Passkey</span>
                            </div>
                            <motion.div 
                                className="mb-4 text-gray-700"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.3, delay: 0.1 }}
                            >
                                <div className="mb-2 text-xs sm:text-sm md:text-base leading-relaxed">Passkey 支持指纹、面容、Windows Hello、手机等安全认证方式。</div>
                                <motion.div 
                                    className="text-xs sm:text-sm text-blue-700 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-md sm:rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 mt-2 leading-relaxed border border-blue-100"
                                    whileHover={{ scale: 1.02 }}
                                    transition={{ type: "spring", stiffness: 300 }}
                                >
                                    <strong>注意：</strong>每个账户<strong>只能设置一个</strong>Passkey，注册新Passkey会覆盖旧的。<br />
                                    建议在常用且安全的设备上设置。若设备丢失或更换，请及时删除原有Passkey并重新注册。
                                </motion.div>
                            </motion.div>
                            <div className="space-y-2 mb-4 sm:mb-6">
                                <label htmlFor="name" className="text-xs sm:text-sm font-medium">Passkey 名称</label>
                                <motion.input
                                    id="name"
                                    type="text"
                                    placeholder="例如：Google Password Manager"
                                    value={credentialName}
                                    onChange={(e) => setCredentialName(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !isLoading && credentialName.trim()) {
                                            handleRegister();
                                        }
                                    }}
                                    autoFocus
                                    className="w-full border-2 border-gray-200 rounded-lg px-3 sm:px-4 py-2 sm:py-3 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200 hover:border-gray-300 text-sm sm:text-base"
                                    maxLength={50}
                                    whileFocus={{ scale: 1.02 }}
                                />
                            </div>
                            <div className="flex justify-end gap-2">
                                <motion.button
                                    onClick={() => setIsOpen(false)}
                                    disabled={isLoading}
                                    className="border border-indigo-200 text-indigo-600 hover:bg-indigo-50 rounded-lg px-4 py-2 transition disabled:opacity-50 flex items-center gap-2"
                                    whileTap={{ scale: 0.97 }}
                                >
                                    <FaBan className="w-4 h-4" />
                                    取消
                                </motion.button>
                                <motion.button
                                    onClick={handleRegister}
                                    disabled={isLoading || !credentialName.trim()}
                                    className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-lg px-3 sm:px-4 py-2 transition disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg hover:shadow-xl text-sm sm:text-base order-1 sm:order-2"
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.97 }}
                                >
                                    {isLoading ? (
                                        <motion.span 
                                            className="w-4 h-4 border-2 border-white border-t-transparent rounded-full"
                                            animate={{ rotate: 360 }}
                                            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                                        />
                                    ) : (
                                        <FaUserPlus className="w-3 h-3 sm:w-4 sm:h-4" />
                                    )}
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