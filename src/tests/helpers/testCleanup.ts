/**
 * 测试清理工具
 * 用于管理测试中的异步资源清理
 */

import { addCleanupTask } from '../setup';

export class TestCleanup {
  private static instance: TestCleanup;
  private cleanupTasks: (() => void | Promise<void>)[] = [];
  private timers: NodeJS.Timeout[] = [];
  private intervals: NodeJS.Timeout[] = [];

  private constructor() {}

  public static getInstance(): TestCleanup {
    if (!TestCleanup.instance) {
      TestCleanup.instance = new TestCleanup();
    }
    return TestCleanup.instance;
  }

  /**
   * 添加清理任务
   */
  public addTask(task: () => void | Promise<void>): void {
    this.cleanupTasks.push(task);
    addCleanupTask(task);
  }

  /**
   * 注册定时器以便清理
   */
  public registerTimer(timer: NodeJS.Timeout): void {
    this.timers.push(timer);
  }

  /**
   * 注册间隔定时器以便清理
   */
  public registerInterval(interval: NodeJS.Timeout): void {
    this.intervals.push(interval);
  }

  /**
   * 清理所有资源
   */
  public async cleanup(): Promise<void> {
    console.log('TestCleanup: 开始清理资源...');

    // 清理间隔定时器
    for (const interval of this.intervals) {
      try {
        clearInterval(interval);
      } catch (error) {
        console.warn('清理间隔定时器失败:', error);
      }
    }
    this.intervals = [];

    // 清理定时器
    for (const timer of this.timers) {
      try {
        clearTimeout(timer);
      } catch (error) {
        console.warn('清理定时器失败:', error);
      }
    }
    this.timers = [];

    // 执行清理任务
    for (const task of this.cleanupTasks) {
      try {
        await task();
      } catch (error) {
        console.warn('执行清理任务失败:', error);
      }
    }
    this.cleanupTasks = [];

    console.log('TestCleanup: 资源清理完成');
  }

  /**
   * 清理特定服务
   */
  public async cleanupService(serviceName: string): Promise<void> {
    try {
      switch (serviceName) {
        case 'libreChat':
          const { libreChatService } = require('../../services/libreChatService');
          if (libreChatService && typeof libreChatService.cleanup === 'function') {
            libreChatService.cleanup();
          }
          break;
        
        case 'command':
          const { commandService } = require('../../services/commandService');
          if (commandService && typeof commandService.cleanup === 'function') {
            commandService.cleanup();
          }
          break;
        
        case 'dataCollection':
          const { dataCollectionService } = require('../../services/dataCollectionService');
          if (dataCollectionService && typeof dataCollectionService.cleanup === 'function') {
            dataCollectionService.cleanup();
          }
          break;
        
        default:
          console.warn(`未知的服务: ${serviceName}`);
      }
    } catch (error) {
      console.warn(`清理服务 ${serviceName} 失败:`, error);
    }
  }
}

// 导出单例实例
export const testCleanup = TestCleanup.getInstance();

/**
 * 自动清理装饰器
 * 用于自动注册清理任务
 */
export function AutoCleanup() {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      try {
        const result = await originalMethod.apply(this, args);
        return result;
      } finally {
        // 测试完成后自动清理
        await testCleanup.cleanup();
      }
    };

    return descriptor;
  };
}

/**
 * 清理特定服务的装饰器
 */
export function CleanupService(serviceName: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      try {
        const result = await originalMethod.apply(this, args);
        return result;
      } finally {
        // 清理特定服务
        await testCleanup.cleanupService(serviceName);
      }
    };

    return descriptor;
  };
} 