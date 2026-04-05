param(
    [Parameter(Mandatory = $true)]
    [string]$TextFilePath,

    [Parameter(Mandatory = $true)]
    [string]$HtmlFilePath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Windows.Forms

$plainText = [System.IO.File]::ReadAllText($TextFilePath, [System.Text.Encoding]::UTF8)
$html = [System.IO.File]::ReadAllText($HtmlFilePath, [System.Text.Encoding]::UTF8)

function Convert-ToHtmlClipboardFormat {
    param(
        [Parameter(Mandatory = $true)]
        [string]$HtmlFragment
    )

    $startFragmentComment = "<!--StartFragment-->"
    $endFragmentComment = "<!--EndFragment-->"

    if (-not $HtmlFragment.Contains($startFragmentComment) -or -not $HtmlFragment.Contains($endFragmentComment)) {
        throw "HTML fragment markers were not found."
    }

    $header = "Version:1.0`r`n" +
        "StartHTML:0000000000`r`n" +
        "EndHTML:0000000000`r`n" +
        "StartFragment:0000000000`r`n" +
        "EndFragment:0000000000`r`n`r`n"

    $utf8 = [System.Text.Encoding]::UTF8
    $startHtml = $utf8.GetByteCount($header)
    $prefix = $HtmlFragment.Substring(0, $HtmlFragment.IndexOf($startFragmentComment) + $startFragmentComment.Length)
    $fragmentBody = $HtmlFragment.Substring(0, $HtmlFragment.IndexOf($endFragmentComment))
    $startFragment = $startHtml + $utf8.GetByteCount($prefix)
    $endFragment = $startHtml + $utf8.GetByteCount($fragmentBody)
    $endHtml = $startHtml + $utf8.GetByteCount($HtmlFragment)

    $finalHeader = "Version:1.0`r`n" +
        ("StartHTML:{0:D10}`r`n" -f $startHtml) +
        ("EndHTML:{0:D10}`r`n" -f $endHtml) +
        ("StartFragment:{0:D10}`r`n" -f $startFragment) +
        ("EndFragment:{0:D10}`r`n`r`n" -f $endFragment)

    return $finalHeader + $HtmlFragment
}

$dataObject = [System.Windows.Forms.DataObject]::new()
$dataObject.SetData([System.Windows.Forms.DataFormats]::UnicodeText, $plainText)
$dataObject.SetData([System.Windows.Forms.DataFormats]::Text, $plainText)
$dataObject.SetData([System.Windows.Forms.DataFormats]::Html, (Convert-ToHtmlClipboardFormat -HtmlFragment $html))
[System.Windows.Forms.Clipboard]::SetDataObject($dataObject, $true)
