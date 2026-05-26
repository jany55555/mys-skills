---
name: image-crop
version: 1.0.0
description: "按目标尺寸或指定矩形裁剪图片，适用于用户提到裁剪图片、居中裁剪、按区域裁图、批量裁剪、crop image。"
argument-hint: <file-or-dir> [--width <n> --height <n>] [--left <n> --top <n> --crop-width <n> --crop-height <n>] [--recursive] [--replace] [--output-dir <dir>] [--position center|north|south|east|west|northeast|northwest|southeast|southwest|entropy|attention] [--format keep|png|jpeg|webp]
metadata:
  requires:
    bins: ["node"]
---

# image-crop

按目标尺寸或指定矩形裁剪图片。

## 适用场景

- 按目标宽高做封面裁剪
- 做居中裁剪
- 按指定区域裁图
- 批量生成统一尺寸素材

## 默认行为

- 支持输入：`.png`、`.jpg`、`.jpeg`、`.webp`、`.gif`、`.avif`、`.bmp`、`.tiff`、`.tif`
- 支持两种模式：
  - 尺寸裁剪：`--width` + `--height`
  - 区域裁剪：`--left` + `--top` + `--crop-width` + `--crop-height`
- 默认保持原格式 `keep`
- 默认不覆盖原图

## 执行方式

将以下脚本内容写入临时文件，然后执行。

### 准备临时目录和依赖

```powershell
$tmp = "$env:TEMP\image-crop-skill"
New-Item -ItemType Directory -Path $tmp -Force | Out-Null
Set-Content -Path "$tmp\package.json" -Value '{"type":"module"}' -Encoding UTF8
npm install --prefix $tmp sharp
```

### 脚本内容（写入 $tmp\crop.mjs）

```js
#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const SUPPORTED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.bmp', '.tiff', '.tif'])
const SUPPORTED_FORMATS = new Set(['keep', 'png', 'jpeg', 'webp'])
const SUPPORTED_POSITIONS = new Set(['center', 'north', 'south', 'east', 'west', 'northeast', 'northwest', 'southeast', 'southwest', 'entropy', 'attention'])

function parsePositiveInteger(value, flagName) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${flagName} must be a positive integer`)
  return parsed
}
function parseNonNegativeInteger(value, flagName) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`${flagName} must be a non-negative integer`)
  return parsed
}
function parseArgs(argv) {
  const options = { inputPath: '', width: null, height: null, left: null, top: null, cropWidth: null, cropHeight: null, recursive: false, replace: false, outputDir: '', position: 'center', format: 'keep', dryRun: false }
  const args = [...argv]
  options.inputPath = args.shift() ?? ''
  while (args.length > 0) {
    const arg = args.shift()
    if (arg === '--recursive') { options.recursive = true; continue }
    if (arg === '--replace') { options.replace = true; continue }
    if (arg === '--dry-run') { options.dryRun = true; continue }
    if (arg === '--width') { options.width = parsePositiveInteger(args.shift(), '--width'); continue }
    if (arg === '--height') { options.height = parsePositiveInteger(args.shift(), '--height'); continue }
    if (arg === '--left') { options.left = parseNonNegativeInteger(args.shift(), '--left'); continue }
    if (arg === '--top') { options.top = parseNonNegativeInteger(args.shift(), '--top'); continue }
    if (arg === '--crop-width') { options.cropWidth = parsePositiveInteger(args.shift(), '--crop-width'); continue }
    if (arg === '--crop-height') { options.cropHeight = parsePositiveInteger(args.shift(), '--crop-height'); continue }
    if (arg === '--output-dir') { const v = args.shift(); if (!v) throw new Error('--output-dir requires a path'); options.outputDir = v; continue }
    if (arg === '--position') { const v = args.shift(); if (!SUPPORTED_POSITIONS.has(v)) throw new Error('--position is invalid'); options.position = v; continue }
    if (arg === '--format') { const v = args.shift(); if (!SUPPORTED_FORMATS.has(v)) throw new Error('--format must be one of keep, png, jpeg, webp'); options.format = v; continue }
    throw new Error(`Unknown argument: ${arg}`)
  }
  if (!options.inputPath) throw new Error('Missing <file-or-dir>')
  const hasSizeCrop = options.width !== null || options.height !== null
  const hasRegionCrop = options.left !== null || options.top !== null || options.cropWidth !== null || options.cropHeight !== null
  const validSizeCrop = options.width !== null && options.height !== null && !hasRegionCrop
  const validRegionCrop = options.left !== null && options.top !== null && options.cropWidth !== null && options.cropHeight !== null && !hasSizeCrop
  if (!validSizeCrop && !validRegionCrop) throw new Error('You must provide either --width + --height, or --left + --top + --crop-width + --crop-height')
  options.mode = validSizeCrop ? 'size' : 'region'
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
function getOutputPath(filePath, rootInputPath, outputDir, replace, targetFormat) {
  const parsed = path.parse(filePath)
  const relativeDir = path.relative(rootInputPath, parsed.dir)
  const normalizedRelativeDir = relativeDir === '.' ? '' : relativeDir
  const outputExtension = getOutputExtension(targetFormat)
  if (replace && !outputDir) { return outputExtension === parsed.ext.toLowerCase() ? filePath : path.join(parsed.dir, `${parsed.name}${outputExtension}`) }
  if (!outputDir) return path.join(parsed.dir, `${parsed.name}.cropped${outputExtension}`)
  return path.join(outputDir, normalizedRelativeDir, `${parsed.name}${outputExtension}`)
}
async function ensureDirectoryForFile(filePath) { await fs.mkdir(path.dirname(filePath), { recursive: true }) }
function applyFormat(pipeline, targetFormat) {
  if (targetFormat === 'png') return pipeline.png()
  if (targetFormat === 'jpeg') return pipeline.jpeg({ quality: 95, mozjpeg: true })
  if (targetFormat === 'webp') return pipeline.webp({ quality: 95 })
  return pipeline
}
function buildPipeline(sourceBuffer, options) {
  let pipeline = sharp(sourceBuffer, { animated: true }).withMetadata()
  if (options.mode === 'size') { pipeline = pipeline.resize({ width: options.width, height: options.height, fit: 'cover', position: options.position }) }
  else { pipeline = pipeline.extract({ left: options.left, top: options.top, width: options.cropWidth, height: options.cropHeight }) }
  return pipeline
}
async function cropFile(filePath, options, rootInputPath, stats) {
  const ext = path.extname(filePath).toLowerCase()
  if (!SUPPORTED_EXTENSIONS.has(ext)) { stats.skipped += 1; console.log(`SKIPPED ${filePath} unsupported format`); return }
  const sourceBuffer = await fs.readFile(filePath)
  const sourceSize = sourceBuffer.byteLength
  const targetFormat = getTargetFormat(ext, options.format)
  if (options.mode === 'region') {
    const metadata = await sharp(sourceBuffer, { animated: true }).metadata()
    if (options.left + options.cropWidth > (metadata.width ?? 0) || options.top + options.cropHeight > (metadata.height ?? 0)) throw new Error(`crop region exceeds image bounds`)
  }
  let pipeline = buildPipeline(sourceBuffer, options)
  pipeline = applyFormat(pipeline, targetFormat)
  const outputBuffer = await pipeline.toBuffer()
  const outputPath = getOutputPath(filePath, rootInputPath, options.outputDir, options.replace, targetFormat)
  const outputSize = outputBuffer.byteLength
  if (options.dryRun) { stats.previewed += 1; console.log(`DRY-RUN ${filePath} -> ${outputPath} (${formatBytes(sourceSize)} -> ${formatBytes(outputSize)})`); return }
  await ensureDirectoryForFile(outputPath)
  await fs.writeFile(outputPath, outputBuffer)
  if (options.replace && path.resolve(outputPath) !== path.resolve(filePath)) await fs.unlink(filePath)
  stats.cropped += 1
  console.log(`CROPPED ${filePath} -> ${outputPath} (${formatBytes(sourceSize)} -> ${formatBytes(outputSize)})`)
}
async function main() {
  try {
    const options = parseArgs(process.argv.slice(2))
    const absoluteInputPath = path.resolve(options.inputPath)
    const inputStat = await fs.stat(absoluteInputPath)
    const rootInputPath = inputStat.isDirectory() ? absoluteInputPath : path.dirname(absoluteInputPath)
    const files = await collectFiles(absoluteInputPath, options.recursive)
    const stats = { cropped: 0, skipped: 0, previewed: 0, errors: 0 }
    for (const filePath of files) {
      try { await cropFile(filePath, options, rootInputPath, stats) }
      catch (error) { stats.errors += 1; console.log(`ERROR ${filePath} ${error instanceof Error ? error.message : String(error)}`) }
    }
    console.log('---')
    console.log(`cropped: ${stats.cropped}`)
    console.log(`skipped: ${stats.skipped}`)
    console.log(`previewed: ${stats.previewed}`)
    console.log(`errors: ${stats.errors}`)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
main()
```

## 示例

```powershell
$tmp = "$env:TEMP\image-crop-skill"
# 将上方脚本写入 $tmp\crop.mjs 后执行：

# 居中裁剪到指定尺寸
node "$tmp\crop.mjs" "C:\path\to\image.png" --width 750 --height 750

# 顶部裁剪
node "$tmp\crop.mjs" "C:\path\to\image.png" --width 750 --height 1334 --position north

# 按矩形区域裁剪
node "$tmp\crop.mjs" "C:\path\to\image.png" --left 100 --top 50 --crop-width 400 --crop-height 300

# 批量裁剪目录
node "$tmp\crop.mjs" "C:\path\to\images" --recursive --width 512 --height 512

# 输出到指定目录
node "$tmp\crop.mjs" "C:\path\to\images" --recursive --width 512 --height 512 --output-dir "C:\path\to\out"

# 转成指定格式
node "$tmp\crop.mjs" "C:\path\to\image.png" --width 512 --height 512 --format webp

# 覆盖原图
node "$tmp\crop.mjs" "C:\path\to\images" --recursive --width 512 --height 512 --replace
```

## 参数说明

| 参数 | 说明 |
|------|------|
| `<file-or-dir>` | 输入文件或目录 |
| `--width <n>` | 目标裁剪宽度 |
| `--height <n>` | 目标裁剪高度 |
| `--left <n>` | 矩形裁剪起点 X |
| `--top <n>` | 矩形裁剪起点 Y |
| `--crop-width <n>` | 矩形裁剪宽度 |
| `--crop-height <n>` | 矩形裁剪高度 |
| `--recursive` | 递归处理目录 |
| `--replace` | 成功后替换原图；若同时改格式，则写入新扩展名并删除原文件 |
| `--output-dir <dir>` | 输出到指定目录，保持相对目录结构 |
| `--position ...` | 尺寸裁剪时的重力位置，默认 `center` |
| `--format keep|png|jpeg|webp` | 输出格式，默认 `keep` |
| `--dry-run` | 只打印计划，不实际写文件 |

## 规则

- 必须二选一：
  - `--width` + `--height`
  - `--left` + `--top` + `--crop-width` + `--crop-height`
- 不允许两种裁剪模式混用
- `image-crop` 负责裁剪，不负责普通缩放
- 只想缩放不裁剪时，应使用 `image-resize`

## 输出

脚本会逐文件输出：

- `CROPPED`：成功输出裁剪结果
- `SKIPPED`：跳过处理
- `DRY-RUN`：仅预览
- `ERROR`：处理失败

结束时输出汇总统计。
