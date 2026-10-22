@echo off
chcp 65001 >nul
title CampusLeave Backend - 8080
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
