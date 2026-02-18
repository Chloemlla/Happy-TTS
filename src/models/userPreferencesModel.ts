import mongoose, { type Document, Schema } from "mongoose";
import type { NotificationSettings, PrivacySettings, RecommendationSettings } from "../types/recommendation";

// 推荐设置子文档Schema
const RecommendationSettingsSchema = new Schema<RecommendationSettings>(
  {
    enabledCategories: { type: [String], default: [] },
    disabledCategories: { type: [String], default: [] },
    preferredLanguages: { type: [String], default: [] },
    preferredVoices: { type: [String], default: [] },
  },
  { _id: false },
);

// 通知设置子文档Schema
const NotificationSettingsSchema = new Schema<NotificationSettings>(
  {
    emailNotifications: { type: Boolean, default: true },
    collaborationAlerts: { type: Boolean, default: true },
    weeklyDigest: { type: Boolean, default: false },
  },
  { _id: false },
);

// 隐私设置子文档Schema
const PrivacySettingsSchema = new Schema<PrivacySettings>(
  {
    shareUsageData: { type: Boolean, default: false },
    allowAnalytics: { type: Boolean, default: true },
  },
  { _id: false },
);

export interface IUserPreferences extends Document {
  userId: string;
  recommendationSettings: RecommendationSettings;
  notificationSettings: NotificationSettings;
  privacySettings: PrivacySettings;
  updatedAt: Date;
}

const UserPreferencesSchema = new Schema<IUserPreferences>(
  {
    userId: { type: String, required: true, unique: true },
    recommendationSettings: { type: RecommendationSettingsSchema, default: () => ({}) },
    notificationSettings: { type: NotificationSettingsSchema, default: () => ({}) },
    privacySettings: { type: PrivacySettingsSchema, default: () => ({}) },
    updatedAt: { type: Date, default: Date.now },
  },
  { collection: "user_preferences" },
);

// 索引
UserPreferencesSchema.index({ userId: 1 }, { unique: true });
UserPreferencesSchema.index({ updatedAt: -1 });

export default mongoose.models.UserPreferences ||
  mongoose.model<IUserPreferences>("UserPreferences", UserPreferencesSchema);
