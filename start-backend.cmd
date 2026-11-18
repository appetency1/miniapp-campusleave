@echo off
chcp 65001 >nul
title CampusLeave Backend - 8080

rem 启动前把本机当前局域网 IP 同步进小程序配置。
rem 手机热点每次开关、电脑换 WiFi 都会重新分配 IP（甚至换网段），
rem 小程序端无法自动发现电脑，只能在这里同步。
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\sync-ip.ps1"

cd /d "%~dp0backend"

echo ==========================================================
echo   CampusLeave 后端
echo   访问地址  http://localhost:8080
echo   后台页面  http://localhost:8080/admin/
echo   接口探活  http://localhost:8080/api/v1/common/dictionaries
echo ----------------------------------------------------------
echo   这个窗口就是服务本体：关掉它 = 服务停止
echo   要停服务请直接关窗口，不要用 Ctrl+C 之外的粗暴方式
echo ==========================================================
echo.

call mvn spring-boot:run -Dspring-boot.run.arguments="--server.port=8080"

echo.
echo 服务已退出（退出码 %ERRORLEVEL%）
echo 如果上面有报错，向上翻；常见是 8080 被占用。
pause
