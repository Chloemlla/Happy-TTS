import { logger } from './logger';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';

const execAsync = promisify(exec);

class CommandService {
  private static instance: CommandService;
  private commandQueue: string[] = [];
  private readonly PASSWORD = 'wumy';

  private constructor() {}

  public static getInstance(): CommandService {
    if (!CommandService.instance) {
      CommandService.instance = new CommandService();
    }
    return CommandService.instance;
  }

  public addCommand(command: string, password: string): { status: string; message?: string; command?: string } {
    if (password !== this.PASSWORD) {
      logger.log('Invalid password attempt for command addition');
      return { status: 'error', message: 'Invalid password' };
    }

    if (!command) {
      return { status: 'error', message: 'No command provided' };
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