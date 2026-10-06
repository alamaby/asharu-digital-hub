<#
.SYNOPSIS
  Static documentation generator: data validation, page rendering, link checking, and distribution build.

.DESCRIPTION
  Builds and validates data-driven project documentation from JSON definitions:
  (1) Reads data/changes/*.json
  (2) Validates 21 mandatory fields + unique ID
  (3) Sorts by date, time, and sequence
  (4) Generates data/changes/index.json
  (5) Generates missing change detail pages from Change-Template.html
  (5b) Generates missing release detail pages from Release-Template.html
  (6) Updates GEN:* blocks across home, changelog, changes, releases, and architecture
  (6b) Injects dynamic brand identity from data/project.json
  (7) Verifies internal links to prevent 404s
  (8) Assembles production-ready static site into dist/project-docs/

.PARAMETER ValidateOnly
  Only runs validation and link verification without writing generated pages or dist/.

.PARAMETER Init
  Scaffolds starter templates, directory structure, and baseline configurations if not already present.

.PARAMETER DocsRoot
  Optional path to documentation root directory. Defaults to parent of tools/ directory.

.PARAMETER DistDir
  Optional path for the distribution build output. Defaults to <RepoRoot>/dist/project-docs.

.EXAMPLE
  pwsh project-docs/tools/Build-ProjectDocs.ps1 -Init
  pwsh project-docs/tools/Build-ProjectDocs.ps1
  pwsh project-docs/tools/Build-ProjectDocs.ps1 -ValidateOnly
#>
[CmdletBinding()]
param(
  [switch]$ValidateOnly,
  [switch]$Init,
  [string]$DocsRoot,
  [string]$DistDir
)

$ErrorActionPreference = 'Stop'
$ToolsDir = $PSScriptRoot

if ($DocsRoot) {
  if (-not (Test-Path $DocsRoot)) {
    New-Item -ItemType Directory -Force -Path $DocsRoot | Out-Null
  }
  $Root = (Resolve-Path $DocsRoot).Path
} else {
  $Root = Split-Path $ToolsDir -Parent
}

if ($DistDir) {
  $ResolvedDist = $DistDir
} else {
  $RepoRoot = Split-Path $Root -Parent
  $ResolvedDist = Join-Path $RepoRoot 'dist/project-docs'
}
$DistDir = $ResolvedDist
$ChangesDir = Join-Path $Root 'data/changes'
$Errors = @()

$Required = @('id','date','time','version','title','category','status','summary',
  'problem_before','solution','reason','files_affected','user_impact',
  'tech_impact','validation','risks','breaking_changes','migration_notes',
  'commits','next_steps','components','seq')

# UTF-8 with BOM ensures clean Unicode rendering across PowerShell 5.1, pwsh, and browsers
$Utf8Bom = New-Object Text.UTF8Encoding($true)
function Write-Text($path, $content) {
  [IO.File]::WriteAllText($path, $content, $Utf8Bom)
}
function Get-DateTime($e) { return "$($e.date) $($e.time)" }

function Fail($msg) { $script:Errors += $msg; Write-Host "  [ERR] $msg" -ForegroundColor Red }

# ---------- INIT ROUTINE ----------
if ($Init) {
  Write-Host "Initializing project-docs structure in: $Root" -ForegroundColor Cyan
  $dirs = @(
    'assets/css', 'assets/js', 'components', 'tools',
    'data/changes', 'data/architecture/history',
    'changes', 'releases'
  )
  foreach ($d in $dirs) {
    $p = Join-Path $Root $d
    if (-not (Test-Path $p)) { New-Item -ItemType Directory -Force -Path $p | Out-Null }
  }

  # Locate templates
  $tplSrc = Join-Path $Root 'templates'
  if (-not (Test-Path $tplSrc)) {
    $tplSrc = Join-Path (Split-Path $ToolsDir -Parent) 'templates'
  }

  if (Test-Path $tplSrc) {
    $scaffoldFiles = @{
      'data/project.json' = 'data/project.json'
      'data/releases.json' = 'data/releases.json'
      'data/architecture/current.json' = 'data/architecture/current.json'
      'index.html' = 'index.html'
      'changelog.html' = 'changelog.html'
      'architecture.html' = 'architecture.html'
      'changes/index.html' = 'changes/index.html'
      'releases/index.html' = 'releases/index.html'
    }
    foreach ($targetRel in $scaffoldFiles.Keys) {
      $dst = Join-Path $Root $targetRel
      $src = Join-Path $tplSrc $scaffoldFiles[$targetRel]
      if ((-not (Test-Path $dst)) -and (Test-Path $src)) {
        $parentDir = Split-Path $dst -Parent
        if (-not (Test-Path $parentDir)) { New-Item -ItemType Directory -Force -Path $parentDir | Out-Null }
        Copy-Item $src $dst -Force
        Write-Host "  + Scaffolded: $targetRel" -ForegroundColor Green
      }
    }

    $existingChanges = @(Get-ChildItem $ChangesDir -Filter '????-??-??-*.json' -File -ErrorAction SilentlyContinue)
    if ($existingChanges.Count -eq 0) {
      $srcChange = Join-Path $tplSrc 'data/changes/2026-01-01-initial-setup.json'
      if (Test-Path $srcChange) {
        Copy-Item $srcChange (Join-Path $ChangesDir '2026-01-01-initial-setup.json') -Force
        Write-Host "  + Scaffolded initial baseline change entry." -ForegroundColor Green
      }
    }

    # Ensure tool templates are present
    foreach ($tName in @('Change-Template.html', 'Release-Template.html')) {
      $dstTool = Join-Path $Root "tools/$tName"
      if (-not (Test-Path $dstTool)) {
        $srcTool = Join-Path $ToolsDir $tName
        if (Test-Path $srcTool) {
          Copy-Item $srcTool $dstTool -Force
          Write-Host "  + Scaffolded: tools/$tName" -ForegroundColor Green
        }
      }
    }

    # Copy assets and components if missing in target
    $skillRoot = Split-Path $ToolsDir -Parent
    if ($skillRoot -ne $Root) {
      foreach ($folder in @('assets', 'components')) {
        $dstFolder = Join-Path $Root $folder
        $srcFolder = Join-Path $skillRoot $folder
        if (Test-Path $srcFolder) {
          if (-not (Test-Path $dstFolder)) { New-Item -ItemType Directory -Force -Path $dstFolder | Out-Null }
          Copy-Item "$srcFolder\*" $dstFolder -Recurse -Force
          Write-Host "  + Copied starter $folder/" -ForegroundColor Green
        }
      }
    }
  } else {
    Fail "Templates directory not found (searched $tplSrc)."
  }
  Write-Host "Initialization finished. Continuing with build..." -ForegroundColor Cyan
}

# Pre-flight check
if (-not (Test-Path $ChangesDir)) {
  Fail "Changes directory not found: $ChangesDir. Run with -Init to initialize project documentation."
  Write-Host "GAGAL: $($Errors.Count) error." -ForegroundColor Red; exit 1
}
$projFile = Join-Path $Root 'data/project.json'
if (-not (Test-Path $projFile)) {
  Fail "Project configuration missing: $projFile. Run with -Init to scaffold default files."
  Write-Host "GAGAL: $($Errors.Count) error." -ForegroundColor Red; exit 1
}
$relFile = Join-Path $Root 'data/releases.json'
if (-not (Test-Path $relFile)) {
  Fail "Releases configuration missing: $relFile. Run with -Init to scaffold default files."
  Write-Host "GAGAL: $($Errors.Count) error." -ForegroundColor Red; exit 1
}

# ---------- 1. READ ENTRIES ----------
$files = @(Get-ChildItem $ChangesDir -Filter '????-??-??-*.json' -File |
  Where-Object { $_.Name -ne 'index.json' })
if ($files.Count -eq 0) { Fail 'No change entry JSON files found in data/changes/.' }
$entries = @()
foreach ($f in $files) {
  try { $e = Get-Content $f.FullName -Raw -Encoding UTF8 | ConvertFrom-Json }
  catch { Fail "Invalid JSON file: $($f.Name)"; continue }
  $entries += [pscustomobject]@{ File = $f; Data = $e }
}
Write-Host "1. Read entries: $($entries.Count) file(s)." -ForegroundColor Cyan

# ---------- 2. VALIDATION ----------
$ids = @{}
foreach ($it in $entries) {
  $e = $it.Data; $n = $it.File.Name
  foreach ($k in $Required) {
    if ($null -eq $e.$k) { Fail "$n : missing mandatory field: $k" }
  }
  $wantId = [IO.Path]::GetFileNameWithoutExtension($n)
  if ($e.id -ne $wantId) { Fail "$n : id '$($e.id)' does not match file name '$wantId'." }
  if ($e.date -notmatch '^\d{4}-\d{2}-\d{2}$') { Fail "$n : date must match YYYY-MM-DD format." }
  if ($e.time -notmatch '^\d{2}:\d{2}:\d{2}$') { Fail "$n : time must match HH:mm:ss format." }
  if ($ids.ContainsKey($e.id)) { Fail "Duplicate entry ID: $($e.id)" } else { $ids[$e.id] = 1 }
}
Write-Host '2. Validation: complete.' -ForegroundColor Cyan

# ---------- 3. SORTING (date asc, time asc, seq asc) ----------
$asc = @($entries | Sort-Object { $_.Data.date }, { $_.Data.time }, { [int]$_.Data.seq })
$desc = @($asc | Sort-Object { $_.Data.date }, { $_.Data.time }, { [int]$_.Data.seq } -Descending)
Write-Host '3. Sorted: date + time + seq.' -ForegroundColor Cyan

function Get-Slug($e) { return $e.id.Substring(11) }
function Get-Url($e) {
  $y, $m = $e.date.Split('-')[0, 1]
  return "changes/$y/$m/$(Get-Slug $e).html"
}
function Get-Search($e) {
  return (@($e.title, $e.summary, ($e.files_affected -join ' '),
    ($e.components -join ' '), ($e.commits -join ' ')) -join ' ')
}

# ---------- 4. UPDATE INDEX.JSON ----------
$idx = [ordered]@{ generated = (Get-Date -Format 'yyyy-MM-dd'); total = $desc.Count; changes = @() }
foreach ($it in $desc) {
  $e = $it.Data
  $idx.changes += [ordered]@{ id = $e.id; date = $e.date; datetime = (Get-DateTime $e); version = $e.version;
    title = $e.title; category = $e.category; status = $e.status;
    components = @($e.components); url = (Get-Url $e); summary = $e.summary }
}
$idxJson = ($idx | ConvertTo-Json -Depth 6 -Compress)
if ($PSVersionTable.PSVersion.Major -ge 6) {
  $idxJson = ($idx | ConvertTo-Json -Depth 6)
}
Write-Text (Join-Path $ChangesDir 'index.json') $idxJson
Write-Host '4. index.json updated.' -ForegroundColor Cyan

# Project identity
$proj = Get-Content $projFile -Raw -Encoding UTF8 | ConvertFrom-Json
$brand = if ($proj.brand) { [string]$proj.brand } else { [string]$proj.name }

function Set-Block($file, $name, $inner) {
  if (-not (Test-Path $file)) { Fail "$file : file not found for GEN block: $name"; return }
  $t = Get-Content $file -Raw -Encoding UTF8
  $pat = "(?s)<!-- GEN:$name -->.*?<!-- /GEN:$name -->"
  $rep = "<!-- GEN:$name -->$inner<!-- /GEN:$name -->"
  if ($t -notmatch "<!-- GEN:$name -->") { Fail "$file : marker GEN:$name not found."; return }
  Write-Text $file ($t -replace $pat, $rep)
}

function New-Card($e, $prefix) {
  if ($prefix -eq '@SELF@') {
    $y, $m = $e.date.Split('-')[0, 1]
    $url = "$y/$m/$(Get-Slug $e).html"
  } else { $url = $prefix + (Get-Url $e) }
  $y = $e.date.Split('-')[0]
  $comp = ($e.components -join ' ')
  $s = (Get-Search $e) -replace '"', ''
  return '<article class="card reveal" data-year="' + $y + '" data-version="' +
    $e.version + '" data-category="' + $e.category + '" data-status="' + $e.status +
    '" data-components="' + $comp + '" data-search="' + $s + '"><h3><a href="' +
    $url + '">' + $e.title + '</a></h3><div class="meta"><span class="badge">' +
    (Get-DateTime $e) + '</span><span class="badge cat-' + $e.category + '">' + $e.category +
    '</span><span class="badge status-' + $e.status + '">' + $e.status +
    '</span><span class="badge">' + $e.version +
    '</span></div><p>' + $e.summary + '</p></article>'
}

if (-not $ValidateOnly) {
  # ---------- 5. DETAIL PAGES (CHANGE ENTRIES) ----------
  $tpl = $null
  foreach ($cand in @((Join-Path $ToolsDir 'Change-Template.html'), (Join-Path $Root 'tools/Change-Template.html'))) {
    if (Test-Path $cand) { $tpl = Get-Content $cand -Raw -Encoding UTF8; break }
  }
  foreach ($it in $asc) {
    $e = $it.Data
    $y, $m = $e.date.Split('-')[0, 1]
    $dir = Join-Path $Root ("changes/$y/$m")
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    $page = Join-Path $dir ((Get-Slug $e) + '.html')
    if (Test-Path $page) {
      $html = Get-Content $page -Raw -Encoding UTF8
      if ($html -notmatch [regex]::Escape($e.id)) { Fail "$page : does not contain entry id $($e.id)." }
    } elseif ($tpl) {
      $valStr = ""
      if ($e.validation -is [PSCustomObject] -or $e.validation -is [System.Collections.IDictionary]) {
        $vParts = @()
        if ($e.validation.build) { $vParts += "build: $($e.validation.build)" }
        if ($e.validation.test) { $vParts += "test: $($e.validation.test)" }
        if ($e.validation.lint) { $vParts += "lint: $($e.validation.lint)" }
        $valStr = ($vParts -join ' / ')
      } else {
        $valStr = [string]$e.validation
      }

      $h = $tpl.Replace('__TITLE__', $e.title).Replace('__DATE__', (Get-DateTime $e))
      $h = $h.Replace('__CATEGORY__', $e.category).Replace('__STATUS__', $e.status)
      $h = $h.Replace('__VERSION__', $e.version).Replace('__ID__', $e.id)
      $h = $h.Replace('__SUMMARY__', $e.summary).Replace('__PROBLEM__', $e.problem_before)
      $h = $h.Replace('__SOLUTION__', $e.solution).Replace('__REASON__', $e.reason)
      $h = $h.Replace('__USER_IMPACT__', $e.user_impact).Replace('__TECH_IMPACT__', $e.tech_impact)
      $h = $h.Replace('__MIGRATION__', $e.migration_notes)
      $h = $h.Replace('__COMMITS__', ($e.commits -join ', '))
      $h = $h.Replace('__FILES__', (($e.files_affected | ForEach-Object { '<li><code>' + $_ + '</code></li>' }) -join ''))
      $h = $h.Replace('__RISKS__', (($e.risks | ForEach-Object { '<li>' + $_ + '</li>' }) -join ''))
      $h = $h.Replace('__BREAKING__', ((@($e.breaking_changes) | ForEach-Object { '<li>' + $_ + '</li>' }) -join ''))
      $h = $h.Replace('__NEXT__', (($e.next_steps | ForEach-Object { '<li>' + $_ + '</li>' }) -join ''))
      $h = $h.Replace('__VALIDATION__', $valStr)
      $h = $h.Replace('__BRAND__', $brand)
      Write-Text $page $h
      Write-Host "  + $page" -ForegroundColor Green
    } else { Fail "Change template not found and page does not exist: $($e.id)" }
  }
  Write-Host '5. Detail pages: complete.' -ForegroundColor Cyan

  # ---------- 5b. RELEASE DETAIL PAGES ----------
  $rel = Get-Content $relFile -Raw -Encoding UTF8 | ConvertFrom-Json
  $relTpl = $null
  foreach ($cand in @((Join-Path $ToolsDir 'Release-Template.html'), (Join-Path $Root 'tools/Release-Template.html'))) {
    if (Test-Path $cand) { $relTpl = Get-Content $cand -Raw -Encoding UTF8; break }
  }
  if ($relTpl -and $rel.releases) {
    $relDir = Join-Path $Root 'releases'
    if (-not (Test-Path $relDir)) { New-Item -ItemType Directory -Force -Path $relDir | Out-Null }
    foreach ($r in $rel.releases) {
      $rPage = Join-Path $relDir ($r.version + '.html')
      if (-not (Test-Path $rPage)) {
        $rChanges = ""
        if ($r.changes) {
          $cItems = foreach ($cid in $r.changes) {
            $matchEntry = $asc | Where-Object { $_.Data.id -eq $cid } | Select-Object -First 1
            if ($matchEntry) {
              '<li><a href="../' + (Get-Url $matchEntry.Data) + '">' + $matchEntry.Data.title + '</a> (' + $matchEntry.Data.category + ')</li>'
            } else {
              '<li><code>' + $cid + '</code></li>'
            }
          }
          $rChanges = ($cItems -join '')
        }
        $rStatus = if ($r.status) { [string]$r.status } else { 'released' }
        $rh = $relTpl.Replace('__VERSION__', $r.version)
        $rh = $rh.Replace('__DATE__', [string]$r.date)
        $rh = $rh.Replace('__STATUS__', $rStatus)
        $rh = $rh.Replace('__NOTES__', [string]$r.notes)
        $rh = $rh.Replace('__CHANGES__', $rChanges)
        $rh = $rh.Replace('__BRAND__', $brand)
        Write-Text $rPage $rh
        Write-Host "  + $rPage" -ForegroundColor Green
      }
    }
  }
  Write-Host '5b. Release pages: complete.' -ForegroundColor Cyan

  # ---------- 6. UPDATE DATA-DRIVEN BLOCKS ----------
  $latest = foreach ($it in ($desc | Select-Object -First 3)) { New-Card $it.Data '' }
  Set-Block (Join-Path $Root 'index.html') 'LATEST' ($latest -join '')
  $timeline = foreach ($it in $asc) {
    $e = $it.Data
    '<li><span class="t-date">' + (Get-DateTime $e) + '</span> — <a href="' + (Get-Url $e) +
    '">' + $e.title + '</a> (' + $e.category + ', ' + $e.version + ')</li>'
  }
  Set-Block (Join-Path $Root 'index.html') 'TIMELINE' ($timeline -join '')
  $cur = $rel.releases | Where-Object { $_.version -eq $rel.latest } | Select-Object -First 1
  if ($cur) {
    Set-Block (Join-Path $Root 'index.html') 'RELEASE' ('<div class="card"><h3><a href="releases/' +
      $cur.version + '.html">' + $cur.version + '</a> — ' + $cur.date + '</h3><p>' +
      $cur.notes + '</p></div>')
  }
  $cats = $desc | Group-Object { $_.Data.category } | Sort-Object Name
  $rows = foreach ($g in $cats) { '<tr><td>' + $g.Name + '</td><td>' + $g.Count + '</td></tr>' }
  Set-Block (Join-Path $Root 'index.html') 'STATS' ('<table><thead><tr><th>Category</th><th>Count</th></tr></thead><tbody>' +
    ($rows -join '') + '</tbody></table><p>Total: ' + $desc.Count + ' change(s).</p>')
  $cl = foreach ($it in $desc) { New-Card $it.Data '' }
  Set-Block (Join-Path $Root 'changelog.html') 'CHANGELOG-LIST' ($cl -join '')
  $ci = foreach ($it in $desc) { New-Card $it.Data '@SELF@' }
  Set-Block (Join-Path $Root 'changes/index.html') 'CHANGES-LIST' ($ci -join '')
  $rl = foreach ($r in $rel.releases) {
    '<article class="card reveal"><h3><a href="' + $r.version + '.html">' + $r.version +
    '</a> — ' + $r.date + '</h3><p>' + $r.notes + '</p></article>'
  }
  Set-Block (Join-Path $Root 'releases/index.html') 'RELEASES-LIST' ('<div class="grid">' + ($rl -join '') + '</div>')

  # ---------- 6c. FILTER TAXONOMY & ARCHITECTURE ----------
  function New-Opts($vals) {
    return (($vals | ForEach-Object { '<option value="' + $_ + '">' + $_ + '</option>' }) -join '')
  }
  $optYear = New-Opts @(($desc | ForEach-Object { $_.Data.date.Split('-')[0] } | Sort-Object -Unique))
  $optVer = New-Opts @(($desc | ForEach-Object { [string]$_.Data.version } | Sort-Object -Unique))
  $optCat = New-Opts @(($desc | ForEach-Object { [string]$_.Data.category } | Sort-Object -Unique))
  $optSt = New-Opts @(($desc | ForEach-Object { [string]$_.Data.status } | Sort-Object -Unique))
  $optComp = New-Opts @(($desc | ForEach-Object { @($_.Data.components) } | Sort-Object -Unique))
  foreach ($lf in @((Join-Path $Root 'changelog.html'), (Join-Path $Root 'changes/index.html'))) {
    if (Test-Path $lf) {
      Set-Block $lf 'OPT-YEAR' $optYear
      Set-Block $lf 'OPT-VERSION' $optVer
      Set-Block $lf 'OPT-CATEGORY' $optCat
      Set-Block $lf 'OPT-STATUS' $optSt
      Set-Block $lf 'OPT-COMPONENT' $optComp
    }
  }
  $archFile = Join-Path $Root 'data/architecture/current.json'
  if (Test-Path $archFile) {
    $arch = Get-Content $archFile -Raw -Encoding UTF8 | ConvertFrom-Json
    $arows = foreach ($c in $arch.components) { '<tr><td><code>' + $c.name + '</code></td><td>' + $c.role + '</td></tr>' }
    $extBin = if ($arch.external_binaries) { ($arch.external_binaries -join ', ') } else { 'None' }
    Set-Block (Join-Path $Root 'architecture.html') 'ARCH' ('<table><thead><tr><th>Component</th><th>Role</th></tr></thead><tbody>' +
      ($arows -join '') + '</tbody></table><p>External binaries: ' + $extBin + '.</p>')
  }
  Set-Block (Join-Path $Root 'index.html') 'PROJECT' ('<p>' + $proj.description +
    ' Documented release: <strong>' + $rel.latest + '</strong>.</p>')
  $homef = Join-Path $Root 'index.html'
  if (Test-Path $homef) {
    $ht = Get-Content $homef -Raw -Encoding UTF8
    $hu = $ht -replace '(<main id="main"><div class="wrap"><h1>)[^<]*(</h1>)', ('$1' + $proj.name + '$2')
    if ($hu -ne $ht) { Write-Text $homef $hu }
  }
  Write-Host '6c. Filters and architecture blocks rendered.' -ForegroundColor Cyan

  # ---------- 6b. INJECT BRAND IDENTITY ----------
  foreach ($pg in (Get-ChildItem $Root -Filter '*.html' -Recurse -File |
    Where-Object { $_.FullName -notmatch '[\\/]((components)|(tools)|(templates))[\\/]' })) {
    $t = Get-Content $pg.FullName -Raw -Encoding UTF8
    $u = $t -replace '__BRAND__', $brand
    $u = $u -replace '<span class="brand-name">[^<]*</span>', ('<span class="brand-name">' + $brand + '</span>')
    $u = $u -replace '(<title>[^<]+?)\s*[\-—·|]\s*[^<]+(</title>)', ('$1 — ' + $brand + '$2')
    $u = [regex]::Replace($u, '(<footer[\s\S]*?<p>)[^<\-—·]+?(\s*[\-—·]\s*)', '$1' + $brand + '$2')
    if ($u -ne $t) { Write-Text $pg.FullName $u }
  }
  Write-Host "6b. Brand identity injected: $brand." -ForegroundColor Cyan
  Write-Host '6. All GEN blocks updated.' -ForegroundColor Cyan

  # ---------- 8. PRODUCTION DISTRIBUTION BUILD ----------
  if (Test-Path $DistDir) { Remove-Item $DistDir -Recurse -Force }
  New-Item -ItemType Directory -Force -Path $DistDir | Out-Null
  foreach ($item in Get-ChildItem $Root) {
    if ($item.Name -in @('tools', 'components', 'templates')) { continue }
    Copy-Item $item.FullName (Join-Path $DistDir $item.Name) -Recurse -Force
  }
  Write-Host "8. Production build assembled in: $DistDir" -ForegroundColor Cyan
}

# ---------- 7. INTERNAL LINK INTEGRITY VERIFICATION ----------
$broken = @()
$roots = @($Root); if ((Test-Path $DistDir) -and (-not $ValidateOnly)) { $roots += $DistDir }
foreach ($base in $roots) {
  foreach ($html in (Get-ChildItem $base -Filter '*.html' -Recurse -File |
    Where-Object { $_.FullName -notmatch '[\\/]((components)|(tools)|(templates))[\\/]' })) {
    $t = Get-Content $html.FullName -Raw -Encoding UTF8
    foreach ($mm in ([regex]::Matches($t, '(?:href|src)="([^"#]+?)"'))) {
      $u = $mm.Groups[1].Value
      if ($u -match '^(https?:|mailto:|data:)') { continue }
      if ($u -eq '') { continue }
      $cleanUrl = ($u -split '\?')[0]
      $target = Join-Path $html.DirectoryName ($cleanUrl -replace '/', [IO.Path]::DirectorySeparatorChar)
      if (-not (Test-Path $target)) { $broken += "$($html.FullName) -> $u" }
    }
  }
}
foreach ($b in $broken) { Fail "Broken internal link: $b" }
Write-Host "7. Link check: $($broken.Count) broken link(s)." -ForegroundColor Cyan

if ($Errors.Count -gt 0) { Write-Host "GAGAL: $($Errors.Count) error(s) encountered." -ForegroundColor Red; exit 1 }
Write-Host 'OK: Validation and build completed successfully.' -ForegroundColor Green
