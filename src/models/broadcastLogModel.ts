import { mongoose } from "../services/mongoService";

const BroadcastLogSchema = new mongoose.Schema({
  message: { type: String, required: true },
  level: { type: String, default: "info" },
  title: String,
  duration: Number,
  display: { type: String, default: "toast" },
  format: { type: String, default: "text" },
  audience: { type: String, default: "all" },
  targetUserIds: { type: [String], default: [] },
  targetChannel: String,
  admin: String,
  connections: Number,
  createdAt: { type: Date, default: Date.now },
});

export function getBroadcastLogModel() {
  return mongoose.models.BroadcastLog || mongoose.model("BroadcastLog", BroadcastLogSchema);
}
