import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  FaBan,
  FaExclamationTriangle,
  FaKey,
  FaPlus,
  FaTimes,
  FaTrash,
  FaUserPlus,
} from 'react-icons/fa';
import { usePasskey } from '../hooks/usePasskey';
import { formatDate } from '../utils/date';
import { useNotification } from './Notification';
import { renderCredentialIdModal } from './ui/CredentialIdModal';
import {
  studioFieldClassName,
  studioGhostButtonClassName,
  studioModalCardClassName,
  studioPageFont,
  studioPrimaryButtonClassName,
} from './studioTheme';

interface PasskeySetupProps {
  onClose?: () => void;
  onChanged?: () => void;
}

export const PasskeySetup: React.FC<PasskeySetupProps> = ({ onClose, onChanged }) => {
  const {
    credentials,
    isLoading,
    loadCredentials,
    registerAuthenticator,
    removeAuthenticator,
    showModal,
    setShowModal,
    currentCredentialId,
  } = usePasskey();
  const { setNotification } = useNotification();

  const [isOpen, setIsOpen] = useState(false);
  const [credentialName, setCredentialName] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isPasskeySupported, setIsPasskeySupported] = useState<boolean | null>(null);
  const latestCredentialsRef = React.useRef(credentials);

  const hasCredential = Array.isArray(credentials) && credentials.length > 0;
  const singlePasskeyMessage = '每个账号仅可注册一个 Passkey。如需更换设备，请先删除当前 Passkey。';
  const registerBusy = isLoading || isRegistering;

  useEffect(() => {
    latestCredentialsRef.current = credentials;
  }, [credentials]);

  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      window.PublicKeyCredential &&
      typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function'
    ) {
      window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
        .then((result: boolean) => setIsPasskeySupported(result))
        .catch(() => setIsPasskeySupported(false));
    } else {
      setIsPasskeySupported(false);
    }
  }, []);

  useEffect(() => {
    void loadCredentials();
  }, [loadCredentials]);

  const closeRegisterModal = () => {
    setCredentialName('');
    setIsOpen(false);
  };

  const handleRegister = async () => {
    if (isRegistering) return;
    if (hasCredential) {
      closeRegisterModal();
      setNotification({ message: singlePasskeyMessage, type: 'warning' });
      return;
    }
    if (!credentialName.trim()) return;

    let registerResult: any = null;
    setIsRegistering(true);
    try {
      registerResult = await registerAuthenticator(credentialName.trim());

      if (registerResult?.errorMessage) {
        closeRegisterModal();
        setNotification({ message: registerResult.errorMessage, type: 'warning' });
        return;
      }

      const newId =
        registerResult?.id ||
        registerResult?.credential?.id ||
        registerResult?.attRespId ||
        registerResult?.finishData?.passkeyCredentials?.[0]?.id;

      const maxAttempts = 6;
      const delayMs = 500;
      let confirmed = false;

      for (let index = 0; index < maxAttempts; index += 1) {
        try {
          await loadCredentials();
        } catch (error) {
          console.warn('loadCredentials failed during confirmation', error);
        }

        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, 200));

        const list = latestCredentialsRef.current || [];
        if (newId) {
          if (list.find((credential: any) => credential.id === newId)) {
            confirmed = true;
            break;
          }
        } else if (list.find((credential: any) => String(credential.name).trim() === credentialName.trim())) {
          confirmed = true;
          break;
        }

        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }

      if (confirmed) {
        setNotification({ message: 'Passkey 注册成功并已确认', type: 'success' });
        closeRegisterModal();
        onChanged?.();
        return;
      }

      console.error('Passkey registration not confirmed after polling', registerResult);
      setNotification({
        message: 'Passkey 注册未确认，请稍后重试',
        type: 'error',
      });
    } catch (error) {
      console.error('Passkey registration failed:', error);
      setNotification({ message: 'Passkey 注册失败（请求错误）', type: 'error' });
    } finally {
      setIsRegistering(false);
    }
  };

  const handleRemoveConfirm = async () => {
    if (!confirmDeleteId) return;
    setRemovingId(confirmDeleteId);
    try {
      await removeAuthenticator(confirmDeleteId);
      setNotification({ message: 'Passkey 已删除', type: 'success' });
      onChanged?.();
    } catch (error) {
      console.error('Passkey removal failed:', error);
      setNotification({ message: '删除失败', type: 'error' });
    } finally {
      setRemovingId(null);
      setConfirmDeleteId(null);
    }
  };

  return (
    <div className="space-y-4" style={{ fontFamily: studioPageFont }}>
      {isPasskeySupported === false ? (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800"
        >
          <div className="flex gap-2">
            <FaExclamationTriangle className="mt-1 shrink-0" />
            <span>当前浏览器不支持 Passkey。请使用最新版 Chrome、Edge、Safari，并确保使用 HTTPS 访问。</span>
          </div>
        </motion.div>
      ) : null}

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24 }}
        className="rounded-[24px] border border-slate-200 bg-white/90 p-4 shadow-sm sm:p-5"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="flex min-w-0 gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white">
              <FaKey />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-slate-900">Passkey</h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                使用设备密钥或生物识别完成身份验证。
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                hasCredential
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-slate-200 bg-slate-50 text-slate-500'
              }`}
            >
              {hasCredential ? '已配置' : '未配置'}
            </span>
            {onClose ? (
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-slate-200 bg-white/80 p-2 text-slate-400 transition hover:border-slate-300 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2"
                aria-label="关闭 Passkey 设置"
                title="关闭"
              >
                <FaTimes />
              </button>
            ) : null}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm leading-6 text-slate-600">
          {singlePasskeyMessage}
        </div>

        <div className="mt-4 space-y-3">
          <AnimatePresence>
            {hasCredential
              ? credentials.map((credential) => (
                <motion.div
                  key={credential.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="flex flex-col gap-3 rounded-[22px] border border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-900">
                      {credential.name}
                    </div>
                    <div className="mt-1 text-xs text-slate-400">
                      添加时间：{formatDate(credential.createdAt)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(credential.id)}
                    disabled={isLoading || removingId === credential.id}
                    className={`${studioGhostButtonClassName} border-rose-200 text-rose-600 hover:border-rose-300 hover:text-rose-700 sm:w-auto`}
                  >
                    {removingId === credential.id ? (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-rose-200 border-t-rose-600" />
                    ) : (
                      <FaTrash />
                    )}
                    删除
                  </button>
                </motion.div>
              ))
              : null}
          </AnimatePresence>

          {!hasCredential && !isLoading ? (
            <div className="rounded-[22px] border border-dashed border-slate-200 bg-white/70 px-4 py-8 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
                <FaKey />
              </div>
              <div className="text-sm font-semibold text-slate-900">还没有 Passkey</div>
              <p className="mt-1 text-sm text-slate-500">添加后可使用设备密钥完成验证。</p>
            </div>
          ) : null}

          {isLoading && !hasCredential ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-slate-200 border-t-slate-900" />
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => setIsOpen(true)}
            disabled={isLoading || hasCredential || isPasskeySupported === false}
            className={`${studioPrimaryButtonClassName} w-full sm:w-auto`}
          >
            <FaPlus />
            添加 Passkey
          </button>
        </div>
      </motion.section>

      <AnimatePresence>
        {confirmDeleteId ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/30 p-4 backdrop-blur-sm"
            onClick={() => setConfirmDeleteId(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 18 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 18 }}
              className={`${studioModalCardClassName} max-w-md`}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-3 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
                  <FaExclamationTriangle />
                </div>
                <h3 className="text-lg font-semibold text-slate-900">删除 Passkey</h3>
              </div>
              <p className="text-sm leading-6 text-slate-500">
                删除后这个设备凭证将无法继续用于登录验证。
              </p>
              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setConfirmDeleteId(null)}
                  disabled={Boolean(removingId)}
                  className={`${studioGhostButtonClassName} w-full sm:w-auto`}
                >
                  <FaBan />
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => void handleRemoveConfirm()}
                  disabled={Boolean(removingId)}
                  className={`${studioPrimaryButtonClassName} w-full bg-rose-600 hover:bg-rose-700 sm:w-auto`}
                >
                  {removingId ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/50 border-t-white" />
                  ) : (
                    <FaTrash />
                  )}
                  确认删除
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {isOpen ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/30 p-4 backdrop-blur-sm"
            onClick={closeRegisterModal}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 18 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 18 }}
              className={`${studioModalCardClassName} max-w-md`}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-4 flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white">
                  <FaKey />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">添加 Passkey</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    建议使用当前最常用且安全的设备。
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="passkey-name" className="text-sm font-semibold text-slate-900">
                  Passkey 名称
                </label>
                <input
                  id="passkey-name"
                  type="text"
                  placeholder="例如：Windows Hello"
                  value={credentialName}
                  onChange={(event) => setCredentialName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !registerBusy && credentialName.trim()) {
                      void handleRegister();
                    }
                  }}
                  autoFocus
                  className={studioFieldClassName}
                  maxLength={50}
                />
              </div>

              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeRegisterModal}
                  disabled={registerBusy}
                  className={`${studioGhostButtonClassName} w-full sm:w-auto`}
                >
                  <FaBan />
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => void handleRegister()}
                  disabled={registerBusy || !credentialName.trim() || hasCredential}
                  className={`${studioPrimaryButtonClassName} w-full sm:w-auto`}
                >
                  {registerBusy ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/50 border-t-white" />
                  ) : (
                    <FaUserPlus />
                  )}
                  注册
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {renderCredentialIdModal({
        open: showModal,
        credentialId: currentCredentialId,
        onClose: () => setShowModal(false),
      })}
    </div>
  );
};
