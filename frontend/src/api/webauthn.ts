import { api } from './api';
import type { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/typescript-types';

export interface Authenticator {
    id: string;
    name: string;
    credentialID: string;
    counter: number;
    createdAt: string;
}

export type RegistrationOptions = PublicKeyCredentialCreationOptionsJSON;
export type AuthenticationOptions = PublicKeyCredentialRequestOptionsJSON;

export const webauthnApi = {
    // 获取用户的认证器列表
    getCredentials: () => api.get<Authenticator[]>('/webauthn/credentials'),

    // 开始注册新认证器
    startRegistration: (credentialName: string) => 
        api.post<RegistrationOptions>('/webauthn/register/start', { credentialName }),

    // 完成注册
    finishRegistration: (credentialName: string, response: any) =>
        api.post('/webauthn/register/finish', { credentialName, response }),

    // 开始认证
    startAuthentication: () =>
        api.post<AuthenticationOptions>('/webauthn/authenticate/start'),

    // 完成认证
    finishAuthentication: (response: any) =>
        api.post('/webauthn/authenticate/finish', { response }),

    // 删除认证器
    removeCredential: (credentialId: string) =>
        api.delete(`/webauthn/credentials/${credentialId}`)
};