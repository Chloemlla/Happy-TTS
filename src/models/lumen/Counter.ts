import { mongoose } from "../../services/mongoService.js";

export interface ICounter {
  _id: string;
  value: number;
}

const CounterSchema = new mongoose.Schema<ICounter>(
  {
    _id: { type: String },
    value: { type: Number, default: 0 },
  },
  { strict: true, timestamps: false, collection: "counters" },
);

CounterSchema.static("increment", async function (id: string, by: number = 1): Promise<number> {
  const result = await this.findByIdAndUpdate(id, { $inc: { value: by } }, { new: true, upsert: true }).lean();
  return result?.value ?? by;
});

const Counter =
  (mongoose.models.Counter as mongoose.Model<ICounter>) ||
  mongoose.model<ICounter>("Counter", CounterSchema);

export { Counter, CounterSchema };