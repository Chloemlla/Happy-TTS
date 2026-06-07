import { RustFileWorkerClient } from "../services/rustFileWorkerClient";

describe("RustFileWorkerClient", () => {
  const createClient = () => {
    const internalClient = {
      getHealth: jest.fn(),
      postJson: jest.fn(),
    };
    const client = new RustFileWorkerClient({
      internalClient,
      maxBytes: 1024,
    });

    return { client, internalClient };
  };

  it("should inspect file bytes through the Rust file-worker", async () => {
    const { client, internalClient } = createClient();
    const fileBuffer = Buffer.from("hello");
    internalClient.postJson.mockResolvedValueOnce({
      success: true,
      data: {
        size: 5,
        detectedMime: "text/plain",
        sha256: "hash",
        magic: { mime: "text/plain", extension: "txt", kind: "text" },
        warnings: [],
        source: "rust-file-worker",
      },
    });

    const result = await client.inspectFile({
      fileBuffer,
      fileName: "hello.txt",
      declaredMime: "text/plain",
    });

    expect(result.detectedMime).toBe("text/plain");
    expect(internalClient.postJson).toHaveBeenCalledWith("/v1/file/inspect", {
      fileBase64: fileBuffer.toString("base64"),
      fileName: "hello.txt",
      declaredMime: "text/plain",
      operations: undefined,
    });
  });

  it("should request hashes with selected algorithms", async () => {
    const { client, internalClient } = createClient();
    const fileBuffer = Buffer.from("hello");
    internalClient.postJson.mockResolvedValueOnce({
      success: true,
      data: {
        size: 5,
        hashes: { sha256: "hash" },
        source: "rust-file-worker",
      },
    });

    await expect(client.hashFile({ fileBuffer, algorithms: ["sha256"] })).resolves.toEqual({
      size: 5,
      hashes: { sha256: "hash" },
      source: "rust-file-worker",
    });
    expect(internalClient.postJson).toHaveBeenCalledWith("/v1/file/hash", {
      fileBase64: fileBuffer.toString("base64"),
      algorithms: ["sha256"],
    });
  });

  it("should decode processed image bytes", async () => {
    const { client, internalClient } = createClient();
    internalClient.postJson.mockResolvedValueOnce({
      success: true,
      data: {
        outputFormat: "original",
        size: 9,
        imageBase64: Buffer.from("processed").toString("base64"),
        metadata: { appliedOperations: ["exifCleanup"] },
        source: "rust-file-worker",
      },
    });

    const result = await client.processImage({
      fileBuffer: Buffer.from("raw-image"),
      operations: ["exifCleanup"],
    });

    expect(result.imageBuffer.toString()).toBe("processed");
    expect(result.metadata).toEqual({ appliedOperations: ["exifCleanup"] });
  });

  it("should reject empty and oversized buffers before calling Rust", async () => {
    const { client, internalClient } = createClient();

    await expect(client.inspectFile({ fileBuffer: Buffer.alloc(0) })).rejects.toMatchObject({
      code: "bad_request",
    });
    await expect(client.inspectFile({ fileBuffer: Buffer.alloc(2048) })).rejects.toMatchObject({
      code: "bad_request",
    });
    expect(internalClient.postJson).not.toHaveBeenCalled();
  });
});
