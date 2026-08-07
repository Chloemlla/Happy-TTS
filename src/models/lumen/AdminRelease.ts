import { mongoose } from "../../services/mongoService.js";

export interface IAdminReleaseAsset {
  abi: string;
  name: string;
  url: string;
  sha256: string;
  sizeBytes: number;
  contentType: string;
}

export interface IAdminReleasePatch {
  fromVersionCode: number;
  fromSha256: string;
  toSha256: string;
  patchUrl: string;
  patchSha256: string;
  algorithm: string;
  sizeBytes: number;
}

export interface IAdminRelease {
  _id: string;
  versionCode: number;
  versionName: string;
  channel: string;
  releaseUrl: string;
  sha256: string;
  assets: IAdminReleaseAsset[];
  patches: IAdminReleasePatch[];
  rollout: string;
  forceUpdate: boolean;
  createdAt: number;
}

const AdminReleaseAssetSchema = new mongoose.Schema<IAdminReleaseAsset>(
  {
    abi: { type: String },
    name: { type: String },
    url: { type: String },
    sha256: { type: String },
    sizeBytes: { type: Number },
    contentType: { type: String },
  },
  { _id: false },
);

const AdminReleasePatchSchema = new mongoose.Schema<IAdminReleasePatch>(
  {
    fromVersionCode: { type: Number },
    fromSha256: { type: String },
    toSha256: { type: String },
    patchUrl: { type: String },
    patchSha256: { type: String },
    algorithm: { type: String },
    sizeBytes: { type: Number },
  },
  { _id: false },
);

const AdminReleaseSchema = new mongoose.Schema<IAdminRelease>(
  {
    _id: { type: String },
    versionCode: { type: Number },
    versionName: { type: String },
    channel: { type: String },
    releaseUrl: { type: String },
    sha256: { type: String },
    assets: [AdminReleaseAssetSchema],
    patches: [AdminReleasePatchSchema],
    rollout: { type: String },
    forceUpdate: { type: Boolean },
    createdAt: { type: Number },
  },
  { strict: true, timestamps: false, collection: "admin_releases" },
);

AdminReleaseSchema.index({ versionCode: 1 });
AdminReleaseSchema.index({ channel: 1 });

const AdminRelease =
  (mongoose.models.AdminRelease as mongoose.Model<IAdminRelease>) ||
  mongoose.model<IAdminRelease>("AdminRelease", AdminReleaseSchema);

export { AdminRelease, AdminReleaseSchema };