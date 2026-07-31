import { createServer, type Server } from "node:http";
import jwt from "jsonwebtoken";
import WebSocket from "ws";
import { config } from "../config/config";
import * as wsAuthentication from "../services/wsAuthentication";
import { wsService } from "../services/wsService";
import { AUTH_COOKIE_NAME } from "../utils/authCookie";
import { emitUserAuthorityChanged } from "../utils/userAuthorityEvents";
import { UserStorage, type User } from "../utils/userStorage";

function listen(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Server did not bind to a TCP port"));
        return;
      }
      resolve(address.port);
    });
  });
}

function closeServer(server: Server | null): Promise<void> {
  if (!server?.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function closeWebSocket(ws: WebSocket): Promise<void> {
  if (ws.readyState === WebSocket.CLOSED) return Promise.resolve();
  return new Promise((resolve) => {
    ws.once("close", () => resolve());
    ws.close();
  });
}

describe("WebSocket upgrade routing", () => {
  let server: Server | null = null;

  afterEach(async () => {
    wsService.close();
    await closeServer(server);
    server = null;
    jest.restoreAllMocks();
  });

  function createUser(overrides: Partial<User> = {}): User {
    return {
      id: "user-1",
      username: "current-user",
      email: "current-user@example.com",
      role: "user",
      dailyUsage: 0,
      lastUsageDate: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      accountStatus: "active",
      ...overrides,
    };
  }

  function connectAndWaitForPong(url: string, headers?: Record<string, string>): Promise<{ ws: WebSocket; message: string }> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url, headers ? { headers } : undefined);
      const timeout = setTimeout(() => {
        ws.terminate();
        reject(new Error("Timed out waiting for /ws pong"));
      }, 3000);

      let settled = false;
      const settle = (callback: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        callback();
      };

      ws.on("open", () => {
        ws.send(JSON.stringify({ type: "ping" }));
      });
      ws.on("message", (data) => {
        settle(() => resolve({ ws, message: data.toString() }));
      });
      ws.on("error", (error) => {
        settle(() => reject(error));
      });
      ws.on("close", (code) => {
        if (!settled) {
          settle(() => reject(new Error(`Connection closed before pong: ${code}`)));
        }
      });
    });
  }

  it("keeps the frontend /ws connection on the app WebSocket server", async () => {
    server = createServer((_req, res) => {
      res.statusCode = 404;
      res.end("Not Found");
    });
    const port = await listen(server);
    wsService.init(server);

    const message = await new Promise<string>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      const timeout = setTimeout(() => {
        ws.terminate();
        reject(new Error("Timed out waiting for /ws pong"));
      }, 3000);

      let settled = false;
      const settle = (callback: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        callback();
      };

      ws.on("open", () => {
        ws.send(JSON.stringify({ type: "ping" }));
      });
      ws.on("message", (data) => {
        settle(() => {
          ws.close();
          resolve(data.toString());
        });
      });
      ws.on("error", (error) => {
        settle(() => reject(error));
      });
      ws.on("close", (code) => {
        if (!settled) {
          settle(() => reject(new Error(`Connection closed before pong: ${code}`)));
        }
      });
    });

    expect(JSON.parse(message)).toMatchObject({ type: "pong" });
  });

  it("authenticates a browser WebSocket from the HttpOnly session cookie", async () => {
    jest.spyOn(UserStorage, "getUserById").mockResolvedValue(createUser());
    server = createServer((_req, res) => {
      res.statusCode = 404;
      res.end("Not Found");
    });
    const port = await listen(server);
    wsService.init(server);
    const token = jwt.sign({ userId: "user-1", role: "admin" }, config.jwtSecret, { expiresIn: "5m" });

    const { ws, message } = await connectAndWaitForPong(`ws://127.0.0.1:${port}/ws`, {
      Cookie: `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}`,
    });

    expect(JSON.parse(message)).toMatchObject({ type: "pong" });
    expect(UserStorage.getUserById).toHaveBeenCalledWith("user-1");
    expect(wsService.getConnectionStats()).toMatchObject({ authenticated: 1, anonymous: 0, admins: 0 });
    await closeWebSocket(ws);
  });

  it("reloads current authority for the legacy query-token fallback", async () => {
    jest.spyOn(UserStorage, "getUserById").mockResolvedValue(createUser({ role: "user" }));
    server = createServer((_req, res) => {
      res.statusCode = 404;
      res.end("Not Found");
    });
    const port = await listen(server);
    wsService.init(server);
    const staleAdminToken = jwt.sign({ userId: "user-1", role: "admin", isAdmin: true }, config.jwtSecret, {
      expiresIn: "5m",
    });

    const { ws } = await connectAndWaitForPong(
      `ws://127.0.0.1:${port}/ws?token=${encodeURIComponent(staleAdminToken)}`,
    );

    expect(wsService.getConnectionStats()).toMatchObject({ authenticated: 1, admins: 0 });
    await closeWebSocket(ws);
  });

  it("disconnects an established socket when the user's authority changes", async () => {
    jest.spyOn(UserStorage, "getUserById").mockResolvedValue(createUser({ role: "admin" }));
    server = createServer((_req, res) => {
      res.statusCode = 404;
      res.end("Not Found");
    });
    const port = await listen(server);
    wsService.init(server);
    const token = jwt.sign({ userId: "user-1", role: "admin" }, config.jwtSecret, { expiresIn: "5m" });
    const { ws } = await connectAndWaitForPong(`ws://127.0.0.1:${port}/ws`, {
      Cookie: `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}`,
    });
    const closed = new Promise<{ code: number; reason: string }>((resolve) => {
      ws.once("close", (code, reason) => resolve({ code, reason: reason.toString() }));
    });

    emitUserAuthorityChanged("user-1", "updated");

    await expect(closed).resolves.toEqual({ code: 4003, reason: "Authority changed" });
    expect(wsService.getConnectionStats()).toMatchObject({ total: 0, admins: 0 });
  });

  it("does not attach an old pending upgrade to a reinitialized WebSocket server", async () => {
    let resolveIdentity: ((identity: wsAuthentication.WebSocketIdentity) => void) | null = null;
    let markAuthenticationStarted: (() => void) | null = null;
    const authenticationStarted = new Promise<void>((resolve) => {
      markAuthenticationStarted = resolve;
    });
    jest.spyOn(wsAuthentication, "resolveWebSocketIdentity").mockImplementation(
      () => new Promise<wsAuthentication.WebSocketIdentity | null>((resolve) => {
        resolveIdentity = resolve;
        markAuthenticationStarted?.();
      }),
    );

    const originalServer = createServer((_req, res) => {
      res.statusCode = 404;
      res.end("Not Found");
    });
    server = originalServer;
    const originalPort = await listen(originalServer);
    wsService.init(originalServer);

    const oldClientResult = new Promise<{ opened: boolean; statusCode?: number }>((resolve) => {
      const oldClient = new WebSocket(`ws://127.0.0.1:${originalPort}/ws`);
      let settled = false;
      const settle = (result: { opened: boolean; statusCode?: number }) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };
      oldClient.on("open", () => settle({ opened: true }));
      oldClient.on("unexpected-response", (_request, response) => {
        response.resume();
        settle({ opened: false, statusCode: response.statusCode });
      });
      oldClient.on("error", () => settle({ opened: false }));
    });

    await authenticationStarted;
    wsService.close();

    const replacementServer = createServer((_req, res) => {
      res.statusCode = 404;
      res.end("Not Found");
    });
    server = replacementServer;
    await listen(replacementServer);
    wsService.init(replacementServer);
    resolveIdentity?.({ userId: null, isAdmin: false });

    await expect(oldClientResult).resolves.toEqual({ opened: false, statusCode: 503 });
    expect(wsService.getConnectionStats()).toMatchObject({ total: 0 });
    await closeServer(originalServer);
  });

  it("keeps EcoEnchants RPC upgrades off the frontend /ws server", async () => {
    server = createServer((_req, res) => {
      res.statusCode = 404;
      res.end("Not Found");
    });
    const port = await listen(server);
    wsService.init(server);

    const result = await new Promise<{ opened: boolean; code: number; reason: string; errors: string[] }>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/api/ecoenchants/v1/rpc/connect`);
      const errors: string[] = [];
      let opened = false;
      const timeout = setTimeout(() => {
        ws.terminate();
        reject(new Error("Timed out waiting for RPC close"));
      }, 3000);

      ws.on("open", () => {
        opened = true;
      });
      ws.on("error", (error) => {
        errors.push(error.message);
      });
      ws.on("close", (code, reason) => {
        clearTimeout(timeout);
        resolve({ opened, code, reason: reason.toString(), errors });
      });
    });

    expect(result).toEqual({
      opened: true,
      code: 4001,
      reason: "Unauthorized",
      errors: [],
    });
  });
});
