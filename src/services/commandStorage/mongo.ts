import { mongoose } from '../mongoService';

function sanitizeString(str: any): string {
  if (typeof str !== 'string') return '';
  if (/[$.{}\[\]]/.test(str)) return '';
  return str;
}

// 命令队列Schema
const commandQueueSchema = new mongoose.Schema({
  commandId: { type: String, required: true, unique: true },
  command: { type: String, required: true },
  addedAt: { type: Date, default: Date.now },
  status: { type: String, enum: ['pending', 'executing', 'completed', 'failed'], default: 'pending' }
}, { collection: 'command_queue' });

// 执行历史Schema
const executionHistorySchema = new mongoose.Schema({
  historyId: { type: String, required: true, unique: true },
  command: { type: String, required: true },
  executedAt: { type: Date, default: Date.now },
  result: { type: String, required: true },
  status: { type: String, enum: ['success', 'failed'], required: true },
  executionTime: { type: Number, default: 0 }, // 执行时间（毫秒）
  errorMessage: { type: String, default: '' }
}, { collection: 'command_history' });

const CommandQueueModel = mongoose.models.CommandQueue || mongoose.model('CommandQueue', commandQueueSchema);
const ExecutionHistoryModel = mongoose.models.ExecutionHistory || mongoose.model('ExecutionHistory', executionHistorySchema);

// 命令队列操作
export async function getCommandQueue() {
  const docs = await CommandQueueModel.find({ status: 'pending' }).sort({ addedAt: 1 }).lean();
  return docs.map((d: any) => ({
    commandId: d.commandId,
    command: d.command,
    addedAt: d.addedAt,
    status: d.status
  }));
}

export async function addToQueue(command: string) {
  const commandId = `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const safeCommand = sanitizeString(command);
  if (!safeCommand) throw new Error('命令内容非法');
  
  await CommandQueueModel.create({
    commandId,
    command: safeCommand,
    status: 'pending'
  });
  
  return { commandId, command: safeCommand };
}

export async function removeFromQueue(commandId: string) {
  const safeCommandId = sanitizeString(commandId);
  if (!safeCommandId) throw new Error('命令ID非法');
  
  const result = await CommandQueueModel.deleteOne({ commandId: safeCommandId });
  return result.deletedCount > 0;
}

export async function clearQueue() {
  await CommandQueueModel.deleteMany({ status: 'pending' });
}

// 执行历史操作
export async function getExecutionHistory(limit: number = 50) {
  const docs = await ExecutionHistoryModel.find()
    .sort({ executedAt: -1 })
    .limit(limit)
    .lean();
  
  return docs.map((d: any) => ({
    historyId: d.historyId,
    command: d.command,
    executedAt: d.executedAt,
    result: d.result,
    status: d.status,
    executionTime: d.executionTime,
    errorMessage: d.errorMessage
  }));
}

export async function addToHistory(data: {
  command: string;
  result: string;
  status: 'success' | 'failed';
  executionTime: number;
  errorMessage?: string;
}) {
  const historyId = `hist_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const safeCommand = sanitizeString(data.command);
  if (!safeCommand) throw new Error('命令内容非法');
  
  await ExecutionHistoryModel.create({
    historyId,
    command: safeCommand,
    result: data.result,
    status: data.status,
    executionTime: data.executionTime,
    errorMessage: data.errorMessage || ''
  });
  
  return { historyId, command: safeCommand };
}

export async function clearHistory() {
  await ExecutionHistoryModel.deleteMany({});
} 