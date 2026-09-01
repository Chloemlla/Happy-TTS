import { mongoose } from "../../services/mongoService.js";

export interface ILifecycleEvent {
  _id: string;
  userId: string;
  deviceInstallationId: string;
  eventType: string;
  processName: string;
  reason: string;
  selfHealed: boolean;
  restartCount: number;
  clientReportedAt: number;
  receivedAt: number;
  metadata: unknown;
  /** D3: TTL anchor. Mongo TTL needs a Date, and `receivedAt` must stay epoch millis for the SDK. */
  ttlExpireAt?: Date;
}

const LifecycleEventSchema = new mongoose.Schema<ILifecycleEvent>(
  {
    _id: { type: String },
    userId: { type: String },
    deviceInstallationId: { type: String },
    eventType: { type: String },
    processName: { type: String },
    reason: { type: String },
    selfHealed: { type: Boolean },
    restartCount: { type: Number },
    clientReportedAt: { type: Number },
    receivedAt: { type: Number },
    metadata: { type: mongoose.Schema.Types.Mixed },
    ttlExpireAt: { type: Date },
  },
  { strict: true, timestamps: false, collection: "lifecycle_events" },
);

LifecycleEventSchema.index({ receivedAt: 1 });
LifecycleEventSchema.index({ userId: 1 });
LifecycleEventSchema.index({ ttlExpireAt: 1 }, { expireAfterSeconds: 0 });

const LifecycleEvent =
  (mongoose.models.LifecycleEvent as mongoose.Model<ILifecycleEvent>) ||
  mongoose.model<ILifecycleEvent>("LifecycleEvent", LifecycleEventSchema);

export { LifecycleEvent, LifecycleEventSchema };