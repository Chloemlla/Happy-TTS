import { useState, useCallback } from 'react';
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import { webauthnApi, Authenticator } from '../api/webauthn';
import { useToast } from './useToast';
import { useAuth } from './useAuth';

export const useWebAuthn = () => {
    const [credentials, setCredentials] = useState<Authenticator[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const { showToast } = useToast();
    const { login } = useAuth();

    // 加载认证器列表
    const loadCredentials = useCallback(async () => {
        try {
            setIsLoading(true);
            const response = await webauthnApi.getCredentials();
            setCredentials(response.data);
        } catch (error) {
            showToast('加载认证器列表失败', 'error');
        } finally {
            setIsLoading(false);
        }
    }, [showToast]);

    // 注册新认证器
    const registerAuthenticator = useCallback(async (credentialName: string) => {
        try {
            setIsLoading(true);

            // 获取注册选项
            const optionsResponse = await webauthnApi.startRegistration(credentialName);
            
            // 调用浏览器的WebAuthn API
            const attResp = await startRegistration({
                optionsJSON: optionsResponse.data
            });

            // 完成注册
            await webauthnApi.finishRegistration(credentialName, attResp);
            
            showToast('认证器注册成功', 'success');
            await loadCredentials();
        } catch (error: any) {
            if (error.name === 'NotAllowedError') {
                showToast('用户取消了操作', 'error');
            } else {
                showToast('注册认证器失败', 'error');
            }
        } finally {
            setIsLoading(false);
        }
    }, [loadCredentials, showToast]);

    // 使用生物识别登录
    const authenticateWithBiometrics = useCallback(async () => {
        try {
            setIsLoading(true);

            // 获取认证选项
            const optionsResponse = await webauthnApi.startAuthentication();
            
            // 调用浏览器的WebAuthn API
            const asseResp = await startAuthentication({
                optionsJSON: optionsResponse.data
            });

            // 完成认证
            const response = await webauthnApi.finishAuthentication(asseResp);
            
            // 使用返回的令牌登录
            await login(response.data.token, response.data.user);
            
            showToast('生物识别登录成功', 'success');
        } catch (error: any) {
            if (error.name === 'NotAllowedError') {
                showToast('用户取消了操作', 'error');
            } else {
                showToast('生物识别登录失败', 'error');
            }
        } finally {
            setIsLoading(false);
        }
    }, [login, showToast]);

    // 删除认证器
    const removeAuthenticator = useCallback(async (credentialId: string) => {
        try {
            setIsLoading(true);
            await webauthnApi.removeCredential(credentialId);
            showToast('认证器已删除', 'success');
            await loadCredentials();
        } catch (error) {
            showToast('删除认证器失败', 'error');
        } finally {
            setIsLoading(false);
        }
    }, [loadCredentials, showToast]);

    return {
        credentials,
        isLoading,
        loadCredentials,
        registerAuthenticator,
        authenticateWithBiometrics,
        removeAuthenticator
    };
}; 