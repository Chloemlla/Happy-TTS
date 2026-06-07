import { mongoose } from "../services/mongoService";

export type OAuthClientType = "confidential" | "public";

export interface OAuthClientDoc {
  clientId: string;
  clientSecretHash: string | null;
  type: OAuthClientType;
  name: string;
  description: string | null;
  homepageUrl: string | null;
  logoUrl: string | null;
  redirectUris: string[];
  allowedScopes: string[];
  ownerUserId: string;
  rateLimitPerMinute: number;
  enabled: boolean;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface OAuthAuthorizationCodeDoc {
  codeHash: string;
  clientId: string;
  userId: string;
  redirectUri: string;
  scopes: string[];
  codeChallenge: string | null;
  codeChallengeMethod: "plain" | "S256" | null;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface OAuthGrantDoc {
  grantId: string;
  clientId: string;
  userId: string;
  scopes: string[];
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface OAuthTokenDoc {
  tokenId: string;
  accessTokenHash: string;
  refreshTokenHash: string | null;
  clientId: string;
  userId: string;
  grantId: string;
  scopes: string[];
  accessTokenExpiresAt: Date;
  refreshTokenExpiresAt: Date | null;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  lastUsedIp: string | null;
  usageCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const OAuthClientSchema = new mongoose.Schema<OAuthClientDoc>(
  {
    clientId: { type: String, required: true, unique: true, index: true },
    clientSecretHash: { type: String, default: null, index: true },
    type: { type: String, enum: ["confidential", "public"], default: "confidential" },
    name: { type: String, required: true },
    description: { type: String, default: null },
    homepageUrl: { type: String, default: null },
    logoUrl: { type: String, default: null },
    redirectUris: { type: [String], required: true },
    allowedScopes: { type: [String], default: ["openid", "profile", "email", "admin:identity", "status"] },
    ownerUserId: { type: String, required: true, index: true },
    rateLimitPerMinute: { type: Number, default: 120, min: 1, max: 1000 },
    enabled: { type: Boolean, default: true, index: true },
    lastUsedAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

OAuthClientSchema.index({ ownerUserId: 1, createdAt: -1 });

const OAuthAuthorizationCodeSchema = new mongoose.Schema<OAuthAuthorizationCodeDoc>(
  {
    codeHash: { type: String, required: true, unique: true, index: true },
    clientId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    redirectUri: { type: String, required: true },
    scopes: { type: [String], required: true },
    codeChallenge: { type: String, default: null },
    codeChallengeMethod: { type: String, enum: ["plain", "S256", null], default: null },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

OAuthAuthorizationCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
OAuthAuthorizationCodeSchema.index({ clientId: 1, userId: 1, expiresAt: 1 });

const OAuthGrantSchema = new mongoose.Schema<OAuthGrantDoc>(
  {
    grantId: { type: String, required: true, unique: true, index: true },
    clientId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    scopes: { type: [String], required: true },
    revokedAt: { type: Date, default: null, index: true },
    lastUsedAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

OAuthGrantSchema.index({ clientId: 1, userId: 1 }, { unique: true });

const OAuthTokenSchema = new mongoose.Schema<OAuthTokenDoc>(
  {
    tokenId: { type: String, required: true, unique: true, index: true },
    accessTokenHash: { type: String, required: true, unique: true, index: true },
    refreshTokenHash: { type: String, default: null, index: true },
    clientId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    grantId: { type: String, required: true, index: true },
    scopes: { type: [String], required: true },
    accessTokenExpiresAt: { type: Date, required: true, index: true },
    refreshTokenExpiresAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null, index: true },
    lastUsedAt: { type: Date, default: null },
    lastUsedIp: { type: String, default: null },
    usageCount: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

OAuthTokenSchema.index(
  { refreshTokenExpiresAt: 1 },
  { expireAfterSeconds: 0, partialFilterExpression: { refreshTokenExpiresAt: { $ne: null } } },
);
OAuthTokenSchema.index({ clientId: 1, userId: 1, revokedAt: 1 });

export const OAuthClientModel =
  (mongoose.models.OAuthClient as mongoose.Model<OAuthClientDoc>) ||
  mongoose.model<OAuthClientDoc>("OAuthClient", OAuthClientSchema);

export const OAuthAuthorizationCodeModel =
  (mongoose.models.OAuthAuthorizationCode as mongoose.Model<OAuthAuthorizationCodeDoc>) ||
  mongoose.model<OAuthAuthorizationCodeDoc>("OAuthAuthorizationCode", OAuthAuthorizationCodeSchema);

export const OAuthGrantModel =
  (mongoose.models.OAuthGrant as mongoose.Model<OAuthGrantDoc>) ||
  mongoose.model<OAuthGrantDoc>("OAuthGrant", OAuthGrantSchema);

export const OAuthTokenModel =
  (mongoose.models.OAuthToken as mongoose.Model<OAuthTokenDoc>) ||
  mongoose.model<OAuthTokenDoc>("OAuthToken", OAuthTokenSchema);
