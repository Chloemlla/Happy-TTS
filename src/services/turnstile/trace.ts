import crypto from "node:crypto";
import logger from "../../utils/logger";
import { connectMongo, mongoose } from "../mongoService";
import { getTraceModel } from "./models";

export function generateUniqueTraceId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = crypto.randomBytes(8).toString("hex");
  return `${timestamp}-${randomPart}`;
}

export async function persistTurnstileTrace(traceData: any): Promise<void> {
  try {
    if (mongoose.connection.readyState !== 1) {
      await connectMongo();
    }
    const TraceModel = getTraceModel();

    const result = await TraceModel.updateOne(
      { traceId: traceData.traceId },
      {
        $set: {
          ...traceData,
          verificationMethod: traceData.verificationMethod || "turnstile",
          time: traceData.time || new Date(),
        },
      },
      { upsert: true },
    );
    if (result?.upsertedCount) {
      logger.info("[Turnstile] 创建新溯源信息", { traceId: traceData.traceId });
    } else {
      logger.info("[Turnstile] 更新现有溯源信息", { traceId: traceData.traceId });
    }
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && (error as any).code === 11000) {
      try {
        const TraceModel = getTraceModel();
        await TraceModel.updateOne(
          { traceId: traceData.traceId },
          {
            ...traceData,
            verificationMethod: traceData.verificationMethod || "turnstile",
            time: new Date(),
          },
        );
        logger.info("[Turnstile] 处理重复键，更新溯源信息", { traceId: traceData.traceId });
      } catch (updateError) {
        logger.warn("[Turnstile] 更新溯源信息失败", updateError);
      }
    } else {
      logger.warn("[Turnstile] 持久化溯源信息失败", error);
    }
  }
}
