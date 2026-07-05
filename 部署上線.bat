@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ==========================================
echo Rocket Launch Simulator - Deploy to Cloudflare Pages
echo ==========================================
echo.

REM 使用 wrangler 直傳 Cloudflare Pages
where wrangler >nul 2>nul
if errorlevel 1 (
  echo [ERROR] wrangler CLI not found.
  echo.
  echo Install with: npm install -g wrangler
  echo Or use GitHub deployment: push to Kunzhi0810/rocket-launch-sim
  echo   Cloudflare Pages will auto-build from GitHub.
  pause
  exit /b 1
)

echo [INFO] Deploying to project: rocket-launch-sim
wrangler pages deploy . --project-name=rocket-launch-sim --commit-dirty=true

echo.
echo ==========================================
echo Done. URL: https://rocket-launch-sim.pages.dev
echo ==========================================
pause
