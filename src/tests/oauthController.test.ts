import type { Request, Response } from "express";
import { describe, expect, it, afterEach } from "@jest/globals";
import { OAuthController } from "../controllers/oauthController";

const originalBaseUrl = process.env.BASE_URL;
const originalFrontendUrl = process.env.FRONTEND_URL;

function makeResponse(): Response {
  const res = {
    set: jest.fn(),
    json: jest.fn(),
  };

  res.set.mockReturnValue(res);
  res.json.mockReturnValue(res);

  return res as unknown as Response;
}

function makeRequest(host: string): Request {
  return {
    protocol: "https",
    get: jest.fn((name: string) => (name.toLowerCase() === "host" ? host : undefined)),
  } as unknown as Request;
}

describe("OAuthController metadata", () => {
  afterEach(() => {
    if (originalBaseUrl === undefined) {
      delete process.env.BASE_URL;
    } else {
      process.env.BASE_URL = originalBaseUrl;
    }

    if (originalFrontendUrl === undefined) {
      delete process.env.FRONTEND_URL;
    } else {
      process.env.FRONTEND_URL = originalFrontendUrl;
    }
  });

  it("normalizes configured base URLs without a trailing-slash regex", () => {
    process.env.BASE_URL = `https://configured.example/api${"/".repeat(4096)}`;
    delete process.env.FRONTEND_URL;

    const res = makeResponse();

    OAuthController.metadata(makeRequest("ignored.example"), res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        issuer: "https://configured.example/api",
        authorization_endpoint: "https://configured.example/api/oauth/authorize",
      }),
    );
  });

  it("normalizes request host base URLs without a trailing-slash regex", () => {
    delete process.env.BASE_URL;
    delete process.env.FRONTEND_URL;

    const res = makeResponse();

    OAuthController.metadata(makeRequest(`public.example${"/".repeat(4096)}`), res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        issuer: "https://public.example",
        authorization_endpoint: "https://public.example/oauth/authorize",
      }),
    );
  });
});
