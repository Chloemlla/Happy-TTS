import type { Request } from "express";
import type { ApiKeyDoc } from "../models/apiKeyModel";
import type { User } from "../utils/userStorage";

/**
 * Narrow public OAuth token context attached to the request after oauthTokenAuth.
 * Keep this free of secrets / full token documents.
 */
export interface OAuthRequestContext {
  clientId: string;
  tokenId: string;
  scopes: string[];
  grantId: string;
}

/**
 * Discriminated auth context attached by session / API Key / OAuth middleware.
 * Controllers should prefer req.auth when present, with legacy req.user/apiKey/oauthToken
 * kept for compatibility.
 */
export type RequestAuthContext =
  | { kind: "session"; user: User }
  | { kind: "apiKey"; user: User; apiKey: ApiKeyDoc }
  | { kind: "oauth"; user: User; oauth: OAuthRequestContext };

export interface AuthenticatedRequest extends Request {
  user?: User;
  apiKey?: ApiKeyDoc;
  oauthToken?: OAuthRequestContext;
  oauthContext?: OAuthRequestContext;
  auth?: RequestAuthContext;
}

export function asAuthenticatedRequest(req: Request): AuthenticatedRequest {
  return req as AuthenticatedRequest;
}

export function hasApiCredential(req: AuthenticatedRequest): boolean {
  if (req.auth?.kind === "apiKey" || req.auth?.kind === "oauth") {
    return true;
  }
  return Boolean(req.apiKey || req.oauthToken);
}
