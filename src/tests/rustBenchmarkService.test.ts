import axios from "axios";
import { RustBenchmarkService } from "../services/rustBenchmarkService";

jest.mock("axios", () => ({
  __esModule: true,
  default: {
    request: jest.fn(),
    isAxiosError: jest.fn(),
    isCancel: jest.fn(),
  },
}));

jest.mock("../services/wsService", () => ({
  wsService: {
    sendToChannel: jest.fn(),
  },
}));

jest.mock("../utils/logger", () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const axiosMock = axios as unknown as {
  request: jest.Mock;
  isAxiosError: jest.Mock;
  isCancel: jest.Mock;
};

describe("RustBenchmarkService", () => {
  beforeEach(() => {
    axiosMock.request.mockReset();
    axiosMock.isAxiosError.mockReturnValue(false);
    axiosMock.isCancel.mockImplementation((error: { code?: string }) => error?.code === "ERR_CANCELED");
  });

  it("does not count stop-triggered cancellations as benchmark failures", async () => {
    const service = new RustBenchmarkService();

    axiosMock.request.mockImplementation(
      (requestConfig: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          const rejectCanceled = () => {
            const error = Object.assign(new Error("request canceled"), { code: "ERR_CANCELED" });
            reject(error);
          };

          if (requestConfig.signal?.aborted) {
            rejectCanceled();
            return;
          }

          requestConfig.signal?.addEventListener("abort", rejectCanceled, { once: true });
        }),
    );

    await service.start({
      target: "network-tools",
      operation: "health",
      baseUrl: "http://127.0.0.1:4010",
      internalToken: "test-token",
      durationMs: 1000,
      concurrency: 1,
      timeoutMs: 500,
    });
    await waitFor(() => axiosMock.request.mock.calls.length > 0);

    service.stop();
    await waitFor(() => !["running", "stopping"].includes(service.getSnapshot().status));

    const snapshot = service.getSnapshot();
    expect(snapshot.status).toBe("completed");
    expect(snapshot.counters.total).toBe(0);
    expect(snapshot.counters.failed).toBe(0);
    expect(snapshot.errors).toEqual([]);
  });
});

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 1000;
  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for condition");
}
