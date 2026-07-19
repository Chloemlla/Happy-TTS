import logger from "../../utils/logger";
import { requireMysqlUri } from "../../utils/mysqlUriPolicy";
import * as fileImpl from "./file";
import * as mongoImpl from "./mongo";

const raw = process.env.LOTTERY_STORAGE;
let storageType = (raw || "mongo").toLowerCase();
const allowed = new Set(["file", "mysql", "mongo"]);
if (!allowed.has(storageType)) {
  logger.warn("无效的 LOTTERY_STORAGE 值，已回退为 mongo", { raw });
  storageType = "mongo";
}

// Fail fast if mysql is selected without a non-weak MYSQL_URI.
// The mysql adapter is loaded lazily only after the URI check passes.
let impl: any;
if (storageType === "mysql") {
  requireMysqlUri();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  impl = require("./mysql");
  logger.info("抽奖存储已选择", { raw, selected: storageType, mysqlUriConfigured: true });
} else if (storageType === "file") {
  impl = fileImpl;
  logger.info("抽奖存储已选择", { raw, selected: storageType });
} else {
  impl = mongoImpl;
  logger.info("抽奖存储已选择", { raw, selected: storageType });
}

export const getAllRounds = impl.getAllRounds;
export const addRound = impl.addRound;
export const updateRound = impl.updateRound;
export const getUserRecord = impl.getUserRecord;
export const updateUserRecord = impl.updateUserRecord;
export const deleteAllRounds = impl.deleteAllRounds;
