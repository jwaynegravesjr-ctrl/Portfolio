param()

$ErrorActionPreference = 'Stop'
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$siteRoot = Join-Path $repoRoot 'site'
$distRoot = Join-Path $siteRoot 'dist'
$publishedAssets = Join-Path $repoRoot 'assets'

if (-not (Test-Path -LiteralPath (Join-Path $siteRoot 'package.json'))) {
    throw 'Expected the Vite source in site/.'
}

Push-Location $siteRoot
try {
    & npm.cmd run build:pages
    if ($LASTEXITCODE -ne 0) { throw 'The Pages build failed.' }
}
finally {
    Pop-Location
}

if (-not (Test-Path -LiteralPath (Join-Path $distRoot 'index.html'))) {
    throw 'The Pages build did not produce index.html.'
}

$resolvedAssets = [System.IO.Path]::GetFullPath($publishedAssets)
if (-not $resolvedAssets.StartsWith($repoRoot + [System.IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Refusing to replace assets outside the repository.'
}
if (Test-Path -LiteralPath $resolvedAssets) {
    Remove-Item -LiteralPath $resolvedAssets -Recurse -Force
}

Copy-Item -LiteralPath (Join-Path $distRoot 'index.html') -Destination (Join-Path $repoRoot 'index.html') -Force
Copy-Item -LiteralPath (Join-Path $distRoot 'assets') -Destination $resolvedAssets -Recurse -Force
Write-Host 'GitHub Pages files refreshed in the repository root.'
