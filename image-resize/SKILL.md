---
name: image-resize
version: 1.0.0
description: "按宽高或最长边缩放图片，适用于用户提到调整图片尺寸、缩小图片、放大图片、限制最长边、批量缩放、resize image。"
argument-hint: <file-or-dir> [--width <n>] [--height <n>] [--max-side <n>] [--recursive] [--replace] [--output-dir <dir>] [--fit inside|outside|fill|contain] [--without-enlargement] [--format keep|png|jpeg|webp]
metadata:
  requires:
    bins: ["node"]
---

# image-resize

按宽高或最长边缩放图片，不负责裁剪。

## 适用场景

- 把图片缩小到指定宽度或高度
- 限制最长边
- 批量生成较小尺寸的素材
- 在不裁剪的前提下统一尺寸策略

## 默认行为

- 支持输入：`.png`、`.jpg`、`.jpeg`、`.webp`、`.gif`、`.avif`、`.bmp`、`.tiff`、`.tif`
- 不裁剪，只缩放
- 默认保持原格式 `keep`
- 默认不覆盖原图
- 默认允许放大；需要避免放大时加 `--without-enlargement`

## 执行方式

将以下脚本内容写入临时文件，然后执行。

### 准备临时目录和依赖

```powershell
$tmp = "$env:TEMP\image-resize-skill"
New-Item -ItemType Directory -Path $tmp -Force | Out-Null
Set-Content -Path "$tmp\package.json" -Value '{"type":"module"}' -Encoding UTF8
npm install --prefix $tmp sharp
```

### 脚本内容（写入 $tmp\resize.mjs）

```js
#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const SUPPORTED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.bmp', '.tiff', '.tif'])
const SUPPORTED_FORMATS = new Set(['keep', 'png', 'jpeg', 'webp'])
const SUPPORTED_FITS = new Set(['inside', 'outside', 'fill', 'contain'])

function parsePositiveInteger(value, flagName) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${flagName} must be a positive integer`)
  return parsed
}
function parseArgs(argv) {
  const options = { inputPath: '', width: null, height: null, maxSide: null, recursive: false, replace: false, outputDir: '', fit: 'inside', withoutEnlargement: false, format: 'keep', dryRun: false }
  const args = [...argv]
  options.inputPath = args.shift() ?? ''
  while (args.length > 0) {
    const arg = args.shift()
    if (arg === '--recursive') { options.recursive = true; continue }
    if (arg === '--replace') { options.replace = true; continue }
    if (arg === '--without-enlargement') { options.withoutEnlargement = true; continue }
    if (arg === '--dry-run') { options.dryRun = true; continue }
    if (arg === '--width') { options.width = parsePositiveInteger(args.shift(), '--width'); continue }
    if (arg === '--height') { options.height = parsePositiveInteger(args.shift(), '--height'); continue }
    if (arg === '--max-side') { options.maxSide = parsePositiveInteger(args.shift(), '--max-side'); continue }
    if (arg === '--output-dir') { const v = args.shift(); if (!v) throw new Error('--output-dir requires a path'); options.outputDir = v; continue }
    if (arg === '--fit') { const v = args.shift(); if (!SUPPORTED_FITS.has(v)) throw new Error('--fit must be one of inside, outside, fill, contain'); options.fit = v; continue }
    if (arg === '--format') { const v = args.shift(); if (!SUPPORTED_FORMATS.has(v)) throw new Error('--format must be one of keep, png, jpeg, webp'); options.format = v; continue }
    throw new Error(`Unknown argument: ${arg}`)
  }
  if (!options.inputPath) throw new Error('Missing <file-or-dir>')
  if (options.width === null && options.height === null && options.maxSide === null) throw new Error('At least one of --width, --height, or --max-side is required')
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
  if (!outputDir) return path.join(parsed.dir, `${parsed.name}.resized${outputExtension}`)
  return path.join(outputDir, normalizedRelativeDir, `${parsed.name}${outputExtension}`)
}
function applyFormat(pipeline, targetFormat) {
  if (targetFormat === 'png') return pipeline.png()
  if (targetFormat === 'jpeg') return pipeline.jpeg({ quality: 95, mozjpeg: true })
  if (targetFormat === 'webp') return pipeline.webp({ quality: 95 })
  return pipeline
}
async function resizeFile(filePath, options, rootInputPath, stats) {
  const ext = path.extname(filePath).toLowerCase()
  if (!SUPPORTED_EXTENSIONS.has(ext)) { stats.skipped += 1; console.log(`SKIPPED ${filePath} unsupported format`); return }
  const sourceBuffer = await fs.readFile(filePath)
  const sourceSize = sourceBuffer.byteLength
  const image = sharp(sourceBuffer, { animated: true }).withMetadata()
  const metadata = await image.metadata()
  let resizeWidth = options.width, resizeHeight = options.height
  if (options.maxSide !== null && metadata.width != null && metadata.height != null) {
    if (metadata.width >= metadata.height) { resizeWidth = options.maxSide; resizeHeight = null }
    else { resizeWidth = null; resizeHeight = options.maxSide }
  }
  const targetFormat = getTargetFormat(ext, options.format)
  let pipeline = sharp(sourceBuffer, { animated: true }).withMetadata().resize({ width: resizeWidth, height: resizeHeight, fit: options.fit, withoutEnlargement: options.withoutEnlargement })
  pipeline = applyFormat(pipeline, targetFormat)
  const outputBuffer = await pipeline.toBuffer()
  const outputPath = getOutputPath(filePath, rootInputPath, options.outputDir, options.replace, targetFormat)
  const outputSize = outputBuffer.byteLength
  if (options.dryRun) { stats.previewed += 1; console.log(`DRY-RUN ${filePath} -> ${outputPath} (${formatBytes(sourceSize)} -> ${formatBytes(outputSize)})`); return }
  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  await fs.writeFile(outputPath, outputBuffer)
  if (options.replace && path.resolve(outputPath) !== path.resolve(filePath)) await fs.unlink(filePath)
  stats.resized += 1
  console.log(`RESIZED ${filePath} -> ${outputPath} (${formatBytes(sourceSize)} -> ${formatBytes(outputSize)})`)
}
async function main() {
  try {
    const options = parseArgs(process.argv.slice(2))
    const absoluteInputPath = path.resolve(options.inputPath)
    const inputStat = await fs.stat(absoluteInputPath)
    const rootInputPath = inputStat.isDirectory() ? absoluteInputPath : path.dirname(absoluteInputPath)
    const files = await collectFiles(absoluteInputPath, options.recursive)
    const stats = { resized: 0, skipped: 0, previewed: 0, errors: 0 }
    for (const filePath of files) {
      try { await resizeFile(filePath, options, rootInputPath, stats) }
      catch (error) { stats.errors += 1; console.log(`ERROR ${filePath} ${error instanceof Error ? error.message : String(error)}`) }
    }
    console.log('---')
    console.log(`resized: ${stats.resized}`)
    console.log(`skipped: ${stats.skipped}`)
    console.log(`previewed: ${stats.previewed}`)
    console.log(`errors: ${stats.errors}`)
  } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1 }
}
main()
```

## 示例

```powershell
$tmp = "$env:TEMP\image-resize-skill"
# 将上方脚本写入 $tmp\resize.mjs 后执行：

# 按宽度缩放
node "$tmp\resize.mjs" "C:\path\to\image.png" --width 750

# 按高度缩放
node "$tmp\resize.mjs" "C:\path\to\image.png" --height 1334

# 限制最长边
node "$tmp\resize.mjs" "C:\path\to\images" --recursive --max-side 1024 --without-enlargement

# 指定输出目录
node "$tmp\resize.mjs" "C:\path\to\images" --recursive --width 512 --output-dir "C:\path\to\out"

# 转成指定格式
node "$tmp\resize.mjs" "C:\path\to\image.png" --width 750 --format webp

# 覆盖原图
node "$tmp\resize.mjs" "C:\path\to\images" --recursive --max-side 1024 --replace
```

## 参数说明

| 参数 | 说明 |
|------|------|
| `<file-or-dir>` | 输入文件或目录 |
| `--width <n>` | 目标宽度 |
| `--height <n>` | 目标高度 |
| `--max-side <n>` | 限制最长边 |
| `--recursive` | 递归处理目录 |
| `--replace` | 成功后替换原图；若同时改格式，则写入新扩展名并删除原文件 |
| `--output-dir <dir>` | 输出到指定目录，保持相对目录结构 |
| `--fit inside|outside|fill|contain` | 缩放模式，默认 `inside` |
| `--without-enlargement` | 不放大原本更小的图片 |
| `--format keep|png|jpeg|webp` | 输出格式，默认 `keep` |
| `--dry-run` | 只打印计划，不实际写文件 |

## 规则

- 必须至少提供 `--width`、`--height`、`--max-side` 之一
- `image-resize` 只负责缩放，不做裁剪
- 要做裁剪时应使用单独的 `image-crop`
- 批量处理前优先先跑单张或 `--dry-run`

## 输出

脚本会逐文件输出：

- `RESIZED`：成功输出缩放结果
- `SKIPPED`：跳过处理
- `DRY-RUN`：仅预览
- `ERROR`：处理失败

结束时输出汇总统计。
