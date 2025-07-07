import { logger } from './logger';
import { spawn } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';

class CommandService {
  private static instance: CommandService;
  private commandQueue: string[] = [];
  private readonly PASSWORD = 'wumy';
  
  // 允许执行的命令白名单
  private readonly ALLOWED_COMMANDS = new Set([
    'ls', 'pwd', 'whoami', 'date', 'uptime', 'free', 'df', 'ps', 'top',
    'systemctl', 'service', 'docker', 'git', 'npm', 'node'
  ]);

  // 危险命令黑名单
  private readonly DANGEROUS_COMMANDS = new Set([
    'rm', 'cat', 'wget', 'curl', 'nc', 'bash', 'sh', 'python', 'perl', 'ruby',
    'echo', 'touch', 'mkdir', 'cp', 'mv', 'ln', 'chmod', 'chown', 'kill', 'reboot',
    'dd', 'format', 'fdisk', 'mkfs', 'mount', 'umount', 'sudo', 'su', 'chmod', 'chown'
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
  private validateCommand(command: string): { isValid: boolean; error?: string; command?: string; args?: string[] } {
    if (!command || typeof command !== 'string') {
      return { isValid: false, error: '命令不能为空' };
    }

    // 检查命令长度
    if (command.length > 100) {
      return { isValid: false, error: '命令长度超过限制' };
    }

    // 检查是否包含危险字符（优先检查）
    const dangerousChars = [';', '&', '|', '`', '$', '(', ')', '{', '}', '[', ']', '<', '>', '"', "'"];
    if (dangerousChars.some(char => command.includes(char))) {
      return { isValid: false, error: '命令包含危险字符' };
    }

    // 检查路径遍历攻击
    const pathTraversalPatterns = [
      /\.\.\//g,  // ../
      /\.\.\\/g,  // ..\
      /\/etc\//g, // /etc/
      /\/root\//g, // /root/
      /\/tmp\//g,  // /tmp/
      /\/var\//g,  // /var/
      /\/home\//g, // /home/
      /\/usr\//g,  // /usr/
      /\/bin\//g,  // /bin/
      /\/sbin\//g, // /sbin/
      /\/lib\//g,  // /lib/
      /\/opt\//g,  // /opt/
      /\/mnt\//g,  // /mnt/
      /\/media\//g, // /media/
      /\/dev\//g,  // /dev/
      /\/proc\//g  // /proc/
    ];
    
    if (pathTraversalPatterns.some(pattern => pattern.test(command))) {
      return { isValid: false, error: '参数包含危险字符' };
    }

    // 解析命令和参数
    const parts = command.trim().split(/\s+/);
    const baseCommand = parts[0];
    const args = parts.slice(1);

    // 检查命令是否在黑名单中
    if (this.DANGEROUS_COMMANDS.has(baseCommand)) {
      return { isValid: false, error: `不允许执行命令: ${baseCommand}` };
    }

    // 检查命令是否在白名单中
    if (!this.ALLOWED_COMMANDS.has(baseCommand)) {
      return { isValid: false, error: `不允许执行命令: ${baseCommand}` };
    }

    // 验证参数安全性
    for (const arg of args) {
      if (dangerousChars.some(char => arg.includes(char))) {
        return { isValid: false, error: `参数包含危险字符: ${arg}` };
      }
      
      // 检查参数中的路径遍历
      if (pathTraversalPatterns.some(pattern => pattern.test(arg))) {
        return { isValid: false, error: `参数包含危险字符: ${arg}` };
      }
    }

    return { isValid: true, command: baseCommand, args };
  }

  /**
   * 安全执行命令
   */
  private async executeCommandSafely(command: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const childProcess = spawn(command, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false, // 禁用shell以避免命令注入
        timeout: 30000
      });

      let stdout = '';
      let stderr = '';

      childProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      childProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      childProcess.on('close', (code) => {
        if (code === 0) {
          resolve(stdout || 'Command executed successfully');
        } else {
          reject(new Error(`Command failed with exit code ${code}: ${stderr}`));
        }
      });

      childProcess.on('error', (error) => {
        reject(new Error(`Command execution error: ${error.message}`));
      });

      // 设置超时
      setTimeout(() => {
        childProcess.kill('SIGTERM');
        reject(new Error('Command execution timeout'));
      }, 30000);
    });
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

      if (!validation.command || !validation.args) {
        throw new Error('命令验证失败');
      }

      // 使用安全的参数化执行
      const result = await this.executeCommandSafely(validation.command, validation.args);
      
      logger.log(`Command executed: ${command}`);
      return result;
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