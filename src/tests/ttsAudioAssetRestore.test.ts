/**
 * 回归测试：Mongo 侧音频回填磁盘。
 *
 * 生产上出现过的问题：接口拿到合法 accessToken 却回 404 TTS_ASSET_NOT_FOUND，
 * 日志是「TTS 音频从 MongoDB 恢复到磁盘失败 { code: 'ERR_INVALID_ARG_TYPE' }」，
 * 而 Mongo 里该 fileName 的文档确实存在。原因是 `.lean()` 拿到的 Buffer 字段是
 * BSON Binary，fs.writeFile 拒收，回填永远失败；容器重建后磁盘副本没了，音频即 404。
 */

const mockSchemaConstructor = jest.fn();
const mockMongooseModels: Record<string, unknown> = {};

jest.mock("../services/mongoService", () => ({
  mongoose: {
    connection: { readyState: 1 },
    Schema: mockSchemaConstructor,
    models: mockMongooseModels,
    model: jest.fn((name: string) => mockMongooseModels[name]),
    isValidObjectId: () => true,
  },
}));

const fs = require("node:fs") as typeof import("node:fs");
const os = require("node:os") as typeof import("node:os");
const path = require("node:path") as typeof import("node:path");

const audioBytes = Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0xff, 0xfb, 0x90]);
let mockFindOneResult: unknown = null;

function installFakeModel(): void {
  mockMongooseModels.TtsAudioAsset = {
    findOne: jest.fn(() => ({
      lean: () => ({ exec: async () => mockFindOneResult }),
    })),
  };
}

// 模块导入时就会取 mongoose.models.TtsAudioAsset，必须先装好假模型。
installFakeModel();

const assetModule = require("../tts/tts.asset") as typeof import("../tts/tts.asset");
const { TtsAudioAssetStore, toAudioBuffer } = assetModule;

/** mongoose `.lean()` 的 Buffer 字段：BSON Binary，带底层字节的 .buffer。 */
function bsonBinaryLike(bytes: Buffer) {
  return {
    buffer: bytes,
    position: bytes.length,
    length: () => bytes.length,
    value: () => bytes,
    _bsontype: "Binary",
  };
}

describe("TTS 音频回填磁盘", () => {
  let outputDir: string;

  beforeEach(() => {
    mockFindOneResult = null;
    installFakeModel();
    outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "tts-asset-restore-"));
  });

  afterEach(() => {
    fs.rmSync(outputDir, { recursive: true, force: true });
  });

  it("把 BSON Binary 的字节原样写到磁盘", async () => {
    mockFindOneResult = { fileName: "probe.mp3", audioData: bsonBinaryLike(audioBytes) };

    const store = new TtsAudioAssetStore();
    await expect(store.restoreAudioAssetToDisk("probe.mp3", outputDir)).resolves.toBe(true);

    expect(fs.readFileSync(path.join(outputDir, "probe.mp3"))).toEqual(audioBytes);
  });

  it("Node Buffer 与 Uint8Array 两种形态都能落盘", async () => {
    mockFindOneResult = { fileName: "buffer.mp3", audioData: Buffer.from(audioBytes) };
    const store = new TtsAudioAssetStore();
    await expect(store.restoreAudioAssetToDisk("buffer.mp3", outputDir)).resolves.toBe(true);
    expect(fs.readFileSync(path.join(outputDir, "buffer.mp3"))).toEqual(audioBytes);

    mockFindOneResult = { fileName: "u8.mp3", audioData: new Uint8Array(audioBytes) };
    await expect(store.restoreAudioAssetToDisk("u8.mp3", outputDir)).resolves.toBe(true);
    expect(fs.readFileSync(path.join(outputDir, "u8.mp3"))).toEqual(audioBytes);
  });

  it("文档缺失或字节为空时不写盘、返回 false", async () => {
    const store = new TtsAudioAssetStore();

    mockFindOneResult = null;
    await expect(store.restoreAudioAssetToDisk("missing.mp3", outputDir)).resolves.toBe(false);
    expect(fs.existsSync(path.join(outputDir, "missing.mp3"))).toBe(false);

    mockFindOneResult = { fileName: "empty.mp3", audioData: null };
    await expect(store.restoreAudioAssetToDisk("empty.mp3", outputDir)).resolves.toBe(false);
    expect(fs.existsSync(path.join(outputDir, "empty.mp3"))).toBe(false);
  });

  it("toAudioBuffer 对无法识别的值返回 null", () => {
    expect(toAudioBuffer(undefined)).toBeNull();
    expect(toAudioBuffer(null)).toBeNull();
    expect(toAudioBuffer("not-bytes")).toBeNull();
    expect(toAudioBuffer({})).toBeNull();
    expect(toAudioBuffer(42)).toBeNull();
  });
});
