/**
 * 篡改检测API测试脚本
 * 用于验证API连接和功能是否正常
 */

import { getApiBaseUrl } from '../api/api';
import { signedFetch } from './requestSigner';

export const testTamperAPI = async () => {
  const apiUrl = `${getApiBaseUrl()}/api/tamper/report-tampering`;
  
  console.log('🧪 开始测试篡改检测API...');
  console.log('📍 API地址:', apiUrl);
  
  const testEvent = {
    eventType: 'test_event',
    elementId: 'test-element',
    timestamp: new Date().toISOString(),
    url: window.location.href,
    tamperType: 'dom',
    detectionMethod: 'api-test',
    originalContent: 'Test Original Content',
    tamperContent: 'Test Tampered Content',
    filePath: window.location.pathname,
    checksum: 'test-checksum',
    attempts: 1,
    additionalInfo: {
      testMode: true,
      userAgent: navigator.userAgent,
      timestamp: Date.now()
    }
  };
  
  try {
    console.log('📤 发送测试数据:', testEvent);
    const body = JSON.stringify(testEvent);
    
    const response = await signedFetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body
    });
    
    console.log('📥 响应状态:', response.status, response.statusText);
    
    if (response.ok) {
      const result = await response.json();
      console.log('✅ API测试成功!');
      console.log('📋 响应数据:', result);
      return { success: true, data: result };
    } else {
      const errorText = await response.text();
      console.error('❌ API测试失败!');
      console.error('📋 错误响应:', errorText);
      return { success: false, error: errorText, status: response.status };
    }
  } catch (error) {
    console.error('❌ API测试异常!');
    console.error('📋 错误详情:', error);
    return { success: false, error: String(error) };
  }
};

// 挂载到全局对象，方便在控制台中调用
if (typeof window !== 'undefined') {
  (window as any).testTamperAPI = testTamperAPI;
}

export default testTamperAPI;
