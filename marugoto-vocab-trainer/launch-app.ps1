$ErrorActionPreference = 'SilentlyContinue'
$ROOT = $PSScriptRoot
if (!$ROOT) {
    $ROOT = (Get-Location).Path
}
Set-Location $ROOT

# 1. Kiểm tra môi trường (Java 24 & Node.js/npm)
$javaCmd = Get-Command java -ErrorAction SilentlyContinue
if (!$javaCmd) {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show("Không tìm thấy Java trên máy tính.`nVui lòng cài đặt Java 24 và thử lại.", "Marugoto Vocab Trainer", "OK", "Error") | Out-Null
    exit 1
}

$npmCmd = Get-Command npm -ErrorAction SilentlyContinue
if (!$npmCmd) {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show("Không tìm thấy Node.js / npm trên máy tính.`nVui lòng cài đặt Node.js và thử lại.", "Marugoto Vocab Trainer", "OK", "Error") | Out-Null
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
    $res = Invoke-WebRequest -Uri 'http://127.0.0.1:5173' -TimeoutSec 1 -UseBasicParsing -ErrorAction Stop
    $frontendUp = $true
} catch {}

if ($backendUp -and $frontendUp) {
    Start-Process "http://localhost:5173"
    exit 0
}

# 3. Cài đặt node_modules nếu chưa có
if (!(Test-Path (Join-Path $ROOT "node_modules"))) {
    $psiNpm = New-Object System.Diagnostics.ProcessStartInfo
    $psiNpm.FileName = "cmd.exe"
    $psiNpm.Arguments = "/c npm install"
    $psiNpm.WorkingDirectory = $ROOT
    $psiNpm.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
    $psiNpm.CreateNoWindow = $true
    $psiNpm.UseShellExecute = $false
    $npmProc = [System.Diagnostics.Process]::Start($psiNpm)
    $npmProc.WaitForExit()
}

# 4. Khởi động Spring Boot Backend chạy nền (hoàn toàn ẩn cửa sổ)
$backendProc = $null
if (!$backendUp) {
    $psiBackend = New-Object System.Diagnostics.ProcessStartInfo
    $psiBackend.FileName = "cmd.exe"
    $psiBackend.Arguments = "/c mvnw.cmd spring-boot:run"
    $psiBackend.WorkingDirectory = Join-Path $ROOT "backend"
    $psiBackend.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
    $psiBackend.CreateNoWindow = $true
    $psiBackend.UseShellExecute = $false
    $backendProc = [System.Diagnostics.Process]::Start($psiBackend)
}

# Đợi Backend sẵn sàng phản hồi (tối đa 120s)
$deadline = (Get-Date).AddMinutes(2)
$backendReady = $false
while ((Get-Date) -lt $deadline) {
    try {
        $res = Invoke-WebRequest -Uri 'http://127.0.0.1:8080/api/decks' -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
        $backendReady = $true
        break
    } catch {
        Start-Sleep -Seconds 1
    }
}

if (!$backendReady) {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show("Backend không khởi động được trong vòng 2 phút.`nVui lòng kiểm tra lại log backend.", "Marugoto Vocab Trainer", "OK", "Warning") | Out-Null
    exit 1
}

# 5. Khởi động Vite Frontend dev server chạy nền (ẩn cửa sổ)
$frontendProc = $null
if (!$frontendUp) {
    $psiFrontend = New-Object System.Diagnostics.ProcessStartInfo
    $psiFrontend.FileName = "cmd.exe"
    $psiFrontend.Arguments = "/c npm run dev"
    $psiFrontend.WorkingDirectory = $ROOT
    $psiFrontend.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
    $psiFrontend.CreateNoWindow = $true
    $psiFrontend.UseShellExecute = $false
    $frontendProc = [System.Diagnostics.Process]::Start($psiFrontend)
}

# Đợi Vite sẵn sàng (tối đa 30s)
$deadlineVite = (Get-Date).AddSeconds(30)
$frontendReady = $false
while ((Get-Date) -lt $deadlineVite) {
    try {
        $res = Invoke-WebRequest -Uri 'http://127.0.0.1:5173' -TimeoutSec 1 -UseBasicParsing -ErrorAction Stop
        $frontendReady = $true
        break
    } catch {
        Start-Sleep -Milliseconds 500
    }
}

# 6. Tự động bật tab trình duyệt mặc định
Start-Process "http://localhost:5173"

# 7. Vòng lặp giám sát (Supervisor loop):
# Khi người dùng đóng tab trình duyệt, backend sẽ tự động phát hiện mất heartbeat và tắt (System.exit).
# Supervisor sẽ lập tức dọn sạch process frontend và kết thúc.
while ($true) {
    Start-Sleep -Seconds 2
    try {
        $res = Invoke-WebRequest -Uri 'http://127.0.0.1:8080/api/lifecycle/heartbeat' -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
    } catch {
        # Backend đã ngắt kết nối / tắt do tab trình duyệt đã đóng
        break
    }
}

# 8. Dọn dẹp tiến trình Frontend và các port còn sót
if ($frontendProc -and !$frontendProc.HasExited) {
    Stop-Process -Id $frontendProc.Id -Force -ErrorAction SilentlyContinue
}

Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue | ForEach-Object {
    Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
}

Get-NetTCPConnection -LocalPort 8080 -ErrorAction SilentlyContinue | ForEach-Object {
    Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
}

exit 0
