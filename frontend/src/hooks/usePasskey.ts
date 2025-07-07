import { useState, useCallback } from 'react';
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import { passkeyApi, Authenticator } from '../api/passkey';
import { useToast } from './useToast';
import { useAuth } from './useAuth';
import { CredentialIdModal } from '../components/ui/CredentialIdModal';
import { DebugInfoModal } from '../components/DebugInfoModal';

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
    showDebugModal: boolean;
    setShowDebugModal: React.Dispatch<React.SetStateAction<boolean>>;
    debugInfos: any[];
    addDebugInfo: (info: any) => void;
} => {
    const [credentials, setCredentials] = useState<Authenticator[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const { showToast } = useToast();
    const { loginWithToken } = useAuth();

    // 新增弹窗状态
    const [showModal, setShowModal] = useState(false);
    const [currentCredentialId, setCurrentCredentialId] = useState('');
    const [showDebugModal, setShowDebugModal] = useState(false);
    const [debugInfos, setDebugInfos] = useState<any[]>([]);

    // 添加调试信息的函数
    const addDebugInfo = useCallback((info: any) => {
        setDebugInfos(prev => [...prev, info]);
    }, []);

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
                    // 记录注册异常但弹窗 credentialID（不输出到控制台）
                    const registerErrorInfo = {
                        action: '注册异常但弹窗 credentialID',
                        credentialID: attResp.id,
                        timestamp: new Date().toISOString()
                    };
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
                // 记录注册成功弹窗 credentialID（不输出到控制台）
                const registerSuccessInfo = {
                    action: '注册成功弹窗 credentialID',
                    credentialID: attResp.id,
                    timestamp: new Date().toISOString()
                };
            }
            showToast('Passkey 注册成功', 'success');
            await loadCredentials();
        } catch (error: any) {
            if (attResp && attResp.id) {
                setCurrentCredentialId(attResp.id);
                setShowModal(true);
                // 记录注册异常弹窗 credentialID（不输出到控制台）
                const registerExceptionInfo = {
                    action: '注册异常弹窗 credentialID',
                    credentialID: attResp.id,
                    timestamp: new Date().toISOString()
                };
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
            
            // 记录传入的用户名
            addDebugInfo({
                action: '开始Passkey认证',
                username: username,
                timestamp: new Date().toISOString()
            });
            
            // 获取认证选项
            const optionsResponse = await passkeyApi.startAuthentication(username);
            
            // 记录API响应信息
            addDebugInfo({
                action: 'Passkey认证API响应',
                status: optionsResponse.status,
                hasData: !!optionsResponse.data,
                dataKeys: Object.keys(optionsResponse.data || {}),
                hasOptions: !!optionsResponse.data?.options,
                optionsKeys: optionsResponse.data?.options ? Object.keys(optionsResponse.data.options) : [],
                timestamp: new Date().toISOString()
            });
            
            // 记录认证选项信息
            addDebugInfo({
                action: 'Passkey认证选项',
                hasOptions: !!optionsResponse.data.options,
                optionsKeys: optionsResponse.data.options ? Object.keys(optionsResponse.data.options) : [],
                allowCredentials: optionsResponse.data.options?.allowCredentials?.length || 0,
                challenge: optionsResponse.data.options?.challenge?.substring(0, 20) + '...',
                allowCredentialsDetails: optionsResponse.data.options?.allowCredentials?.map((cred: any) => ({
                    id: cred.id?.substring(0, 20) + '...',
                    type: cred.type,
                    transports: cred.transports,
                    fullId: cred.id
                })),
                timestamp: new Date().toISOString()
            });
            
            // 调用浏览器的 Passkey API
            try {
                // 确保认证选项格式正确
                const options = optionsResponse.data.options;
                addDebugInfo({
                    action: '准备调用startAuthentication',
                    hasOptions: !!options,
                    optionsType: typeof options,
                    optionsKeys: Object.keys(options || {}),
                    allowCredentialsCount: options?.allowCredentials?.length || 0,
                    timestamp: new Date().toISOString()
                });
                
                asseResp = await startAuthentication({ optionsJSON: options });
                
                                            // 记录响应对象结构
                addDebugInfo({
                    action: 'Passkey认证响应对象',
                    hasId: !!asseResp.id,
                    hasRawId: !!asseResp.rawId,
                    hasResponse: !!asseResp.response,
                    type: asseResp.type,
                    idLength: asseResp.id?.length,
                    rawIdType: typeof asseResp.rawId,
                    rawIdByteLength: asseResp.rawId?.byteLength,
                    responseKeys: asseResp.response ? Object.keys(asseResp.response) : [],
                    idValue: asseResp.id?.substring(0, 20) + '...',
                    rawIdArray: asseResp.rawId ? Array.from(new Uint8Array(asseResp.rawId)).slice(0, 10) : null,
                    timestamp: new Date().toISOString()
                });
                
                // 确保响应对象包含必要的字段
                if (!asseResp.id && !asseResp.rawId) {
                    throw new Error('Passkey认证响应缺少credentialID字段');
                }
                
                // 如果只有rawId没有id，手动添加id字段
                if (asseResp.rawId && !asseResp.id) {
                    try {
                        // 将ArrayBuffer转换为base64url字符串
                        const uint8Array = new Uint8Array(asseResp.rawId);
                        const base64String = btoa(String.fromCharCode(...uint8Array));
                        // 转换为base64url格式（替换+为-，/为_，移除=）
                        asseResp.id = base64String.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
                        // 记录手动添加id字段
                        addDebugInfo({
                            action: '手动添加id字段',
                            idValue: asseResp.id.substring(0, 20) + '...',
                            timestamp: new Date().toISOString()
                        });
                    } catch (error) {
                        // 记录转换失败
                        addDebugInfo({
                            action: '转换rawId失败',
                            error: error instanceof Error ? error.message : String(error),
                            timestamp: new Date().toISOString()
                        });
                    }
                } else if (asseResp.id) {
                    // 如果已有id字段，确保它是base64url格式
                    if (asseResp.id.includes('+') || asseResp.id.includes('/') || asseResp.id.includes('=')) {
                        asseResp.id = asseResp.id.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
                        addDebugInfo({
                            action: '修复现有id字段格式',
                            originalId: asseResp.id,
                            fixedId: asseResp.id.substring(0, 20) + '...',
                            timestamp: new Date().toISOString()
                        });
                    }
                }
                
            } catch (error) {
                // 记录startAuthentication调用失败
                addDebugInfo({
                    action: 'startAuthentication调用失败',
                    error: error instanceof Error ? error.message : String(error),
                    timestamp: new Date().toISOString()
                });
                throw error;
            }
        } catch (error: any) {
            // 即使失败也尝试弹窗
            if (asseResp && asseResp.id) {
                setCurrentCredentialId(asseResp.id);
                setShowModal(true);
                // 记录认证异常但弹窗 credentialID
                addDebugInfo({
                    action: '认证异常但弹窗 credentialID',
                    credentialID: asseResp.id,
                    timestamp: new Date().toISOString()
                });
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
            // 记录认证弹窗 credentialID
            addDebugInfo({
                action: '认证弹窗 credentialID',
                credentialID: asseResp.id,
                timestamp: new Date().toISOString()
            });
        }
        try {
            // 认证成功后，直接将asseResp原始对象传递给后端，无需手动处理id/rawId
            const resp = await passkeyApi.finishAuthentication(username, asseResp);
            // 使用后端返回的令牌登录
            await loginWithToken(resp.data.token, resp.data.user);
            showToast('Passkey 认证成功', 'success');
            window.location.reload();
            return resp.data.success || false;
        } catch (error: any) {
            if (asseResp && asseResp.id) {
                setCurrentCredentialId(asseResp.id);
                setShowModal(true);
                // 记录认证异常弹窗 credentialID
                addDebugInfo({
                    action: '认证异常弹窗 credentialID',
                    credentialID: asseResp.id,
                    timestamp: new Date().toISOString()
                });
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
        setCurrentCredentialId,
        showDebugModal,
        setShowDebugModal,
        debugInfos,
        addDebugInfo
    };
}; 