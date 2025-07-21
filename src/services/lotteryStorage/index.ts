import * as mongoImpl from './mongo';
import * as fileImpl from './file';
import * as mysqlImpl from './mysql';

const storageType = process.env.LOTTERY_STORAGE || 'mongo';
console.log('[LOTTERY_STORAGE]', process.env.LOTTERY_STORAGE);
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