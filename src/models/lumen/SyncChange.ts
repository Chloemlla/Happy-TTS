import { mongoose } from "../../services/mongoService.js";

export interface ISyncChange {
  _id: string;
  userId: string;
  cursor: number;
  change: {
    collection: string;
    operation: string;
    remoteId: string;
    payload: unknown;
    deviceInstallationId: string;
    updatedAt: number;
  };
}

const SyncChangeSchema = new mongoose.Schema<ISyncChange>(
  {
    _id: { type: String },
    userId: { type: String, required: true },
    cursor: { type: Number, unique: true },
    change: {
      type: new mongoose.Schema(
        {
          collection: { type: String },
          operation: { type: String },
          remoteId: { type: String },
          payload: { type: mongoose.Schema.Types.Mixed },
          deviceInstallationId: { type: String },
          updatedAt: { type: Number },
        },
        { _id: false },
      ),
    },
  },
  { strict: true, timestamps: false, collection: "sync_changes" },
);

SyncChangeSchema.index({ userId: 1, cursor: 1 });
SyncChangeSchema.index({ cursor: 1 }, { unique: true });

const SyncChange =
  (mongoose.models.SyncChange as mongoose.Model<ISyncChange>) ||
  mongoose.model<ISyncChange>("SyncChange", SyncChangeSchema);

export { SyncChange, SyncChangeSchema };