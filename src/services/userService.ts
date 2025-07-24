import { mongoose } from './mongoService';
import { User as UserType } from '../utils/userStorage';
import validator from 'validator';

const userSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  dailyUsage: { type: Number, default: 0 },
  lastUsageDate: { type: String },
  createdAt: { type: String },
  token: String,
  tokenExpiresAt: Number,
  totpSecret: String,
  totpEnabled: Boolean,
  backupCodes: [String],
  passkeyEnabled: Boolean,
  passkeyCredentials: [
    {
      id: String,
      name: String,
      credentialID: String,
      credentialPublicKey: String,
      counter: Number,
      createdAt: String,
    },
  ],
  pendingChallenge: String,
  currentChallenge: String,
  passkeyVerified: Boolean,
  avatarUrl: { type: String }, // 新增头像URL字段
}, { collection: 'user_datas' });

const UserModel = mongoose.models.User || mongoose.model('User', userSchema);

// 工具函数：彻底删除对象中的avatarBase64字段
function removeAvatarBase64(obj: any) {
  if (obj && typeof obj === 'object' && 'avatarBase64' in obj) {
    delete obj.avatarBase64;
  }
  return obj;
}

export const getAllUsers = async (): Promise<UserType[]> => {
  const docs = await UserModel.find().lean();
  return docs.map(removeAvatarBase64) as unknown as UserType[];
};

export const getUserById = async (id: string): Promise<UserType | null> => {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new Error('非法的用户ID');
  }
  // 调试日志：记录查询条件和耗时
  const start = Date.now();
  // 修复：select 字段包含所有passkey相关字段
  const doc = await UserModel.findOne({ id }).select('id username email role password avatarUrl passkeyEnabled passkeyCredentials pendingChallenge currentChallenge passkeyVerified').lean();
  const duration = Date.now() - start;
  console.log('[MongoDB getUserById] 查询条件:', { id }, '耗时:', duration + 'ms', '返回字段:', doc ? Object.keys(doc) : 'null');
  if (!doc) return null;
  return removeAvatarBase64(doc) as unknown as UserType;
};

export const getUserByUsername = async (username: string): Promise<UserType | null> => {
  if (typeof username !== 'string' || !/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    throw new Error('非法的用户名');
  }
  const doc = await UserModel.findOne({ username }).select('id username email role token tokenExpiresAt password avatarUrl passkeyEnabled passkeyCredentials pendingChallenge currentChallenge passkeyVerified').lean();
  if (!doc) return null;
  return removeAvatarBase64(doc) as unknown as UserType;
};

export const getUserByEmail = async (email: string): Promise<UserType | null> => {
  // 防注入：只允许字符串类型且为合法邮箱
  if (typeof email !== 'string') return null;
  const safeEmail = email.trim();
  if (!validator.isEmail(safeEmail)) return null;
  const doc = await UserModel.findOne({ email: safeEmail }).select('id username email role token tokenExpiresAt password avatarUrl passkeyEnabled passkeyCredentials pendingChallenge currentChallenge passkeyVerified').lean();
  if (!doc) return null;
  return removeAvatarBase64(doc) as unknown as UserType;
};

export const createUser = async (user: UserType): Promise<UserType> => {
  const doc = await UserModel.create(user);
  return doc.toObject() as unknown as UserType;
};

// 允许被更新的字段白名单
const ALLOWED_UPDATE_FIELDS = [
  'username', 'email', 'password', 'role', 'dailyUsage', 'lastUsageDate', 'token', 'tokenExpiresAt',
  'totpSecret', 'totpEnabled', 'backupCodes', 'passkeyEnabled', 'passkeyCredentials',
  'pendingChallenge', 'currentChallenge', 'passkeyVerified', 'avatarBase64'
];

export const updateUser = async (id: string, updates: Partial<UserType>): Promise<UserType | null> => {
  // 只允许字符串id，且不能包含特殊字符
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new Error('非法的用户ID');
  }
  // 处理avatarBase64字段：如果传入undefined，则物理删除
  let updateOps: any = { $set: {} };
  for (const key in updates) {
    if (key === 'avatarBase64' && (updates as any)[key] === undefined) {
      if (!updateOps.$unset) updateOps.$unset = {};
      updateOps.$unset.avatarBase64 = "";
    } else if (key !== 'avatarBase64') {
      updateOps.$set[key] = (updates as any)[key];
    }
  }
  // 如果$set为空对象，删除它
  if (Object.keys(updateOps.$set).length === 0) delete updateOps.$set;
  // 调试日志：输出更新条件、内容
  console.log('[updateUser] 更新条件:', { id }, '更新内容:', updateOps);
  const doc = await UserModel.findOneAndUpdate({ id }, updateOps, { new: true }).lean();
  // 调试日志：输出更新后文档
  if (process.env.NODE_ENV !== 'production') {
    console.log('[updateUser] 更新后文档:', removeAvatarBase64(doc));
  } else if (doc) {
    // 生产环境只输出前20行
    const safeDoc = removeAvatarBase64(doc);
    const lines = JSON.stringify(safeDoc, null, 2).split('\n').slice(0, 20).join('\n');
    console.log('[updateUser] 更新后文档(前20行):\n' + lines + (lines.length < JSON.stringify(safeDoc, null, 2).length ? '\n...（已截断）' : ''));
  }
  return doc ? removeAvatarBase64(doc) as unknown as UserType : null;
};

export const deleteUser = async (id: string): Promise<void> => {
  await UserModel.deleteOne({ id });
}; 