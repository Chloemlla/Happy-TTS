import crypto from "node:crypto";
import logger from "../../utils/logger";
import { connectMongo } from "../mongoService";
import { getTraceModel } from "./models";

export function generateUniqueTraceId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = crypto.randomBytes(8).toString("hex");
  return `${timestamp}-${randomPart}`;
}

export async function persistTurnstileTrace(traceData: any): Promise<void> {
  try {
    await connectMongo();
    const TraceModel = getTraceModel();

    const existingTrace = await TraceModel.findOne({ traceId: traceData.traceId });
    if (existingTrace) {
      await TraceModel.updateOne(
        { traceId: traceData.traceId },
        {
          ...traceData,
          verificationMethod: traceData.verificationMethod || "turnstile",
          time: new Date(),
        },
      );
      logger.info("[Turnstile] 更新现有溯源信息", { traceId: traceData.traceId });
    } else {
      await TraceModel.create({
        ...traceData,
        verificationMethod: traceData.verificationMethod || "turnstile",
      });
      logger.info("[Turnstile] 创建新溯源信息", { traceId: traceData.traceId });
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
