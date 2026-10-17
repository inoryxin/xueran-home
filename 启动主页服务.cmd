@echo off
chcp 65001 >nul
rem ============================================================
rem  许雪然主页 · 本地服务手动启动
rem  平时不用管它（登录时会自动启动），万一页面打不开就双击这个
rem ============================================================
setlocal
set PY=C:\Python314\pythonw.exe
if not exist "%PY%" set PY=pythonw.exe
start "" "%PY%" "%~dp0tools\serve.py"
timeout /t 2 >nul
echo.
echo   许雪然主页服务已启动： http://127.0.0.1:8888/
echo   如果浏览器还是打不开，看看 8888 端口是不是被别的程序占了。
echo.
pause
