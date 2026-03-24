param(
  [string]$SourceHtml = "",
  [string]$OutputJs = ".\course-data.js"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-SourcePath {
  param([string]$InputPath)

  if ($InputPath -and (Test-Path $InputPath)) {
    return (Resolve-Path $InputPath).Path
  }

  $workspacePath = Join-Path $PSScriptRoot "..\messages.html"
  if (Test-Path $workspacePath) {
    return (Resolve-Path $workspacePath).Path
  }

  $fallbackPath = "C:\Users\amir-\Downloads\Telegram Desktop\ChatExport_2026-03-24 (1)\messages.html"
  if (Test-Path $fallbackPath) {
    return $fallbackPath
  }

  throw "messages.html not found. Pass -SourceHtml with an explicit path."
}

function Clean-HtmlText {
  param([string]$HtmlFragment)

  if ([string]::IsNullOrWhiteSpace($HtmlFragment)) {
    return ""
  }

  $text = [regex]::Replace($HtmlFragment, "<br\s*/?>", "`n", [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
  $text = [regex]::Replace($text, "<[^>]+>", "")
  $text = [System.Net.WebUtility]::HtmlDecode($text)
  return $text.Trim()
}

function First-Line {
  param([string]$Text)

  if ([string]::IsNullOrWhiteSpace($Text)) {
    return ""
  }

  $lines = @($Text -split "`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ })
  if ($lines.Count -eq 0) {
    return ""
  }

  return [string]$lines[0]
}

function Make-Excerpt {
  param(
    [string]$Text,
    [int]$MaxLength = 180
  )

  if ([string]::IsNullOrWhiteSpace($Text)) {
    return ""
  }

  $flat = ($Text -replace "\\s+", " ").Trim()
  if ($flat.Length -le $MaxLength) {
    return $flat
  }

  return $flat.Substring(0, $MaxLength) + "…"
}

function Get-SectionForMessage {
  param(
    [int]$MessageId,
    [array]$Sections
  )

  return $Sections | Where-Object { $MessageId -ge $_.start -and $MessageId -le $_.end } | Select-Object -First 1
}

function Build-Title {
  param([pscustomobject]$Post)

  $firstLine = First-Line -Text $Post.content
  if ($firstLine) {
    return $firstLine
  }

  if ($Post.videoFiles.Count -gt 0 -and $Post.photoFiles.Count -gt 0) {
    return "Видео и фото"
  }

  if ($Post.videoFiles.Count -gt 0) {
    return "Видео"
  }

  if ($Post.photoFiles.Count -gt 1) {
    return "Группа фото"
  }

  if ($Post.photoFiles.Count -eq 1) {
    return "Фото"
  }

  if ($Post.stickerFiles.Count -gt 0) {
    return "Стикер"
  }

  if ($Post.links.Count -gt 0) {
    return "Ссылки"
  }

  return "Сообщение $($Post.messageId)"
}

function Build-Type {
  param([pscustomobject]$Post)

  $hasVideo = $Post.videoFiles.Count -gt 0
  $hasPhoto = $Post.photoFiles.Count -gt 0
  $hasText = -not [string]::IsNullOrWhiteSpace($Post.content)

  if ($hasVideo -and $hasPhoto) { return "mixed" }
  if ($hasVideo) { return "video" }
  if ($hasPhoto) { return "photo" }
  if ($Post.stickerFiles.Count -gt 0) { return "sticker" }
  if ($hasText) { return "text" }

  return "other"
}

function Normalize-Post {
  param([pscustomobject]$Post)

  $Post.videoFiles = @($Post.videoFiles | Select-Object -Unique)
  $Post.photoFiles = @($Post.photoFiles | Select-Object -Unique)
  $Post.stickerFiles = @($Post.stickerFiles | Select-Object -Unique)
  $Post.links = @($Post.links | Select-Object -Unique)
  $Post.messageIds = @($Post.messageIds | Select-Object -Unique)

  $Post.title = Build-Title -Post $Post
  $Post.type = Build-Type -Post $Post
  $Post.excerpt = Make-Excerpt -Text $Post.content

  return $Post
}

$sections = @(
  [PSCustomObject]@{ id = "start"; title = "Старт"; subtitle = "Введение"; start = 7; end = 9 },
  [PSCustomObject]@{ id = "block-1"; title = "Блок 1"; subtitle = "Визуал профиля"; start = 10; end = 28 },
  [PSCustomObject]@{ id = "block-2"; title = "Блок 2"; subtitle = "Фотофон и реквизит"; start = 29; end = 39 },
  [PSCustomObject]@{ id = "block-3"; title = "Блок 3"; subtitle = "Позы рук"; start = 40; end = 62 },
  [PSCustomObject]@{ id = "block-4"; title = "Блок 4"; subtitle = "Камера"; start = 63; end = 75 },
  [PSCustomObject]@{ id = "block-5"; title = "Блок 5"; subtitle = "Обработка и ретушь"; start = 76; end = 91 },
  [PSCustomObject]@{ id = "block-6"; title = "Блок 6"; subtitle = "Свет"; start = 92; end = 93 },
  [PSCustomObject]@{ id = "block-7"; title = "Блок 7"; subtitle = "Практика"; start = 94; end = 153 },
  [PSCustomObject]@{ id = "bonus"; title = "Бонус"; subtitle = "Дополнительные материалы"; start = 154; end = 159 },
  [PSCustomObject]@{ id = "final"; title = "Завершение"; subtitle = "Финал курса"; start = 160; end = 163 }
)

$sourcePath = Resolve-SourcePath -InputPath $SourceHtml
$resolvedOutput = if ([System.IO.Path]::IsPathRooted($OutputJs)) { $OutputJs } else { Join-Path (Get-Location) $OutputJs }

$html = Get-Content -Raw -Encoding UTF8 $sourcePath
$messagePattern = '<div class="message default clearfix(?<joined> joined)?" id="message(?<id>\d+)">'
$messageMatches = [regex]::Matches($html, $messagePattern)

$messages = @()
for ($i = 0; $i -lt $messageMatches.Count; $i++) {
  $startIndex = $messageMatches[$i].Index
  $endIndex = if ($i -lt ($messageMatches.Count - 1)) { $messageMatches[$i + 1].Index } else { $html.Length }
  if ($endIndex -le $startIndex) { continue }

  $chunk = $html.Substring($startIndex, $endIndex - $startIndex)
  $id = [int]$messageMatches[$i].Groups["id"].Value

  if ($id -eq 163) {
    continue
  }

  $fromMatch = [regex]::Match($chunk, '<div class="from_name">([\s\S]*?)</div>')
  $fromName = if ($fromMatch.Success) { Clean-HtmlText -HtmlFragment $fromMatch.Groups[1].Value } else { "" }

  $timeMatch = [regex]::Match($chunk, '<div class="pull_right date details"[^>]*>\s*([^<]+)\s*</div>')
  $timeLabel = if ($timeMatch.Success) { [System.Net.WebUtility]::HtmlDecode($timeMatch.Groups[1].Value).Trim() } else { "" }

  $textMatch = [regex]::Match($chunk, '<div class="text">([\s\S]*?)</div>')
  $content = if ($textMatch.Success) { Clean-HtmlText -HtmlFragment $textMatch.Groups[1].Value } else { "" }

  $videoFiles = @([regex]::Matches($chunk, 'href="(video_files/[^"]+)"') | ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique)
  $photoFiles = @([regex]::Matches($chunk, 'href="(photos/[^"]+\.(?:jpg|jpeg|png|webp))"') | ForEach-Object { $_.Groups[1].Value } | Where-Object { $_ -notmatch "_thumb\." } | Select-Object -Unique)
  $stickerFiles = @([regex]::Matches($chunk, 'href="(stickers/[^"]+\.(?:webp|jpg|jpeg|png|gif))"') | ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique)
  $links = @([regex]::Matches($chunk, 'href="(https?://[^"]+)"') | ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique)

  $hasText = -not [string]::IsNullOrWhiteSpace($content)
  $hasMedia = ($videoFiles.Count -gt 0) -or ($photoFiles.Count -gt 0) -or ($stickerFiles.Count -gt 0)
  $hasLinks = $links.Count -gt 0

  if (-not ($hasText -or $hasMedia -or $hasLinks)) {
    continue
  }

  $messages += [PSCustomObject]@{
    id = $id
    joined = $messageMatches[$i].Groups["joined"].Success
    fromName = $fromName
    timeLabel = $timeLabel
    content = $content
    videoFiles = $videoFiles
    photoFiles = $photoFiles
    stickerFiles = $stickerFiles
    links = $links
    hasText = $hasText
    hasMedia = $hasMedia
  }
}

$posts = @()
$order = 1
$active = $null

foreach ($message in $messages) {
  $section = Get-SectionForMessage -MessageId $message.id -Sections $sections
  if (-not $section) {
    continue
  }

  if (-not $active) {
    $active = [PSCustomObject]@{
      id = "lesson-$($message.id)"
      messageId = $message.id
      messageIds = @($message.id)
      sectionId = $section.id
      order = $order
      title = ""
      excerpt = ""
      content = $message.content
      timeLabel = $message.timeLabel
      type = ""
      videoFiles = @($message.videoFiles)
      photoFiles = @($message.photoFiles)
      stickerFiles = @($message.stickerFiles)
      links = @($message.links)
      joined = $message.joined
      fromName = if ($message.fromName) { $message.fromName } else { "КУРС" }
    }
    continue
  }

  $canMergeJoinedMedia =
    $message.joined -and
    (-not $message.hasText) -and
    $message.hasMedia -and
    ($active.sectionId -eq $section.id)

  if ($canMergeJoinedMedia) {
    $active.messageIds += $message.id
    $active.videoFiles += $message.videoFiles
    $active.photoFiles += $message.photoFiles
    $active.stickerFiles += $message.stickerFiles
    $active.links += $message.links
    if ($message.timeLabel) {
      $active.timeLabel = $message.timeLabel
    }
    continue
  }

  $posts += Normalize-Post -Post $active
  $order++

  $active = [PSCustomObject]@{
    id = "lesson-$($message.id)"
    messageId = $message.id
    messageIds = @($message.id)
    sectionId = $section.id
    order = $order
    title = ""
    excerpt = ""
    content = $message.content
    timeLabel = $message.timeLabel
    type = ""
    videoFiles = @($message.videoFiles)
    photoFiles = @($message.photoFiles)
    stickerFiles = @($message.stickerFiles)
    links = @($message.links)
    joined = $message.joined
    fromName = if ($message.fromName) { $message.fromName } else { "КУРС" }
  }
}

if ($active) {
  $posts += Normalize-Post -Post $active
}

$author = ""
if ($messages.Count -gt 0 -and ($messages[0].PSObject.Properties.Name -contains "fromName")) {
  $author = [string]$messages[0].fromName
}
if ([string]::IsNullOrWhiteSpace($author)) {
  $author = "КУРС «Pro Фото на 💵»"
}

$data = [PSCustomObject]@{
  course = [PSCustomObject]@{
    title = "Pro Photo"
    subtitle = "Курс в формате Telegram-ленты"
    author = $author
  }
  sections = $sections | ForEach-Object {
    [PSCustomObject]@{
      id = $_.id
      title = $_.title
      subtitle = $_.subtitle
    }
  }
  lessons = $posts
}

$json = $data | ConvertTo-Json -Depth 10
$output = "window.COURSE_DATA = $json;"
Set-Content -Path $resolvedOutput -Encoding UTF8 -Value $output

$videoCount = @($posts | ForEach-Object { $_.videoFiles } | Where-Object { $_ } | Select-Object -Unique).Count
$photoCount = @($posts | ForEach-Object { $_.photoFiles } | Where-Object { $_ } | Select-Object -Unique).Count
Write-Output "posts=$($posts.Count) videos=$videoCount photos=$photoCount"
