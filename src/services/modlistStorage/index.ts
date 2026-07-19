import { requireMysqlUri } from "../../utils/mysqlUriPolicy";
import * as fileImpl from "./file";
import * as mongoImpl from "./mongo";

const storageType = (process.env.MODLIST_STORAGE || "mongo").toLowerCase();

// Fail fast if mysql is selected without a non-weak MYSQL_URI.
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

export const getAllMods = impl.getAllMods;
export const addMod = impl.addMod;
export const updateMod = impl.updateMod;
export const deleteMod = impl.deleteMod;
export const batchAddMods = impl.batchAddMods;
export const batchDeleteMods = impl.batchDeleteMods;
