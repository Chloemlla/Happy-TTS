import mongoose, { Schema, Document } from 'mongoose';

export interface IResource extends Document {
  title: string;
  description: string;
  downloadUrl: string;
  price: number;
  category: string;
  imageUrl: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ResourceSchema: Schema<IResource> = new Schema<IResource>(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    downloadUrl: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    category: { type: String, required: true },
    imageUrl: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// 添加索引以提高查询性能
ResourceSchema.index({ isActive: 1 });
ResourceSchema.index({ category: 1 });
ResourceSchema.index({ createdAt: -1 });
ResourceSchema.index({ title: 'text', description: 'text' }); // 文本搜索索引

export default mongoose.models.Resource || mongoose.model<IResource>('Resource', ResourceSchema); 