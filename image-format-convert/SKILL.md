---
name: image-format-convert
version: 1.1.0
description: "在 PNG/JPEG/WebP/AVIF/BMP/TIFF/GIF 之间转换图片格式，适用于用户提到格式转换、png 转 jpg、jpg 转 webp、图片转 avif、批量转格式、format convert。"
argument-hint: <file-or-dir> --to <png|jpeg|webp|avif|bmp|tiff> [--recursive] [--replace] [--output-dir <dir>] [--quality <1-100>] [--lossless] [--flatten-bg <hex>] [--skip-larger]
metadata:
  requires:
    bins: ["node"]
---

# image-format-convert

在常见图片格式之间做批量转换。

## 适用场景

- PNG 转 JPEG / WebP / AVIF
- JPEG 转 PNG / WebP / AVIF
- WebP 转 PNG / JPEG
- 批量统一素材格式

## 默认行为

- 支持输入：`.png`、`.jpg`、`.jpeg`、`.webp`、`.gif`、`.avif`、`.bmp`、`.tiff`、`.tif`
- 必须显式指定 `--to`
- 默认不缩放、不裁剪
- 默认不覆盖原图
- 默认质量 `95`
- 支持 `--lossless`，适用于 `png/webp/avif` 等支持无损的目标格式

## 执行方式

将以下脚本内容写入临时文件 `convert.mjs`，然后执行。

### 脚本内容

```js
#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const SUPPORTED_INPUT_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.bmp', '.tiff', '.tif'])
const SUPPORTED_OUTPUT_FORMATS = new Set(['png', 'jpeg', 'webp', 'avif', 'bmp', 'tiff'])

function printUsage() {
  console.log(`Usage:
  node convert.mjs <file-or-dir> --to <png|jpeg|webp|avif|bmp|tiff> [--recursive] [--replace] [--output-dir <dir>] [--quality <1-100>] [--lossless] [--flatten-bg <hex>] [--skip-larger] [--dry-run]`)
}

function parsePositiveInteger(value, flagName) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flagName} must be a positive integer`)
  }
  return parsed
}

function normalizeHexColor(value) {
  if (!value) throw new Error('--flatten-bg requires a hex color')
  const normalized = value.replace(/^#/, '')
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) throw new Error('--flatten-bg must be a 6-digit hex color like ffffff')
  return `#${normalized.toLowerCase()}`
}

function parseArgs(argv) {
  const options = { inputPath: '', to: '', recursive: false, replace: false, outputDir: '', quality: 95, lossless: false, flattenBg: '', skipLarger: false, dryRun: false }
  const args = [...argv]
  options.inputPath = args.shift() ?? ''
  while (args.length > 0) {
    const arg = args.shift()
    if (arg === '--recursive') { options.recursive = true; continue }
    if (arg === '--replace') { options.replace = true; continue }
    if (arg === '--lossless') { options.lossless = true; continue }
    if (arg === '--skip-larger') { options.skipLarger = true; continue }
    if (arg === '--dry-run') { options.dryRun = true; continue }
    if (arg === '--to') { const v = args.shift(); if (!SUPPORTED_OUTPUT_FORMATS.has(v)) throw new Error('--to must be one of png, jpeg, webp, avif, bmp, tiff'); options.to = v; continue }
    if (arg === '--output-dir') { const v = args.shift(); if (!v) throw new Error('--output-dir requires a path'); options.outputDir = v; continue }
    if (arg === '--quality') { const v = parsePositiveInteger(args.shift(), '--quality'); if (v > 100) throw new Error('--quality must be 1-100'); options.quality = v; continue }
    if (arg === '--flatten-bg') { options.flattenBg = normalizeHexColor(args.shift()); continue }
    throw new Error(`Unknown argument: ${arg}`)
  }
  if (!options.inputPath) throw new Error('Missing <file-or-dir>')
  if (!options.to) throw new Error('Missing required --to <format>')
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

function getOutputExtension(format) { return format === 'jpeg' ? '.jpg' : `.${format}` }

function getOutputPath(filePath, rootInputPath, outputDir, replace, targetFormat) {
  const parsed = path.parse(filePath)
  const relativeDir = path.relative(rootInputPath, parsed.dir)
  const normalizedRelativeDir = relativeDir === '.' ? '' : relativeDir
  const outputExtension = getOutputExtension(targetFormat)
  if (replace && !outputDir) {
    if (outputExtension === parsed.ext.toLowerCase()) return filePath
    return path.join(parsed.dir, `${parsed.name}${outputExtension}`)
  }
  if (!outputDir) return path.join(parsed.dir, `${parsed.name}.converted${outputExtension}`)
  return path.join(outputDir, normalizedRelativeDir, `${parsed.name}${outputExtension}`)
}

async function ensureDirectoryForFile(filePath) { await fs.mkdir(path.dirname(filePath), { recursive: true }) }

function applyOutputFormat(pipeline, targetFormat, options) {
  if (targetFormat === 'png') return pipeline.png({ compressionLevel: 9, effort: 10 })
  if (targetFormat === 'jpeg') return pipeline.jpeg({ quality: options.quality, mozjpeg: true })
  if (targetFormat === 'webp') return options.lossless ? pipeline.webp({ lossless: true, effort: 6 }) : pipeline.webp({ quality: options.quality, effort: 6 })
  if (targetFormat === 'avif') return options.lossless ? pipeline.avif({ lossless: true, effort: 6 }) : pipeline.avif({ quality: options.quality, effort: 6 })
  if (targetFormat === 'bmp') return pipeline.bmp()
  if (targetFormat === 'tiff') return pipeline.tiff({ quality: options.quality, compression: options.lossless ? 'lzw' : 'jpeg' })
  return pipeline
}

async function convertFile(filePath, options, rootInputPath, stats) {
  const ext = path.extname(filePath).toLowerCase()
  if (!SUPPORTED_INPUT_EXTENSIONS.has(ext)) { stats.skipped += 1; console.log(`SKIPPED ${filePath} unsupported format`); return }
  const sourceBuffer = await fs.readFile(filePath)
  const sourceSize = sourceBuffer.byteLength
  const outputPath = getOutputPath(filePath, rootInputPath, options.outputDir, options.replace, options.to)
  let pipeline = sharp(sourceBuffer, { animated: true }).withMetadata()
  if (options.to === 'jpeg' || options.to === 'bmp') pipeline = pipeline.flatten({ background: options.flattenBg || '#ffffff' })
  pipeline = applyOutputFormat(pipeline, options.to, options)
  const outputBuffer = await pipeline.toBuffer()
  const outputSize = outputBuffer.byteLength
  if (options.skipLarger && outputSize >= sourceSize) { stats.skipped += 1; console.log(`SKIPPED ${filePath} output larger (${formatBytes(sourceSize)} -> ${formatBytes(outputSize)})`); return }
  if (options.dryRun) { stats.previewed += 1; console.log(`DRY-RUN ${filePath} -> ${outputPath} (${formatBytes(sourceSize)} -> ${formatBytes(outputSize)})`); return }
  await ensureDirectoryForFile(outputPath)
  await fs.writeFile(outputPath, outputBuffer)
  if (options.replace && path.resolve(outputPath) !== path.resolve(filePath)) await fs.unlink(filePath)
  stats.converted += 1
  console.log(`CONVERTED ${filePath} -> ${outputPath} (${formatBytes(sourceSize)} -> ${formatBytes(outputSize)})`)
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2))
    const absoluteInputPath = path.resolve(options.inputPath)
    const inputStat = await fs.stat(absoluteInputPath)
    const rootInputPath = inputStat.isDirectory() ? absoluteInputPath : path.dirname(absoluteInputPath)
    const files = await collectFiles(absoluteInputPath, options.recursive)
    const stats = { converted: 0, skipped: 0, previewed: 0, errors: 0 }
    for (const filePath of files) {
      try { await convertFile(filePath, options, rootInputPath, stats) }
      catch (error) { stats.errors += 1; console.log(`ERROR ${filePath} ${error instanceof Error ? error.message : String(error)}`) }
    }
    console.log('---')
    console.log(`converted: ${stats.converted}`)
    console.log(`skipped: ${stats.skipped}`)
    console.log(`previewed: ${stats.previewed}`)
    console.log(`errors: ${stats.errors}`)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    printUsage()
    process.exitCode = 1
  }
}

main()
```

### 安装依赖

在临时目录安装 sharp：

```powershell
$tmp = "$env:TEMP\image-convert-skill"
New-Item -ItemType Directory -Path $tmp -Force | Out-Null
Set-Content -Path "$tmp\package.json" -Value '{"type":"module"}' -Encoding UTF8
npm install --prefix $tmp sharp
```

### 执行转换

```powershell
$tmp = "$env:TEMP\image-convert-skill"
# 将上方脚本内容写入 $tmp\convert.mjs，然后执行：
node "$tmp\convert.mjs" "<file-or-dir>" --to <format>
```

## 示例

### PNG 转 JPEG

```powershell
node "$tmp\convert.mjs" "C:\path\to\image.png" --to jpeg
```

### JPEG 转 WebP

```powershell
node "$tmp\convert.mjs" "C:\path\to\image.jpg" --to webp --quality 95
```

### PNG 无损转 WebP

```powershell
node "$tmp\convert.mjs" "C:\path\to\image.png" --to webp --lossless
```

### 批量转格式

```powershell
node "$tmp\convert.mjs" "C:\path\to\images" --recursive --to webp
```

### 输出更大时跳过

```powershell
node "$tmp\convert.mjs" "C:\path\to\images" --recursive --to avif --skip-larger
```

### 透明图转 JPEG 并铺底色

```powershell
node "$tmp\convert.mjs" "C:\path\to\image.png" --to jpeg --flatten-bg ffffff
```

## 参数说明

| 参数 | 说明 |
|------|------|
| `<file-or-dir>` | 输入文件或目录 |
| `--to <format>` | 目标格式，必填 |
| `--recursive` | 递归处理目录 |
| `--replace` | 成功后替换原图 |
| `--output-dir <dir>` | 输出到指定目录，保持相对目录结构 |
| `--quality <1-100>` | 有损格式质量，默认 `95` |
| `--lossless` | 启用无损模式 |
| `--flatten-bg <hex>` | 转 JPEG 等不支持透明的格式时，指定铺底色，例如 `ffffff` |
| `--skip-larger` | 结果更大时跳过写入 |
| `--dry-run` | 只打印计划，不实际写文件 |

## 规则

- 只负责格式转换，不做缩放和裁剪
- 透明图转不支持 alpha 的格式时，默认铺白底；也可以显式传 `--flatten-bg`
- 批量处理前优先先跑单张或 `--dry-run`

## 输出

脚本会逐文件输出：

- `CONVERTED`：成功输出转换结果
- `SKIPPED`：跳过处理
- `DRY-RUN`：仅预览
- `ERROR`：处理失败

结束时输出汇总统计。
