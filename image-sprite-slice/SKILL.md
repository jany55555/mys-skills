---
name: image-sprite-slice
version: 1.0.0
description: "按精灵图网格或指定切片尺寸拆分 sprite sheet，适用于用户提到切雪碧图、切图集、切 spritesheet、切序列帧、sprite slice。"
argument-hint: <file-or-dir> [--tile-width <n> --tile-height <n> | --columns <n> --rows <n>] [--recursive] [--output-dir <dir>] [--prefix <name>] [--trim-empty] [--background-threshold <0-255>] [--format keep|png|jpeg|webp]
metadata:
  requires:
    bins: ["node"]
---

# image-sprite-slice

按精灵图网格或指定切片尺寸拆分 sprite sheet。

## 适用场景

- 按固定格子切雪碧图
- 把角色动作图集拆成单帧
- 批量切分多张 sprite sheet
- 过滤掉空白切片

## 默认行为

- 支持输入：`.png`、`.jpg`、`.jpeg`、`.webp`、`.gif`、`.avif`、`.bmp`、`.tiff`、`.tif`
- 支持两种切分模式：
  - 指定切片尺寸：`--tile-width` + `--tile-height`
  - 指定网格数量：`--columns` + `--rows`
- 默认不递归目录
- 默认保留空白切片
- 默认保持原格式 `keep`

## 执行方式

将以下脚本内容写入临时文件，然后执行。

### 准备临时目录和依赖

```powershell
$tmp = "$env:TEMP\image-sprite-slice-skill"
New-Item -ItemType Directory -Path $tmp -Force | Out-Null
Set-Content -Path "$tmp\package.json" -Value '{"type":"module"}' -Encoding UTF8
npm install --prefix $tmp sharp
```

### 脚本内容（写入 $tmp\slice.mjs）

```js
#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const SUPPORTED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.bmp', '.tiff', '.tif'])
const SUPPORTED_FORMATS = new Set(['keep', 'png', 'jpeg', 'webp'])

function parsePositiveInteger(value, flagName) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${flagName} must be a positive integer`)
  return parsed
}
function parseArgs(argv) {
  const options = { inputPath: '', tileWidth: null, tileHeight: null, columns: null, rows: null, recursive: false, outputDir: '', prefix: '', trimEmpty: false, backgroundThreshold: 0, format: 'keep', dryRun: false }
  const args = [...argv]
  options.inputPath = args.shift() ?? ''
  while (args.length > 0) {
    const arg = args.shift()
    if (arg === '--recursive') { options.recursive = true; continue }
    if (arg === '--trim-empty') { options.trimEmpty = true; continue }
    if (arg === '--dry-run') { options.dryRun = true; continue }
    if (arg === '--tile-width') { options.tileWidth = parsePositiveInteger(args.shift(), '--tile-width'); continue }
    if (arg === '--tile-height') { options.tileHeight = parsePositiveInteger(args.shift(), '--tile-height'); continue }
    if (arg === '--columns') { options.columns = parsePositiveInteger(args.shift(), '--columns'); continue }
    if (arg === '--rows') { options.rows = parsePositiveInteger(args.shift(), '--rows'); continue }
    if (arg === '--output-dir') { const v = args.shift(); if (!v) throw new Error('--output-dir requires a path'); options.outputDir = v; continue }
    if (arg === '--prefix') { const v = args.shift(); if (!v) throw new Error('--prefix requires a name'); options.prefix = v; continue }
    if (arg === '--background-threshold') { const v = Number(args.shift()); if (!Number.isInteger(v) || v < 0 || v > 255) throw new Error('--background-threshold must be 0-255'); options.backgroundThreshold = v; continue }
    if (arg === '--format') { const v = args.shift(); if (!SUPPORTED_FORMATS.has(v)) throw new Error('--format must be one of keep, png, jpeg, webp'); options.format = v; continue }
    throw new Error(`Unknown argument: ${arg}`)
  }
  if (!options.inputPath) throw new Error('Missing <file-or-dir>')
  const hasTileMode = options.tileWidth !== null || options.tileHeight !== null
  const hasGridMode = options.columns !== null || options.rows !== null
  const validTileMode = options.tileWidth !== null && options.tileHeight !== null && !hasGridMode
  const validGridMode = options.columns !== null && options.rows !== null && !hasTileMode
  if (!validTileMode && !validGridMode) throw new Error('You must provide either --tile-width + --tile-height, or --columns + --rows')
  options.mode = validTileMode ? 'tile' : 'grid'
  return options
}
async function collectFiles(targetPath, recursive) {
  const stat = await fs.stat(targetPath)
  if (stat.isFile()) return [targetPath]
  if (!stat.isDirectory()) return []
  const results = []
  const entries = await fs.readdir(targetPath, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(targetPath, entry.name)
    if (entry.isFile()) { results.push(fullPath); continue }
    if (entry.isDirectory() && recursive) results.push(...await collectFiles(fullPath, true))
  }
  return results
}
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}
function getOriginalFormat(ext) {
  if (ext === '.jpg' || ext === '.jpeg') return 'jpeg'
  if (ext === '.tif' || ext === '.tiff') return 'png'
  return ext.slice(1)
}
function getTargetFormat(ext, requestedFormat) {
  if (requestedFormat !== 'keep') return requestedFormat
  const originalFormat = getOriginalFormat(ext)
  return SUPPORTED_FORMATS.has(originalFormat) ? originalFormat : 'png'
}
function getOutputExtension(format) { return format === 'jpeg' ? '.jpg' : `.${format}` }
function applyFormat(pipeline, targetFormat) {
  if (targetFormat === 'png') return pipeline.png()
  if (targetFormat === 'jpeg') return pipeline.jpeg({ quality: 95, mozjpeg: true })
  if (targetFormat === 'webp') return pipeline.webp({ quality: 95 })
  return pipeline
}
function getSliceOutputPath(filePath, rootInputPath, outputDir, prefix, rowIndex, columnIndex, targetFormat) {
  const parsed = path.parse(filePath)
  const relativeDir = path.relative(rootInputPath, parsed.dir)
  const normalizedRelativeDir = relativeDir === '.' ? '' : relativeDir
  const baseName = prefix || parsed.name
  const fileName = `${baseName}_r${String(rowIndex).padStart(2, '0')}_c${String(columnIndex).padStart(2, '0')}${getOutputExtension(targetFormat)}`
  if (!outputDir) return path.join(parsed.dir, `${parsed.name}.slices`, fileName)
  return path.join(outputDir, normalizedRelativeDir, parsed.name, fileName)
}
async function isEffectivelyEmpty(buffer, threshold) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const channels = info.channels
  const firstRed = data[0] ?? 0, firstGreen = data[1] ?? 0, firstBlue = data[2] ?? 0, firstAlpha = data[3] ?? 0
  for (let i = 0; i < data.length; i += channels) {
    if (Math.abs(data[i] - firstRed) > threshold || Math.abs(data[i+1] - firstGreen) > threshold || Math.abs(data[i+2] - firstBlue) > threshold || Math.abs(data[i+3] - firstAlpha) > threshold) return false
  }
  return true
}
function resolveGrid(metadata, options) {
  const imageWidth = metadata.width ?? 0, imageHeight = metadata.height ?? 0
  if (options.mode === 'tile') {
    if (imageWidth % options.tileWidth !== 0 || imageHeight % options.tileHeight !== 0) throw new Error(`image size ${imageWidth}x${imageHeight} is not divisible by tile size ${options.tileWidth}x${options.tileHeight}`)
    return { tileWidth: options.tileWidth, tileHeight: options.tileHeight, columns: imageWidth / options.tileWidth, rows: imageHeight / options.tileHeight }
  }
  if (imageWidth % options.columns !== 0 || imageHeight % options.rows !== 0) throw new Error(`image size ${imageWidth}x${imageHeight} is not divisible by grid ${options.columns}x${options.rows}`)
  return { tileWidth: imageWidth / options.columns, tileHeight: imageHeight / options.rows, columns: options.columns, rows: options.rows }
}
async function sliceFile(filePath, options, rootInputPath, stats) {
  const ext = path.extname(filePath).toLowerCase()
  if (!SUPPORTED_EXTENSIONS.has(ext)) { stats.skipped += 1; console.log(`SKIPPED ${filePath} unsupported format`); return }
  const sourceBuffer = await fs.readFile(filePath)
  const sourceSize = sourceBuffer.byteLength
  const metadata = await sharp(sourceBuffer, { animated: true }).metadata()
  const { tileWidth, tileHeight, columns, rows } = resolveGrid(metadata, options)
  const targetFormat = getTargetFormat(ext, options.format)
  for (let rowIndex = 0; rowIndex < rows; rowIndex++) {
    for (let columnIndex = 0; columnIndex < columns; columnIndex++) {
      let pipeline = sharp(sourceBuffer, { animated: true }).extract({ left: columnIndex * tileWidth, top: rowIndex * tileHeight, width: tileWidth, height: tileHeight }).withMetadata()
      pipeline = applyFormat(pipeline, targetFormat)
      const outputBuffer = await pipeline.toBuffer()
      if (options.trimEmpty && await isEffectivelyEmpty(outputBuffer, options.backgroundThreshold)) { stats.skipped += 1; console.log(`SKIPPED ${filePath} [r${rowIndex} c${columnIndex}] empty slice`); continue }
      const outputPath = getSliceOutputPath(filePath, rootInputPath, options.outputDir, options.prefix, rowIndex, columnIndex, targetFormat)
      if (options.dryRun) { stats.previewed += 1; console.log(`DRY-RUN ${filePath} [r${rowIndex} c${columnIndex}] -> ${outputPath} (${formatBytes(sourceSize)} -> ${formatBytes(outputBuffer.byteLength)})`); continue }
      await fs.mkdir(path.dirname(outputPath), { recursive: true })
      await fs.writeFile(outputPath, outputBuffer)
      stats.sliced += 1
      console.log(`SLICED ${filePath} [r${rowIndex} c${columnIndex}] -> ${outputPath} (${tileWidth}x${tileHeight}, ${formatBytes(outputBuffer.byteLength)})`)
    }
  }
}
async function main() {
  try {
    const options = parseArgs(process.argv.slice(2))
    const absoluteInputPath = path.resolve(options.inputPath)
    const inputStat = await fs.stat(absoluteInputPath)
    const rootInputPath = inputStat.isDirectory() ? absoluteInputPath : path.dirname(absoluteInputPath)
    const files = await collectFiles(absoluteInputPath, options.recursive)
    const stats = { sliced: 0, skipped: 0, previewed: 0, errors: 0 }
    for (const filePath of files) {
      try { await sliceFile(filePath, options, rootInputPath, stats) }
      catch (error) { stats.errors += 1; console.log(`ERROR ${filePath} ${error instanceof Error ? error.message : String(error)}`) }
    }
    console.log('---')
    console.log(`sliced: ${stats.sliced}`)
    console.log(`skipped: ${stats.skipped}`)
    console.log(`previewed: ${stats.previewed}`)
    console.log(`errors: ${stats.errors}`)
  } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1 }
}
main()
```

## 示例

```powershell
$tmp = "$env:TEMP\image-sprite-slice-skill"
# 将上方脚本写入 $tmp\slice.mjs 后执行：

# 按切片尺寸拆分
node "$tmp\slice.mjs" "C:\path\to\sheet.png" --tile-width 128 --tile-height 128

# 按行列数拆分
node "$tmp\slice.mjs" "C:\path\to\sheet.png" --columns 6 --rows 4

# 批量处理目录
node "$tmp\slice.mjs" "C:\path\to\sheets" --recursive --tile-width 64 --tile-height 64

# 跳过空白切片
node "$tmp\slice.mjs" "C:\path\to\sheet.png" --columns 8 --rows 8 --trim-empty

# 输出到指定目录并指定前缀
node "$tmp\slice.mjs" "C:\path\to\sheet.png" --tile-width 64 --tile-height 64 --output-dir "C:\path\to\out" --prefix hero

# 转成指定格式
node "$tmp\slice.mjs" "C:\path\to\sheet.png" --columns 4 --rows 4 --format png
```

## 参数说明

| 参数 | 说明 |
|------|------|
| `<file-or-dir>` | 输入文件或目录 |
| `--tile-width <n>` | 单个切片宽度 |
| `--tile-height <n>` | 单个切片高度 |
| `--columns <n>` | 网格列数 |
| `--rows <n>` | 网格行数 |
| `--recursive` | 递归处理目录 |
| `--output-dir <dir>` | 输出到指定目录，保持相对目录结构 |
| `--prefix <name>` | 输出文件名前缀，默认使用原文件名 |
| `--trim-empty` | 跳过近似空白切片 |
| `--background-threshold <0-255>` | 判定空白切片时的透明度/颜色阈值，默认 `0` |
| `--format keep|png|jpeg|webp` | 输出格式，默认 `keep` |
| `--dry-run` | 只打印计划，不实际写文件 |

## 规则

- 必须二选一：
  - `--tile-width` + `--tile-height`
  - `--columns` + `--rows`
- 不允许两种切分模式混用
- 图像宽高必须能被对应网格整除
- `image-sprite-slice` 只负责切片，不负责拼图

## 输出

脚本会逐切片输出：

- `SLICED`：成功输出切片
- `SKIPPED`：跳过处理
- `DRY-RUN`：仅预览
- `ERROR`：处理失败

结束时输出汇总统计。
