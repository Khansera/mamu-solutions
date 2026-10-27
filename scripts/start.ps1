# PowerShell Script to Launch Tally AI Assistant on Windows 10
# RAM requirement: < 400 MB total (ideal for 8 GB RAM systems)

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Starting Tally 7.1 + Gemini Assistant (Windows 10)     " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Check Python installation
$pythonCmd = Get-Command python -ErrorAction SilentlyContinue
if (-not $pythonCmd) {
    Write-Host "[ERROR] Python 3.10+ not found in PATH." -ForegroundColor Red
    Write-Host "Please install Python from https://www.python.org/downloads/ and check 'Add Python to PATH'." -ForegroundColor Yellow
    Exit 1
}

# 2. Check Node / npm
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Host "[ERROR] Node.js not found in PATH." -ForegroundColor Red
    Exit 1
}

# 3. Create .env if not present
if (-not (Test-Path ".env")) {
    Write-Host "[NOTICE] .env file not found. Copying from .env.example..." -ForegroundColor Yellow
    Copy-Item ".env.example" ".env"
    Write-Host "Please edit .env to insert your free Google Gemini API key." -ForegroundColor Yellow
}

# 4. Check virtual environment
if (-not (Test-Path "venv")) {
    Write-Host "[SETUP] Creating Python virtual environment..." -ForegroundColor Cyan
    python -m venv venv
    .\venv\Scripts\pip install -r requirements.txt
}

# 5. Run test suite to verify accounting rules
Write-Host "`n[CHECK] Running deterministic accounting & GST validation tests..." -ForegroundColor Cyan
.\venv\Scripts\python -m unittest discover -s backend/tests -v
if ($LASTEXITCODE -ne 0) {
    Write-Host "[WARNING] Tests reported issues. Please check output." -ForegroundColor Yellow
}

# 6. Start Backend in new process
Write-Host "`n[STARTING] Launching FastAPI backend on http://127.0.0.1:8000..." -ForegroundColor Green
Start-Process -FilePath "powershell.exe" -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\..'; .\venv\Scripts\uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload"

# 7. Start Frontend
Write-Host "[STARTING] Launching React frontend on http://localhost:3000..." -ForegroundColor Green
npm run dev
