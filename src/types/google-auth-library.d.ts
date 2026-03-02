/**
 * google-auth-library 类型声明
 * 在未安装该依赖时提供类型支持，避免 TypeScript 编译错误
 */
declare module "google-auth-library" {
    export class OAuth2Client {
        constructor(clientId?: string, clientSecret?: string, redirectUri?: string);
        verifyIdToken(options: {
            idToken: string;
            audience?: string | string[];
        }): Promise<LoginTicket>;
    }

    export class LoginTicket {
        getPayload(): TokenPayload | undefined;
    }

    export interface TokenPayload {
        iss: string;
        azp: string;
        aud: string;
        sub: string;
        email?: string;
        email_verified?: boolean;
        name?: string;
        picture?: string;
        given_name?: string;
        family_name?: string;
        locale?: string;
        iat: number;
        exp: number;
    }
}
