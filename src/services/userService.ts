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
  avatarBase64: { type: String },
}, { collection: 'user_datas' });

const UserModel = mongoose.models.User || mongoose.model('User', userSchema);

export const getAllUsers = async (): Promise<UserType[]> => {
  const docs = await UserModel.find().lean();
  return docs as unknown as UserType[];
};

export const getUserById = async (id: string): Promise<UserType | null> => {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new Error('非法的用户ID');
  }
  const doc = await UserModel.findOne({ id }).lean();
  if (!doc) return null;
  return doc as unknown as UserType;
};

export const getUserByUsername = async (username: string): Promise<UserType | null> => {
  if (typeof username !== 'string' || !/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    throw new Error('非法的用户名');
  }
  const doc = await UserModel.findOne({ username }).lean();
  if (!doc) return null;
  return doc as unknown as UserType;
};

export const getUserByEmail = async (email: string): Promise<UserType | null> => {
  // 防注入：只允许字符串类型且为合法邮箱
  if (typeof email !== 'string') return null;
  const safeEmail = email.trim();
  if (!validator.isEmail(safeEmail)) return null;
  const doc = await UserModel.findOne({ email: safeEmail }).lean();
  if (!doc) return null;
  return doc as unknown as UserType;
};

export const createUser = async (user: UserType): Promise<UserType> => {
  const doc = await UserModel.create(user);
  return doc.toObject() as unknown as UserType;
};

// 允许被更新的字段白名单
const ALLOWED_UPDATE_FIELDS = [
  'username', 'email', 'password', 'role', 'dailyUsage', 'lastUsageDate', 'token', 'tokenExpiresAt',
  'totpSecret', 'totpEnabled', 'backupCodes', 'passkeyEnabled', 'passkeyCredentials',
  'pendingChallenge', 'currentChallenge', 'passkeyVerified'
];

export const updateUser = async (id: string, updates: Partial<UserType>): Promise<UserType | null> => {
  // 只允许字符串id，且不能包含特殊字符
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new Error('非法的用户ID');
  }
  // 字段白名单过滤
  const safeUpdates: Partial<UserType> = {};
  for (const key of Object.keys(updates)) {
    if (ALLOWED_UPDATE_FIELDS.includes(key)) {
      // @ts-ignore
      safeUpdates[key] = updates[key];
    }
  }
  const doc = await UserModel.findOneAndUpdate({ id }, safeUpdates, { new: true }).lean();
  if (!doc) return null;
  return doc as unknown as UserType;
};

export const deleteUser = async (id: string): Promise<void> => {
  await UserModel.deleteOne({ id });
}; 