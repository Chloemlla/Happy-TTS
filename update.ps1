# Set UTF-8 encoding for console output
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "🔒 开始修复所有安全漏洞..." -ForegroundColor Green

# 根目录
Write-Host "📦 升级根目录依赖..." -ForegroundColor Yellow
pnpm update glob@latest body-parser@latest js-yaml@latest

# Frontend
Write-Host "📦 升级 frontend 依赖..." -ForegroundColor Yellow
Set-Location frontend
pnpm update glob@latest mdast-util-to-hast@latest js-yaml@latest prismjs@latest

# Frontend Docs
Write-Host "📦 升级 frontend/docs 依赖..." -ForegroundColor Yellow
Set-Location docs
pnpm update node-forge@latest nth-check@latest mdast-util-to-hast@latest webpack-dev-server@latest js-yaml@latest
Set-Location ..\..

Write-Host "✅ 所有安全漏洞修复完成！" -ForegroundColor Green
