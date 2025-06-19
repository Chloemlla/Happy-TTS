import { logger } from './logger';

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
}

export const commandService = CommandService.getInstance(); 