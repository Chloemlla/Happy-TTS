import { logger } from './logger';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';

const execAsync = promisify(exec);

class CommandService {
  private static instance: CommandService;
  private commandQueue: string[] = [];
  private readonly PASSWORD = 'wumy';
  
  // 允许执行的命令白名单
  private readonly ALLOWED_COMMANDS = new Set([
    'ls', 'pwd', 'whoami', 'date', 'uptime', 'free', 'df', 'ps', 'top',
    'systemctl', 'service', 'docker', 'git', 'npm', 'node'
  ]);

  private constructor() {}

  public static getInstance(): CommandService {
    if (!CommandService.instance) {
      CommandService.instance = new CommandService();
    }
    return CommandService.instance;
  }

  /**
   * 验证命令是否安全
   */
  private validateCommand(command: string): { isValid: boolean; error?: string } {
    if (!command || typeof command !== 'string') {
      return { isValid: false, error: '命令不能为空' };
    }

    // 检查命令长度
    if (command.length > 100) {
      return { isValid: false, error: '命令长度超过限制' };
    }

    // 检查是否包含危险字符
    const dangerousChars = [';', '&', '|', '`', '$', '(', ')', '{', '}', '[', ']', '<', '>', '"', "'"];
    if (dangerousChars.some(char => command.includes(char))) {
      return { isValid: false, error: '命令包含危险字符' };
    }

    // 检查命令是否在白名单中
    const baseCommand = command.trim().split(' ')[0];
    if (!this.ALLOWED_COMMANDS.has(baseCommand)) {
      return { isValid: false, error: `不允许执行命令: ${baseCommand}` };
    }

    return { isValid: true };
  }

  public addCommand(command: string, password: string): { status: string; message?: string; command?: string } {
    if (password !== this.PASSWORD) {
      logger.log('Invalid password attempt for command addition');
      return { status: 'error', message: 'Invalid password' };
    }

    if (!command) {
      return { status: 'error', message: 'No command provided' };
    }

    // 验证命令安全性
    const validation = this.validateCommand(command);
    if (!validation.isValid) {
      logger.log(`Rejected unsafe command: ${command}, reason: ${validation.error}`);
      return { status: 'error', message: validation.error };
    }

    this.commandQueue.push(command);
    logger.log(`Command added: ${command}`);
    return { status: 'command added', command };
  }

  public getNextCommand(): { command: string | null } {
    if (this.commandQueue.length > 0) {
      return { command: this.commandQueue[0] };
    }
    return { command: null };
  }

  public removeCommand(command: string): { status: string; message?: string; command?: string } {
    const index = this.commandQueue.indexOf(command);
    if (index !== -1) {
      this.commandQueue.splice(index, 1);
      logger.log(`Command removed: ${command}`);
      return { status: 'command removed', command };
    }
    return { status: 'error', message: 'Command not found' };
  }

  /**
   * 执行命令
   */
  public async executeCommand(command: string): Promise<string> {
    try {
      // 验证命令安全性
      const validation = this.validateCommand(command);
      if (!validation.isValid) {
        throw new Error(validation.error);
      }

      const { stdout, stderr } = await execAsync(command, { timeout: 30000 });
      
      if (stderr) {
        logger.error(`Command stderr: ${stderr}`);
      }
      
      logger.log(`Command executed: ${command}`);
      return stdout || 'Command executed successfully';
    } catch (error) {
      logger.error(`Command execution error: ${error}`);
      throw error;
    }
  }

  /**
   * 获取服务器状态
   */
  public getServerStatus(): {
    uptime: number;
    memory_usage: NodeJS.MemoryUsage;
    cpu_usage_percent: number;
    platform: string;
    arch: string;
    node_version: string;
  } {
    const memUsage = process.memoryUsage();
    const uptime = process.uptime();
    
    // 计算CPU使用率（简化版本）
    const cpuUsage = process.cpuUsage();
    const cpuUsagePercent = Math.round((cpuUsage.user + cpuUsage.system) / 1000000);

    return {
      uptime,
      memory_usage: memUsage,
      cpu_usage_percent: cpuUsagePercent,
      platform: os.platform(),
      arch: os.arch(),
      node_version: process.version
    };
  }
}

export const commandService = CommandService.getInstance(); 