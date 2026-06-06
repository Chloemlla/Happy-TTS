import { createServer, type Server } from "node:http";
import WebSocket from "ws";
import { wsService } from "../services/wsService";

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

describe("WebSocket upgrade routing", () => {
  let server: Server | null = null;

  afterEach(async () => {
    wsService.close();
    await closeServer(server);
    server = null;
  });

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
