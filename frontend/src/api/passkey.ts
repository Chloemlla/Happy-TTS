import type { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/typescript-types';
import { api } from './api';

export interface Authenticator {
    id: string;
    name: string;
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
    getCredentials: () => api.get<Authenticator[]>('/passkey/credentials'),
    
    // 开始注册 Passkey
    startRegistration: (credentialName: string) => 
        api.post<RegistrationOptions>('/passkey/register/start', { credentialName }),
    
    // 完成注册 Passkey
    finishRegistration: (credentialName: string, response: any) => 
        api.post('/passkey/register/finish', { credentialName, response }),
    
    // 开始认证
    startAuthentication: () => 
        api.post<AuthenticationOptions>('/passkey/authenticate/start'),
    
    // 完成认证
    finishAuthentication: (response: any) => 
        api.post('/passkey/authenticate/finish', { response }),
    
    // 删除 Passkey 凭证
    removeCredential: (credentialId: string) => 
        api.delete(`/passkey/credentials/${credentialId}`)
};