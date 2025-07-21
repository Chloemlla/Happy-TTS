import * as mongoImpl from './mongo';
import * as fileImpl from './file';
import * as mysqlImpl from './mysql';

const storageType = process.env.MODLIST_STORAGE || 'mongo';

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

export const getAllMods = impl.getAllMods;
export const addMod = impl.addMod;
export const updateMod = impl.updateMod;
export const deleteMod = impl.deleteMod;
export const batchAddMods = impl.batchAddMods;
export const batchDeleteMods = impl.batchDeleteMods; 