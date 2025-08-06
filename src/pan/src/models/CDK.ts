import mongoose, { Document, Schema } from 'mongoose';

export interface ICDK extends Document {
  code: string;
  resourceId: mongoose.Types.ObjectId;
  isUsed: boolean;
  usedAt?: Date;
  usedBy?: string;
  usedIp?: string;
  expiresAt?: Date;
  batchId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const cdkSchema = new Schema<ICDK>({
  code: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    uppercase: true,
    minlength: 8,
    maxlength: 50
  },
  resourceId: {
    type: Schema.Types.ObjectId,
    ref: 'Resource',
    required: true
  },
  isUsed: {
    type: Boolean,
    default: false
  },
  usedAt: {
    type: Date,
    default: null
  },
  usedBy: {
    type: String,
    trim: true,
    maxlength: 100,
    default: null
  },
  usedIp: {
    type: String,
    trim: true,
    maxlength: 45,
    default: null
  },
  expiresAt: {
    type: Date,
    default: null
  },
  batchId: {
    type: String,
    trim: true,
    maxlength: 100,
    default: null
  }
}, {
  timestamps: true
});

// 索引
cdkSchema.index({ code: 1 }, { unique: true });
cdkSchema.index({ resourceId: 1 });
cdkSchema.index({ isUsed: 1 });
cdkSchema.index({ batchId: 1 });
cdkSchema.index({ expiresAt: 1 });
cdkSchema.index({ createdAt: -1 });

// 虚拟字段：是否过期
cdkSchema.virtual('isExpired').get(function() {
  if (!this.expiresAt) return false;
  return new Date() > this.expiresAt;
});

// 虚拟字段：是否可用
cdkSchema.virtual('isAvailable').get(function() {
  return !this.isUsed && !this.isExpired;
});

// 确保虚拟字段在JSON序列化时包含
cdkSchema.set('toJSON', { virtuals: true });

// 静态方法：生成CDK代码
cdkSchema.statics.generateCode = function(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 16; i++) {
    if (i > 0 && i % 4 === 0) {
      result += '-';
    }
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// 静态方法：批量生成CDK
cdkSchema.statics.generateBatch = async function(
  resourceId: mongoose.Types.ObjectId,
  quantity: number,
  batchId: string,
  expiresAt?: Date
): Promise<ICDK[]> {
  const cdks: Partial<ICDK>[] = [];
  
  for (let i = 0; i < quantity; i++) {
    let code: string;
    let isUnique = false;
    
    // 确保代码唯一性
    while (!isUnique) {
      code = this.generateCode();
      const existing = await this.findOne({ code });
      if (!existing) {
        isUnique = true;
      }
    }
    
    cdks.push({
      code: code!,
      resourceId,
      batchId,
      expiresAt,
      isUsed: false
    });
  }
  
  return this.insertMany(cdks);
};

export const CDK = mongoose.model<ICDK>('CDK', cdkSchema);

export default CDK; 