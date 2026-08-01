import { normalizeUserStorageMode, USER_STORAGE_MODE } from "../utils/userStorageMode";

describe("用户存储模式契约", () => {
  it.each([undefined, null, "", "   "])("缺少存储模式时固定使用 MongoDB: %p", (value) => {
    expect(normalizeUserStorageMode(value)).toBe(USER_STORAGE_MODE);
  });

  it.each(["mongo", "MONGO", " Mongo "])("接受 MongoDB 存储模式: %s", (value) => {
    expect(normalizeUserStorageMode(value)).toBe(USER_STORAGE_MODE);
  });

  it.each(["file", "mysql"])("拒绝已移除的用户存储模式: %s", (value) => {
    expect(() => normalizeUserStorageMode(value)).toThrow(`USER_STORAGE_MODE 只支持 mongo，当前值为 ${value}`);
  });
});
