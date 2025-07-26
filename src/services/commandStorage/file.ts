import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data', 'commands');
const QUEUE_FILE = path.join(DATA_DIR, 'queue.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');

// 确保数据目录存在
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

// 读取JSON文件
function readJsonFile(filePath: string, defaultValue: any = []) {
  try {
    if (!fs.existsSync(filePath)) {
      return defaultValue;
    }
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`读取文件失败: ${filePath}`, error);
    return defaultValue;
  }
}

// 写入JSON文件
function writeJsonFile(filePath: string, data: any) {
  try {
    ensureDataDir();
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error(`写入文件失败: ${filePath}`, error);
    throw error;
  }
}

// 命令队列操作
export async function getCommandQueue() {
  const queue = readJsonFile(QUEUE_FILE, []);
  return queue.filter((item: any) => item.status === 'pending');
}

export async function addToQueue(command: string) {
  const queue = readJsonFile(QUEUE_FILE, []);
  const commandId = `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const newCommand = {
    commandId,
    command,
    addedAt: new Date().toISOString(),
    status: 'pending'
  };
  
  queue.push(newCommand);
  writeJsonFile(QUEUE_FILE, queue);
  
  return { commandId, command };
}

export async function removeFromQueue(commandId: string) {
  const queue = readJsonFile(QUEUE_FILE, []);
  const initialLength = queue.length;
  const filteredQueue = queue.filter((item: any) => item.commandId !== commandId);
  
  if (filteredQueue.length !== initialLength) {
    writeJsonFile(QUEUE_FILE, filteredQueue);
    return true;
  }
  return false;
}

export async function clearQueue() {
  const queue = readJsonFile(QUEUE_FILE, []);
  const filteredQueue = queue.filter((item: any) => item.status !== 'pending');
  writeJsonFile(QUEUE_FILE, filteredQueue);
}

// 执行历史操作
export async function getExecutionHistory(limit: number = 50) {
  const history = readJsonFile(HISTORY_FILE, []);
  return history.slice(0, limit);
}

export async function addToHistory(data: {
  command: string;
  result: string;
  status: 'success' | 'failed';
  executionTime: number;
  errorMessage?: string;
}) {
  const history = readJsonFile(HISTORY_FILE, []);
  const historyId = `hist_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const newHistory = {
    historyId,
    command: data.command,
    executedAt: new Date().toISOString(),
    result: data.result,
    status: data.status,
    executionTime: data.executionTime,
    errorMessage: data.errorMessage || ''
  };
  
  history.unshift(newHistory); // 添加到开头
  
  // 限制历史记录数量
  if (history.length > 1000) {
    history.splice(1000);
  }
  
  writeJsonFile(HISTORY_FILE, history);
  
  return { historyId, command: data.command };
}

export async function clearHistory() {
  writeJsonFile(HISTORY_FILE, []);
} 