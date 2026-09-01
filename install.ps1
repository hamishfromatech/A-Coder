<#
.SYNOPSIS
    A-Coder IDE install script (Windows)

.DESCRIPTION
    Installs the latest release of A-Coder IDE from the GitHub releases of
    hamishfromatech/A-Coder, verifying checksums against the .sha256 sidecars
    published alongside every asset.

    One-liner (PowerShell):
        irm https://raw.githubusercontent.com/hamishfromatech/A-Coder/main/install.ps1 | iex

    Install methods:
        -SystemSetup (default when elevated)  A-CoderSetup-<arch>-<v>.exe   per-machine
        -UserSetup   (default when non-admin)  A-CoderUserSetup-<arch>-<v>.exe  per-user
        -Portable                             A-Coder-win32-<arch>-<v>.zip unpacked to -InstallDir
        -Msi                                  A-Coder-<arch>-<v>.msi  per-machine via msiexec

.PARAMETER Version
    Install a specific release tag (default: latest).

.PARAMETER InstallDir
    Destination directory for -Portable installs (default: %LOCALAPPDATA%\Programs\A-Coder).

.PARAMETER SkipChecksum
    Skip SHA-256 verification (not recommended).

.PARAMETER Force
    Kill a running A-Coder instance instead of failing.

.PARAMETER Quiet
    Suppress non-essential output.

.EXAMPLE
    .\install.ps1 -UserSetup
    .\install.ps1 -Version 1.99.30097 -Portable -InstallDir C:\Tools\A-Coder

.NOTES
    Design notes (mirrors the a-coder-builder release workflows):
    - Assets live at https://github.com/hamishfromatech/A-Coder/releases/download/<tag>/<asset>
    - Asset names come from a-coder-builder/prepare_assets.sh:
        A-CoderSetup-<arch>-<tag>.exe            (system installer, Inno Setup)
        A-CoderUserSetup-<arch>-<tag>.exe        (user installer, Inno Setup)
        A-Coder-win32-<arch>-<tag>.zip           (portable archive)
        A-Coder-<arch>-<tag>.msi                 (MSI, updates-disabled variant also exists)
    - Every asset has a .sha256 sidecar in "<hash>  <filename>" format
    - The GitHub API (releases/latest) is the primary version source; the
      hamishfromatech/versions repo (stable/win32/<arch>/<channel>/latest.json,
      the same file the IDE auto-updater reads) is the fallback
#>
[CmdletBinding()]
param(
    [Parameter()]
    [string]$Version,

    [Parameter()]
    [ValidateSet('SystemSetup', 'UserSetup', 'Portable', 'Msi')]
    [string]$Method,

    [Parameter()]
    [string]$InstallDir,

    [Parameter()]
    [switch]$SkipChecksum,

    [Parameter()]
    [switch]$Force,

    [Parameter()]
    [switch]$Quiet,

    [Parameter()]
    [switch]$Help
)

$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
$Repo            = 'hamishfromatech/A-Coder'            # releases live here
$VersionsRepo    = 'hamishfromatech/versions'           # fallback version metadata
$AppName         = 'A-Coder'
$ReleasesUrl     = "https://github.com/$Repo/releases"
$RawVersionsUrl  = "https://raw.githubusercontent.com/$VersionsRepo/refs/heads/main/stable"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
function Write-Info {
    if (-not $Quiet) { Write-Host "==> $args" }
}

function Write-Fatal {
    param([string]$Message)
    Write-Host "ERROR: $Message" -ForegroundColor Red
    exit 1
}

function Show-Usage {
    Write-Host @"
Usage: install.ps1 [-Method SystemSetup|UserSetup|Portable|Msi] [-Version <tag>]
                   [-InstallDir <dir>] [-SkipChecksum] [-Force] [-Quiet]

Installs the latest A-Coder IDE release from github.com/$Repo.
Default method: SystemSetup when elevated, UserSetup otherwise.
"@
    exit 0
}

if ($Help) { Show-Usage }

# TLS 1.2 for Windows PowerShell 5.1 (PS 7+ defaults to a sane policy)
if ($PSVersionTable.PSVersion.Major -lt 6) {
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
}

function Test-Elevated {
    if ($PSVersionTable.PSVersion.Major -ge 6 -and -not $IsWindows) {
        return $false
    }
    try {
        $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
        $principal = New-Object Security.Principal.WindowsPrincipal($identity)
        return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    }
    catch {
        return $false
    }
}

function Invoke-Download {
    param(
        [Parameter(Mandatory)] [string]$Url,
        [Parameter(Mandatory)] [string]$OutFile,
        [switch]$Silent
    )
    if ($Silent -and $PSVersionTable.PSVersion.Major -ge 6) {
        Invoke-WebRequest -Uri $Url -OutFile $OutFile -ErrorAction Stop
    }
    else {
        # -UseBasicParsing: PS 5.1 hangs without the IE engine on some boxes
        Invoke-WebRequest -Uri $Url -OutFile $OutFile -UseBasicParsing -ErrorAction Stop
    }
}

function Get-Release {
    <# Resolves the release tag and asset list. Returns hashtable with Version and AssetUrls. #>
    try {
        if ($Version) {
            $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/tags/$Version"
            if (-not $release) {
                Write-Fatal "Release tag not found: $Version. See $ReleasesUrl"
            }
        }
        else {
            $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/latest"
        }
        return @{
            Version  = $release.tag_name
            AssetUrls = @($release.assets | ForEach-Object { $_.browser_download_url })
        }
    }
    catch {
        return $null
    }
}

function Get-ReleaseViaVersionsRepo {
    <# Fallback: the versions repo, same latest.json the IDE auto-updater reads.
       Channels: system | user | archive | msi #>
    param([string]$Arch, [string]$Channel)
    $url = "$RawVersionsUrl/win32/$Arch/$Channel/latest.json"
    try {
        $latest = Invoke-RestMethod -Uri $url
        return @{
            Version = $latest.name
            AssetUrl = $latest.url
            Sha256 = $latest.sha256hash
        }
    }
    catch {
        return $null
    }
}

function Assert-Checksum {
    param(
        [Parameter(Mandatory)] [string]$File,
        [Parameter(Mandatory)] [string]$AssetUrl,
        [AllowEmptyString()] [string]$ExpectedSha
    )
    if (-not $ExpectedSha) {
        Write-Info 'Verifying SHA-256 checksum'
        $sidecar = "$File.sha256"
        Invoke-Download -Url "$AssetUrl.sha256" -OutFile $sidecar -Silent
        $expected = (Get-Content $sidecar -TotalCount 1).Split(' ')[0]
    }
    else {
        $expected = $ExpectedSha
    }
    $actual = (Get-FileHash -Path $File -Algorithm SHA256).Hash.ToLower()
    if ($actual -ne $expected.ToLower()) {
        Write-Fatal "Checksum mismatch for $(Split-Path $File -Leaf)`n  expected: $expected`n  actual:   $actual"
    }
    if (-not $Quiet) { Write-Host 'Checksum OK' }
}

# ---------------------------------------------------------------------------
# Preflight
# ---------------------------------------------------------------------------
if (-not $IsWindows -and $PSVersionTable.PSVersion.Major -ge 6 -and -not $env:PROCESSOR_ARCHITECTURE) {
    Write-Fatal 'This script is for Windows. On macOS/Linux use install.sh.'
}

if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') {
    $Arch = 'arm64'
}
else {
    $Arch = 'x64'   # AMD64 and everything else VS Code ships as x64
}

$elevated = Test-Elevated
if (-not $Method) {
    $Method = if ($elevated) { 'SystemSetup' } else { 'UserSetup' }
}

# Channel used by the versions-repo fallback (matches update_version.sh paths)
$channelByMethod = @{ SystemSetup = 'system'; UserSetup = 'user'; Portable = 'archive'; Msi = 'msi' }
$channel = $channelByMethod[$Method]

# ---------------------------------------------------------------------------
# Resolve release + asset
# ---------------------------------------------------------------------------
Write-Info "Platform: win32 / $Arch ($Method)"
Write-Info "Resolving $(if ($Version) { $Version } else { 'latest' }) release"

$release = Get-Release
$assetSha = $null

if ($release) {
    $Version = $release.Version
    $assetName = switch ($Method) {
        'SystemSetup' { "$AppName" + "Setup-$Arch-$Version.exe" }
        'UserSetup'   { "$AppName" + "UserSetup-$Arch-$Version.exe" }
        'Portable'    { "$AppName-win32-$Arch-$Version.zip" }
        'Msi'         { "$AppName-$Arch-$Version.msi" }
    }
    $assetUrl = $release.AssetUrls | Where-Object { $_ -like "*/$assetName" } | Select-Object -First 1
    if (-not $assetUrl) {
        Write-Fatal "No Windows asset ($assetName) found in release $Version.`nIt may not include Windows builds yet - see $ReleasesUrl"
    }
}
else {
    if ($Version) {
        Write-Fatal "Release tag not found: $Version (GitHub API unavailable). See $ReleasesUrl"
    }
    Write-Warning 'GitHub API unavailable; falling back to the versions repo'
    $fallback = Get-ReleaseViaVersionsRepo -Arch $Arch -Channel $channel
    if (-not $fallback) {
        Write-Fatal "Could not determine the latest version. Check $ReleasesUrl"
    }
    $Version = $fallback.Version
    $assetUrl = $fallback.AssetUrl
    $assetSha = $fallback.Sha256
}

if (-not $Quiet) { Write-Info "Version: $Version" }

if ($Method -eq 'Portable' -and -not $InstallDir) {
    $InstallDir = Join-Path $env:LOCALAPPDATA 'Programs\A-Coder'
}

# ---------------------------------------------------------------------------
# Download + verify
# ---------------------------------------------------------------------------
$tempDir = Join-Path ([IO.Path]::GetTempPath()) ("a-coder-install-" + [IO.Path]::GetRandomFileName())
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
try {
    $assetFile = Join-Path $tempDir (Split-Path $assetUrl -Leaf)
    Write-Info "Downloading $(Split-Path $assetUrl -Leaf)"
    Invoke-Download -Url $assetUrl -OutFile $assetFile

    if (-not $SkipChecksum) {
        Assert-Checksum -File $assetFile -AssetUrl $assetUrl -ExpectedSha $assetSha
    }

    # ---------------------------------------------------------------------------
    # Install
    # ---------------------------------------------------------------------------
    $running = Get-Process -Name $AppName -ErrorAction SilentlyContinue
    if ($running) {
        if ($Force -and $Method -in @('SystemSetup', 'UserSetup', 'Msi')) {
            Write-Warning "A-Coder is running; stopping it (-Force)"
            $running | Stop-Process -Force
            Start-Sleep -Seconds 1
        }
        elseif ($Method -in @('SystemSetup', 'UserSetup', 'Msi')) {
            Write-Fatal 'A-Coder is currently running. Quit it and re-run, or pass -Force.'
        }
    }

    switch ($Method) {
        'SystemSetup' {
            # Inno Setup silent flags (same as VS Code):
            #   /VERYSILENT      no wizard
            #   /NORESTART       no reboot
            #   /SUPPRESSMSGBOXES
            #   /MERGETASKS=!runcode  do not launch after install
            Write-Info 'Running system installer (per-machine)...'
            $args = @('/VERYSILENT', '/NORESTART', '/SUPPRESSMSGBOXES', '/MERGETASKS=!runcode')
            if ($Quiet) { $args += '/LOG=-' }
            $proc = Start-Process -FilePath $assetFile -ArgumentList $args -Wait -PassThru
            if ($proc.ExitCode -ne 0) {
                Write-Fatal "Installer exited with code $($proc.ExitCode) (1=abort, 2=reboot needed, 1223=cancelled)"
            }
            $installedAt = "${env:ProgramFiles}\A-Coder IDE"
            Write-Info "A-Coder IDE $Version installed ($Method)"
            if ($installedAt -and (Test-Path $installedAt)) {
                Write-Info "Location: $installedAt"
            }
            Write-Host "Open: run 'a-coder' in a terminal, or launch A-Coder IDE from the Start menu"
        }

        'UserSetup' {
            Write-Info 'Running user installer (per-user)...'
            $args = @('/VERYSILENT', '/NORESTART', '/SUPPRESSMSGBOXES', '/MERGETASKS=!runcode')
            if ($Quiet) { $args += '/LOG=-' }
            $proc = Start-Process -FilePath $assetFile -ArgumentList $args -Wait -PassThru
            if ($proc.ExitCode -ne 0) {
                Write-Fatal "Installer exited with code $($proc.ExitCode) (1=abort, 2=reboot needed, 1223=cancelled)"
            }
            $installedAt = Join-Path $env:LOCALAPPDATA 'Programs\A-Coder IDE'
            Write-Info "A-Coder IDE $Version installed ($Method)"
            if ($installedAt -and (Test-Path $installedAt)) {
                Write-Info "Location: $installedAt"
            }
            Write-Host "Open: run 'a-coder' in a terminal, or launch A-Coder IDE from the Start menu"
        }

        'Msi' {
            if (-not $elevated) {
                Write-Fatal 'MSI installs are per-machine and require an elevated shell. Re-run as Administrator or use -UserSetup.'
            }
            Write-Info 'Installing MSI (per-machine)...'
            $proc = Start-Process -FilePath 'msiexec.exe' -ArgumentList "/i `"$assetFile`"", '/qn', '/norestart' -Wait -PassThru
            if ($proc.ExitCode -ne 0) {
                Write-Fatal "msiexec exited with code $($proc.ExitCode) (1602=cancelled, 3010=reboot required)"
            }
            Write-Info "A-Coder IDE $Version installed ($Method)"
            Write-Host "Open: run 'a-coder' in a terminal, or launch A-Coder IDE from the Start menu"
        }

        'Portable' {
            Write-Info "Extracting to $InstallDir"
            if (Test-Path $InstallDir) {
                if ($Force) {
                    Remove-Item $InstallDir -Recurse -Force
                }
                else {
                    Write-Fatal "$InstallDir already exists. Pass -Force to overwrite it."
                }
            }
            New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
            Expand-Archive -Path $assetFile -DestinationPath $InstallDir -Force
            $binDir = Join-Path $InstallDir 'bin'
            Write-Info "A-Coder IDE $Version installed ($Method)"
            Write-Info "Location: $InstallDir"
            Write-Host "Open: `"$InstallDir\$AppName.exe`"  (CLI: `"$binDir\a-coder.exe`")"
            if ($binDir -and (Test-Path $binDir)) {
                Write-Host "Tip: add `"$binDir`" to your PATH to use 'a-coder' from any terminal."
            }
        }
    }

    Write-Host ''
    Write-Host 'To update later, re-run this script.'
}
finally {
    Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue
}