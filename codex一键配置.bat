@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion
title Codex CLI 一键配置 (专家版)

:: 初始化 ANSI 颜色
for /f %%a in ('echo prompt $E ^| cmd') do set "E=%%a"
set "G=!E![32m" & set "R=!E![31m" & set "Y=!E![33m"
set "C=!E![36m" & set "W=!E![97m" & set "D=!E![90m" & set "N=!E![0m"

set "CODEX_DIR=%USERPROFILE%\.codex"

cls
echo.
echo  !C!============================================!N!
echo  !C!  ::!N!  !W!Codex CLI 一键配置 (专家版)!N!        !C!::!N!
echo  !C!============================================!N!
echo.

if not exist "!CODEX_DIR!" mkdir "!CODEX_DIR!"

:: ===== 配置模板 =====
echo  !C!  [ 配置模板 ]!N!
echo.
echo    !G![1]!N! !G!^>^>!N! !W!极速模式!N!   codex-mini
echo    !C![2]!N! !C!^>^>!N! !W!均衡模式!N!   gpt-5.4-mini
echo    !Y![3]!N! !Y!^>^>!N! !W!深度模式!N!   gpt-5.4 (含推理等级)
echo    !W![5]!N! !W!^>^>!N! !W!专家模式!N!   gpt-5.3-codex !G!(纯净版)!N!
echo.

set "MODEL=gpt-5.3-codex" & set "EFFORT=none" & set "TNAME=专家模式"
set /p "TPL=  选择 [1-5] (默认5): "

if "!TPL!"=="1" (set "MODEL=codex-mini" & set "EFFORT=none" & set "TNAME=极速模式")
if "!TPL!"=="2" (set "MODEL=gpt-5.4-mini" & set "EFFORT=none" & set "TNAME=均衡模式")
if "!TPL!"=="3" (set "MODEL=gpt-5.4" & set "EFFORT=xhigh" & set "TNAME=深度模式")

echo.
echo  !G![+]!N! !W!!TNAME!!N!  模型=!W!!MODEL!!N!

:: ===== API 端点 =====
echo.
echo  !C!  [ API 端点 ]!N!
echo    [1] anyrouter.top !G!(默认)!N!
echo    [2] api.bwen.net
echo    [3] api.openai.com/v1
set "BASE_URL=https://anyrouter.top/v1"
set /p "EP=  选择 (默认1): "
if "!EP!"=="2" set "BASE_URL=https://api.bwen.net"
if "!EP!"=="3" set "BASE_URL=https://api.openai.com/v1"
echo  !G![+]!N! 端点: !D!!BASE_URL!!N!

:: ===== API Key =====
set "CURRENT_KEY="
if exist "!CODEX_DIR!\auth.json" (
    for /f "delims=" %%a in ('powershell -command "[Console]::InputEncoding=[System.Text.UTF8Encoding]::new($false); [Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false); if(Test-Path ''!CODEX_DIR!\auth.json''){ (Get-Content ''!CODEX_DIR!\auth.json'' -Encoding UTF8 | ConvertFrom-Json).OPENAI_API_KEY }" 2^>nul') do set "CURRENT_KEY=%%a"
)

echo.
if defined CURRENT_KEY (
    set "SK=!CURRENT_KEY:~0,8!****!CURRENT_KEY:~-4!"
    echo  !C!  [ API Key ]!N!  当前: !W!!SK!!N!
    set /p "CK=  修改? (Y/N): "
    if /i "!CK!"=="Y" (
        set /p "NK=  新 Key: "
        if defined NK set "CURRENT_KEY=!NK!"
    )
) else (
    echo  !C!  [ API Key ]!N!
    set /p "NK=  输入 Key: "
    if not defined NK (echo  !R![X] 未输入!!N! & pause & exit /b 1)
    set "CURRENT_KEY=!NK!"
)

:: ===== 写入配置文件 =====
echo.
<nul set /p =  !D![~] 写入配置...!N!

:: 写入 config.toml
(
echo model_provider = "OpenAI"
echo model = "!MODEL!"
echo review_model = "!MODEL!"
:: 只有非专家模式或特定需要推理的模型才写入推理等级
if "!EFFORT!" neq "none" echo model_reasoning_effort = "!EFFORT!"
echo disable_response_storage = true
echo network_access = "enabled"
echo windows_wsl_setup_acknowledged = true
echo model_context_window = 1000000
echo model_auto_compact_token_limit = 900000
echo.
echo [model_providers.OpenAI]
echo name = "OpenAI"
echo base_url = "!BASE_URL!"
echo wire_api = "responses"
echo requires_openai_auth = true
) > "!CODEX_DIR!\config.toml"

:: 写入 auth.json
echo { "OPENAI_API_KEY": "!CURRENT_KEY!" } > "!CODEX_DIR!\auth.json"

echo  !G!OK!N!

echo.
echo  !C!============================================!N!
echo  !G!  [+] 配置完成!!N!
echo.
echo    模板  !W!!TNAME!!N!
echo    模型  !W!!MODEL!!N!
echo    端点  !D!!BASE_URL!!N!
echo  !C!============================================!N!
echo.
endlocal
pause
