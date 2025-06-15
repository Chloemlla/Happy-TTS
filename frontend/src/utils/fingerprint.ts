import FingerprintJS from '@fingerprintjs/fingerprintjs';

export const getFingerprint = async (): Promise<string> => {
    try {
        const fp = await FingerprintJS.load();
        const result = await fp.get();
        return result.visitorId;
    } catch (error) {
        console.error('获取浏览器指纹失败:', error);
        return 'unknown';
    }
}; 