<#
  uia.ps1 — dump the UI Automation tree of a window / take a window screenshot.
  Used by the rehub `uia` backend (no external dependencies; built-in .NET UIA).

  Examples:
    powershell -NoProfile -File uia.ps1 -Action tree -ProcessName SketchUp -Out tree.json
    powershell -NoProfile -File uia.ps1 -Action tree -ProcessId 1234 -MaxDepth 8
    powershell -NoProfile -File uia.ps1 -Action screenshot -ProcessName SketchUp -Out win.png
    powershell -NoProfile -File uia.ps1 -Action find -ProcessName SketchUp -Query "Push"
#>
param(
    [ValidateSet('tree', 'screenshot', 'find')]
    [string]$Action = 'tree',
    [string]$ProcessName = '',
    [int]$ProcessId = 0,
    [string]$Title = '',
    [string]$Query = '',
    [string]$Out = '',
    [int]$MaxDepth = 8,
    [int]$MaxNodes = 600
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, System.Drawing, System.Windows.Forms

function Get-TargetWindow {
    $root = [System.Windows.Automation.AutomationElement]::RootElement
    $cond = [System.Windows.Automation.Condition]::TrueCondition
    $windows = $root.FindAll([System.Windows.Automation.TreeScope]::Children, $cond)

    $proc = $null
    if ($ProcessId -gt 0) {
        $proc = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
    } elseif ($ProcessName) {
        $procs = @(Get-Process -Name $ProcessName -ErrorAction SilentlyContinue)
        $proc = $procs | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
        if (-not $proc) { $proc = $procs | Select-Object -First 1 }
    } else {
        throw "need -ProcessName or -ProcessId"
    }
    if (-not $proc) { throw "process not found (pid=$ProcessId name=$ProcessName)" }
    $pidTarget = $proc.Id

    # 1) prefer the process' main window handle (works for shell windows too)
    if ($proc.MainWindowHandle -ne 0) {
        try {
            $el = [System.Windows.Automation.AutomationElement]::FromHandle($proc.MainWindowHandle)
            if ($el) { return $el }
        } catch { }
    }

    # 2) fall back to scanning top-level UIA windows
    $candidates = @()
    foreach ($w in $windows) {
        try {
            if ($w.Current.ProcessId -eq $pidTarget) { $candidates += $w }
        } catch { }
    }
    if (-not $candidates) { throw "no top-level window for pid $pidTarget" }
    if ($Title) {
        $byTitle = $candidates | Where-Object { $_.Current.Name -like "*$Title*" } | Select-Object -First 1
        if ($byTitle) { return $byTitle }
    }
    return $candidates | Select-Object -First 1
}

function SafeInt($v) {
    try {
        $d = [double]$v
        if ([double]::IsNaN($d) -or [double]::IsInfinity($d)) { return $null }
        return [int][math]::Round($d)
    } catch { return $null }
}

function Get-NodeInfo($el, $depth) {
    $r = $null
    try { $r = $el.Current.BoundingRectangle } catch { }
    return [pscustomobject]@{
        name         = $el.Current.Name
        type         = $el.Current.ControlType.ProgrammaticName
        automationId = $el.Current.AutomationId
        className    = $el.Current.ClassName
        enabled      = $el.Current.IsEnabled
        offscreen    = $el.Current.IsOffscreen
        x            = if ($r) { SafeInt $r.X } else { $null }
        y            = if ($r) { SafeInt $r.Y } else { $null }
        w            = if ($r) { SafeInt $r.Width } else { $null }
        h            = if ($r) { SafeInt $r.Height } else { $null }
        depth        = $depth
    }
}

$win = Get-TargetWindow
$winInfo = Get-NodeInfo $win 0

if ($Action -eq 'screenshot') {
    $r = $win.Current.BoundingRectangle
    $x = SafeInt $r.X; $y = SafeInt $r.Y; $w = SafeInt $r.Width; $h = SafeInt $r.Height
    $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
    # minimized/offscreen windows report -32000 or NaN → fall back to the primary screen
    if (($null -eq $x) -or ($null -eq $y) -or ($null -eq $w) -or ($null -eq $h) -or ($w -lt 10) -or ($h -lt 10) -or ($x -lt -10000) -or ($y -lt -10000)) {
        $x = $bounds.X; $y = $bounds.Y; $w = $bounds.Width; $h = $bounds.Height
        $fallback = $true
    } else { $fallback = $false }
    $bmp = New-Object System.Drawing.Bitmap ([int]$w), ([int]$h)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.CopyFromScreen([int]$x, [int]$y, 0, 0, $bmp.Size)
    if (-not $Out) { $Out = Join-Path $env:TEMP ("uia-shot-$([guid]::NewGuid().ToString('N')).png") }
    $bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose()
    [pscustomobject]@{ path = $Out; window = $winInfo; rect = @{ x = $x; y = $y; w = $w; h = $h }; screenFallback = $fallback } | ConvertTo-Json -Depth 5
    exit 0
}

if ($Action -eq 'find') {
    if (-not $Query) { throw "find needs -Query" }
    $cond = New-Object System.Windows.Automation.PropertyCondition(
        [System.Windows.Automation.AutomationElement]::NameProperty, $Query)
    $found = $win.FindAll([System.Windows.Automation.TreeScope]::Descendants, $cond)
    $list = @()
    foreach ($f in $found) { $list += Get-NodeInfo $f -1 }
    [pscustomobject]@{ window = $winInfo; query = $Query; count = $list.Count; matches = $list } | ConvertTo-Json -Depth 6
    exit 0
}

# tree walk (parent/children encoded as flat list with depth)
$nodes = New-Object System.Collections.ArrayList
$null = $nodes.Add($winInfo)
$walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
$script:count = 1

function Walk($el, $depth) {
    if ($script:count -ge $MaxNodes -or $depth -ge $MaxDepth) { return }
    $child = $walker.GetFirstChild($el)
    while ($child -ne $null) {
        try {
            $info = Get-NodeInfo $child $depth
            $null = $nodes.Add($info)
            $script:count++
        } catch { }
        Walk $child ($depth + 1)
        if ($script:count -ge $MaxNodes) { return }
        try { $child = $walker.GetNextSibling($child) } catch { $child = $null }
    }
}
Walk $win 1

$result = [pscustomobject]@{
    window      = $winInfo
    nodeCount   = $nodes.Count
    truncated   = ($script:count -ge $MaxNodes)
    controls    = $nodes
}

if ($Out) {
    $result | ConvertTo-Json -Depth 8 | Set-Content -Path $Out -Encoding UTF8
    [pscustomobject]@{ path = $Out; nodeCount = $result.nodeCount; truncated = $result.truncated } | ConvertTo-Json -Depth 3
} else {
    $result | ConvertTo-Json -Depth 8
}
