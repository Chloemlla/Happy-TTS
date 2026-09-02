import { spawn } from "node:child_process";
import * as os from "node:os";
import { isAdminOperationPasswordValid } from "../utils/adminOperationPassword";
import * as commandStorage from "./commandStorage";

class CommandService {
  private static instance: CommandService;

  // G7-39: bound accumulated child-process output so `ls -R /` cannot OOM the
  // process by building an unbounded JS string.
  private static readonly MAX_OUTPUT_BYTES = 1024 * 1024;

  // 允许执行的命令白名单
  // G7-39: ping/nslookup/netstat/route/arp removed — they turn the server into a
  // network probe / DNS exfil channel.
  private readonly ALLOWED_COMMANDS = new Set([
    // Linux/Unix 命令
    "ls",
    "pwd",
    "whoami",
    "date",
    "uptime",
    "free",
    "df",
    "ps",
    "top",
    // Windows 命令
    "dir",
    "cd",
    "cls",
    "ver",
    "hostname",
    "ipconfig",
    "tasklist",
    "systeminfo",
  ]);

  // 危险命令黑名单
  private readonly DANGEROUS_COMMANDS = new Set([
    "rm",
    "cat",
    "wget",
    "curl",
    "nc",
    "bash",
    "sh",
    "python",
    "perl",
    "ruby",
    "touch",
    "mkdir",
    "cp",
    "mv",
    "ln",
    "chmod",
    "chown",
    "kill",
    "reboot",
    "dd",
    "format",
    "fdisk",
    "mkfs",
    "mount",
    "umount",
    "sudo",
    "su",
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
    console.log("🔍 [CommandService] 开始验证命令:", command);

    if (!command || typeof command !== "string") {
      console.log("❌ [CommandService] 命令为空或类型错误");
      return { isValid: false, error: "命令不能为空" };
    }

    // 检查命令长度
    if (command.length > 100) {
      console.log("❌ [CommandService] 命令长度超过限制:", command.length);
      return { isValid: false, error: "命令长度超过限制" };
    }

    // 检查是否包含危险字符（优先检查）
    const dangerousChars = [";", "&", "|", "`", "$", "(", ")", "{", "}", "[", "]", "<", ">", '"', "'"];
    if (dangerousChars.some((char) => command.includes(char))) {
      console.log("❌ [CommandService] 命令包含危险字符");
      return { isValid: false, error: "命令包含危险字符" };
    }

    // 解析命令和参数
    const parts = command.trim().split(/\s+/);
    const baseCommand = parts[0];
    const args = parts.slice(1);

    // 路径遍历检测
    // G7-39: the previous blacklist required a trailing slash (/etc/ matches but
    // `ls /etc` and `ls -R /` do not). Reject absolute paths and `..` segments
    // outright instead.
    for (const arg of args) {
      if (arg.startsWith("/") || arg === ".." || arg.startsWith("../") || arg.includes("/../") || arg.endsWith("/..")) {
        console.log("❌ [CommandService] 参数包含路径遍历");
        return { isValid: false, error: "参数包含危险字符" };
      }
    }

    // 只允许白名单命令
    if (!this.ALLOWED_COMMANDS.has(baseCommand) || this.DANGEROUS_COMMANDS.has(baseCommand)) {
      console.log("❌ [CommandService] 命令不在允许列表");
      return { isValid: false, error: "不允许执行命令" };
    }

    // 参数仅允许安全字符
    const argPattern = /^[a-zA-Z0-9_\-./]{0,64}$/;
    for (const arg of args) {
      if (!argPattern.test(arg)) {
        console.log("❌ [CommandService] 参数包含非法字符");
        return { isValid: false, error: "参数包含非法字符" };
      }
    }

    console.log("✅ [CommandService] 命令验证通过:", baseCommand);

    return { isValid: true, command: baseCommand, args };
  }

  /**
   * Run a child process with bounded output and a cleared timeout.
   * G7-39: stdout/stderr are capped at MAX_OUTPUT_BYTES (killing the process on
   * overflow) and the timeout timer is cleared on close/error.
   */
  private executeBounded(bin: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(bin, args, {
        stdio: ["pipe", "pipe", "pipe"],
        shell: false,
        timeout: 30000,
      });

      let stdout = "";
      let stderr = "";

      const killTimer = setTimeout(() => {
        child.kill("SIGTERM");
        reject(new Error("Command execution timeout"));
      }, 30000);

      child.stdout.on("data", (data: Buffer) => {
        stdout += data.toString();
        if (stdout.length > CommandService.MAX_OUTPUT_BYTES) {
          stdout = stdout.slice(0, CommandService.MAX_OUTPUT_BYTES) + "\n[output truncated]";
          child.kill("SIGTERM");
        }
      });

      child.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
        if (stderr.length > CommandService.MAX_OUTPUT_BYTES) {
          stderr = stderr.slice(0, CommandService.MAX_OUTPUT_BYTES) + "\n[stderr truncated]";
        }
      });

      child.on("close", (code) => {
        clearTimeout(killTimer);
        if (code === 0) {
          resolve(stdout || "Command executed successfully");
        } else {
          reject(new Error(`Command failed with exit code ${code}: ${stderr}`));
        }
      });

      child.on("error", (error) => {
        clearTimeout(killTimer);
        reject(new Error(`Command execution error: ${error.message}`));
      });
    });
  }

  /**
   * 安全执行命令
   */
  private async executeCommandSafely(command: string, args: string[]): Promise<string> {
    console.log("🚀 [CommandService] 开始执行命令...");
    console.log("   命令:", command);
    console.log("   参数:", args);
    console.log("   操作系统:", process.platform);

    // 检测操作系统
    const isWindows = process.platform === "win32";

    // Windows系统需要特殊处理内置命令
    if (isWindows) {
      // Windows内置命令映射
      const windowsBuiltinCommands: Record<string, string> = {
        // Windows原生命令
        dir: "cmd",
        cd: "cmd",
        cls: "cmd",
        ver: "cmd",
        hostname: "hostname",
        ipconfig: "ipconfig",
        tasklist: "tasklist",
        systeminfo: "systeminfo",
        // Linux/Unix命令映射到Windows等效命令
        pwd: "cmd", // pwd -> cd (不带参数显示当前目录)
        ls: "cmd", // ls -> dir
        whoami: "whoami", // whoami在Windows上存在
        date: "cmd", // date -> date
        uptime: "cmd", // uptime -> systeminfo (部分信息)
        free: "cmd", // free -> systeminfo (内存信息)
        df: "cmd", // df -> dir (磁盘信息)
        ps: "cmd", // ps -> tasklist
        top: "cmd", // top -> tasklist /v
      };

      const builtinCommand = windowsBuiltinCommands[command];
      console.log("   Windows内置命令映射:", builtinCommand);

      if (builtinCommand === "cmd") {
        // 对于cmd内置命令，使用cmd /c执行
        console.log("   使用cmd /c执行内置命令");

        // 使用硬编码命令映射，避免将用户输入传递给 spawn
        const SAFE_COMMAND_MAP: Record<string, { cmd: string; args: string[] }> = {
          cd: { cmd: "cd", args: [] },
          dir: { cmd: "dir", args: [] },
          cls: { cmd: "cls", args: [] },
          ver: { cmd: "ver", args: [] },
          date: { cmd: "date", args: ["/t"] },
          systeminfo: { cmd: "systeminfo", args: [] },
          tasklist: { cmd: "tasklist", args: [] },
        };

        // 特殊处理Linux/Unix命令映射
        let mappedKey = command;
        if (command === "pwd") mappedKey = "cd";
        else if (command === "ls" || command === "df") mappedKey = "dir";
        else if (command === "date") mappedKey = "date";
        else if (command === "uptime" || command === "free") mappedKey = "systeminfo";
        else if (command === "ps") mappedKey = "tasklist";
        else if (command === "top") {
          mappedKey = "tasklist";
          SAFE_COMMAND_MAP.tasklist = { cmd: "tasklist", args: ["/v"] };
        }

        const safeEntry = SAFE_COMMAND_MAP[mappedKey];
        if (!safeEntry) {
          return Promise.reject(new Error("命令未被允许"));
        }

        return this.executeBounded("cmd", ["/c", safeEntry.cmd, ...safeEntry.args]);
      } else {
        // 对于其他Windows命令，使用硬编码路径映射
        const SAFE_WIN_COMMANDS: Record<string, string> = {
          hostname: "hostname",
          ipconfig: "ipconfig",
          tasklist: "tasklist",
          systeminfo: "systeminfo",
          whoami: "whoami",
        };
        const safeWinCmd = SAFE_WIN_COMMANDS[command];
        if (!safeWinCmd) {
          return Promise.reject(new Error("命令未被允许"));
        }
        // 参数仅允许安全字符
        const safeArgs: string[] = [];
        if (args && args.length > 0) {
          const argPattern = /^[a-zA-Z0-9_\-./]{0,64}$/;
          for (const arg of args) {
            if (!argPattern.test(arg)) {
              return Promise.reject(new Error("参数包含非法字符"));
            }
            safeArgs.push(arg);
          }
        }
        return this.executeBounded(safeWinCmd, safeArgs);
      }
    } else {
      // Linux/Unix系统 - 使用硬编码命令映射
      console.log("   在Linux/Unix系统上执行命令");
      const SAFE_UNIX_COMMANDS: Record<string, string> = {
        ls: "/bin/ls",
        pwd: "/bin/pwd",
        whoami: "/usr/bin/whoami",
        date: "/bin/date",
        uptime: "/usr/bin/uptime",
        free: "/usr/bin/free",
        df: "/bin/df",
        ps: "/bin/ps",
        top: "/usr/bin/top",
        hostname: "/bin/hostname",
      };
      const safeUnixCmd = SAFE_UNIX_COMMANDS[command];
      if (!safeUnixCmd) {
        return Promise.reject(new Error("命令未被允许"));
      }
      // 参数仅允许安全字符
      const safeUnixArgs: string[] = [];
      if (args && args.length > 0) {
        const argPattern = /^[a-zA-Z0-9_\-./]{0,64}$/;
        for (const arg of args) {
          if (!argPattern.test(arg)) {
            return Promise.reject(new Error("参数包含非法字符"));
          }
          safeUnixArgs.push(arg);
        }
      }
      return this.executeBounded(safeUnixCmd, safeUnixArgs);
    }
  }

  public async addCommand(
    command: string,
    _password: string,
  ): Promise<{ status: string; message?: string; command?: string; commandId?: string }> {
    console.log("🔐 [CommandService] 添加命令请求:");
    console.log("   命令:", command);
    console.log("   密码: [已隐藏]");

    if (!command) {
      console.log("❌ [CommandService] 命令为空");
      return { status: "error", message: "No command provided" };
    }

    if (!this.isValidPassword(_password)) {
      console.log("❌ [CommandService] 密码验证失败");
      return { status: "error", message: "Invalid password" };
    }

    // 验证命令安全性
    const validation = this.validateCommand(command);
    console.log("🔍 [CommandService] 命令验证结果:");
    console.log("   是否有效:", validation.isValid);
    console.log("   错误信息:", validation.error);
    console.log("   解析的命令:", validation.command);
    console.log("   解析的参数:", validation.args);

    if (!validation.isValid) {
      console.log(`❌ [CommandService] 拒绝不安全的命令: ${command}, 原因: ${validation.error}`);
      return { status: "error", message: validation.error };
    }

    try {
      // 添加到MongoDB队列
      const result = await commandStorage.addToQueue(command);
      console.log(`✅ [CommandService] 命令已添加到队列: ${command}, ID: ${result.commandId}`);
      return { status: "command added", command, commandId: result.commandId };
    } catch (error) {
      console.error("❌ [CommandService] 添加到队列失败:", error);
      return { status: "error", message: "Failed to add command to queue" };
    }
  }

  public async getNextCommand(): Promise<{ command: string | null; commandId?: string }> {
    try {
      const queue = await commandStorage.getCommandQueue();
      if (queue.length > 0) {
        const nextCommand = queue[0];
        return { command: nextCommand.command, commandId: nextCommand.commandId };
      }
      return { command: null };
    } catch (error) {
      console.error("❌ [CommandService] 获取队列失败:", error);
      return { command: null };
    }
  }

  public async removeCommand(commandId: string): Promise<{ status: string; message?: string; command?: string }> {
    try {
      const removed = await commandStorage.removeFromQueue(commandId);
      if (removed) {
        console.log(`✅ [CommandService] 命令已从队列移除: ${commandId}`);
        return { status: "command removed", command: commandId };
      }
      return { status: "error", message: "Command not found" };
    } catch (error) {
      console.error("❌ [CommandService] 移除命令失败:", error);
      return { status: "error", message: "Failed to remove command" };
    }
  }

  /**
   * 执行命令
   * 密码闸门在路由层（`src/routes/commandRoutes.ts` 的 `/execute`）：本方法不重复校验，
   * 因此不要把它暴露给任何未经 isSuperAdmin + isAdminOperationPasswordValid 的调用方。
   */
  public async executeCommand(command: string): Promise<string> {
    const startTime = Date.now();
    let executionTime = 0;

    try {
      // 验证命令安全性
      const validation = this.validateCommand(command);
      if (!validation.isValid) {
        throw new Error(validation.error);
      }

      if (!validation.command || !validation.args) {
        throw new Error("命令验证失败");
      }

      // 使用安全的参数化执行
      const result = await this.executeCommandSafely(validation.command, validation.args);

      executionTime = Date.now() - startTime;
      console.log(`✅ [CommandService] 命令执行成功: ${command}, 耗时: ${executionTime}ms`);

      // 记录执行历史
      try {
        await commandStorage.addToHistory({
          command,
          result,
          status: "success",
          executionTime,
        });
      } catch (historyError) {
        console.error("❌ [CommandService] 记录执行历史失败:", historyError);
      }

      return result;
    } catch (error) {
      executionTime = Date.now() - startTime;
      console.error(`❌ [CommandService] 命令执行失败: ${command}, 耗时: ${executionTime}ms, 错误: ${error}`);

      // 记录执行历史
      try {
        await commandStorage.addToHistory({
          command,
          result: error instanceof Error ? error.message : String(error),
          status: "failed",
          executionTime,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      } catch (historyError) {
        console.error("❌ [CommandService] 记录执行历史失败:", historyError);
      }

      throw error;
    }
  }

  /**
   * 获取执行历史
   */
  public async getExecutionHistory(limit: number = 50) {
    try {
      return await commandStorage.getExecutionHistory(limit);
    } catch (error) {
      console.error("❌ [CommandService] 获取执行历史失败:", error);
      return [];
    }
  }

  /**
   * 清空执行历史
   */
  public async clearExecutionHistory() {
    try {
      await commandStorage.clearHistory();
      console.log("✅ [CommandService] 执行历史已清空");
      return { status: "success", message: "History cleared" };
    } catch (error) {
      console.error("❌ [CommandService] 清空执行历史失败:", error);
      return { status: "error", message: "Failed to clear history" };
    }
  }

  /**
   * 清空命令队列
   */
  public async clearCommandQueue() {
    try {
      await commandStorage.clearQueue();
      console.log("✅ [CommandService] 命令队列已清空");
      return { status: "success", message: "Queue cleared" };
    } catch (error) {
      console.error("❌ [CommandService] 清空命令队列失败:", error);
      return { status: "error", message: "Failed to clear queue" };
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
      node_version: process.version,
    };
  }

  private isValidPassword(password: string): boolean {
    // G7-39: the `NODE_ENV === "test" && password === "wumy"` hardcoded
    // backdoor is removed. Any deployment with NODE_ENV=test would otherwise
    // accept a universal admin password.
    return isAdminOperationPasswordValid(password);
  }
}

export const commandService = CommandService.getInstance();
