param(
    [switch]$ExternalDb,
    [switch]$SkipDbPush,
    [switch]$SkipInstall
)

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

# npm's concurrently package needs cmd.exe to be discoverable by name on Windows.
if ($env:WINDIR) {
    $system32 = Join-Path $env:WINDIR 'System32'
    $env:ComSpec = Join-Path $system32 'cmd.exe'
    if (($env:PATH -split ';') -notcontains $system32) {
        $env:PATH = "$system32;$env:PATH"
    }
}

function Read-DotEnvMap {
    param([string]$Path)
    $map = @{}
    if (-not (Test-Path -LiteralPath $Path)) { return $map }
    foreach ($rawLine in Get-Content -LiteralPath $Path) {
        $line = $rawLine.Trim()
        if ([string]::IsNullOrWhiteSpace($line) -or $line.StartsWith('#')) { continue }
        $eqIdx = $line.IndexOf('=')
        if ($eqIdx -le 0) { continue }
        $k = $line.Substring(0, $eqIdx).Trim()
        $v = $line.Substring($eqIdx + 1).Trim()
        if (($v.StartsWith('"') -and $v.EndsWith('"') -and $v.Length -ge 2) -or
            ($v.StartsWith("'") -and $v.EndsWith("'") -and $v.Length -ge 2)) {
            $v = $v.Substring(1, $v.Length - 2)
        }
        $map[$k] = $v
    }
    return $map
}

function Get-EffectiveSetting {
    param(
        [hashtable]$DotEnv,
        [string]$Name,
        [string]$Default = ''
    )
    $fromEnv = [Environment]::GetEnvironmentVariable($Name)
    if (-not [string]::IsNullOrWhiteSpace($fromEnv)) { return $fromEnv.Trim() }
    if ($DotEnv.ContainsKey($Name) -and -not [string]::IsNullOrWhiteSpace($DotEnv[$Name])) {
        return $DotEnv[$Name].Trim()
    }
    return $Default
}

function Get-DependencyManifestHash {
    $manifestPaths = @(
        'package-lock.json',
        'bun.lock',
        'package.json',
        'apps/api/package.json',
        'apps/web/package.json',
        'packages/shared/package.json'
    ) | Where-Object { Test-Path -LiteralPath $_ }

    $combined = ($manifestPaths | ForEach-Object {
        $h = (Get-FileHash -Algorithm SHA256 -LiteralPath $_).Hash
        "${_}:$h"
    }) -join "`n"

    $bytes = [System.Text.Encoding]::UTF8.GetBytes($combined)
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        return ([System.BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant()
    } finally {
        $sha.Dispose()
    }
}

if (-not (Test-Path -LiteralPath '.env')) {
    Copy-Item -LiteralPath '.env.example' -Destination '.env'
    Write-Host 'Berkas .env dibuat dari .env.example.'
}

$dotEnv = Read-DotEnvMap -Path '.env'
$databaseUrl = Get-EffectiveSetting -DotEnv $dotEnv -Name 'DATABASE_URL'
$sqlHost = Get-EffectiveSetting -DotEnv $dotEnv -Name 'SQL_HOST' -Default 'localhost'
$isLocalDockerHost = $sqlHost -in @('localhost', '127.0.0.1', '::1', 'postgres')
$isLocalUrl = [string]::IsNullOrWhiteSpace($databaseUrl) -or ($databaseUrl -match '@(localhost|127\.0\.0\.1|postgres)(:|/)')
$useExternalDb = $ExternalDb.IsPresent -or (-not $isLocalUrl) -or (-not $isLocalDockerHost)

if ($useExternalDb) {
    Write-Host 'Mode database eksternal/Cloud SQL aktif (Docker PostgreSQL lokal dilewati).'
} else {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        throw 'Docker tidak ditemukan. Pasang dan jalankan Docker Desktop, atau gunakan -ExternalDb untuk database eksternal.'
    }

    docker info *> $null
    if ($LASTEXITCODE -ne 0) {
        throw 'Docker Desktop belum berjalan. Jalankan Docker Desktop, tunggu siap, lalu coba lagi (atau gunakan -ExternalDb).'
    }

    Write-Host 'Menyalakan database PostgreSQL lokal...'
    docker compose up -d postgres
    if ($LASTEXITCODE -ne 0) { throw 'Gagal menyalakan PostgreSQL.' }

    Write-Host 'Menunggu database siap...'
    $deadline = (Get-Date).AddSeconds(90)
    do {
        $health = docker inspect --format='{{.State.Health.Status}}' lms-ptik-postgres 2>$null
        if ($LASTEXITCODE -eq 0 -and $health -eq 'healthy') { break }
        if ((Get-Date) -ge $deadline) {
            docker compose logs --tail 30 postgres
            throw 'PostgreSQL belum siap setelah 90 detik.'
        }
        Start-Sleep -Seconds 2
    } while ($true)
}

if (-not $SkipInstall) {
    $depsStampPath = Join-Path 'node_modules' '.sintaks-deps.sha256'
    $currentHash = Get-DependencyManifestHash
    $recordedHash = if (Test-Path -LiteralPath $depsStampPath) {
        (Get-Content -LiteralPath $depsStampPath -Raw).Trim()
    } else {
        ''
    }

    if (-not (Test-Path -LiteralPath 'node_modules') -or ($currentHash -ne $recordedHash)) {
        Write-Host 'Memasang / menyinkronkan dependensi workspace...'
        npm install
        if ($LASTEXITCODE -ne 0) { throw 'Pemasangan dependensi gagal.' }
        if (Test-Path -LiteralPath 'node_modules') {
            Set-Content -LiteralPath $depsStampPath -Value $currentHash -NoNewline
        }
    }
}

if (-not $SkipDbPush) {
    Write-Host 'Menyinkronkan skema database Drizzle...'
    npm run db:push
    if ($LASTEXITCODE -ne 0) { throw 'Sinkronisasi skema database (npm run db:push) gagal.' }
}

$portRaw = Get-EffectiveSetting -DotEnv $dotEnv -Name 'PORT'
if ([string]::IsNullOrWhiteSpace($portRaw)) {
    $portRaw = Get-EffectiveSetting -DotEnv $dotEnv -Name 'API_PORT' -Default '3000'
}
$effectivePort = 0
if (-not [int]::TryParse($portRaw, [ref]$effectivePort) -or $effectivePort -lt 1 -or $effectivePort -gt 65535) {
    throw "Konfigurasi port tidak valid: '$portRaw'. Gunakan angka 1-65535 pada PORT atau API_PORT."
}

$listeners = @(Get-NetTCPConnection -LocalPort $effectivePort -State Listen -ErrorAction SilentlyContinue)
if ($listeners.Count -gt 0) {
    $processIds = ($listeners | Select-Object -ExpandProperty OwningProcess -Unique) -join ', '
    throw "Port $effectivePort sedang digunakan oleh proses ID $processIds. Hentikan server lama atau ubah API_PORT/PORT lalu jalankan skrip ini lagi."
}

Write-Host "Database siap. Menjalankan website dan API di http://localhost:$effectivePort; tekan Ctrl+C untuk berhenti."
npm run dev
exit $LASTEXITCODE

