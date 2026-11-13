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

if (-not (Test-Path -LiteralPath '.env')) {
    Copy-Item -LiteralPath '.env.example' -Destination '.env'
    Write-Host 'Berkas .env dibuat dari .env.example.'
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'Docker tidak ditemukan. Pasang dan jalankan Docker Desktop, lalu coba lagi.'
}

docker info *> $null
if ($LASTEXITCODE -ne 0) {
    throw 'Docker Desktop belum berjalan. Jalankan Docker Desktop, tunggu siap, lalu coba lagi.'
}

Write-Host 'Menyalakan database PostgreSQL...'
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

if (-not (Test-Path -LiteralPath 'node_modules')) {
    Write-Host 'Memasang dependensi aplikasi...'
    npm install
    if ($LASTEXITCODE -ne 0) { throw 'Pemasangan dependensi gagal.' }
}

Write-Host 'Menyiapkan Prisma dan skema database...'
npm run db:generate
if ($LASTEXITCODE -ne 0) { throw 'Pembuatan Prisma Client gagal.' }
npm run db:deploy
if ($LASTEXITCODE -ne 0) { throw 'Penerapan migrasi database gagal.' }

foreach ($port in @(5173, 4000)) {
    $listeners = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
    if ($listeners.Count -gt 0) {
        $processIds = ($listeners | Select-Object -ExpandProperty OwningProcess -Unique) -join ', '
        throw "Port $port sedang digunakan oleh proses ID $processIds. Hentikan server lama lalu jalankan skrip ini lagi."
    }
}

Write-Host 'Database siap. Menjalankan website dan API; tekan Ctrl+C untuk berhenti.'
npm run dev
exit $LASTEXITCODE
