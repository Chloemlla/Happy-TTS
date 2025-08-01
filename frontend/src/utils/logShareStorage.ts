import { openDB, deleteDB } from 'idb';
import CryptoJS from 'crypto-js';

// IndexedDB 配置
const LOGSHARE_DB = 'logshare-store';
const LOGSHARE_STORE = 'logshare';

// 存储密钥
const STORAGE_KEY = 'happy_logshare';

// 历史记录类型
export interface LogShareHistory {
  id: string;
  type: 'upload' | 'query';
  data: {
    link?: string;
    ext?: string;
    time: string;
    queryId?: string;
  };
  createdAt: string;
}

// IndexedDB 数据库操作
export async function getLogShareDB() {
  return await openDB(LOGSHARE_DB, 1, {
    upgrade(db, oldVersion, newVersion) {
      console.log(`[LogShare存储] 数据库升级: v${oldVersion} -> v${newVersion}`);
      
      if (oldVersion < 1) {
        // 初始版本：创建存储对象
        if (!db.objectStoreNames.contains(LOGSHARE_STORE)) {
          db.createObjectStore(LOGSHARE_STORE, { keyPath: 'id' });
        }
      }
    },
  });
}

// 获取存储的历史记录
export async function getStoredHistory(): Promise<LogShareHistory[]> {
  try {
    const db = await getLogShareDB();
    const history = await db.getAll(LOGSHARE_STORE);
    return history || [];
  } catch (error) {
    console.error('[LogShare存储] 获取历史记录失败:', error);
    return [];
  }
}

// 保存历史记录到IndexedDB
export async function saveHistoryToStorage(historyData: LogShareHistory): Promise<void> {
  try {
    const db = await getLogShareDB();
    await db.put(LOGSHARE_STORE, historyData);
    console.log('[LogShare存储] 保存成功，ID:', historyData.id);
  } catch (error) {
    console.error('[LogShare存储] 保存失败:', error);
  }
}

// 从IndexedDB删除历史记录
export async function deleteHistoryFromStorage(id: string): Promise<void> {
  try {
    const db = await getLogShareDB();
    await db.delete(LOGSHARE_STORE, id);
    console.log('[LogShare存储] 删除成功，ID:', id);
  } catch (error) {
    console.error('[LogShare存储] 删除失败:', error);
  }
}

// 清空所有历史记录
export async function clearAllHistory(): Promise<void> {
  try {
    const db = await getLogShareDB();
    await db.clear(LOGSHARE_STORE);
    console.log('[LogShare存储] 清空成功');
  } catch (error) {
    console.error('[LogShare存储] 清空失败:', error);
  }
}

// 导出时从IndexedDB获取数据
export async function exportHistoryFromDB(): Promise<LogShareHistory[]> {
  try {
    const db = await getLogShareDB();
    const history = await db.getAll(LOGSHARE_STORE);
    return history || [];
  } catch (error) {
    console.error('[LogShare存储] 导出获取失败:', error);
    return [];
  }
}

// 导入时保存到IndexedDB
export async function importHistoryToDB(history: LogShareHistory[]): Promise<void> {
  try {
    const db = await getLogShareDB();
    // 清空现有数据
    await db.clear(LOGSHARE_STORE);
    // 添加新数据
    for (const item of history) {
      await db.put(LOGSHARE_STORE, item);
    }
    console.log('[LogShare存储] 导入成功，记录数量:', history.length);
  } catch (error) {
    console.error('[LogShare存储] 导入失败:', error);
  }
}

// 重置数据库（用于处理数据库结构问题）
export async function resetLogShareDB(): Promise<void> {
  try {
    const db = await getLogShareDB();
    await db.clear(LOGSHARE_STORE);
    console.log('[LogShare存储] 数据库重置成功');
  } catch (error) {
    console.error('[LogShare存储] 数据库重置失败:', error);
    // 如果重置失败，尝试删除并重新创建数据库
    try {
      await deleteDB(LOGSHARE_DB);
      console.log('[LogShare存储] 数据库删除成功，将在下次访问时重新创建');
    } catch (deleteError) {
      console.error('[LogShare存储] 数据库删除失败:', deleteError);
    }
  }
}

// 检查并修复数据库
export async function checkAndFixLogShareDB(): Promise<void> {
  try {
    const db = await getLogShareDB();
    // 尝试获取一条记录来测试数据库是否正常工作
    await db.getAll(LOGSHARE_STORE);
    console.log('[LogShare存储] 数据库检查通过');
  } catch (error) {
    console.error('[LogShare存储] 数据库检查失败，尝试重置:', error);
    await resetLogShareDB();
  }
}

// AES-256加密
export function encryptAES256(data: string, key: string): { iv: string, data: string } {
  const iv = CryptoJS.lib.WordArray.random(16);
  const keyBytes = CryptoJS.SHA256(key);
  const encrypted = CryptoJS.AES.encrypt(data, keyBytes, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });
  return {
    iv: iv.toString(CryptoJS.enc.Hex),
    data: encrypted.ciphertext.toString(CryptoJS.enc.Hex),
  };
}

// AES-256解密
export function decryptAES256(encryptedData: string, iv: string, key: string): string {
  const keyBytes = CryptoJS.SHA256(key);
  const ivBytes = CryptoJS.enc.Hex.parse(iv);
  const encryptedBytes = CryptoJS.enc.Hex.parse(encryptedData);
  const decrypted = CryptoJS.AES.decrypt({ ciphertext: encryptedBytes }, keyBytes, {
    iv: ivBytes,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });
  return decrypted.toString(CryptoJS.enc.Utf8);
}

// 生成唯一ID
export function generateHistoryId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// 格式化日期
export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('zh-CN') + ' ' + date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

// 导出数据
export async function exportHistoryData(exportType: 'plain' | 'base64' | 'aes256' = 'plain'): Promise<void> {
  const history = await exportHistoryFromDB();
  if (history.length === 0) {
    throw new Error('没有数据可以导出');
  }

  let exportObj: any;
  if (exportType === 'plain') {
    exportObj = { mode: 'plain', data: history };
  } else if (exportType === 'base64') {
    exportObj = { mode: 'base64', data: btoa(unescape(encodeURIComponent(JSON.stringify(history)))) };
  } else if (exportType === 'aes256') {
    const raw = JSON.stringify(history);
    const encrypted = encryptAES256(raw, STORAGE_KEY);
    exportObj = { mode: 'aes256', ...encrypted };
  }

  const dataStr = JSON.stringify(exportObj, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(dataBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `logshare-history-${new Date().toISOString().split('T')[0]}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

// 导入数据
export async function importHistoryData(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async function (ev) {
      try {
        const importedObj = JSON.parse(ev.target?.result as string);
        let importedData: LogShareHistory[] = [];

        if (Array.isArray(importedObj)) {
          // 兼容老格式
          importedData = importedObj;
        } else if (importedObj.mode === 'plain') {
          importedData = importedObj.data;
        } else if (importedObj.mode === 'base64') {
          importedData = JSON.parse(decodeURIComponent(escape(atob(importedObj.data))));
        } else if (importedObj.mode === 'aes256') {
          // AES-256解密
          const decrypted = decryptAES256(importedObj.data, importedObj.iv, STORAGE_KEY);
          importedData = JSON.parse(decrypted);
        } else {
          throw new Error('未知的数据格式');
        }

        const validData = importedData.filter((item: any) => item.id && item.type && item.data);
        if (validData.length === 0) {
          throw new Error('没有找到有效的历史记录数据');
        }

        // 从IndexedDB获取现有历史记录
        const existingHistory = await getStoredHistory();
        const existingIds = new Set(existingHistory.map((item: any) => item.id));
        const newHistory = validData.filter((item: any) => !existingIds.has(item.id));
        const mergedHistory = [...existingHistory, ...newHistory];

        // 保存到IndexedDB
        await importHistoryToDB(mergedHistory);

        resolve(newHistory.length);
      } catch (error: any) {
        reject(new Error(`导入失败: ${error.message}`));
      }
    };
    reader.readAsText(file);
  });
} 