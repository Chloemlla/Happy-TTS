import { mongoose } from "../services/mongoService";

export interface ProjectLumenConfigDoc {
  key: string;
  value: string;
  desc?: string;
  updatedAt?: Date;
}

const ProjectLumenConfigSchema = new mongoose.Schema<ProjectLumenConfigDoc>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    value: {
      type: String,
      required: true,
    },
    desc: {
      type: String,
      default: "",
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { collection: "project_lumen_config" },
);

export const ProjectLumenConfigModel =
  (mongoose.models.ProjectLumenConfig as mongoose.Model<ProjectLumenConfigDoc>) ||
  mongoose.model<ProjectLumenConfigDoc>("ProjectLumenConfig", ProjectLumenConfigSchema);
