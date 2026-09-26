import "./helpers/mockAppSecurityBoundaries";
import "./helpers/mockAuthSessionPersistence";
import "./helpers/mockLogSharePersistence";
import "./helpers/mockUserService";
import fs from "node:fs";
import path from "node:path";
import jwt from "jsonwebtoken";
import request from "supertest";
import app from "../app";
import { config } from "../config/config";
import { UserStorage } from "../utils/userStorage";
import { decryptLogSharePayload, type EncryptedLogSharePayload } from "./helpers/logShareCrypto";

describe("logRoutes API", () => {
  let adminPassword = "";
  let adminToken = "";
  let logId = "";
  const testLog = "Jest test log content.";
  const sharelogsDir = path.join(process.cwd(), "data", "sharelogs");
  const testFilePath = path.join(__dirname, "testlog.txt");

  beforeAll(async () => {
    // 获取管理员密码
    const users = await UserStorage.getAllUsers();
    const admin = users.find((u) => u.role === "admin");
    adminPassword = admin?.password || "admin";
    // a72b49b0 起 /api/sharelog 与其 :id 查询都挂了
    // authenticateToken + authenticateSuperAdmin（见 src/routes/logRoutes.ts:57,251）。
    // 只发表单里的 adminPassword 会在鉴权中间件就被 401 拦下，四个用例拿到的
    // 全是 401（它们声称要验的是上传与取回、口令错误 403、不存在 404）。
    // 所以这里把夹具里的 admin 提升为 superadmin 并签一个真 JWT；
    // 会话校验由 mockAuthSessionPersistence 放行（本套件职责不是会话撤销）。
    if (admin) {
      await UserStorage.updateUser(admin.id, { role: "superadmin" } as any);
      adminToken = jwt.sign({ userId: admin.id, username: admin.username }, config.jwtSecret, { expiresIn: "1h" });
    }
    // 确保sharelogs目录存在
    if (!fs.existsSync(sharelogsDir)) {
      fs.mkdirSync(sharelogsDir, { recursive: true });
    }
    // 创建测试文件
    fs.writeFileSync(testFilePath, testLog, "utf-8");
  });

  afterAll(() => {
    // 清理测试日志文件
    if (logId) {
      const files = fs.readdirSync(sharelogsDir);
      const fileName = files.find((f) => f.startsWith(logId));
      if (fileName) {
        const filePath = path.join(sharelogsDir, fileName);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }
    }
    if (fs.existsSync(testFilePath)) fs.unlinkSync(testFilePath);
  });

  it("管理员密码正确时上传日志成功并返回访问链接", async () => {
    const res = await request(app)
      .post("/api/sharelog")
      .set("Authorization", `Bearer ${adminToken}`)
      .attach("file", testFilePath)
      .field("adminPassword", adminPassword);
    expect(res.status).toBe(200);
    expect(res.body.id).toBeDefined();
    expect(res.body.link).toContain("/logshare?id=");
    logId = res.body.id;
  });

  it("管理员密码错误时上传失败", async () => {
    const res = await request(app)
      .post("/api/sharelog")
      .set("Authorization", `Bearer ${adminToken}`)
      .attach("file", testFilePath)
      .field("adminPassword", "wrongpass");
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/密码错误/);
  });

  it("查询日志内容成功", async () => {
    const res = await request(app)
      .post(`/api/sharelog/${logId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ adminPassword });
    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        version: 2,
        algorithm: "aes-256-gcm",
        kdf: "pbkdf2-sha512",
        data: expect.any(String),
        iv: expect.any(String),
        salt: expect.any(String),
        tag: expect.any(String),
      }),
    );
    const decrypted = decryptLogSharePayload(res.body as EncryptedLogSharePayload, adminPassword);
    expect(decrypted.content).toBe(testLog);
  });

  it("查询不存在的日志返回404", async () => {
    const res = await request(app)
      .post("/api/sharelog/notexistid")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ adminPassword });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/日志不存在/);
  });
});
