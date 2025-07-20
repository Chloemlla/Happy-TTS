import { mongoose } from '../mongoService';

function sanitizeString(str: any): string {
  if (typeof str !== 'string') return '';
  if (/[$.{}\[\]]/.test(str)) return '';
  return str;
}

const roundSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  data: { type: Object, required: true }
}, { collection: 'lottery_rounds' });
const userSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  data: { type: Object, required: true }
}, { collection: 'lottery_users' });

const RoundModel = mongoose.models.LotteryRound || mongoose.model('LotteryRound', roundSchema);
const UserModel = mongoose.models.LotteryUser || mongoose.model('LotteryUser', userSchema);

export async function getAllRounds() {
  const docs = await RoundModel.find().lean();
  return docs.map((d: any) => ({ ...d.data, id: d.id }));
}

export async function addRound(round: any) {
  const safeId = sanitizeString(round.id);
  if (!safeId) throw new Error('轮次ID非法');
  if (await RoundModel.findOne({ id: safeId })) throw new Error('轮次已存在');
  await RoundModel.create({ id: safeId, data: round });
  return round;
}

export async function updateRound(id: string, data: any) {
  const safeId = sanitizeString(id);
  if (!safeId) throw new Error('轮次ID非法');
  const doc = await RoundModel.findOne({ id: safeId });
  if (!doc) throw new Error('未找到轮次');
  doc.data = { ...doc.data, ...data };
  await doc.save();
  return { ...doc.data, id: safeId };
}

export async function getUserRecord(userId: string) {
  const safeUserId = sanitizeString(userId);
  if (!safeUserId) return null;
  const doc = await UserModel.findOne({ userId: safeUserId });
  return doc ? doc.data : null;
}

export async function updateUserRecord(userId: string, data: any) {
  const safeUserId = sanitizeString(userId);
  if (!safeUserId) throw new Error('用户ID非法');
  let doc = await UserModel.findOne({ userId: safeUserId });
  if (!doc) {
    doc = await UserModel.create({ userId: safeUserId, data });
  } else {
    doc.data = { ...(doc.data || {}), ...data };
    await doc.save();
  }
  return doc.data;
} 