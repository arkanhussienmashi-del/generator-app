@echo off
echo ========================================
echo   تشغيل تطبيق المولّدات
echo ========================================
echo.
echo اضغط Ctrl+C لإيقاف السيرفر
echo.
python -m http.server 3000 --bind 0.0.0.0 --directory "C:\Users\AA\Desktop\MOLDTY\generator-app\dist"
pause
