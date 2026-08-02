#requires -Version 5.1
<#
.SYNOPSIS
Deploy the Janus Codex + Claude Code + Trellis workflow files into a project root.

.DESCRIPTION
Copies the reusable workflow layer for both Codex and Claude Code.

By default the script is additive / idempotent:
- existing destination directories and files are skipped (not overwritten)
- missing directories are created; missing files are copied
- pass -Force to merge and overwrite existing files

Shared Trellis core:
- .trellis/scripts/
- .trellis/spec/
- .trellis/workflow.md and .trellis/config.yaml
- optional .trellis/.version, .developer, .gitignore, .template-hashes.json
- empty .trellis/tasks and .trellis/workspace (never copies source task/runtime data)

Codex platform:
- .codex/  (agents, hooks, hooks.json, config.toml)
- .agents/skills/trellis-*

Claude Code platform (hook format):
- .claude/agents/
- .claude/commands/
- .claude/hooks/  (session-start / inject-workflow-state / inject-subagent-context)
- .claude/skills/trellis-*
- .claude/settings.json  (SessionStart / PreToolUse / UserPromptSubmit hook registration)

It deliberately does not copy:
- .trellis/tasks, .trellis/.runtime, .trellis/workspace contents from source
- .claude/settings.local.json (machine-local)

.EXAMPLE
.\Install-CodexClaudeTrellis.ps1

.EXAMPLE
.\Install-CodexClaudeTrellis.ps1 -TargetRoot F:\Repositories\GitHub\NewProject -Force

.EXAMPLE
.\Install-CodexClaudeTrellis.ps1 -ClaudeOnly -Force

.EXAMPLE
.\Install-CodexClaudeTrellis.ps1 -CodexOnly -ConfigureUserConfig

.EXAMPLE
.\Install-CodexClaudeTrellis.ps1 -Platforms Codex,Claude -Force
#>

[CmdletBinding(SupportsShouldProcess = $true, DefaultParameterSetName = 'Platforms')]
param(
    [string]$SourceRoot = 'F:\Repositories\GitHub\jans\Janus',
    [string]$TargetRoot = $PSScriptRoot,
    [switch]$Force,

    # Enable [features].hooks and mark TargetRoot as trusted in ~/.codex/config.toml
    [switch]$ConfigureUserConfig,

    # Deploy only Codex + shared Trellis (skip .claude/)
    [Parameter(ParameterSetName = 'CodexOnly')]
    [switch]$CodexOnly,

    # Deploy only Claude + shared Trellis (skip .codex/ and .agents/skills)
    [Parameter(ParameterSetName = 'ClaudeOnly')]
    [switch]$ClaudeOnly,

    # Explicit platform list; default is both when neither -CodexOnly nor -ClaudeOnly is set
    [Parameter(ParameterSetName = 'Platforms')]
    [ValidateSet('Codex', 'Claude')]
    [string[]]$Platforms = @('Codex', 'Claude')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

# Deploy counters (script-scoped; reset per run in main body)
$script:CopiedFiles = 0
$script:SkippedFiles = 0
$script:SkippedDirectories = 0
$script:CreatedDirectories = 0

function Write-Skip {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Message
    )

    Write-Host "  跳过: $Message" -ForegroundColor DarkYellow
}

function Resolve-ExistingDirectory {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,
        [Parameter(Mandatory = $true)]
        [string]$Name
    )

    if ([string]::IsNullOrWhiteSpace($Path)) {
        throw "$Name 不能为空。"
    }

    $resolved = Resolve-Path -LiteralPath $Path -ErrorAction Stop
    if (-not (Test-Path -LiteralPath $resolved.ProviderPath -PathType Container)) {
        throw "$Name 不是目录: $Path"
    }

    return [System.IO.Path]::GetFullPath($resolved.ProviderPath)
}

function Join-RootPath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Root,
        [Parameter(Mandatory = $true)]
        [string]$RelativePath
    )

    return Join-Path -Path $Root -ChildPath $RelativePath
}

function Assert-SourcePath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,
        [Parameter(Mandatory = $true)]
        [string]$Label
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        throw "缺少必需的源 $Label`: $Path"
    }
}

function Ensure-Directory {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    if (Test-Path -LiteralPath $Path -PathType Container) {
        return $false
    }

    if ($PSCmdlet.ShouldProcess($Path, '创建目录')) {
        New-Item -ItemType Directory -Path $Path -Force | Out-Null
        $script:CreatedDirectories++
        return $true
    }

    return $false
}

function Copy-FileItem {
    param(
        [Parameter(Mandatory = $true)]
        [string]$SourcePath,
        [Parameter(Mandatory = $true)]
        [string]$DestinationPath
    )

    Assert-SourcePath -Path $SourcePath -Label 'file'

    if ((Test-Path -LiteralPath $DestinationPath) -and -not $Force) {
        Write-Skip "文件已存在: $DestinationPath"
        $script:SkippedFiles++
        return
    }

    $parent = Split-Path -Parent $DestinationPath
    Ensure-Directory -Path $parent | Out-Null

    if ($PSCmdlet.ShouldProcess($DestinationPath, "从 $SourcePath 复制文件")) {
        Copy-Item -LiteralPath $SourcePath -Destination $DestinationPath -Force:$Force
        $script:CopiedFiles++
    }
}

function Copy-DirectoryTree {
    param(
        [Parameter(Mandatory = $true)]
        [string]$SourceDirectory,
        [Parameter(Mandatory = $true)]
        [string]$DestinationDirectory,
        [string[]]$ExcludeNames = @(),
        # When true and destination already exists (and not -Force), skip the whole tree
        [switch]$SkipIfDestinationExists
    )

    Assert-SourcePath -Path $SourceDirectory -Label 'directory'

    $destExists = Test-Path -LiteralPath $DestinationDirectory -PathType Container

    if ($destExists -and -not $Force -and $SkipIfDestinationExists) {
        Write-Skip "目录已存在: $DestinationDirectory"
        $script:SkippedDirectories++
        return
    }

    if (-not $destExists) {
        Ensure-Directory -Path $DestinationDirectory | Out-Null
    }

    $sourceRoot = [System.IO.Path]::GetFullPath($SourceDirectory).TrimEnd('\', '/')
    $items = Get-ChildItem -LiteralPath $SourceDirectory -Force -Recurse

    foreach ($item in $items) {
        $relative = $item.FullName.Substring($sourceRoot.Length).TrimStart('\', '/')

        $skip = $false
        foreach ($exclude in $ExcludeNames) {
            if ($relative -eq $exclude -or $relative.StartsWith("$exclude\") -or $relative.StartsWith("$exclude/")) {
                $skip = $true
                break
            }
            if ($item.Name -eq $exclude) {
                $skip = $true
                break
            }
        }
        if ($skip) {
            continue
        }

        $destination = Join-Path -Path $DestinationDirectory -ChildPath $relative

        if ($item.PSIsContainer) {
            if ((Test-Path -LiteralPath $destination -PathType Container) -and -not $Force) {
                # Structure already present; ensure path exists but do not re-create noise
                continue
            }
            Ensure-Directory -Path $destination | Out-Null
            continue
        }

        if ((Test-Path -LiteralPath $destination) -and -not $Force) {
            Write-Skip "文件已存在: $destination"
            $script:SkippedFiles++
            continue
        }

        $parent = Split-Path -Parent $destination
        Ensure-Directory -Path $parent | Out-Null

        if ($PSCmdlet.ShouldProcess($destination, "从 $($item.FullName) 复制文件")) {
            Copy-Item -LiteralPath $item.FullName -Destination $destination -Force:$Force
            $script:CopiedFiles++
        }
    }
}

function Copy-TrellisSkills {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ResolvedSourceRoot,
        [Parameter(Mandatory = $true)]
        [string]$ResolvedTargetRoot,
        # Relative root under project, e.g. '.agents\skills' or '.claude\skills'
        [Parameter(Mandatory = $true)]
        [string]$SkillsRelativeRoot
    )

    $sourceSkills = Join-RootPath -Root $ResolvedSourceRoot -RelativePath $SkillsRelativeRoot
    Assert-SourcePath -Path $sourceSkills -Label 'skills directory'

    $skills = Get-ChildItem -LiteralPath $sourceSkills -Directory -Force |
        Where-Object { $_.Name -like 'trellis-*' }

    if (-not $skills) {
        throw "在 $sourceSkills 下未找到 trellis-* 技能目录"
    }

    foreach ($skill in $skills) {
        $destination = Join-RootPath -Root $ResolvedTargetRoot -RelativePath "$SkillsRelativeRoot\$($skill.Name)"
        # Whole skill package already present → skip unless -Force
        Copy-DirectoryTree `
            -SourceDirectory $skill.FullName `
            -DestinationDirectory $destination `
            -SkipIfDestinationExists
    }
}

function Copy-SharedTrellis {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ResolvedSourceRoot,
        [Parameter(Mandatory = $true)]
        [string]$ResolvedTargetRoot
    )

    $requiredDirectories = @(
        '.trellis\scripts',
        '.trellis\spec'
    )

    $requiredFiles = @(
        '.trellis\workflow.md',
        '.trellis\config.yaml'
    )

    $optionalFiles = @(
        '.trellis\.version',
        '.trellis\.developer',
        '.trellis\.gitignore',
        '.trellis\.template-hashes.json'
    )

    foreach ($relativePath in $requiredDirectories) {
        # Existing structure dirs are skipped entirely without -Force
        Copy-DirectoryTree `
            -SourceDirectory (Join-RootPath -Root $ResolvedSourceRoot -RelativePath $relativePath) `
            -DestinationDirectory (Join-RootPath -Root $ResolvedTargetRoot -RelativePath $relativePath) `
            -SkipIfDestinationExists
    }

    foreach ($relativePath in $requiredFiles) {
        Copy-FileItem `
            -SourcePath (Join-RootPath -Root $ResolvedSourceRoot -RelativePath $relativePath) `
            -DestinationPath (Join-RootPath -Root $ResolvedTargetRoot -RelativePath $relativePath)
    }

    foreach ($relativePath in $optionalFiles) {
        $sourcePath = Join-RootPath -Root $ResolvedSourceRoot -RelativePath $relativePath
        if (Test-Path -LiteralPath $sourcePath) {
            Copy-FileItem `
                -SourcePath $sourcePath `
                -DestinationPath (Join-RootPath -Root $ResolvedTargetRoot -RelativePath $relativePath)
        }
    }

    # Empty runtime dirs: create if missing, skip if already present
    foreach ($emptyDir in @('.trellis\tasks', '.trellis\workspace')) {
        $path = Join-RootPath -Root $ResolvedTargetRoot -RelativePath $emptyDir
        if (Test-Path -LiteralPath $path -PathType Container) {
            Write-Skip "目录已存在: $path"
            $script:SkippedDirectories++
        }
        else {
            Ensure-Directory -Path $path | Out-Null
        }
    }
}

function Copy-CodexPlatform {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ResolvedSourceRoot,
        [Parameter(Mandatory = $true)]
        [string]$ResolvedTargetRoot
    )

    Copy-DirectoryTree `
        -SourceDirectory (Join-RootPath -Root $ResolvedSourceRoot -RelativePath '.codex') `
        -DestinationDirectory (Join-RootPath -Root $ResolvedTargetRoot -RelativePath '.codex') `
        -SkipIfDestinationExists

    Copy-TrellisSkills `
        -ResolvedSourceRoot $ResolvedSourceRoot `
        -ResolvedTargetRoot $ResolvedTargetRoot `
        -SkillsRelativeRoot '.agents\skills'
}

function Copy-ClaudePlatform {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ResolvedSourceRoot,
        [Parameter(Mandatory = $true)]
        [string]$ResolvedTargetRoot
    )

    $sourceClaude = Join-RootPath -Root $ResolvedSourceRoot -RelativePath '.claude'
    Assert-SourcePath -Path $sourceClaude -Label 'Claude directory'

    $requiredClaudePaths = @(
        '.claude\hooks\session-start.py',
        '.claude\hooks\inject-workflow-state.py',
        '.claude\hooks\inject-subagent-context.py',
        '.claude\settings.json',
        '.claude\agents',
        '.claude\skills'
    )

    foreach ($relativePath in $requiredClaudePaths) {
        Assert-SourcePath `
            -Path (Join-RootPath -Root $ResolvedSourceRoot -RelativePath $relativePath) `
            -Label $relativePath
    }

    # Full .claude tree except machine-local settings; skip existing tree without -Force
    Copy-DirectoryTree `
        -SourceDirectory $sourceClaude `
        -DestinationDirectory (Join-RootPath -Root $ResolvedTargetRoot -RelativePath '.claude') `
        -ExcludeNames @('settings.local.json') `
        -SkipIfDestinationExists

    # Ensure trellis-* skills landed when .claude was partially present or skills root is missing
    $targetSkills = Join-RootPath -Root $ResolvedTargetRoot -RelativePath '.claude\skills'
    $hasTrellisSkill = $false
    if (Test-Path -LiteralPath $targetSkills -PathType Container) {
        $hasTrellisSkill = [bool](Get-ChildItem -LiteralPath $targetSkills -Directory -Force -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -like 'trellis-*' } |
            Select-Object -First 1)
    }

    if (-not $hasTrellisSkill) {
        Copy-TrellisSkills `
            -ResolvedSourceRoot $ResolvedSourceRoot `
            -ResolvedTargetRoot $ResolvedTargetRoot `
            -SkillsRelativeRoot '.claude\skills'
    }

    $settingsPath = Join-RootPath -Root $ResolvedTargetRoot -RelativePath '.claude\settings.json'
    if (Test-Path -LiteralPath $settingsPath) {
        Assert-ClaudeHookRegistration -SettingsPath $settingsPath
    }
    else {
        Write-Skip "部署后缺少 Claude settings（目标不完整时可能出现）: $settingsPath"
    }
}

function Assert-ClaudeHookRegistration {
    param(
        [Parameter(Mandatory = $true)]
        [string]$SettingsPath
    )

    if (-not (Test-Path -LiteralPath $SettingsPath)) {
        throw "复制后缺少 Claude settings: $SettingsPath"
    }

    $raw = Get-Content -LiteralPath $SettingsPath -Encoding UTF8 -Raw
    $settings = $raw | ConvertFrom-Json

    if (-not $settings.hooks) {
        throw "Claude settings.json 缺少 hooks 配置段: $SettingsPath"
    }

    $requiredEvents = @('SessionStart', 'UserPromptSubmit', 'PreToolUse')
    foreach ($eventName in $requiredEvents) {
        $prop = $settings.hooks.PSObject.Properties[$eventName]
        if (-not $prop -or -not $prop.Value) {
            throw "Claude settings.json 缺少 hooks.$eventName 注册: $SettingsPath"
        }
    }

    $commandBlob = ($raw)
    $requiredScripts = @(
        '.claude/hooks/session-start.py',
        '.claude/hooks/inject-workflow-state.py',
        '.claude/hooks/inject-subagent-context.py'
    )
    foreach ($script in $requiredScripts) {
        if ($commandBlob -notlike "*$script*") {
            throw "Claude settings.json 未引用必需的 hook 脚本: $script"
        }
    }
}

function Set-HooksFeature {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Content
    )

    $normalized = $Content -replace "`r`n", "`n"
    $lines = [System.Collections.Generic.List[string]]::new()
    foreach ($line in ($normalized -split "`n", -1)) {
        $lines.Add($line)
    }

    if ($lines.Count -eq 1 -and $lines[0] -eq '') {
        $lines.Clear()
    }

    $featuresStart = -1
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -match '^\s*\[features\]\s*$') {
            $featuresStart = $i
            break
        }
    }

    if ($featuresStart -lt 0) {
        if ($lines.Count -gt 0 -and $lines[$lines.Count - 1] -ne '') {
            $lines.Add('')
        }
        $lines.Add('[features]')
        $lines.Add('hooks = true')
        return ($lines -join [Environment]::NewLine).TrimEnd() + [Environment]::NewLine
    }

    $featuresEnd = $lines.Count
    for ($i = $featuresStart + 1; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -match '^\s*\[.+\]\s*$') {
            $featuresEnd = $i
            break
        }
    }

    for ($i = $featuresStart + 1; $i -lt $featuresEnd; $i++) {
        if ($lines[$i] -match '^\s*hooks\s*=') {
            $lines[$i] = 'hooks = true'
            return ($lines -join [Environment]::NewLine).TrimEnd() + [Environment]::NewLine
        }
    }

    $lines.Insert($featuresStart + 1, 'hooks = true')
    return ($lines -join [Environment]::NewLine).TrimEnd() + [Environment]::NewLine
}

function Update-CodexUserConfig {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ResolvedTargetRoot
    )

    $codexHome = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path -Path $HOME -ChildPath '.codex' }
    $configPath = Join-Path -Path $codexHome -ChildPath 'config.toml'
    $targetForToml = $ResolvedTargetRoot.Replace('\', '/')
    $projectHeader = "[projects.`"$targetForToml`"]"

    Ensure-Directory -Path $codexHome

    $content = ''
    if (Test-Path -LiteralPath $configPath) {
        $content = Get-Content -LiteralPath $configPath -Encoding UTF8 -Raw
    }

    $updated = Set-HooksFeature -Content $content

    if (-not $updated.Contains($projectHeader)) {
        if ($updated.Trim().Length -gt 0) {
            $updated = $updated.TrimEnd() + [Environment]::NewLine + [Environment]::NewLine
        }
        $updated += "$projectHeader" + [Environment]::NewLine
        $updated += 'trust_level = "trusted"' + [Environment]::NewLine
    }

    if ($PSCmdlet.ShouldProcess($configPath, '更新 Codex 用户配置')) {
        $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
        [System.IO.File]::WriteAllText($configPath, $updated, $utf8NoBom)
    }
}

# --- resolve platforms ---
$deployCodex = $false
$deployClaude = $false

if ($PSCmdlet.ParameterSetName -eq 'CodexOnly') {
    $deployCodex = $true
}
elseif ($PSCmdlet.ParameterSetName -eq 'ClaudeOnly') {
    $deployClaude = $true
}
else {
    foreach ($p in $Platforms) {
        if ($p -eq 'Codex') { $deployCodex = $true }
        if ($p -eq 'Claude') { $deployClaude = $true }
    }
}

if (-not $deployCodex -and -not $deployClaude) {
    throw '未选择任何平台。请使用默认（两者都部署）、-Platforms Codex,Claude、-CodexOnly 或 -ClaudeOnly。'
}

if ($ConfigureUserConfig -and -not $deployCodex) {
    throw '-ConfigureUserConfig 仅在部署包含 Codex 时可用。'
}

$resolvedSourceRoot = Resolve-ExistingDirectory -Path $SourceRoot -Name 'SourceRoot'
$resolvedTargetRoot = Resolve-ExistingDirectory -Path $TargetRoot -Name 'TargetRoot'

if ($resolvedSourceRoot -eq $resolvedTargetRoot) {
    throw 'SourceRoot 与 TargetRoot 不能是同一目录。'
}

$platformLabel = @()
if ($deployCodex) { $platformLabel += 'Codex' }
if ($deployClaude) { $platformLabel += 'Claude' }
$platformText = $platformLabel -join ' + '

$script:CopiedFiles = 0
$script:SkippedFiles = 0
$script:SkippedDirectories = 0
$script:CreatedDirectories = 0

Write-Host "正在部署 Trellis 工作流 ($platformText)"
Write-Host "  源目录: $resolvedSourceRoot"
Write-Host "  目标目录: $resolvedTargetRoot"
if ($Force) {
    Write-Host '  模式: 强制覆盖（覆盖已有文件）'
}
else {
    Write-Host '  模式: 跳过已有结构（使用 -Force 可覆盖）'
}

# Shared core always
Copy-SharedTrellis -ResolvedSourceRoot $resolvedSourceRoot -ResolvedTargetRoot $resolvedTargetRoot

if ($deployCodex) {
    Write-Host '  -> Codex 平台 (.codex/、.agents/skills/trellis-*)'
    Copy-CodexPlatform -ResolvedSourceRoot $resolvedSourceRoot -ResolvedTargetRoot $resolvedTargetRoot
}

if ($deployClaude) {
    Write-Host '  -> Claude Code 平台 (.claude/ agents、commands、hooks、skills、settings.json)'
    Copy-ClaudePlatform -ResolvedSourceRoot $resolvedSourceRoot -ResolvedTargetRoot $resolvedTargetRoot
}

if ($ConfigureUserConfig) {
    Update-CodexUserConfig -ResolvedTargetRoot $resolvedTargetRoot
}

Write-Host ""
Write-Host "Codex + Claude + Trellis 工作流已部署到: $resolvedTargetRoot"
Write-Host "平台: $platformText"
Write-Host "汇总: 已复制=$script:CopiedFiles  新建目录=$script:CreatedDirectories  跳过文件=$script:SkippedFiles  跳过目录=$script:SkippedDirectories"
Write-Host '已跳过源任务/运行时数据: .trellis/tasks、.trellis/.runtime、.trellis/workspace'
Write-Host '已跳过本机配置: .claude/settings.local.json'
if (-not $Force -and ($script:SkippedFiles -gt 0 -or $script:SkippedDirectories -gt 0)) {
    Write-Host '已有结构未改动。如需覆盖文件，请加 -Force 重新运行。'
}

if ($deployCodex) {
    if (-not $ConfigureUserConfig) {
        Write-Host 'Codex 下一步: 在 ~/.codex/config.toml 中将该项目标为 trusted，启用 [features].hooks = true，然后在 Codex 中运行 /hooks。'
    }
    else {
        Write-Host 'Codex 下一步: 在 Codex 中运行 /hooks 以批准已安装的 hooks（一次性）。'
    }
}

if ($deployClaude) {
    Write-Host 'Claude 下一步: 在 Claude Code 中重新打开项目；SessionStart / UserPromptSubmit / PreToolUse hooks 会从 .claude/settings.json 自动加载。'
    Write-Host '  验证: python .claude/hooks/session-start.py   （或开启新 Claude 会话，确认 Trellis 上下文已注入）'
}
