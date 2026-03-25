$root = Split-Path -Parent $MyInvocation.MyCommand.Path

Get-CimInstance Win32_Process | Where-Object {
    $_.CommandLine -like "*$root*uvicorn app.main:app*" -or
    $_.CommandLine -like "*$root*frontend*vite*--port 5173*"
} | ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
}

Write-Host "Stopped local frontend/backend processes started from this workspace."
