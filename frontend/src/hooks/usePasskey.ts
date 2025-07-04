import { useState, useCallback } from 'react';
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import { passkeyApi, Authenticator } from '../api/passkey';
import { useToast } from './useToast';
import { useAuth } from './useAuth';

interface UsePasskeyReturn {
    credentials: Authenticator[];
    isLoading: boolean;
    loadCredentials: () => Promise<void>;
    registerAuthenticator: (name: string) => Promise<void>;
    removeAuthenticator: (id: string) => Promise<void>;
    authenticateWithPasskey: () => Promise<boolean>;
}

export const usePasskey = (): UsePasskeyReturn => {
    const [credentials, setCredentials] = useState<Authenticator[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const { showToast } = useToast();
    const { login } = useAuth();

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
        try {
            // 获取注册选项
            const optionsResponse = await passkeyApi.startRegistration(credentialName);

            // 调用浏览器的 Passkey API，用户可能会取消
            let attResp;
            try {
                attResp = await startRegistration({ optionsJSON: optionsResponse.data.options });
            } catch (error: any) {
                if (error?.name === 'NotAllowedError') {
                    showToast('用户取消了操作', 'error');
                } else {
                    showToast('注册 Passkey 失败', 'error');
                }
                return; // 只要失败，直接return，不再往下执行
            }

            // 完成注册
            await passkeyApi.finishRegistration(credentialName, attResp);
            showToast('Passkey 注册成功', 'success');
            await loadCredentials();
        } catch (error: any) {
            showToast('注册 Passkey 失败', 'error');
        } finally {
            setIsLoading(false);
        }
    }, [loadCredentials, showToast]);

    const authenticateWithPasskey = useCallback(async (): Promise<boolean> => {
        try {
            setIsLoading(true);
            
            // 获取认证选项
            const optionsResponse = await passkeyApi.startAuthentication();
            
            // 调用浏览器的 Passkey API
            const asseResp = await startAuthentication({ optionsJSON: optionsResponse.data.options });
            
            // 完成认证
            const response = await passkeyApi.finishAuthentication(asseResp);
            
            // 使用返回的令牌登录
            await login(response.data.token, response.data.user);
            
            showToast('Passkey 认证成功', 'success');
            return response.data.success || false;
        } catch (error: any) {
            if (error.name === 'NotAllowedError') {
                showToast('用户取消了操作', 'error');
            } else {
                showToast('Passkey 认证失败', 'error');
            }
            return false;
        } finally {
            setIsLoading(false);
        }
    }, [login, showToast]);

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

    return {
        credentials,
        isLoading,
        loadCredentials,
        registerAuthenticator,
        removeAuthenticator,
        authenticateWithPasskey
    };
}; 