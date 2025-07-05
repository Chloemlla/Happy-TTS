import type { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/types';
import { api } from './api';

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

export const passkeyApi = {
    // 获取用户的 Passkey 凭证列表
    getCredentials: () => api.get<Authenticator[]>('/api/passkey/credentials'),
    
    // 开始注册 Passkey
    startRegistration: (credentialName: string) => 
        api.post<RegistrationOptions>('/api/passkey/register/start', { credentialName }),
    
    // 完成注册 Passkey
    finishRegistration: (credentialName: string, response: any) => 
        api.post('/api/passkey/register/finish', { credentialName, response }),
    
    // 开始认证
    startAuthentication: (username: string) => 
        api.post<AuthenticationOptions>('/api/passkey/authenticate/start', { username }),
    
    // 完成认证
    finishAuthentication: (username: string, response: any) => 
        api.post('/api/passkey/authenticate/finish', { username, response }),
    
    // 删除 Passkey 凭证
    removeCredential: (credentialId: string) => 
        api.delete(`/api/passkey/credentials/${credentialId}`)
};