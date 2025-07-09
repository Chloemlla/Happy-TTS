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

export const getAllUsers = async () => UserModel.find().lean();
export const getUserById = async (id: string) => UserModel.findOne({ id }).lean();
export const getUserByUsername = async (username: string) => UserModel.findOne({ username }).lean();
export const getUserByEmail = async (email: string) => UserModel.findOne({ email }).lean();
export const createUser = async (user: UserType) => UserModel.create(user);
export const updateUser = async (id: string, updates: Partial<UserType>) => UserModel.findOneAndUpdate({ id }, updates, { new: true }).lean();
export const deleteUser = async (id: string) => UserModel.deleteOne({ id }); 