import mongoose from './mongoService';
import { User as UserType } from '../utils/userStorage';

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
}, { collection: 'tts' });

const UserModel = mongoose.models.User || mongoose.model('User', userSchema);

export const getAllUsers = async (): Promise<UserType[]> => {
  const docs = await UserModel.find().lean();
  return docs as unknown as UserType[];
};

export const getUserById = async (id: string): Promise<UserType | null> => {
  const doc = await UserModel.findOne({ id }).lean();
  if (!doc) return null;
  return doc as unknown as UserType;
};

export const getUserByUsername = async (username: string): Promise<UserType | null> => {
  const doc = await UserModel.findOne({ username }).lean();
  if (!doc) return null;
  return doc as unknown as UserType;
};

export const getUserByEmail = async (email: string): Promise<UserType | null> => {
  const doc = await UserModel.findOne({ email }).lean();
  if (!doc) return null;
  return doc as unknown as UserType;
};

export const createUser = async (user: UserType): Promise<UserType> => {
  const doc = await UserModel.create(user);
  return doc.toObject() as unknown as UserType;
};

export const updateUser = async (id: string, updates: Partial<UserType>): Promise<UserType | null> => {
  const doc = await UserModel.findOneAndUpdate({ id }, updates, { new: true }).lean();
  if (!doc) return null;
  return doc as unknown as UserType;
};

export const deleteUser = async (id: string): Promise<void> => {
  await UserModel.deleteOne({ id });
}; 