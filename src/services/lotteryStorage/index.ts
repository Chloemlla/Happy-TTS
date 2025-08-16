import * as mongoImpl from './mongo';
import * as fileImpl from './file';
import * as mysqlImpl from './mysql';
import logger from '../../utils/logger';

const raw = process.env.LOTTERY_STORAGE;
let storageType = (raw || 'mongo').toLowerCase();
const allowed = new Set(['file', 'mysql', 'mongo']);
if (!allowed.has(storageType)) {
  logger.warn('无效的 LOTTERY_STORAGE 值，已回退为 mongo', { raw });
  storageType = 'mongo';
}
logger.info('抽奖存储已选择', { raw, selected: storageType });
let impl: any;

switch (storageType) {
  case 'file':
    impl = fileImpl;
    break;
  case 'mysql':
    impl = mysqlImpl;
    break;
  case 'mongo':
  default:
    impl = mongoImpl;
}

export const getAllRounds = impl.getAllRounds;
export const addRound = impl.addRound;
export const updateRound = impl.updateRound;
export const getUserRecord = impl.getUserRecord;
export const updateUserRecord = impl.updateUserRecord;
export const deleteAllRounds = impl.deleteAllRounds; 