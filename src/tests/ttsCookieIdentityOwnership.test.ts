import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { config } from "../config/config";
import type { AuthenticatedRequest } from "../types/authRequest";
import { AUTH_COOKIE_NAME } from "../utils/authCookie";
import { UserStorage } from "../utils/userStorage";
import { ttsAssetAccessService } from "../tts/tts.assetAccess";
import { ttsStorage } from "../tts/tts.storage";
import { TtsController } from "../tts/tts.controller";

jest.mock("../utils/userStorage", () => ({
  UserStorage: {
    getUserById: jest.fn(),
  },
}));

jest.mock("../tts/tts.assetAccess", () => ({
  ttsAssetAccessService: {
    buildAccessUrl: jest.fn(() => "https://example.test/mock-audio.wav"),
    ensureAssetAvailable: jest.fn(async () => true),
    serveAsset: jest.fn(async ({ res }: { res: express.Response }) => {
      res.status(200).json({ success: true });
    }),
  },
}));

jest.mock("../tts/tts.history", () => ({
  generationHistoryStore: {
    getRecentRecords: jest.fn(async () => []),
    getAllRecords: jest.fn(async () => ({ records: [], total: 0 })),
    updateAdminReview: jest.fn(async () => null),
  },
  redactTtsTextForStorage: (text: string) => text,
}));

jest.mock("../tts/tts.pipeline", () => ({
  TtsSubmissionPipeline: jest.fn().mockImplementation(() => ({
    validateAndBuild: jest.fn(),
    buildUsageSummaryByUserId: jest.fn(async () => ({
      authenticated: true,
      isAdmin: false,
      dailyLimit: 10,
      usedToday: 0,
      remainingToday: 10,
      reservedToday: 0,
    })),
  })),
}));

jest.mock("../tts/tts.queue", () => ({
  TtsQueue: jest.fn().mockImplementation(() => ({
    enqueue: jest.fn(),
  })),
}));

jest.mock("../utils/sign", () => ({
  signContent: jest.fn(() => "sig"),
}));

const mockGetUserById = UserStorage.getUserById as jest.MockedFunction<typeof UserStorage.getUserById>;

function makeUser(id: string, username = id) {
  return {
    id,
    username,
    email: `${username}@example.com`,
    role: "user" as const,
    accountStatus: "active" as const,
    dailyUsage: 0,
    lastUsageDate: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };
}

function makeOwnedJob(taskId: string, userId: string) {
  return {
    taskId,
    status: "completed" as const,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    request: {
      text: "hello",
      model: "tts-1",
      voice: "alloy",
      outputFormat: "mp3",
      speed: 1,
    },
    userId,
    isAdmin: false,
    ip: "127.0.0.1",
    fingerprint: "fp-owner",
    message: "done",
    usage: {
      authenticated: true,
      isAdmin: false,
      dailyLimit: 10,
      usedToday: 1,
      remainingToday: 9,
      reservedToday: 0,
    },
    result: {
      text: "hello",
      fileName: "owner-audio.mp3",
      audioUrl: "https://example.test/owner-audio.mp3",
      audioStorage: "file" as const,
      audioMimeType: "audio/mpeg",
      audioSize: 12,
      message: "ok",
      status: "generated" as const,
      permissions: {
        canDownload: true,
        canShare: false,
      },
    },
  };
}

describe("TTS cookie-only identity and job ownership", () => {
  const owner = makeUser("owner-1", "owner");
  const other = makeUser("other-1", "other");
  const taskId = "tts_job_owner_1";

  const app = express();
  app.get("/jobs/:taskId", (req, res) => TtsController.getJobStatus(req, res));
  app.get("/jobs/:taskId/result", (req, res) => TtsController.getJobResult(req, res));
  app.get("/history", (req, res) => TtsController.getRecentGenerations(req, res));
  app.get("/assets/:fileName", (req, res) => TtsController.getAudioAsset(req, res));

  let getJobSpy: jest.SpiedFunction<typeof ttsStorage.getJob>;
  let getQueuePositionSpy: jest.SpiedFunction<typeof ttsStorage.getQueuePosition>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUserById.mockImplementation(async (id: string) => {
      if (id === owner.id) return owner as any;
      if (id === other.id) return other as any;
      return null;
    });
    getJobSpy = jest.spyOn(ttsStorage, "getJob").mockResolvedValue(makeOwnedJob(taskId, owner.id) as any);
    getQueuePositionSpy = jest.spyOn(ttsStorage, "getQueuePosition").mockResolvedValue(0);
  });

  afterEach(() => {
    getJobSpy.mockRestore();
    getQueuePositionSpy.mockRestore();
  });

  it("recognizes Cookie-only session for owned job status", async () => {
    const token = jwt.sign({ userId: owner.id }, config.jwtSecret, { expiresIn: "1h" });
    const res = await request(app)
      .get(`/jobs/${taskId}`)
      .set("Cookie", [`${AUTH_COOKIE_NAME}=${token}`]);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      taskId,
      status: "completed",
      resultReady: true,
    });
    expect(mockGetUserById).toHaveBeenCalledWith(owner.id);
  });

  it("recognizes Bearer session for owned job status (parity with cookie)", async () => {
    const token = jwt.sign({ userId: owner.id }, config.jwtSecret, { expiresIn: "1h" });
    const res = await request(app)
      .get(`/jobs/${taskId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.taskId).toBe(taskId);
  });

  it("rejects Cookie session from another user for owned job", async () => {
    const token = jwt.sign({ userId: other.id }, config.jwtSecret, { expiresIn: "1h" });
    const res = await request(app)
      .get(`/jobs/${taskId}`)
      .set("Cookie", [`${AUTH_COOKIE_NAME}=${token}`]);

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({
      success: false,
      code: "TTS_JOB_FORBIDDEN",
    });
  });

  it("requires auth for owned job when no session/cookie is present", async () => {
    const res = await request(app).get(`/jobs/${taskId}`);
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({
      success: false,
      code: "TTS_JOB_AUTH_REQUIRED",
    });
  });

  it("honors typed API Key identity for owned job result", async () => {
    const appWithApiKey = express();
    appWithApiKey.get("/jobs/:taskId/result", (req, res, next) => {
      const authReq = req as AuthenticatedRequest;
      authReq.user = owner as any;
      authReq.apiKey = {
        keyId: "ak_test",
        keyHash: "hash",
        name: "test",
        userId: owner.id,
        permissions: ["tts"],
        rateLimit: 60,
        expiresAt: null,
        lastUsedAt: null,
        lastUsedIp: null,
        usageCount: 0,
        enabled: true,
        billingEnabled: false,
        billingMode: "metered",
        balanceCredits: 0,
        totalChargedCredits: 0,
        totalBillableRequests: 0,
        lastBillingAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any;
      authReq.auth = { kind: "apiKey", user: owner as any, apiKey: authReq.apiKey! };
      next();
    }, (req, res) => TtsController.getJobResult(req, res));

    const res = await request(appWithApiKey).get(`/jobs/${taskId}/result`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      taskId,
      status: "generated",
    });
    expect(ttsAssetAccessService.buildAccessUrl).toHaveBeenCalled();
  });

  it("honors typed OAuth identity for owned job status", async () => {
    const appWithOauth = express();
    appWithOauth.get("/jobs/:taskId", (req, res, next) => {
      const authReq = req as AuthenticatedRequest;
      const oauth = {
        clientId: "client_1",
        tokenId: "token_1",
        scopes: ["tts"],
        grantId: "grant_1",
      };
      authReq.user = owner as any;
      authReq.oauthToken = oauth;
      authReq.oauthContext = oauth;
      authReq.auth = { kind: "oauth", user: owner as any, oauth };
      next();
    }, (req, res) => TtsController.getJobStatus(req, res));

    const res = await request(appWithOauth).get(`/jobs/${taskId}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("scopes history ownership to Cookie-only session user", async () => {
    const { generationHistoryStore } = jest.requireMock("../tts/tts.history") as {
      generationHistoryStore: { getRecentRecords: jest.Mock };
    };
    generationHistoryStore.getRecentRecords.mockResolvedValueOnce([
      {
        id: "rec-1",
        scope: "user",
        userId: owner.id,
        ip: "127.0.0.1",
        fingerprint: "fp-owner",
        text: "hello",
        voice: "alloy",
        model: "tts-1",
        outputFormat: "mp3",
        speed: 1,
        contentHash: "hash",
        fileName: "owner-audio.mp3",
        createdAt: new Date().toISOString(),
      },
    ]);

    const token = jwt.sign({ userId: owner.id }, config.jwtSecret, { expiresIn: "1h" });
    const res = await request(app)
      .get("/history")
      .query({ fingerprint: "fp-owner" })
      .set("Cookie", [`${AUTH_COOKIE_NAME}=${token}`]);

    expect(res.status).toBe(200);
    expect(generationHistoryStore.getRecentRecords).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: owner.id,
      }),
    );
  });

  it("asset endpoint still accepts accessToken path (token-bound ownership)", async () => {
    const res = await request(app)
      .get("/assets/owner-audio.mp3")
      .query({ accessToken: "payload.signature" });

    // Controller only validates token presence; serveAsset owns token claims.
    expect(ttsAssetAccessService.serveAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: "owner-audio.mp3",
        accessToken: "payload.signature",
      }),
    );
    // serveAsset is mocked to no-op; ensure route reached service boundary.
    expect([200, 204, 403, 404]).toContain(res.status);
  });
});
