# Clone the 25 third-party reverse-engineering projects into vendor/ (depth 1).
# Vendor sources are intentionally NOT committed to this repository.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\vendor-clone.ps1
#   powershell ... -File scripts\vendor-clone.ps1 -Force   # re-clone missing/broken dirs
param(
    [string]$Root = (Split-Path -Parent $PSScriptRoot),
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
$repos = @(
    'utabk/marrow',
    'president-xd/revula',
    'Veedubin/Reverse-Engineering-Playground',
    'mrexodia/ida-pro-mcp',
    'HexRaysSA/ida-mcp',
    'blacktop/ida-mcp-rs',
    'LaurieWired/GhidraMCP',
    'bethington/ghidra-mcp',
    'cyberkaida/reverse-engineering-assistant',
    'clearbluejar/pyghidra-mcp',
    'mrphrazer/ghidra-headless-mcp',
    '13bm/GhidraMCP',
    'fosdickio/binary_ninja_mcp',
    'mrphrazer/binary-ninja-headless-mcp',
    'zinja-coder/jadx-ai-mcp',
    'zinja-coder/jadx-mcp-server',
    'zinja-coder/apktool-mcp-server',
    'index-login/MobileRE-Skill',
    'dnakov/frida-mcp',
    'FuzzySecurity/kahlo-mcp',
    'haikow/claude-reverse-skills',
    'zhizhuodemao/js-reverse-mcp',
    'NoOne-hub/JSReverser-MCP',
    'a0yark/js-reverse-pro-mcp',
    'albertan017/LLM4Decompile',
    'trailofbits/buttercup'
)

New-Item -ItemType Directory -Force -Path (Join-Path $Root 'vendor') | Out-Null

$ok = 0; $skip = 0; $fail = 0
foreach ($r in $repos) {
    $name = ($r -split '/')[1]
    $dst = Join-Path (Join-Path $Root 'vendor') $name
    if ((Test-Path (Join-Path $dst '.git')) -and -not $Force) {
        Write-Host "skip   $r (already cloned)"
        $skip++
        continue
    }
    if ($Force -and (Test-Path $dst)) { Remove-Item $dst -Recurse -Force }
    Write-Host "clone  $r"
    git clone --depth 1 --quiet "https://github.com/$r.git" $dst
    if (Test-Path (Join-Path $dst '.git')) { $ok++ } else { Write-Warning "failed: $r"; $fail++ }
}

Write-Host ""
Write-Host "vendor done: cloned=$ok skipped=$skip failed=$fail (root: $Root\vendor)"
Write-Host "next: copy config.example.json to config.json, then see docs/BACKENDS.md for tools."
