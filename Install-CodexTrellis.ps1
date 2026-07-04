#requires -Version 5.1
<#
.SYNOPSIS
Deploy the Janus Codex + Trellis workflow files into a project root.

.DESCRIPTION
Copies the reusable workflow layer only:
- .codex/
- .trellis/scripts/
- .trellis/spec/
- .trellis/workflow.md and .trellis/config.yaml
- .agents/skills/trellis-*

It deliberately does not copy .trellis/tasks, .trellis/.runtime, or
.trellis/workspace from the source project.

.EXAMPLE
.\Install-CodexTrellis.ps1

.EXAMPLE
.\Install-CodexTrellis.ps1 -TargetRoot F:\Repositories\GitHub\NewProject -Force

.EXAMPLE
.\Install-CodexTrellis.ps1 -ConfigureUserConfig
#>

[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [string]$SourceRoot = 'F:\Repositories\GitHub\jans\Janus',
    [string]$TargetRoot = $PSScriptRoot,
    [switch]$Force,
    [switch]$ConfigureUserConfig
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

function Resolve-ExistingDirectory {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,
        [Parameter(Mandatory = $true)]
        [string]$Name
    )

    if ([string]::IsNullOrWhiteSpace($Path)) {
        throw "$Name cannot be empty."
    }

    $resolved = Resolve-Path -LiteralPath $Path -ErrorAction Stop
    if (-not (Test-Path -LiteralPath $resolved.ProviderPath -PathType Container)) {
        throw "$Name is not a directory: $Path"
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
        throw "Missing required source $Label`: $Path"
    }
}

function Ensure-Directory {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    if (Test-Path -LiteralPath $Path -PathType Container) {
        return
    }

    if ($PSCmdlet.ShouldProcess($Path, 'Create directory')) {
        New-Item -ItemType Directory -Path $Path -Force | Out-Null
    }
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
        throw "Destination file already exists: $DestinationPath. Re-run with -Force to overwrite."
    }

    $parent = Split-Path -Parent $DestinationPath
    Ensure-Directory -Path $parent

    if ($PSCmdlet.ShouldProcess($DestinationPath, "Copy file from $SourcePath")) {
        Copy-Item -LiteralPath $SourcePath -Destination $DestinationPath -Force:$Force
    }
}

function Copy-DirectoryTree {
    param(
        [Parameter(Mandatory = $true)]
        [string]$SourceDirectory,
        [Parameter(Mandatory = $true)]
        [string]$DestinationDirectory
    )

    Assert-SourcePath -Path $SourceDirectory -Label 'directory'

    if ((Test-Path -LiteralPath $DestinationDirectory) -and -not $Force) {
        throw "Destination directory already exists: $DestinationDirectory. Re-run with -Force to merge and overwrite files."
    }

    Ensure-Directory -Path $DestinationDirectory

    $sourceRoot = [System.IO.Path]::GetFullPath($SourceDirectory).TrimEnd('\', '/')
    $items = Get-ChildItem -LiteralPath $SourceDirectory -Force -Recurse

    foreach ($item in $items) {
        $relative = $item.FullName.Substring($sourceRoot.Length).TrimStart('\', '/')
        $destination = Join-Path -Path $DestinationDirectory -ChildPath $relative

        if ($item.PSIsContainer) {
            Ensure-Directory -Path $destination
            continue
        }

        if ((Test-Path -LiteralPath $destination) -and -not $Force) {
            throw "Destination file already exists: $destination. Re-run with -Force to overwrite."
        }

        $parent = Split-Path -Parent $destination
        Ensure-Directory -Path $parent

        if ($PSCmdlet.ShouldProcess($destination, "Copy file from $($item.FullName)")) {
            Copy-Item -LiteralPath $item.FullName -Destination $destination -Force:$Force
        }
    }
}

function Copy-TrellisSkills {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ResolvedSourceRoot,
        [Parameter(Mandatory = $true)]
        [string]$ResolvedTargetRoot
    )

    $sourceSkills = Join-RootPath -Root $ResolvedSourceRoot -RelativePath '.agents\skills'
    Assert-SourcePath -Path $sourceSkills -Label 'skills directory'

    $skills = Get-ChildItem -LiteralPath $sourceSkills -Directory -Force |
        Where-Object { $_.Name -like 'trellis-*' }

    if (-not $skills) {
        throw "No trellis-* skills found under $sourceSkills"
    }

    foreach ($skill in $skills) {
        $destination = Join-RootPath -Root $ResolvedTargetRoot -RelativePath ".agents\skills\$($skill.Name)"
        Copy-DirectoryTree -SourceDirectory $skill.FullName -DestinationDirectory $destination
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

    if ($PSCmdlet.ShouldProcess($configPath, 'Update Codex user config')) {
        $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
        [System.IO.File]::WriteAllText($configPath, $updated, $utf8NoBom)
    }
}

$resolvedSourceRoot = Resolve-ExistingDirectory -Path $SourceRoot -Name 'SourceRoot'
$resolvedTargetRoot = Resolve-ExistingDirectory -Path $TargetRoot -Name 'TargetRoot'

if ($resolvedSourceRoot -eq $resolvedTargetRoot) {
    throw 'SourceRoot and TargetRoot must be different directories.'
}

$requiredDirectories = @(
    '.codex',
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
    Copy-DirectoryTree `
        -SourceDirectory (Join-RootPath -Root $resolvedSourceRoot -RelativePath $relativePath) `
        -DestinationDirectory (Join-RootPath -Root $resolvedTargetRoot -RelativePath $relativePath)
}

foreach ($relativePath in $requiredFiles) {
    Copy-FileItem `
        -SourcePath (Join-RootPath -Root $resolvedSourceRoot -RelativePath $relativePath) `
        -DestinationPath (Join-RootPath -Root $resolvedTargetRoot -RelativePath $relativePath)
}

foreach ($relativePath in $optionalFiles) {
    $sourcePath = Join-RootPath -Root $resolvedSourceRoot -RelativePath $relativePath
    if (Test-Path -LiteralPath $sourcePath) {
        Copy-FileItem `
            -SourcePath $sourcePath `
            -DestinationPath (Join-RootPath -Root $resolvedTargetRoot -RelativePath $relativePath)
    }
}

Copy-TrellisSkills -ResolvedSourceRoot $resolvedSourceRoot -ResolvedTargetRoot $resolvedTargetRoot

Ensure-Directory -Path (Join-RootPath -Root $resolvedTargetRoot -RelativePath '.trellis\tasks')
Ensure-Directory -Path (Join-RootPath -Root $resolvedTargetRoot -RelativePath '.trellis\workspace')

if ($ConfigureUserConfig) {
    Update-CodexUserConfig -ResolvedTargetRoot $resolvedTargetRoot
}

Write-Host "Codex + Trellis workflow deployed to: $resolvedTargetRoot"
Write-Host 'Skipped source task/runtime data: .trellis/tasks, .trellis/.runtime, .trellis/workspace'

if (-not $ConfigureUserConfig) {
    Write-Host 'Next: add this project to ~/.codex/config.toml as trusted, enable hooks, then run /hooks in Codex.'
}
