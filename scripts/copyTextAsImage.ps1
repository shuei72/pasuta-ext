param(
    [Parameter(Mandatory = $true)]
    [string]$JsonFilePath,

    [Parameter(Mandatory = $true)]
    [string]$FontFamily,

    [Parameter(Mandatory = $true)]
    [double]$FontSize,

    [Parameter(Mandatory = $true)]
    [double]$LineHeight
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName PresentationFramework
Add-Type -AssemblyName WindowsBase

$payload = [System.IO.File]::ReadAllText($JsonFilePath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
$lines = @($payload.lines)

$paddingX = 5.0
$paddingY = 5.0
$pixelsPerDip = 1.0
$backgroundColor = [System.Windows.Media.ColorConverter]::ConvertFromString($payload.backgroundColor)
$background = [System.Windows.Media.SolidColorBrush]::new($backgroundColor)
$typeface = [System.Windows.Media.Typeface]::new($FontFamily)
$culture = [System.Globalization.CultureInfo]::InvariantCulture
$flowDirection = [System.Windows.FlowDirection]::LeftToRight

$maxWidth = 0.0
$renderedLines = @()

foreach ($line in $lines) {
    $segments = @($line)
    $lineWidth = 0.0
    $renderedSegments = @()

    foreach ($segment in $segments) {
        $text = [string]$segment.text
        $foregroundColor = if ($segment.color) {
            [System.Windows.Media.ColorConverter]::ConvertFromString([string]$segment.color)
        }
        else {
            [System.Windows.Media.ColorConverter]::ConvertFromString([string]$payload.foregroundColor)
        }

        $foreground = [System.Windows.Media.SolidColorBrush]::new($foregroundColor)
        $formatted = [System.Windows.Media.FormattedText]::new(
            $text,
            $culture,
            $flowDirection,
            $typeface,
            $FontSize,
            $foreground,
            $pixelsPerDip
        )

        $renderedSegments += [pscustomobject]@{
            FormattedText = $formatted
            X = $lineWidth
        }
        $lineWidth += $formatted.WidthIncludingTrailingWhitespace
    }

    if ($lineWidth -gt $maxWidth) {
        $maxWidth = $lineWidth
    }

    $renderedLines += ,@($renderedSegments)
}

$width = [Math]::Ceiling($maxWidth + ($paddingX * 2))
$height = [Math]::Ceiling(($renderedLines.Count * $LineHeight) + ($paddingY * 2))

if ($width -lt 1) {
    $width = 1
}

if ($height -lt 1) {
    $height = 1
}

$visual = [System.Windows.Media.DrawingVisual]::new()
$context = $visual.RenderOpen()
$context.DrawRectangle($background, $null, [System.Windows.Rect]::new(0, 0, $width, $height))

for ($index = 0; $index -lt $renderedLines.Count; $index += 1) {
    foreach ($segment in $renderedLines[$index]) {
        $point = [System.Windows.Point]::new($paddingX + $segment.X, $paddingY + ($index * $LineHeight))
        $context.DrawText($segment.FormattedText, $point)
    }
}

$context.Close()

$bitmap = [System.Windows.Media.Imaging.RenderTargetBitmap]::new(
    [int]$width,
    [int]$height,
    96.0,
    96.0,
    [System.Windows.Media.PixelFormats]::Pbgra32
)
$bitmap.Render($visual)
[System.Windows.Clipboard]::SetImage($bitmap)
