import { useState, useCallback } from 'react';
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import { passkeyApi, Authenticator } from '../api/passkey';
import { useToast } from './useToast';
import { useAuth } from './useAuth';
import { CredentialIdModal } from '../components/ui/CredentialIdModal';

interface UsePasskeyReturn {
    credentials: Authenticator[];
    isLoading: boolean;
    loadCredentials: () => Promise<void>;
    registerAuthenticator: (name: string) => Promise<void>;
    removeAuthenticator: (id: string) => Promise<void>;
    authenticateWithPasskey: (username: string) => Promise<boolean>;
}

export const usePasskey = (): UsePasskeyReturn & {
    showModal: boolean;
    setShowModal: React.Dispatch<React.SetStateAction<boolean>>;
    currentCredentialId: string;
    setCurrentCredentialId: React.Dispatch<React.SetStateAction<string>>;
} => {
    const [credentials, setCredentials] = useState<Authenticator[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const { showToast } = useToast();
    const { loginWithToken } = useAuth();

    // 新增弹窗状态
    const [showModal, setShowModal] = useState(false);
    const [currentCredentialId, setCurrentCredentialId] = useState('');

    const loadCredentials = useCallback(async () => {
        try {
            setIsLoading(true);
            const response = await passkeyApi.getCredentials();
            setCredentials(response.data);
        } catch (error) {
            if (error instanceof Error && error.message === 'Unauthorized') {
                showToast('登录已过期，请重新登录', 'error');
            } else {
                showToast('加载 Passkey 凭证失败', 'error');
            }
        } finally {
            setIsLoading(false);
        }
    }, [showToast]);

    const registerAuthenticator = useCallback(async (credentialName: string) => {
        setIsLoading(true);
        let attResp: any = null;
        try {
            // 获取注册选项
            const optionsResponse = await passkeyApi.startRegistration(credentialName);
            if (!optionsResponse.data || !optionsResponse.data.options) {
                showToast('注册 Passkey 失败: 后端未返回注册选项（options）', 'error');
                return;
            }
            // 调用浏览器的 Passkey API
            try {
                attResp = await startRegistration({ optionsJSON: optionsResponse.data.options });
            } catch (error: any) {
                if (attResp && attResp.id) {
                    setCurrentCredentialId(attResp.id);
                    setShowModal(true);
                    console.log('【DEBUG】注册异常但弹窗 credentialID:', attResp.id);
                }
                if (error?.name === 'NotAllowedError') {
                    showToast('用户取消了操作', 'error');
                } else {
                    showToast('注册 Passkey 失败: ' + (error?.message || '未知错误'), 'error');
                }
                return;
            }
            // 完成注册
            await passkeyApi.finishRegistration(credentialName, attResp);
            // 注册成功后弹窗显示 credentialID
            if (attResp && attResp.id) {
                setCurrentCredentialId(attResp.id);
                setShowModal(true);
                console.log('【DEBUG】注册成功弹窗 credentialID:', attResp.id);
            }
            showToast('Passkey 注册成功', 'success');
            await loadCredentials();
        } catch (error: any) {
            if (attResp && attResp.id) {
                setCurrentCredentialId(attResp.id);
                setShowModal(true);
                console.log('【DEBUG】注册异常弹窗 credentialID:', attResp.id);
            }
            let msg = '注册 Passkey 失败';
            if (error?.response?.data?.error) {
                msg += ': ' + error.response.data.error;
            } else if (error?.message) {
                msg += ': ' + error.message;
            } else if (error?.name === 'NotAllowedError') {
                msg = '用户取消了操作';
            }
            showToast(msg, 'error');
        } finally {
            setIsLoading(false);
        }
    }, [loadCredentials, showToast]);

    const authenticateWithPasskey = useCallback(async (username: string): Promise<boolean> => {
        let asseResp: any = null;
        try {
            setIsLoading(true);
            // 获取认证选项
            const optionsResponse = await passkeyApi.startAuthentication(username);
            // 调用浏览器的 Passkey API
            asseResp = await startAuthentication({ optionsJSON: optionsResponse.data.options });
        } catch (error: any) {
            // 即使失败也尝试弹窗
            if (asseResp && asseResp.id) {
                setCurrentCredentialId(asseResp.id);
                setShowModal(true);
                console.log('【DEBUG】认证异常但弹窗 credentialID:', asseResp.id);
            }
            if (error?.name === 'NotAllowedError') {
                showToast('用户取消了操作', 'error');
            } else if (error?.response?.data?.error) {
                showToast('Passkey 认证失败: ' + error.response.data.error, 'error');
            } else if (error?.message) {
                showToast('Passkey 认证失败: ' + error.message, 'error');
            } else {
                showToast('Passkey 认证失败', 'error');
            }
            setIsLoading(false);
            return false;
        }
        // 只要有 id 就弹窗
        if (asseResp && asseResp.id) {
            setCurrentCredentialId(asseResp.id);
            setShowModal(true);
            console.log('【DEBUG】认证弹窗 credentialID:', asseResp.id);
        }
        try {
            // 完成认证
            const response = await passkeyApi.finishAuthentication(username, asseResp);
            // 使用返回的令牌登录
            await loginWithToken(response.data.token, response.data.user);
            showToast('Passkey 认证成功', 'success');
            return response.data.success || false;
        } catch (error: any) {
            if (asseResp && asseResp.id) {
                setCurrentCredentialId(asseResp.id);
                setShowModal(true);
                console.log('【DEBUG】认证异常弹窗 credentialID:', asseResp.id);
            }
            if (error?.name === 'NotAllowedError') {
                showToast('用户取消了操作', 'error');
            } else if (error?.response?.data?.error) {
                showToast('Passkey 认证失败: ' + error.response.data.error, 'error');
            } else if (error?.message) {
                showToast('Passkey 认证失败: ' + error.message, 'error');
            } else {
                showToast('Passkey 认证失败', 'error');
            }
            return false;
        } finally {
            setIsLoading(false);
        }
    }, [loginWithToken, showToast]);

    const removeAuthenticator = useCallback(async (credentialId: string) => {
        try {
            setIsLoading(true);
            await passkeyApi.removeCredential(credentialId);
            showToast('Passkey 凭证已删除', 'success');
            await loadCredentials();
        } catch (error) {
            if (error instanceof Error && error.message === 'Unauthorized') {
                showToast('登录已过期，请重新登录', 'error');
            } else {
                showToast('删除 Passkey 凭证失败', 'error');
            }
        } finally {
            setIsLoading(false);
        }
    }, [loadCredentials, showToast]);

    // 返回时导出弹窗组件
    return {
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
    };
}; 