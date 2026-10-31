@echo off
setlocal
set "ROOT=%~dp0"
if not exist "%ROOT%backend\.venv\Scripts\python.exe" (
  py -m venv "%ROOT%backend\.venv"
)
start "TAPLEARN API" powershell -NoExit -Command "Set-Location -LiteralPath '%ROOT%backend'; .\.venv\Scripts\python.exe -m pip install -r requirements.txt; .\.venv\Scripts\python.exe -m uvicorn main:app --reload --host 0.0.0.0 --port 8000"
start "TAPLEARN WEB" powershell -NoExit -Command "Set-Location -LiteralPath '%ROOT%frontend'; npm install; npm run dev -- --host 0.0.0.0"
endlocal
