param([switch]$NoBrowser)

$ErrorActionPreference = 'SilentlyContinue'
$ROOT = $PSScriptRoot
if (!$ROOT) {
    $ROOT = (Get-Location).Path
}
Set-Location $ROOT

function Start-HiddenCommand($command, $directory, $logName) {
    $logDirectory = Join-Path $ROOT 'logs'
    New-Item -ItemType Directory -Path $logDirectory -Force -ErrorAction Stop | Out-Null
    $logPath = Join-Path $logDirectory $logName
    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = 'cmd.exe'
    $startInfo.Arguments = "/d /c $command > `"$logPath`" 2>&1"
    $startInfo.WorkingDirectory = $directory
    $startInfo.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
    $startInfo.CreateNoWindow = $true
    $startInfo.UseShellExecute = $false
    return [System.Diagnostics.Process]::Start($startInfo)
}

function Show-StartupError($message) {
    if (!$NoBrowser) {
        Add-Type -AssemblyName PresentationFramework
        [System.Windows.MessageBox]::Show($message, 'Marugoto Vocab Trainer', 'OK', 'Warning') | Out-Null
    }
}

# Only stop process trees started by this launcher, never arbitrary port owners.
function Stop-OwnedProcessTree($process) {
    if (!$process -or $process.HasExited) { return }
    $stopInfo = New-Object System.Diagnostics.ProcessStartInfo
    $stopInfo.FileName = 'taskkill.exe'
    $stopInfo.Arguments = "/PID $($process.Id) /T /F"
    $stopInfo.CreateNoWindow = $true
    $stopInfo.UseShellExecute = $false
    $stopInfo.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
    $stopProcess = [System.Diagnostics.Process]::Start($stopInfo)
    $stopProcess.WaitForExit()
}

function Open-AppBrowser {
    if (!$NoBrowser) { Start-Process 'http://localhost:5173' }
}

# 1. Kiểm tra môi trường (Java 24 & Node.js/npm)
$javaCmd = Get-Command java -ErrorAction SilentlyContinue
if (!$javaCmd) {
    Show-StartupError "Không tìm thấy Java trên máy tính.`nVui lòng cài đặt Java 24 và thử lại."
    exit 1
}

$npmCmd = Get-Command npm -ErrorAction SilentlyContinue
if (!$npmCmd) {
    Show-StartupError "Không tìm thấy Node.js / npm trên máy tính.`nVui lòng cài đặt Node.js và thử lại."
    exit 1
}

# 2. Kiểm tra nếu ứng dụng đã đang chạy sẵn
$backendUp = $false
try {
    $res = Invoke-WebRequest -Uri 'http://127.0.0.1:8080/api/decks' -TimeoutSec 1 -UseBasicParsing -ErrorAction Stop
    $backendUp = $true
} catch {}

$frontendUp = $false
try {
    $res = Invoke-WebRequest -Uri 'http://localhost:5173' -TimeoutSec 1 -UseBasicParsing -ErrorAction Stop
    $frontendUp = $true
} catch {}

if ($backendUp -and $frontendUp) {
    Open-AppBrowser
    exit 0
}

# 3. Cài đặt node_modules nếu chưa có
if (!(Test-Path (Join-Path $ROOT "node_modules"))) {
    $npmProc = Start-HiddenCommand 'npm install' $ROOT 'npm-install.log'
    $npmProc.WaitForExit()
    if ($npmProc.ExitCode -ne 0) {
        Show-StartupError "Không cài được thư viện frontend.`nXem logs/npm-install.log."
        exit 1
    }
}

# 4. Khởi động Spring Boot Backend chạy nền (hoàn toàn ẩn cửa sổ)
$backendProc = $null
if (!$backendUp) {
    $backendProc = Start-HiddenCommand 'mvnw.cmd spring-boot:run' (Join-Path $ROOT 'backend') 'backend.log'
}

# Đợi Backend sẵn sàng phản hồi (tối đa 120s)
$deadline = (Get-Date).AddMinutes(2)
$backendReady = $false
while ((Get-Date) -lt $deadline) {
    if ($backendProc -and $backendProc.HasExited) { break }
    try {
        $res = Invoke-WebRequest -Uri 'http://127.0.0.1:8080/api/decks' -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
        $backendReady = $true
        break
    } catch {
        Start-Sleep -Seconds 1
    }
}

if (!$backendReady) {
    Stop-OwnedProcessTree $backendProc
    Show-StartupError "Backend không khởi động được.`nXem logs/backend.log."
    exit 1
}

# 5. Khởi động Vite Frontend dev server chạy nền (ẩn cửa sổ)
$frontendProc = $null
if (!$frontendUp) {
    $frontendProc = Start-HiddenCommand 'npm run dev' $ROOT 'frontend.log'
}

# Đợi Vite sẵn sàng (tối đa 30s)
$deadlineVite = (Get-Date).AddSeconds(30)
$frontendReady = $false
while ((Get-Date) -lt $deadlineVite) {
    if ($frontendProc -and $frontendProc.HasExited) { break }
    try {
        $res = Invoke-WebRequest -Uri 'http://localhost:5173' -TimeoutSec 1 -UseBasicParsing -ErrorAction Stop
        $frontendReady = $true
        break
    } catch {
        Start-Sleep -Milliseconds 500
    }
}

if (!$frontendReady) {
    Stop-OwnedProcessTree $frontendProc
    Stop-OwnedProcessTree $backendProc
    Show-StartupError "Frontend không khởi động được.`nXem logs/frontend.log."
    exit 1
}

# 6. Tự động bật tab trình duyệt mặc định
Open-AppBrowser

# 7. Vòng lặp giám sát (Supervisor loop):
# Khi người dùng đóng tab trình duyệt, backend sẽ tự động phát hiện mất heartbeat và tắt (System.exit).
# Supervisor sẽ lập tức dọn sạch process frontend và kết thúc.
$firstConnectionDeadline = (Get-Date).AddSeconds(60)
while ($true) {
    Start-Sleep -Seconds 2
    try {
        $status = Invoke-RestMethod -Uri 'http://127.0.0.1:8080/api/lifecycle/status' -TimeoutSec 2 -ErrorAction Stop
        if (!$status.hasConnected -and (Get-Date) -gt $firstConnectionDeadline) { break }
    } catch {
        # Backend đã ngắt kết nối / tắt do tab trình duyệt đã đóng
        break
    }
}

# 8. Dọn dẹp process con do launcher này tạo.
Stop-OwnedProcessTree $frontendProc
Stop-OwnedProcessTree $backendProc

exit 0
