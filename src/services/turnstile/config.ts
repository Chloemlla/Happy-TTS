import logger from "../../utils/logger";
import { isConnected } from "../mongoService";
import { getTurnstileKey, invalidateTurnstileKeyCache, TurnstileSettingModel } from "./models";
import { validateConfigKey, validateConfigValue } from "./validators";

export async function isEnabled(): Promise<boolean> {
  const secretKey = await getTurnstileKey("TURNSTILE_SECRET_KEY");
  return !!secretKey;
}

export async function getConfig(): Promise<{
  enabled: boolean;
  siteKey: string | null;
  secretKey: string | null;
}> {
  const [secretKey, siteKey] = await Promise.all([
    getTurnstileKey("TURNSTILE_SECRET_KEY"),
    getTurnstileKey("TURNSTILE_SITE_KEY"),
  ]);

  return { enabled: !!secretKey, siteKey, secretKey };
}

export async function updateConfig(
  key: "TURNSTILE_SECRET_KEY" | "TURNSTILE_SITE_KEY",
  value: string,
): Promise<boolean> {
  try {
    const allowedKeys = ["TURNSTILE_SECRET_KEY", "TURNSTILE_SITE_KEY"] as const;
    if (!allowedKeys.includes(key as any)) {
      logger.warn("Turnstile配置更新失败：不允许的配置键", { key });
      return false;
    }

    const validatedValue = validateConfigValue(value);
    if (!validatedValue) {
      logger.warn("Turnstile配置更新失败：输入参数无效", { key, valueLength: value?.length });
      return false;
    }

    if (!isConnected()) {
      logger.error("数据库连接不可用，无法更新Turnstile配置");
      return false;
    }

    const updateQuery =
      key === "TURNSTILE_SECRET_KEY" ? { key: "TURNSTILE_SECRET_KEY" } : { key: "TURNSTILE_SITE_KEY" };

    const updateData =
      key === "TURNSTILE_SECRET_KEY"
        ? { key: "TURNSTILE_SECRET_KEY", value: validatedValue, updatedAt: new Date() }
        : { key: "TURNSTILE_SITE_KEY", value: validatedValue, updatedAt: new Date() };

    await TurnstileSettingModel.findOneAndUpdate(updateQuery, updateData, { upsert: true, returnDocument: "after" });
    invalidateTurnstileKeyCache(key);

    logger.info(`Turnstile配置更新成功: ${key}`);
    return true;
  } catch (error) {
    logger.error(`更新Turnstile配置失败: ${key}`, error);
    return false;
  }
}

export async function deleteConfig(key: "TURNSTILE_SECRET_KEY" | "TURNSTILE_SITE_KEY"): Promise<boolean> {
  try {
    const validatedKey = validateConfigKey(key);

    if (!validatedKey) {
      logger.warn("Turnstile配置删除失败：输入参数无效", { key });
      return false;
    }

    if (!isConnected()) {
      logger.error("数据库连接不可用，无法删除Turnstile配置");
      return false;
    }

    await TurnstileSettingModel.findOneAndDelete({ key: validatedKey });
    invalidateTurnstileKeyCache(validatedKey);
    logger.info(`Turnstile配置删除成功: ${validatedKey}`);
    return true;
  } catch (error) {
    logger.error(`删除Turnstile配置失败: ${key}`, error);
    return false;
  }
}
