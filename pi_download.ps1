<#
pi‑agent 模型数据更新脚本
#>
$version = "0.84.2"
$repo = "D:\code\pi-agent"
$tempDir = Join-Path $env:TEMP "pi-$version-model-data"

New-Item -ItemType Directory -Force $tempDir | Out-Null

$archive = Join-Path $tempDir "pi-$version-source.tar.gz"
$sums = Join-Path $tempDir "SHA256SUMS"
$extractDir = Join-Path $tempDir "extracted"

New-Item -ItemType Directory -Force $repo | Out-Null

Write-Host "1/4 正在下载源码压缩包..."
Invoke-WebRequest "https://github.com/earendil-works/pi/releases/download/v$version/pi-$version-source.tar.gz" -OutFile $archive -TimeoutSec 300

Write-Host "正在下载校验文件 SHA256SUMS..."
Invoke-WebRequest "https://github.com/earendil-works/pi/releases/download/v$version/SHA256SUMS" -OutFile $sums -TimeoutSec 300

Write-Host "`n2/4 开始校验SHA256哈希值..."
# 全部单行管道，不再换行拆分
$line = (Get-Content $sums) | Where-Object { $_ -match "pi-$([regex]::Escape($version))-source\.tar\.gz$" } | Select-Object -First 1

if (-not $line) {
    throw "SHA256SUMS 中找不到源码压缩包记录"
}

$expected = ($line -split "\s+")[0].ToLower()
$actual = (Get-FileHash $archive -Algorithm SHA256).Hash.ToLower()

if ($expected -ne $actual) {
    throw "SHA256 校验失败：expected=$expected actual=$actual"
}

Write-Host "✅ SHA256 校验成功"

Write-Host "`n3/4 解压压缩包..."
New-Item -ItemType Directory -Force $extractDir | Out-Null
tar -xzf $archive -C $extractDir

# Get‑ChildItem也改成单行，避免换行解析问题
$amazonFile = (Get-ChildItem $extractDir -Filter "amazon-bedrock.json" -File -Recurse) | Where-Object {$_.FullName -match "\\packages\\ai\\src\\providers\\data\\amazon-bedrock\.json$"} | Select-Object -First 1

if (-not $amazonFile) {
    throw "发布包中没有找到模型数据目录"
}

$sourceDataDir = $amazonFile.Directory.FullName
$targetDataDir = Join-Path $repo "packages\ai\src\providers\data"

Write-Host "复制模型数据到 $targetDataDir"
New-Item -ItemType Directory -Force $targetDataDir | Out-Null
Copy-Item -Path "$sourceDataDir\*" -Destination $targetDataDir -Recurse -Force

Write-Host "`n4/4 清理临时文件..."
Remove-Item -LiteralPath $tempDir -Recurse -Force

Write-Host "`n🎉 全部任务执行完成！模型数据已经复制到本地仓库。"