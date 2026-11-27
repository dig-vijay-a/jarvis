param(
  [Parameter(Mandatory=$true)][string]$ImagePath
)
$ErrorActionPreference = 'Stop'
$t0 = Get-Date
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType=WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType=WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine, Windows.Media.Ocr, ContentType=WindowsRuntime]
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
})[0]

function Await-WinRT($op, $type) {
  $m = $asTaskGeneric.MakeGenericMethod($type)
  $t = $m.Invoke($null, @($op))
  $t.Wait()
  return $t.Result
}

$absPath = (Resolve-Path $ImagePath).Path
$file = Await-WinRT ([Windows.Storage.StorageFile]::GetFileFromPathAsync($absPath)) ([Windows.Storage.StorageFile])
$stream = Await-WinRT ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
try {
  $decoder = Await-WinRT ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $bitmap = Await-WinRT ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
  $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
  if (-not $engine) {
    $lang = New-Object Windows.Globalization.Language('en-US')
    $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($lang)
  }
  $ocrRes = Await-WinRT ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
  $lines = @()
  foreach ($line in $ocrRes.Lines) {
    $words = @($line.Words)
    $minX = 999999; $minY = 999999; $maxR = 0; $maxB = 0
    foreach ($w in $words) {
      $r = $w.BoundingRect
      if ($r.X -lt $minX) { $minX = [int][Math]::Floor($r.X) }
      if ($r.Y -lt $minY) { $minY = [int][Math]::Floor($r.Y) }
      if (($r.X + $r.Width) -gt $maxR) { $maxR = [int][Math]::Ceiling($r.X + $r.Width) }
      if (($r.Y + $r.Height) -gt $maxB) { $maxB = [int][Math]::Ceiling($r.Y + $r.Height) }
    }
    if ($words.Count -eq 0) { $minX = 0; $minY = 0 }
    $lines += [PSCustomObject]@{
      text = $line.Text
      x = $minX
      y = $minY
      width = [Math]::Max(0, $maxR - $minX)
      height = [Math]::Max(0, $maxB - $minY)
    }
  }
  $elapsed = [int][Math]::Round(((Get-Date) - $t0).TotalMilliseconds)
  $out = [PSCustomObject]@{
    ok = $true
    engine = 'windows_winrt_ocr'
    language = $engine.RecognizerLanguage.LanguageTag
    duration_ms = $elapsed
    full_text = $ocrRes.Text
    line_count = $lines.Count
    lines = $lines
  }
  $out | ConvertTo-Json -Depth 4 -Compress
} finally {
  $stream.Dispose()
}
