import { mongoose } from "../services/mongoService";

/** OIDC id_token 签名公钥的 JWK 表示（RFC 7517，RS256）。 */
export interface OidcPublicJwk {
  kty: "RSA";
  use: "sig";
  alg: "RS256";
  kid: string;
  n: string;
  e: string;
}

/**
 * 单例文档：进程内的 OIDC id_token 签名密钥。
 *
 * `kid` 是 RFC 7638 指纹，因此同一把密钥在重启后仍然得到同一个 kid；私钥用
 * `select: false` 保护，只有显式 `.select("+privateKeyPem")` 的读取才能拿到。
 */
export interface OidcSigningKeyDoc {
  kid: string;
  privateKeyPem: string;
  publicJwk: OidcPublicJwk;
  active: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

const OidcPublicJwkSchema = new mongoose.Schema<OidcPublicJwk>(
  {
    kty: { type: String, required: true },
    use: { type: String, required: true },
    alg: { type: String, required: true },
    kid: { type: String, required: true },
    n: { type: String, required: true },
    e: { type: String, required: true },
  },
  { _id: false },
);

const OidcSigningKeySchema = new mongoose.Schema<OidcSigningKeyDoc>(
  {
    kid: {
      type: String,
      required: true,
      index: true,
    },
    privateKeyPem: {
      type: String,
      required: true,
      select: false,
    },
    publicJwk: {
      type: OidcPublicJwkSchema,
      required: true,
    },
    active: {
      type: Boolean,
      required: true,
      default: true,
      index: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { collection: "oidc_signing_keys" },
);

export const OidcSigningKeyModel =
  (mongoose.models.OidcSigningKey as mongoose.Model<OidcSigningKeyDoc>) ||
  mongoose.model<OidcSigningKeyDoc>("OidcSigningKey", OidcSigningKeySchema);
