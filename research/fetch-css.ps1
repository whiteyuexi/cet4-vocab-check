$ErrorActionPreference = "Continue"
$dir = "$env:TEMP\design\sites"
$ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"

foreach ($f in (Get-ChildItem $dir -Filter *.html)) {
  $html = Get-Content $f.FullName -Raw -Encoding UTF8
  $links = [regex]::Matches($html, '<link[^>]+stylesheet[^>]*>') | ForEach-Object { $_.Value }
  $hrefs = @()
  foreach ($l in $links) {
    $m = [regex]::Match($l, 'href="([^"]+)"')
    if (-not $m.Success) { $m = [regex]::Match($l, "href='([^']+)'") }
    if ($m.Success) { $hrefs += $m.Groups[1].Value }
  }
  $n = 0
  foreach ($h in $hrefs) {
    if ($n -ge 2) { break }
    if ($h -notmatch '^(http|//|/)') { continue }
    $url = $h
    if ($h.StartsWith('//')) { $url = 'https:' + $h }
    $target = Join-Path $dir ($f.BaseName + '_' + $n + '.css')
    curl.exe -s -L -m 25 -A $ua -o $target $url 2>&1 | Out-Null
    if (Test-Path $target) {
      $sz = [math]::Round((Get-Item $target).Length / 1KB, 0)
      if ($sz -gt 3) {
        Write-Output ("{0,-16} -> {1,5} KB  {2}" -f $f.BaseName, $sz, $url.Substring(0, [Math]::Min(55, $url.Length)))
        $n++
      } else { Remove-Item $target -Force }
    }
  }
  if ($n -eq 0) { Write-Output ("{0,-16} -> 未找到外链样式表" -f $f.BaseName) }
}
