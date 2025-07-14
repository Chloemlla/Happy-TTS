import * as mongoImpl from './mongo';
import * as fileImpl from './file';
import * as mysqlImpl from './mysql';

const storageType = process.env.USER_GENERATION_STORAGE || 'mongo';

// 兜底类型 any，防止类型声明报错
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

export const findDuplicateGeneration = impl.findDuplicateGeneration;
export const addGenerationRecord = impl.addGenerationRecord;
export const isAdminUser = impl.isAdminUser; 