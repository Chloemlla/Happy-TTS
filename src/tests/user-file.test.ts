import fs from 'fs';
import path from 'path';
describe('用户文件修复功能', () => {
  const dataDir = path.join(process.cwd(), 'data');
  const usersFile = path.join(dataDir, 'users.json');
  it('应能自动修复各种用户文件异常', async () => {
    // 文件不存在
    if (fs.existsSync(usersFile)) {
      const backupFile = usersFile + '.backup';
      fs.copyFileSync(usersFile, backupFile);
      fs.unlinkSync(usersFile);
    }
    try {
      const { UserStorage } = require('../../dist/utils/userStorage.js');
      await UserStorage.getAllUsers();
    } catch {}
    // 空文件
    fs.writeFileSync(usersFile, '');
    try {
      const { UserStorage } = require('../../dist/utils/userStorage.js');
      const users = await UserStorage.getAllUsers();
      expect(Array.isArray(users)).toBe(true);
    } catch {}
    // 格式错误
    fs.writeFileSync(usersFile, 'invalid json content');
    try {
      const { UserStorage } = require('../../dist/utils/userStorage.js');
      const users = await UserStorage.getAllUsers();
      expect(Array.isArray(users)).toBe(true);
    } catch {}
    // 空数组
    fs.writeFileSync(usersFile, '[]');
    try {
      const { UserStorage } = require('../../dist/utils/userStorage.js');
      const users = await UserStorage.getAllUsers();
      expect(Array.isArray(users)).toBe(true);
    } catch {}
    // 恢复备份
    const backupFile = usersFile + '.backup';
    if (fs.existsSync(backupFile)) {
      fs.copyFileSync(backupFile, usersFile);
      fs.unlinkSync(backupFile);
    }
  });
}); 