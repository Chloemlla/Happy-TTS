/**
 * 邮件模板模块
 * 包含所有HTML邮件模板的生成函数
 */

/**
 * 获取前端基础URL
 */
function _getFrontendBaseUrl(): string {
  return process.env.FRONTEND_URL || "https://tts.951100.xyz";
}

/**
 * 生成邮箱验证链接HTML模板
 * @param username 用户名
 * @param verificationLink 验证链接
 * @returns HTML邮件内容
 */
export function generateVerificationLinkEmailHtml(
  username: string,
  verificationLink: string
): string {
  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Happy-TTS 邮箱验证</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            background: linear-gradient(135deg, #f0f8ff 0%, #ffffff 50%, #f8f0ff 100%);
            min-height: 100vh;
            padding: 20px;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
            background: rgba(255, 255, 255, 0.8);
            backdrop-filter: blur(10px);
            border-radius: 24px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
            color: white;
            padding: 40px 30px;
            text-align: center;
        }
        .header h1 {
            font-size: 32px;
            font-weight: bold;
            margin-bottom: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 12px;
        }
        .header .icon {
            width: 40px;
            height: 40px;
            background: rgba(0, 0, 0, 0.22);
            border-radius: 50%;
            display: inline-block;
            text-align: center;
            line-height: 40px;
            font-size: 18px;
            font-weight: 700;
            color: #ffffff;
            box-shadow: 0 4px 10px rgba(0, 0, 0, 0.15);
            border: 1px solid rgba(255, 255, 255, 0.55);
        }
        .header p {
            color: #bfdbfe;
            font-size: 18px;
        }
        .content {
            padding: 40px 30px;
        }
        .welcome {
            text-align: center;
            margin-bottom: 30px;
        }
        .welcome h2 {
            font-size: 24px;
            color: #1f2937;
            margin-bottom: 10px;
        }
        .welcome p {
            color: #6b7280;
            font-size: 16px;
        }
        .button-section {
            text-align: center;
            margin: 30px 0;
        }
        .verify-button {
            display: inline-block;
            padding: 16px 48px;
            background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
            color: white;
            text-decoration: none;
            border-radius: 12px;
            font-size: 18px;
            font-weight: 600;
            box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
            transition: all 0.3s ease;
        }
        .verify-button:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 16px rgba(59, 130, 246, 0.4);
        }
        .instructions {
            background: rgba(59, 130, 246, 0.05);
            border-left: 4px solid #3b82f6;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
        }
        .instructions h3 {
            color: #1f2937;
            font-size: 18px;
            margin-bottom: 10px;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .instructions ul {
            color: #4b5563;
            padding-left: 20px;
        }
        .instructions li {
            margin-bottom: 8px;
        }
        .warning {
            background: rgba(239, 68, 68, 0.05);
            border: 1px solid rgba(239, 68, 68, 0.2);
            border-radius: 12px;
            padding: 20px;
            margin: 20px 0;
            text-align: center;
        }
        .warning p {
            color: #dc2626;
            font-size: 14px;
            margin: 5px 0;
        }
        .footer {
            background: #f9fafb;
            padding: 30px;
            text-align: center;
            border-top: 1px solid #e5e7eb;
        }
        .footer p {
            color: #6b7280;
            font-size: 14px;
            margin-bottom: 10px;
        }
        .footer .brand {
            color: #3b82f6;
            font-weight: 600;
            font-size: 16px;
        }
        @media (max-width: 600px) {
            .container {
                margin: 10px;
                border-radius: 16px;
            }
            .header {
                padding: 30px 20px;
            }
            .header h1 {
                font-size: 24px;
            }
            .content {
                padding: 30px 20px;
            }
            .verify-button {
                padding: 14px 36px;
                font-size: 16px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header" style="text-align:center;">
            <h1 style="margin:0;text-align:center;">
                <span class="icon" style="display:inline-block;width:40px;height:40px;line-height:40px;background:rgba(0,0,0,0.22);border-radius:50%;text-align:center;color:#ffffff;font-weight:700;border:1px solid rgba(255,255,255,0.55);">H</span>
                 <span class="logo-text">Happy-TTS</span>
            </h1>
            <p style="text-align:center;">文本转语音服务平台</p>
        </div>
        
        <div class="content">
            <div class="welcome">
                <h2>欢迎注册 Happy-TTS！</h2>
                <p>亲爱的 <strong>${username}</strong>，感谢您选择我们的服务</p>
            </div>
            
            <div class="button-section">
                <a href="${verificationLink}" class="verify-button" style="color: white; text-decoration: none;">
                    点击验证邮箱
                </a>
            </div>
            
            <div class="instructions">
                <h3>
                    📋 验证步骤
                </h3>
                <ul>
                    <li>点击上方按钮即可完成邮箱验证</li>
                    <li>请使用相同的设备和网络打开链接</li>
                    <li>验证成功后即可登录使用</li>
                    <li>验证链接10分钟内有效</li>
                </ul>
            </div>
            
            <div class="warning">
                <p><strong>⚠️ 安全提醒</strong></p>
                <p>请勿将验证链接转发给他人</p>
                <p>如果您没有进行注册操作，请忽略此邮件</p>
            </div>
        </div>
        
        <div class="footer">
            <p class="brand">Happy-TTS 团队</p>
            <p>让文字拥有声音的力量</p>
            <p style="font-size: 12px; color: #9ca3af;">
                此邮件由系统自动发送，请勿回复
            </p>
        </div>
    </div>
</body>
</html>
    `.trim();
}

/**
 * 生成密码重置验证链接HTML模板
 * @param username 用户名
 * @param resetLink 重置链接
 * @returns HTML邮件内容
 */
export function generatePasswordResetLinkEmailHtml(
  username: string,
  resetLink: string
): string {
  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Happy-TTS 密码重置</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            background: linear-gradient(135deg, #f0f8ff 0%, #ffffff 50%, #f8f0ff 100%);
            min-height: 100vh;
            padding: 20px;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
            background: rgba(255, 255, 255, 0.8);
            backdrop-filter: blur(10px);
            border-radius: 24px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
            color: white;
            padding: 40px 30px;
            text-align: center;
        }
        .header h1 {
            font-size: 32px;
            font-weight: bold;
            margin-bottom: 10px;
        }
        .header .icon {
            width: 40px;
            height: 40px;
            background: rgba(0, 0, 0, 0.22);
            border-radius: 50%;
            display: inline-block;
            text-align: center;
            line-height: 40px;
            font-size: 18px;
            font-weight: 700;
            color: #ffffff;
            box-shadow: 0 4px 10px rgba(0, 0, 0, 0.15);
            border: 1px solid rgba(255, 255, 255, 0.55);
        }
        .header p {
            color: #bfdbfe;
            font-size: 18px;
        }
        .content {
            padding: 40px 30px;
        }
        .welcome {
            text-align: center;
            margin-bottom: 30px;
        }
        .welcome h2 {
            font-size: 24px;
            color: #1f2937;
            margin-bottom: 10px;
        }
        .welcome p {
            color: #6b7280;
            font-size: 16px;
        }
        .button-section {
            text-align: center;
            margin: 30px 0;
        }
        .reset-button {
            display: inline-block;
            padding: 16px 48px;
            background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
            color: white;
            text-decoration: none;
            border-radius: 12px;
            font-size: 18px;
            font-weight: 600;
            box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
            transition: all 0.3s ease;
        }
        .reset-button:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 16px rgba(59, 130, 246, 0.4);
        }
        .instructions {
            background: rgba(59, 130, 246, 0.05);
            border-left: 4px solid #3b82f6;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
        }
        .instructions h3 {
            color: #1f2937;
            font-size: 18px;
            margin-bottom: 10px;
        }
        .instructions ul {
            color: #4b5563;
            padding-left: 20px;
        }
        .instructions li {
            margin-bottom: 8px;
        }
        .warning {
            background: rgba(239, 68, 68, 0.05);
            border: 1px solid rgba(239, 68, 68, 0.2);
            border-radius: 12px;
            padding: 20px;
            margin: 20px 0;
            text-align: center;
        }
        .warning p {
            color: #dc2626;
            font-size: 14px;
            margin: 5px 0;
        }
        .footer {
            background: #f9fafb;
            padding: 30px;
            text-align: center;
            border-top: 1px solid #e5e7eb;
        }
        .footer p {
            color: #6b7280;
            font-size: 14px;
            margin-bottom: 10px;
        }
        .footer .brand {
            color: #3b82f6;
            font-weight: 600;
            font-size: 16px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header" style="text-align:center;">
            <h1 style="margin:0;text-align:center;">
                <span class="icon" style="display:inline-block;width:40px;height:40px;line-height:40px;background:rgba(0,0,0,0.22);border-radius:50%;text-align:center;color:#ffffff;font-weight:700;border:1px solid rgba(255,255,255,0.55);">H</span>
                 <span class="logo-text">Happy-TTS</span>
            </h1>
            <p style="text-align:center;">文本转语音服务平台</p>
        </div>
        
        <div class="content">
            <div class="welcome">
                <h2>密码重置请求</h2>
                <p>亲爱的 <strong>${username}</strong>，我们收到了您的密码重置请求</p>
            </div>
            
            <div class="button-section">
                <a href="${resetLink}" class="reset-button" style="color: white; text-decoration: none;">
                    点击重置密码
                </a>
            </div>
            
            <div class="instructions">
                <h3>🔐 重置步骤</h3>
                <ul>
                    <li>点击上方按钮即可进入密码重置页面</li>
                    <li>请使用相同的设备和网络打开链接</li>
                    <li>设置新密码后即可使用新密码登录</li>
                    <li>重置链接10分钟内有效</li>
                </ul>
            </div>
            
            <div class="warning">
                <p><strong>⚠️ 安全提醒</strong></p>
                <p>请勿将重置链接转发给他人</p>
                <p>如果您没有申请密码重置，请忽略此邮件</p>
            </div>
        </div>
        
        <div class="footer">
            <p class="brand">Happy-TTS 团队</p>
            <p>让文字拥有声音的力量</p>
            <p style="font-size: 12px; color: #9ca3af;">
                此邮件由系统自动发送，请勿回复
            </p>
        </div>
    </div>
</body>
</html>
    `.trim();
}

/**
 * 生成欢迎邮件HTML模板
 * @param username 用户名
 * @returns HTML邮件内容
 */
export function generateWelcomeEmailHtml(username: string): string {
  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>欢迎加入 Happy-TTS</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: #f7fbff;
            color: #1f2937;
            padding: 24px;
        }
        .card {
            max-width: 680px;
            margin: 0 auto;
            background: #ffffff;
            border-radius: 20px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.06);
            overflow: hidden;
            border: 1px solid #eef2f7;
        }
        .header {
            background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
            color: #fff;
            padding: 36px 28px;
            text-align: center;
        }
        .header h1 {
            font-size: 28px;
            margin: 0;
            display: inline-flex;
            gap: 10px;
            align-items: center;
        }
        .icon {
            width: 40px;
            height: 40px;
            background: rgba(0, 0, 0, 0.22);
            border-radius: 50%;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 10px rgba(0, 0, 0, 0.15);
            border: 1px solid rgba(255, 255, 255, 0.55);
        }
        .badge {
            display: inline-block;
            margin-top: 8px;
            background: rgba(255, 255, 255, 0.18);
            padding: 6px 10px;
            border-radius: 999px;
            font-size: 12px;
        }
        .content {
            padding: 28px;
        }
        .hello {
            font-size: 18px;
            color: #374151;
            margin-bottom: 16px;
        }
        .list {
            background: #f9fafb;
            border: 1px solid #e5e7eb;
            border-radius: 12px;
            padding: 16px 18px;
        }
        .list h3 {
            margin: 0 0 10px 0;
            font-size: 16px;
            color: #111827;
        }
        .list ul {
            margin: 0;
            padding-left: 18px;
            color: #4b5563;
        }
        .list li {
            margin: 6px 0;
        }
        .cta {
            margin-top: 22px;
            padding: 16px;
            background: #eef2ff;
            border-left: 4px solid #6366f1;
            border-radius: 10px;
            color: #374151;
        }
        .footer {
            padding: 20px 28px;
            border-top: 1px solid #eef2f7;
            color: #6b7280;
            font-size: 13px;
            text-align: center;
            background: #f9fafb;
        }
    </style>
</head>
<body>
    <div class="card">
        <div class="header" style="text-align:center;">
            <h1 style="margin:0;text-align:center;"><span class="icon" style="display:inline-block;width:40px;height:40px;line-height:40px;background:rgba(0,0,0,0.22);border-radius:50%;text-align:center;color:#ffffff;font-weight:700;border:1px solid rgba(255,255,255,0.55);">H</span>
                <span class="logo-text">Happy-TTS</span>
            </h1>
            <div class="badge">让文字拥有声音的力量</div>
        </div>
        <div class="content">
            <p class="hello">亲爱的 <strong>${username}</strong>，欢迎来到 Happy-TTS！您的账户已创建成功。</p>
            <div class="list">
                <h3>您现在可以：</h3>
                <ul>
                    <li>访问个人中心管理资料与头像（导航：Profile）</li>
                    <li>前往各类内置工具与页面（导航：Case Converter、API Docs、Markdown Export、LibreChat 等）</li>
                    <li>在移动端体验便捷的菜单导航（MobileNav）</li>
                    <li>开启双重验证（TOTP）以增强账户安全</li>
                </ul>
            </div>
            <div class="cta">
                温馨提示：请妥善保管您的账户信息。如需帮助，直接在站内反馈或联系管理员。
            </div>
        </div>
        <div class="footer">
            Happy-TTS 团队 · 感谢使用我们的服务！
        </div>
    </div>
</body>
</html>
    `.trim();
}
