import * as mongoImpl from './mongo';
import * as fileImpl from './file';
import logger from '../../utils/logger';

const raw = process.env.COMMAND_STORAGE;
let storageType = (raw || 'mongo').toLowerCase();
const allowed = new Set(['file', 'mongo']);
if (!allowed.has(storageType)) {
  logger.warn('无效的 COMMAND_STORAGE 值，已回退为 mongo', { raw });
  storageType = 'mongo';
}
logger.info('命令存储已选择', { raw, selected: storageType });
let impl: any;
switch (storageType) {
  case 'file':
    impl = fileImpl;
    break;
  case 'mongo':
  default:
    impl = mongoImpl;
}

export const getCommandQueue = impl.getCommandQueue;
export const addToQueue = impl.addToQueue;
export const removeFromQueue = impl.removeFromQueue;
export const clearQueue = impl.clearQueue;
export const getExecutionHistory = impl.getExecutionHistory;
export const addToHistory = impl.addToHistory;
export const clearHistory = impl.clearHistory; 