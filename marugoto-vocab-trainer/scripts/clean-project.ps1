# Run with -WhatIf to preview. Close the app and test runners before cleaning.
[CmdletBinding(SupportsShouldProcess = $true)]
param()

$ErrorActionPreference = 'Stop'
$appRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$rootPrefix = $appRoot.TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar

# Only generated output: never remove data/, PDFs, source, artifacts, IDE
# settings, CodeGraph indexes, node_modules, or the rest of tmp/.
$relativePaths = @('dist', 'backend/target', 'logs', 'debug.log', 'tmp/test-runtime')
$tmpPath = Join-Path $appRoot 'tmp'
if (Test-Path -LiteralPath $tmpPath -PathType Container) {
    $relativePaths += @(Get-ChildItem -LiteralPath $tmpPath -File -Filter '*.log' |
        ForEach-Object { 'tmp/' + $_.Name })
}

$targets = @()
foreach ($relativePath in $relativePaths) {
    $targetPath = [System.IO.Path]::GetFullPath((Join-Path $appRoot $relativePath))
    if (!$targetPath.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Cleanup target escapes the application: $targetPath"
    }
    if (!(Test-Path -LiteralPath $targetPath)) { continue }

    # Reject junctions/symlinks in every ancestor and descendant before deleting
    # anything, so generated directories cannot redirect cleanup outside the app.
    $ancestor = Get-Item -LiteralPath $targetPath -Force
    while ($null -ne $ancestor) {
        if ($ancestor.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
            throw "Cleanup refuses linked paths: $($ancestor.FullName)"
        }
        $ancestor = if ($ancestor -is [System.IO.DirectoryInfo]) { $ancestor.Parent } else { $ancestor.Directory }
    }
    $items = @(Get-Item -LiteralPath $targetPath -Force)
    if ($items[0].PSIsContainer) {
        $items += @(Get-ChildItem -LiteralPath $targetPath -Recurse -Force)
    }
    if ($items | Where-Object { $_.Attributes -band [System.IO.FileAttributes]::ReparsePoint }) {
        throw "Cleanup refuses a directory containing linked paths: $targetPath"
    }
    $files = @($items | Where-Object { !$_.PSIsContainer })
    $targets += [pscustomobject]@{
        Path = $targetPath
        Files = $files.Count
        Bytes = ($files | Measure-Object Length -Sum).Sum
    }
}

foreach ($target in $targets) {
    if ($PSCmdlet.ShouldProcess($target.Path, "Remove generated output ($($target.Files) files)")) {
        Remove-Item -LiteralPath $target.Path -Recurse -Force
        Write-Output ("Removed {0} ({1:N2} MiB)" -f $target.Path, ($target.Bytes / 1MB))
    }
}
if (!$targets.Count) { Write-Output 'No generated output to clean.' }
