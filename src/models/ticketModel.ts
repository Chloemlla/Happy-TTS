import { mongoose } from "../services/mongoService";

const ticketAiProviderFailureSchema = new mongoose.Schema(
  {
    baseUrl: { type: String, required: true },
    model: { type: String, required: true },
    status: { type: Number },
    code: { type: String },
    message: { type: String, required: true },
    occurredAt: { type: Date, required: true },
  },
  { _id: false },
);

const ticketAiErrorDetailsSchema = new mongoose.Schema(
  {
    reason: {
      type: String,
      enum: ["no_provider_configured", "all_providers_failed"],
      required: true,
    },
    summary: { type: String, required: true },
    attempts: { type: [ticketAiProviderFailureSchema], default: [] },
    occurredAt: { type: Date, required: true },
  },
  { _id: false },
);

const ticketMessageSchema = new mongoose.Schema({
  senderId: { type: String, required: true },
  senderRole: { type: String, enum: ["user", "admin", "ai"], required: true },
  content: { type: String, required: true },
  isAi: { type: Boolean, default: false },
  aiErrorDetails: { type: ticketAiErrorDetailsSchema },
  createdAt: { type: Date, default: Date.now },
});

const ticketSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    username: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    status: {
      type: String,
      enum: ["open", "in-progress", "resolved", "closed"],
      default: "open",
      index: true,
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
    },
    messages: [ticketMessageSchema],
  },
  {
    collection: "tickets",
    timestamps: true,
  },
);

export const TicketModel = mongoose.models.Ticket || mongoose.model("Ticket", ticketSchema);

export interface ITicketAiProviderFailure {
  baseUrl: string;
  model: string;
  status?: number;
  code?: string;
  message: string;
  occurredAt: Date;
}

export interface ITicketAiErrorDetails {
  reason: "no_provider_configured" | "all_providers_failed";
  summary: string;
  attempts: ITicketAiProviderFailure[];
  occurredAt: Date;
}

export interface ITicketMessage {
  senderId: string;
  senderRole: "user" | "admin" | "ai";
  content: string;
  isAi?: boolean;
  aiErrorDetails?: ITicketAiErrorDetails;
  createdAt: Date;
}

export interface ITicket {
  _id: string;
  userId: string;
  username: string;
  title: string;
  description: string;
  status: "open" | "in-progress" | "resolved" | "closed";
  priority: "low" | "medium" | "high";
  messages: ITicketMessage[];
  createdAt: Date;
  updatedAt: Date;
}
