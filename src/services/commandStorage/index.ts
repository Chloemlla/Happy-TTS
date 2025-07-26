import * as mongoImpl from './mongo';
import * as fileImpl from './file';

const storageType = process.env.COMMAND_STORAGE || 'mongo';
console.log('[COMMAND_STORAGE]', process.env.COMMAND_STORAGE);
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