import crypto from "node:crypto";
import type { Request, Response } from "express";
import {
  ECO_ENCHANTS_PRODUCT_ID,
  EcoEnchantsService,
  type EcoEnchantsRequestContext,
} from "../services/ecoEnchantsService";
import { firstString, firstStringOr } from "../utils/httpParam";

function getRequestId(req: Request): string {
  return req.requestId || firstString(req.headers["x-request-id"]) || `req_${crypto.randomUUID()}`;
}

function getActorId(req: Request): string | undefined {
  const user = (req as any).user;
  if (!user) return undefined;
  return String(user.id || user._id || user.userId || user.username || "unknown");
}

function buildContext(req: Request, actorType?: EcoEnchantsRequestContext["actorType"]): EcoEnchantsRequestContext {
  return {
    requestId: getRequestId(req),
    ip: req.ip || req.socket.remoteAddress,
    userAgent: req.get("User-Agent"),
    method: req.method,
    path: req.originalUrl || req.path,
    actorId: getActorId(req),
    actorType,
  };
}

function sendError(res: Response, requestId: string, error: unknown): void {
  const formatted = EcoEnchantsService.formatError(error, requestId);
  res.status(formatted.statusCode).json(formatted.body);
}

function getIdempotencyKey(req: Request): string | undefined {
  return firstString(req.headers["idempotency-key"]);
}

function parsePage(req: Request): { page: number; pageSize: number } {
  return {
    page: Number.parseInt(firstStringOr(req.query.page, "1"), 10),
    pageSize: Number.parseInt(firstStringOr(req.query.pageSize, "20"), 10),
  };
}

function getRawPayload(req: Request): string {
  if (Buffer.isBuffer(req.body)) return req.body.toString("utf8");
  if (typeof req.body === "string") return req.body;
  return JSON.stringify(req.body || {});
}

export class EcoEnchantsController {
  static async health(req: Request, res: Response): Promise<void> {
    const requestId = getRequestId(req);
    res.json({
      requestId,
      status: "ok",
      time: new Date().toISOString(),
    });
  }

  static async productPolicy(req: Request, res: Response): Promise<void> {
    const requestId = getRequestId(req);
    try {
      const productId = firstString(req.params.productId) || ECO_ENCHANTS_PRODUCT_ID;
      const policy = await EcoEnchantsService.getProductPolicy(productId, requestId);
      res.json(policy);
    } catch (error) {
      sendError(res, requestId, error);
    }
  }

  static async verifyLicense(req: Request, res: Response): Promise<void> {
    const context = buildContext(req, "license");
    try {
      const result = await EcoEnchantsService.verifyLicense(req.body, context);
      res.json(result);
    } catch (error) {
      sendError(res, context.requestId, error);
    }
  }

  static async activateLicense(req: Request, res: Response): Promise<void> {
    const context = buildContext(req, "license");
    try {
      const result = await EcoEnchantsService.withIdempotency(
        {
          scope: "licenses.activate",
          key: getIdempotencyKey(req),
          method: req.method,
          path: req.originalUrl || req.path,
          body: req.body,
        },
        async () => ({
          statusCode: 201,
          body: await EcoEnchantsService.activateLicense(req.body, context),
        }),
      );
      res.status(result.statusCode).json(result.body);
    } catch (error) {
      sendError(res, context.requestId, error);
    }
  }

  static async deactivateLicense(req: Request, res: Response): Promise<void> {
    const context = buildContext(req, "license");
    try {
      const result = await EcoEnchantsService.withIdempotency(
        {
          scope: "licenses.deactivate",
          key: getIdempotencyKey(req),
          method: req.method,
          path: req.originalUrl || req.path,
          body: req.body,
        },
        async () => ({
          statusCode: 200,
          body: await EcoEnchantsService.deactivateLicense(req.body, context),
        }),
      );
      res.status(result.statusCode).json(result.body);
    } catch (error) {
      sendError(res, context.requestId, error);
    }
  }

  static async latestDownload(req: Request, res: Response): Promise<void> {
    const requestId = getRequestId(req);
    try {
      const channel = firstString(req.query.channel) || "stable";
      const userId = getActorId(req);
      if (userId && !(req as any).ecoEnchantsDownloadToken) {
        await EcoEnchantsService.listCustomerDownloads(userId, requestId);
      }
      const result = await EcoEnchantsService.getLatestDownload(channel, requestId);
      res.json(result);
    } catch (error) {
      sendError(res, requestId, error);
    }
  }

  static async myLicenses(req: Request, res: Response): Promise<void> {
    const requestId = getRequestId(req);
    try {
      const result = await EcoEnchantsService.listCustomerLicenses(getActorId(req) || "unknown", requestId);
      res.json(result);
    } catch (error) {
      sendError(res, requestId, error);
    }
  }

  static async myLicenseDetail(req: Request, res: Response): Promise<void> {
    const requestId = getRequestId(req);
    try {
      const result = await EcoEnchantsService.getCustomerLicense(
        getActorId(req) || "unknown",
        firstStringOr(req.params.licenseId),
        requestId,
      );
      res.json(result);
    } catch (error) {
      sendError(res, requestId, error);
    }
  }

  static async revokeMyActivation(req: Request, res: Response): Promise<void> {
    const context = buildContext(req, "customer");
    try {
      const result = await EcoEnchantsService.withIdempotency(
        {
          scope: "me.activation.revoke",
          key: getIdempotencyKey(req),
          method: req.method,
          path: req.originalUrl || req.path,
          body: req.body,
        },
        async () => ({
          statusCode: 200,
          body: await EcoEnchantsService.revokeCustomerActivation(
            getActorId(req) || "unknown",
            firstStringOr(req.params.licenseId),
            firstStringOr(req.params.activationId),
            context,
          ),
        }),
      );
      res.status(result.statusCode).json(result.body);
    } catch (error) {
      sendError(res, context.requestId, error);
    }
  }

  static async rotateMyLicenseKey(req: Request, res: Response): Promise<void> {
    const context = buildContext(req, "customer");
    try {
      const result = await EcoEnchantsService.withIdempotency(
        {
          scope: "me.license.rotate_key",
          key: getIdempotencyKey(req),
          method: req.method,
          path: req.originalUrl || req.path,
          body: req.body,
        },
        async () => ({
          statusCode: 200,
          body: await EcoEnchantsService.rotateCustomerLicenseKey(
            getActorId(req) || "unknown",
            firstStringOr(req.params.licenseId),
            context,
          ),
        }),
      );
      res.status(result.statusCode).json(result.body);
    } catch (error) {
      sendError(res, context.requestId, error);
    }
  }

  static async myDownloads(req: Request, res: Response): Promise<void> {
    const requestId = getRequestId(req);
    try {
      const result = await EcoEnchantsService.listCustomerDownloads(getActorId(req) || "unknown", requestId);
      res.json(result);
    } catch (error) {
      sendError(res, requestId, error);
    }
  }

  static async createProduct(req: Request, res: Response): Promise<void> {
    const context = buildContext(req, "admin");
    try {
      const result = await EcoEnchantsService.withIdempotency(
        {
          scope: "admin.products.create",
          key: getIdempotencyKey(req),
          method: req.method,
          path: req.originalUrl || req.path,
          body: req.body,
        },
        async () => ({
          statusCode: 201,
          body: { requestId: context.requestId, ...(await EcoEnchantsService.createProduct(req.body, context)) },
        }),
      );
      res.status(result.statusCode).json(result.body);
    } catch (error) {
      sendError(res, context.requestId, error);
    }
  }

  static async updateProduct(req: Request, res: Response): Promise<void> {
    const context = buildContext(req, "admin");
    try {
      const result = await EcoEnchantsService.withIdempotency(
        {
          scope: "admin.products.update",
          key: getIdempotencyKey(req),
          method: req.method,
          path: req.originalUrl || req.path,
          body: req.body,
        },
        async () => ({
          statusCode: 200,
          body: {
            requestId: context.requestId,
            ...(await EcoEnchantsService.updateProduct(firstStringOr(req.params.productId), req.body, context)),
          },
        }),
      );
      res.status(result.statusCode).json(result.body);
    } catch (error) {
      sendError(res, context.requestId, error);
    }
  }

  static async createReleaseBuild(req: Request, res: Response): Promise<void> {
    const context = buildContext(req, "admin");
    try {
      const result = await EcoEnchantsService.withIdempotency(
        {
          scope: "admin.release.create",
          key: getIdempotencyKey(req),
          method: req.method,
          path: req.originalUrl || req.path,
          body: req.body,
        },
        async () => ({
          statusCode: 201,
          body: {
            requestId: context.requestId,
            ...(await EcoEnchantsService.createReleaseBuild(firstStringOr(req.params.productId), req.body, context)),
          },
        }),
      );
      res.status(result.statusCode).json(result.body);
    } catch (error) {
      sendError(res, context.requestId, error);
    }
  }

  static async createPlan(req: Request, res: Response): Promise<void> {
    const context = buildContext(req, "admin");
    try {
      const result = await EcoEnchantsService.withIdempotency(
        {
          scope: "admin.plans.create",
          key: getIdempotencyKey(req),
          method: req.method,
          path: req.originalUrl || req.path,
          body: req.body,
        },
        async () => ({
          statusCode: 201,
          body: { requestId: context.requestId, ...(await EcoEnchantsService.createPlan(req.body, context)) },
        }),
      );
      res.status(result.statusCode).json(result.body);
    } catch (error) {
      sendError(res, context.requestId, error);
    }
  }

  static async createLicense(req: Request, res: Response): Promise<void> {
    const context = buildContext(req, "admin");
    try {
      const result = await EcoEnchantsService.withIdempotency(
        {
          scope: "admin.licenses.create",
          key: getIdempotencyKey(req),
          method: req.method,
          path: req.originalUrl || req.path,
          body: req.body,
        },
        async () => ({
          statusCode: 201,
          body: { requestId: context.requestId, ...(await EcoEnchantsService.createLicense(req.body, context)) },
        }),
      );
      res.status(result.statusCode).json(result.body);
    } catch (error) {
      sendError(res, context.requestId, error);
    }
  }

  static async updateLicense(req: Request, res: Response): Promise<void> {
    const context = buildContext(req, "admin");
    try {
      const result = await EcoEnchantsService.withIdempotency(
        {
          scope: "admin.licenses.update",
          key: getIdempotencyKey(req),
          method: req.method,
          path: req.originalUrl || req.path,
          body: req.body,
        },
        async () => ({
          statusCode: 200,
          body: {
            requestId: context.requestId,
            ...(await EcoEnchantsService.updateLicense(firstStringOr(req.params.licenseId), req.body, context)),
          },
        }),
      );
      res.status(result.statusCode).json(result.body);
    } catch (error) {
      sendError(res, context.requestId, error);
    }
  }

  static async revokeLicense(req: Request, res: Response): Promise<void> {
    const context = buildContext(req, "admin");
    try {
      const result = await EcoEnchantsService.withIdempotency(
        {
          scope: "admin.licenses.revoke",
          key: getIdempotencyKey(req),
          method: req.method,
          path: req.originalUrl || req.path,
          body: req.body,
        },
        async () => ({
          statusCode: 200,
          body: {
            requestId: context.requestId,
            ...(await EcoEnchantsService.revokeLicense(firstStringOr(req.params.licenseId), context)),
          },
        }),
      );
      res.status(result.statusCode).json(result.body);
    } catch (error) {
      sendError(res, context.requestId, error);
    }
  }

  static async adminAuditLogs(req: Request, res: Response): Promise<void> {
    const requestId = getRequestId(req);
    try {
      const { page, pageSize } = parsePage(req);
      const result = await EcoEnchantsService.listAdminAuditLogs({
        requestId,
        page,
        pageSize,
        action: firstString(req.query.action),
        actorType: firstString(req.query.actorType),
        result: firstString(req.query.result),
      });
      res.json(result);
    } catch (error) {
      sendError(res, requestId, error);
    }
  }

  static async adminRiskEvents(req: Request, res: Response): Promise<void> {
    const requestId = getRequestId(req);
    try {
      const { page, pageSize } = parsePage(req);
      const result = await EcoEnchantsService.listAdminRiskEvents({
        requestId,
        page,
        pageSize,
        status: firstString(req.query.status),
        severity: firstString(req.query.severity),
        type: firstString(req.query.type),
      });
      res.json(result);
    } catch (error) {
      sendError(res, requestId, error);
    }
  }

  static async webhook(req: Request, res: Response): Promise<void> {
    const context = buildContext(req, "webhook");
    try {
      const provider = firstString(req.params.provider);
      if (provider !== "polymart" && provider !== "stripe" && provider !== "paypal") {
        res.status(404).json({ requestId: context.requestId, error: { code: "not_found", message: "Webhook provider not found." } });
        return;
      }
      const result = await EcoEnchantsService.handleWebhook(provider, getRawPayload(req), req.headers, context);
      res.status(202).json(result);
    } catch (error) {
      sendError(res, context.requestId, error);
    }
  }
}
