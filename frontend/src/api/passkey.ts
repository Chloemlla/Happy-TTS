import type { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/types';
import { api, getApiBaseUrl } from './api';
import { PASSKEY_API_BASE, getPasskeyOrigin } from '../config/passkeyConfig';

export interface Authenticator {
    id: string;
    name: string;
    credentialID: string;
    credentialPublicKey: string;
    counter: number;
    createdAt: string;
}

export interface RegistrationOptions {
    options: PublicKeyCredentialCreationOptionsJSON;
}

export interface AuthenticationOptions {
    options: PublicKeyCredentialRequestOptionsJSON;
}

/**
 * 获取 Passkey 操作的 clientOrigin
 * 
 * 关键点：与普通 API 请求不同
 * - 普通 API: 向当前前端服务器发送 (getApiBaseUrl())
 * - Passkey API: 向统一的后端服务器发送 (PASSKEY_API_BASE)
 * 
 * 这确保所有前端创建的 Passkey 都使用同一个 RP_ID
 * 
 * 格式: https://api.hapxs.com (不包含路径)
 */
export const getClientOrigin = (): string => {
    return getPasskeyOrigin();  // 返回统一的 https://api.hapxs.com
};

export const passkeyApi = {
    // 获取用户的 Passkey 凭证列表
    // 注意：这个请求可以向 getApiBaseUrl() 发送（各前端可各自处理）
    // 但也可以向 PASSKEY_API_BASE 发送（后端统一处理）
    getCredentials: () => api.get<Authenticator[]>(`${getApiBaseUrl()}/api/passkey/credentials`),
    
    // 开始注册 Passkey - 向统一的 Passkey API 服务器发送
    // 这样生成的 Passkey 才能在所有四个前端中使用
    startRegistration: (credentialName: string) => 
        api.post<RegistrationOptions>(`${PASSKEY_API_BASE}/api/passkey/register/start`, { 
            credentialName,
            clientOrigin: getClientOrigin()  // 统一返回 https://api.hapxs.com
        }),
    
    // 完成注册 Passkey
    finishRegistration: (credentialName: string, response: any) => 
        api.post(`${PASSKEY_API_BASE}/api/passkey/register/finish`, { 
            credentialName, 
            response,
            clientOrigin: getClientOrigin()  // 统一返回 https://api.hapxs.com
        }),
    
    // 开始认证 - 向统一的 Passkey API 服务器发送
    startAuthentication: (username: string) => 
        api.post<AuthenticationOptions>(`${PASSKEY_API_BASE}/api/passkey/authenticate/start`, { 
            username,
            clientOrigin: getClientOrigin()  // 统一返回 https://api.hapxs.com
        }),
    
    // 完成认证
    finishAuthentication: (username: string, response: any) => 
        api.post(`${PASSKEY_API_BASE}/api/passkey/authenticate/finish`, { 
            username, 
            response,
            clientOrigin: getClientOrigin()  // 统一返回 https://api.hapxs.com
        }),
    
    // 删除 Passkey 凭证
    // 这个可以向各自的前端服务器发送
    removeCredential: (credentialId: string) => 
        api.delete(`${getApiBaseUrl()}/api/passkey/credentials/${credentialId}`)
};