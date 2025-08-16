import mongoose, { Schema, Document } from 'mongoose';

export interface IFBIWanted extends Document {
  name: string;
  aliases: string[];
  age: number;
  height: string;
  weight: string;
  eyes: string;
  hair: string;
  race: string;
  nationality: string;
  dateOfBirth: Date;
  placeOfBirth: string;
  charges: string[];
  description: string;
  reward: number;
  photoUrl: string;
  fingerprints: string[];
  lastKnownLocation: string;
  dangerLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
  status: 'ACTIVE' | 'CAPTURED' | 'DECEASED' | 'REMOVED';
  dateAdded: Date;
  lastUpdated: Date;
  fbiNumber: string;
  ncicNumber: string;
  occupation: string;
  scarsAndMarks: string[];
  languages: string[];
  caution: string;
  remarks: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const FBIWantedSchema: Schema<IFBIWanted> = new Schema<IFBIWanted>(
  {
    name: { type: String, required: true },
    aliases: [{ type: String }],
    age: { type: Number, required: true, min: 0, max: 150 },
    height: { type: String, default: '未知' },
    weight: { type: String, default: '未知' },
    eyes: { type: String, default: '未知' },
    hair: { type: String, default: '未知' },
    race: { type: String, default: '未知' },
    nationality: { type: String, default: '未知' },
    dateOfBirth: { type: Date, default: null },
    placeOfBirth: { type: String, default: '未知' },
    charges: [{ type: String, required: true }],
    description: { type: String, default: '' },
    reward: { type: Number, required: true, min: 0 },
    photoUrl: { type: String, default: '' },
    fingerprints: [{ type: String }],
    lastKnownLocation: { type: String, default: '' },
    dangerLevel: { 
      type: String, 
      enum: ['LOW', 'MEDIUM', 'HIGH', 'EXTREME'], 
      default: 'MEDIUM' 
    },
    status: { 
      type: String, 
      enum: ['ACTIVE', 'CAPTURED', 'DECEASED', 'REMOVED'], 
      default: 'ACTIVE' 
    },
    dateAdded: { type: Date, default: Date.now },
    lastUpdated: { type: Date, default: Date.now },
    fbiNumber: { type: String, unique: true, required: true },
    ncicNumber: { type: String, default: '' },
    occupation: { type: String, default: '' },
    scarsAndMarks: [{ type: String }],
    languages: [{ type: String }],
    caution: { type: String, default: '' },
    remarks: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// 添加索引以提高查询性能
FBIWantedSchema.index({ isActive: 1 });
FBIWantedSchema.index({ status: 1 });
FBIWantedSchema.index({ dangerLevel: 1 });
FBIWantedSchema.index({ dateAdded: -1 });
FBIWantedSchema.index({ name: 'text', description: 'text', charges: 'text' }); // 文本搜索索引

// 更新 lastUpdated 字段的中间件
FBIWantedSchema.pre('save', function(next) {
  this.lastUpdated = new Date();
  next();
});

export default mongoose.models.FBIWanted || mongoose.model<IFBIWanted>('FBIWanted', FBIWantedSchema);
