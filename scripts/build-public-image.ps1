$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$context = Join-Path $repoRoot ('target/public-image-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path (Join-Path $context 'public/onboarding') -Force | Out-Null
foreach ($file in @('Dockerfile', '.dockerignore', 'nginx.conf', 'package.json', 'package-lock.json', 'angular.json', 'tsconfig.json', 'tsconfig.app.json')) {
    Copy-Item -LiteralPath (Join-Path $repoRoot $file) -Destination (Join-Path $context $file)
}
foreach ($directory in @('src', 'contracts')) {
    Copy-Item -LiteralPath (Join-Path $repoRoot $directory) -Destination (Join-Path $context $directory) -Recurse
}
foreach ($file in @('silent-check-sso.html', 'silent-check-sso.js', 'onboarding/plantation-data-worksheet.csv')) {
    Copy-Item -LiteralPath (Join-Path $repoRoot ('public/' + $file)) -Destination (Join-Path $context ('public/' + $file))
}
# Public defaults only. Never read or copy the owner's public/config.json or private environment.
$defaults = '{"apiBaseUrl":"http://localhost:8080","keycloak":{"url":"http://localhost:8180","realm":"agrosphere","clientId":"agrosphere-web"},"cesium":{}}'
[IO.File]::WriteAllText((Join-Path $context 'public/config.json'), $defaults)
docker build --tag agrosphere-web:0.4.0-local $context
if ($LASTEXITCODE -ne 0) { throw 'Independent public-source Docker build failed' }
Write-Output "Public-source context retained for inspection: $context"
