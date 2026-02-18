import mongoose from "mongoose";

export interface IArchive {
  archiveName: string;
  archiveFileName: string;
  createdAt: Date;
  createdBy: string;
  sourceDirectory: string;
  databaseLogsIncluded: number;
  fileSystemLogsIncluded: number;
  totalFiles: number;
  originalTotalSize: number;
  compressedTotalSize: number;
  overallCompressionRatio: string;
  compressionType: string;
  includePattern?: string;
  excludePattern?: string;
  files: Array<{
    fileName: string;
    originalSize: number;
    modifiedAt: string;
    source: string;
  }>;
  ipfsUpload: {
    enabled: boolean;
    uploadedFiles: number;
    failedFiles: number;
    totalFiles: number;
    uploadResults: Array<{
      archiveFileName: string;
      ipfsCid: string | null;
      ipfsUrl: string | null;
      web2Url: string | null;
      fileSize: number;
      uploadSuccess: boolean;
      error?: string;
    }>;
    uploadedAt: string;
  };
}

const ArchiveSchema = new mongoose.Schema<IArchive>(
  {
    archiveName: { type: String, required: true },
    archiveFileName: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    createdBy: { type: String, required: true },
    sourceDirectory: { type: String, required: true },
    databaseLogsIncluded: { type: Number, default: 0 },
    fileSystemLogsIncluded: { type: Number, default: 0 },
    totalFiles: { type: Number, required: true },
    originalTotalSize: { type: Number, required: true },
    compressedTotalSize: { type: Number, required: true },
    overallCompressionRatio: { type: String, required: true },
    compressionType: { type: String, default: "tar.gz" },
    includePattern: { type: String, default: null },
    excludePattern: { type: String, default: null },
    files: [
      {
        fileName: { type: String, required: true },
        originalSize: { type: Number, required: true },
        modifiedAt: { type: String, required: true },
        source: { type: String, required: true },
      },
    ],
    ipfsUpload: {
      enabled: { type: Boolean, default: true },
      uploadedFiles: { type: Number, default: 0 },
      failedFiles: { type: Number, default: 0 },
      totalFiles: { type: Number, default: 0 },
      uploadResults: [
        {
          archiveFileName: { type: String, required: true },
          ipfsCid: { type: String, default: null },
          ipfsUrl: { type: String, default: null },
          web2Url: { type: String, default: null },
          fileSize: { type: Number, required: true },
          uploadSuccess: { type: Boolean, required: true },
          error: { type: String, default: null },
        },
      ],
      uploadedAt: { type: String, required: true },
    },
  },
  {
    collection: "archives",
    timestamps: true,
  },
);

// 创建索引
ArchiveSchema.index({ archiveName: 1 });
ArchiveSchema.index({ createdAt: -1 });
ArchiveSchema.index({ createdBy: 1 });
ArchiveSchema.index({ "ipfsUpload.uploadResults.ipfsCid": 1 });

const ArchiveModel = mongoose.model<IArchive>("Archive", ArchiveSchema);

export default ArchiveModel;
