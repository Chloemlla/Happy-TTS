import logger from "../../utils/logger";
import { requireMysqlUri } from "../../utils/mysqlUriPolicy";
import * as fileImpl from "./file";
import * as mongoImpl from "./mongo";

const raw = process.env.MODLIST_STORAGE;
let storageType = (raw || "mongo").toLowerCase();
const allowed = new Set(["file", "mysql", "mongo"]);
// G7-40: mirror lottery/command storage — reject invalid values with a warning
// instead of silently proceeding to an unexpected backend.
if (!allowed.has(storageType)) {
  logger.warn("无效的 MODLIST_STORAGE 值，已回退为 mongo", { raw });
  storageType = "mongo";
}

// Fail fast if mysql is selected without a non-weak MYSQL_URI.
let impl: any;
if (storageType === "mysql") {
  requireMysqlUri();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  impl = require("./mysql");
  logger.info("MOD 存储已选择", { raw, selected: storageType, mysqlUriConfigured: true });
} else if (storageType === "file") {
  impl = fileImpl;
  logger.info("MOD 存储已选择", { raw, selected: storageType });
} else {
  impl = mongoImpl;
  logger.info("MOD 存储已选择", { raw, selected: storageType });
}

export const getAllMods = impl.getAllMods;
export const addMod = impl.addMod;
export const updateMod = impl.updateMod;
export const deleteMod = impl.deleteMod;
export const batchAddMods = impl.batchAddMods;
export const batchDeleteMods = impl.batchDeleteMods;
