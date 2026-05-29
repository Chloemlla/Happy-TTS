import type { Request, Response } from "express";
import { NexaiReleaseManifestService } from "../services/nexaiReleaseManifestService";
import { firstString } from "../utils/httpParam";
import logger from "../utils/logger";

export class NexaiReleaseController {
  static async getManifest(req: Request, res: Response) {
    try {
      const tag = firstString(req.params.tag);
      if (!tag) {
        return res.status(400).json({
          success: false,
          error: "invalid_release_tag",
          message: "Release tag is required",
        });
      }

      const manifest = await NexaiReleaseManifestService.getManifest(tag);
      if (!manifest) {
        return res.status(404).json({
          success: false,
          error: "release_manifest_not_found",
          message: "Release manifest not found",
        });
      }

      res.json({
        success: true,
        data: manifest,
      });
    } catch (error: any) {
      logger.error("[NexAI Release] get manifest error:", error);
      res.status(error?.statusCode || 500).json({
        success: false,
        error: error?.code || "release_manifest_error",
        message: error?.message || "Failed to resolve release manifest",
      });
    }
  }
}
