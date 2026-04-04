import { describe, expect, it, jest } from "@jest/globals";
import type { Request, Response } from "express";
import { translationAccessMiddleware } from "../middleware/translationAccessMiddleware";

function createResponse() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response & {
    status: jest.Mock;
    json: jest.Mock;
  };
}

describe("translationAccessMiddleware", () => {
  it("rejects suspended accounts", () => {
    const req = {
      user: {
        id: "u1",
        accountStatus: "suspended",
      },
    } as unknown as Request;
    const res = createResponse();
    const next = jest.fn();

    translationAccessMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "账户已被封停" });
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects users with disabled translation page access", () => {
    const req = {
      user: {
        id: "u1",
        accountStatus: "active",
        isTranslationEnabled: false,
      },
    } as unknown as Request;
    const res = createResponse();
    const next = jest.fn();

    translationAccessMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "翻译页面访问已被停用" });
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects users with temporary translation restriction", () => {
    const req = {
      user: {
        id: "u1",
        accountStatus: "active",
        isTranslationEnabled: true,
        translationAccessUntil: new Date(Date.now() + 60_000).toISOString(),
      },
    } as unknown as Request;
    const res = createResponse();
    const next = jest.fn();

    translationAccessMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "翻译权限受限，请稍后再试" });
    expect(next).not.toHaveBeenCalled();
  });

  it("allows users with active translation access", () => {
    const req = {
      user: {
        id: "u1",
        accountStatus: "active",
        isTranslationEnabled: true,
        translationAccessUntil: "",
      },
    } as unknown as Request;
    const res = createResponse();
    const next = jest.fn();

    translationAccessMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
