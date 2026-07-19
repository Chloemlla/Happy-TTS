import { requireMysqlUri } from "../../utils/mysqlUriPolicy";
import * as fileImpl from "./file";
import * as mongoImpl from "./mongo";

const storageType = (process.env.USER_GENERATION_STORAGE || "mongo").toLowerCase();

// Fail fast if mysql is selected without a non-weak MYSQL_URI.
// 兜底类型 any，防止类型声明报错
let impl: any;
if (storageType === "mysql") {
  requireMysqlUri();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  impl = require("./mysql");
} else if (storageType === "file") {
  impl = fileImpl;
} else {
  impl = mongoImpl;
}

export const findDuplicateGeneration = impl.findDuplicateGeneration;
export const addGenerationRecord = impl.addGenerationRecord;
export const isAdminUser = impl.isAdminUser;
