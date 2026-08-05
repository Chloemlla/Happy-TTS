import { mongoose } from "../../services/mongoService";

export interface IBackup {
  _id: string;
  userId: string;
  deviceInstallationId: string;
  schemaVersion: number;
  exportedAt: number;
  uploadedAt: number;
  backup: unknown;
}

const BackupSchema = new mongoose.Schema<IBackup>(
  {
    _id: { type: String },
    userId: { type: String, required: true },
    deviceInstallationId: { type: String },
    schemaVersion: { type: Number },
    exportedAt: { type: Number },
    uploadedAt: { type: Number },
    backup: { type: mongoose.Schema.Types.Mixed },
  },
  { strict: true, timestamps: false, collection: "backups" },
);

BackupSchema.index({ userId: 1, uploadedAt: 1 });

const Backup =
  (mongoose.models.Backup as mongoose.Model<IBackup>) ||
  mongoose.model<IBackup>("Backup", BackupSchema);

export { Backup, BackupSchema };