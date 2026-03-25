$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$venvPython = Join-Path $root ".venv\Scripts\python.exe"
$npmCmd = "C:\Program Files\nodejs\npm.cmd"
$logDir = Join-Path $root "tmp-logs"
$backendOutLog = Join-Path $logDir "backend.out.log"
$backendErrLog = Join-Path $logDir "backend.err.log"
$frontendOutLog = Join-Path $logDir "frontend.out.log"
$frontendErrLog = Join-Path $logDir "frontend.err.log"

function Import-DotEnv {
    param([string]$Path)

    if (!(Test-Path $Path)) {
        return
    }

    Get-Content $Path | ForEach-Object {
        $line = $_.Trim()
        if (!$line -or $line.StartsWith("#")) {
            return
        }

        $parts = $line.Split("=", 2)
        if ($parts.Count -ne 2) {
            return
        }

        $name = $parts[0].Trim()
        $value = $parts[1].Trim().Trim('"')
        [System.Environment]::SetEnvironmentVariable($name, $value)
    }
}

if (!(Test-Path $venvPython)) {
    throw "Python virtual environment not found at $venvPython"
}

Import-DotEnv (Join-Path $root ".env")
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

@($backendOutLog, $backendErrLog, $frontendOutLog, $frontendErrLog) | ForEach-Object {
    if (Test-Path $_) {
        Remove-Item $_ -Force
    }
}

Push-Location (Join-Path $root "backend")
& $venvPython -m scripts.seed_data
Pop-Location

Start-Process -FilePath $venvPython `
    -WorkingDirectory (Join-Path $root "backend") `
    -ArgumentList "-m uvicorn app.main:app --host 127.0.0.1 --port 8000" `
    -RedirectStandardOutput $backendOutLog `
    -RedirectStandardError $backendErrLog

Start-Process -FilePath $npmCmd `
    -WorkingDirectory (Join-Path $root "frontend") `
    -ArgumentList "run dev -- --host 127.0.0.1 --port 5173" `
    -RedirectStandardOutput $frontendOutLog `
    -RedirectStandardError $frontendErrLog

Write-Host "Backend:  http://127.0.0.1:8000"
Write-Host "Frontend: http://127.0.0.1:5173"
Write-Host "Backend logs:  $backendOutLog / $backendErrLog"
Write-Host "Frontend logs: $frontendOutLog / $frontendErrLog"
