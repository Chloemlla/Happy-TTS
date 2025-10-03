import React, { useState, useEffect } from 'react';
import { integrityChecker } from '../utils/integrityCheck';

interface TamperDetectionDemoProps {
  className?: string;
}

interface SystemStatus {
  initialized: boolean;
  disabled: boolean;
  recoveryMode: boolean;
  debugMode: boolean;
  errorCount: number;
  isExempt: boolean;
}

export const TamperDetectionDemo: React.FC<TamperDetectionDemoProps> = ({ className }) => {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [checkResult, setCheckResult] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  // 获取系统状态
  const updateStatus = () => {
    try {
      const debugInfo = integrityChecker.getDebugInfo();
      const errorStatus = integrityChecker.getErrorStatus();
      const exemptStatus = integrityChecker.checkExemptStatus();
      
      setStatus({
        initialized: debugInfo.isInitialized,
        disabled: integrityChecker.isDisabled(),
        recoveryMode: debugInfo.isInRecoveryMode,
        debugMode: false, // 需要从其他地方获取
        errorCount: errorStatus.errorCount,
        isExempt: exemptStatus.isExempt
      });
    } catch (error) {
      console.error('获取状态失败:', error);
    }
  };

  // 执行完整性检查
  const handleCheck = async (checkType: 'all' | 'dom' | 'text' | 'network' | 'baseline' = 'all') => {
    setIsLoading(true);
    try {
      const result = await integrityChecker.manualCheck({
        checkType,
        forceCheck: false
      });
      setCheckResult(result);
    } catch (error) {
      console.error('检查失败:', error);
      setCheckResult({ success: false, errors: [String(error)] });
    } finally {
      setIsLoading(false);
    }
  };

  // 手动报告篡改
  const handleReportTampering = async () => {
    try {
      const result = await integrityChecker.manualReportTampering({
        eventType: 'manual_test',
        elementId: 'demo-element',
        originalContent: 'Original Content',
        tamperContent: 'Tampered Content',
        tamperType: 'dom',
        detectionMethod: 'manual-demo'
      });
      alert(result.success ? '报告成功!' : `报告失败: ${result.message}`);
    } catch (error) {
      alert(`报告失败: ${error}`);
    }
  };

  // 触发恢复
  const handleRecovery = (type: 'emergency' | 'soft' | 'baseline' = 'soft') => {
    try {
      const result = integrityChecker.manualRecovery({
        recoveryType: type,
        showWarning: true
      });
      alert(result.success ? '恢复成功!' : `恢复失败: ${result.message}`);
      updateStatus();
    } catch (error) {
      alert(`恢复失败: ${error}`);
    }
  };

  // 模拟篡改
  const handleSimulate = (type: 'dom' | 'network' | 'proxy' | 'injection') => {
    try {
      const result = integrityChecker.simulateTampering({
        tamperType: type,
        elementId: 'demo-simulation',
        testContent: `Simulated ${type} tampering`
      });
      alert(result.success ? '模拟成功!' : `模拟失败: ${result.message}`);
    } catch (error) {
      alert(`模拟失败: ${error}`);
    }
  };

  // 控制系统
  const handleControl = (action: 'pause' | 'resume' | 'disable' | 'reinit') => {
    try {
      switch (action) {
        case 'pause':
          integrityChecker.pause();
          break;
        case 'resume':
          integrityChecker.resume();
          break;
        case 'disable':
          integrityChecker.disable();
          break;
        case 'reinit':
          integrityChecker.reinitialize();
          break;
      }
      updateStatus();
      alert(`操作 ${action} 执行成功!`);
    } catch (error) {
      alert(`操作失败: ${error}`);
    }
  };

  useEffect(() => {
    updateStatus();
    const interval = setInterval(updateStatus, 5000); // 每5秒更新状态
    return () => clearInterval(interval);
  }, []);

  if (!status) {
    return <div className={className}>加载中...</div>;
  }

  return (
    <div className={`tamper-detection-demo p-6 bg-gray-50 rounded-lg ${className}`}>
      <h2 className="text-2xl font-bold mb-4 text-gray-800">🛡️ 篡改检测系统控制面板</h2>
      
      {/* 系统状态 */}
      <div className="mb-6 p-4 bg-white rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-3 text-gray-700">📊 系统状态</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <div className={`p-2 rounded ${status.initialized ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
            初始化: {status.initialized ? '✅' : '❌'}
          </div>
          <div className={`p-2 rounded ${status.disabled ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
            系统状态: {status.disabled ? '已禁用' : '正常'}
          </div>
          <div className={`p-2 rounded ${status.recoveryMode ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-800'}`}>
            恢复模式: {status.recoveryMode ? '启用' : '关闭'}
          </div>
          <div className={`p-2 rounded ${status.isExempt ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}`}>
            豁免状态: {status.isExempt ? '已豁免' : '正常检查'}
          </div>
          <div className="p-2 rounded bg-gray-100 text-gray-800">
            错误计数: {status.errorCount}
          </div>
          <div className="p-2 rounded bg-gray-100 text-gray-800">
            <button 
              onClick={updateStatus}
              className="text-blue-600 hover:text-blue-800 underline"
            >
              🔄 刷新状态
            </button>
          </div>
        </div>
      </div>

      {/* 完整性检查 */}
      <div className="mb-6 p-4 bg-white rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-3 text-gray-700">🔍 完整性检查</h3>
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={() => handleCheck('all')}
            disabled={isLoading}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
          >
            {isLoading ? '检查中...' : '全面检查'}
          </button>
          <button
            onClick={() => handleCheck('dom')}
            disabled={isLoading}
            className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
          >
            DOM检查
          </button>
          <button
            onClick={() => handleCheck('text')}
            disabled={isLoading}
            className="px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600 disabled:opacity-50"
          >
            文本检查
          </button>
          <button
            onClick={() => handleCheck('network')}
            disabled={isLoading}
            className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 disabled:opacity-50"
          >
            网络检查
          </button>
          <button
            onClick={() => handleCheck('baseline')}
            disabled={isLoading}
            className="px-4 py-2 bg-indigo-500 text-white rounded hover:bg-indigo-600 disabled:opacity-50"
          >
            基准检查
          </button>
        </div>
        
        {checkResult && (
          <div className={`p-3 rounded text-sm ${checkResult.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
            <div className="font-semibold mb-2">
              检查结果: {checkResult.success ? '✅ 通过' : '❌ 失败'}
            </div>
            {checkResult.results && checkResult.results.length > 0 && (
              <div className="mb-2">
                <strong>详细结果:</strong>
                <ul className="list-disc list-inside ml-2">
                  {checkResult.results.map((result: any, index: number) => (
                    <li key={index}>
                      {result.type}: {result.message || JSON.stringify(result)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {checkResult.errors && checkResult.errors.length > 0 && (
              <div>
                <strong>错误信息:</strong>
                <ul className="list-disc list-inside ml-2">
                  {checkResult.errors.map((error: string, index: number) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 操作控制 */}
      <div className="mb-6 p-4 bg-white rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-3 text-gray-700">🎛️ 系统控制</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <button
            onClick={() => handleControl('pause')}
            className="px-3 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600 text-sm"
          >
            ⏸️ 暂停
          </button>
          <button
            onClick={() => handleControl('resume')}
            className="px-3 py-2 bg-green-500 text-white rounded hover:bg-green-600 text-sm"
          >
            ▶️ 恢复
          </button>
          <button
            onClick={() => handleControl('disable')}
            className="px-3 py-2 bg-red-500 text-white rounded hover:bg-red-600 text-sm"
          >
            🚫 禁用
          </button>
          <button
            onClick={() => handleControl('reinit')}
            className="px-3 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
          >
            🔄 重初始化
          </button>
        </div>
      </div>

      {/* 恢复功能 */}
      <div className="mb-6 p-4 bg-white rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-3 text-gray-700">🔄 恢复功能</h3>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => handleRecovery('soft')}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            软恢复
          </button>
          <button
            onClick={() => handleRecovery('emergency')}
            className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
          >
            紧急恢复
          </button>
          <button
            onClick={() => handleRecovery('baseline')}
            className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
          >
            重捕获基准
          </button>
        </div>
      </div>

      {/* 测试功能 */}
      <div className="mb-6 p-4 bg-white rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-3 text-gray-700">🧪 测试功能</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
          <button
            onClick={() => handleSimulate('dom')}
            className="px-3 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 text-sm"
          >
            模拟DOM篡改
          </button>
          <button
            onClick={() => handleSimulate('network')}
            className="px-3 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 text-sm"
          >
            模拟网络篡改
          </button>
          <button
            onClick={() => handleSimulate('proxy')}
            className="px-3 py-2 bg-pink-500 text-white rounded hover:bg-pink-600 text-sm"
          >
            模拟代理篡改
          </button>
          <button
            onClick={() => handleSimulate('injection')}
            className="px-3 py-2 bg-red-500 text-white rounded hover:bg-red-600 text-sm"
          >
            模拟脚本注入
          </button>
        </div>
        <button
          onClick={handleReportTampering}
          className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
        >
          📤 手动报告篡改
        </button>
      </div>

      {/* 控制台提示 */}
      <div className="p-4 bg-blue-50 rounded-lg">
        <h3 className="text-lg font-semibold mb-2 text-blue-800">💡 控制台API</h3>
        <p className="text-blue-700 text-sm mb-2">
          打开浏览器控制台，使用全局 <code className="bg-blue-200 px-1 rounded">TamperDetection</code> API：
        </p>
        <div className="text-xs text-blue-600 font-mono bg-blue-100 p-2 rounded">
          <div>TamperDetection.help() // 查看帮助</div>
          <div>TamperDetection.status() // 查看状态</div>
          <div>await TamperDetection.check() // 执行检查</div>
          <div>TamperDetection.debug(true) // 启用调试</div>
        </div>
      </div>
    </div>
  );
};

export default TamperDetectionDemo;
