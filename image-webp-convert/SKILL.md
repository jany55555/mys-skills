---
name: image-webp-convert
version: 1.0.0
description: "将 PNG/JPG/JPEG 批量转换为 WebP，默认保真优先。适用于用户提到转 webp、批量转 webp、图片转 webp、png 转 webp、jpg 转 webp、保真转换、无损 webp。"
argument-hint: <file-or-dir> [--recursive] [--replace] [--quality 100] [--jpg-mode preserve|skip] [--output-dir <dir>] [--skip-larger]
metadata:
  requires:
    bins: ["node"]
---

# image-webp-convert

将图片转换为 WebP，默认保真优先。

## 适用场景

- 单张图片转 WebP
- 批量目录转 WebP
- PNG 无损转 WebP
- JPG/JPEG 高质量转 WebP
- 批量整理游戏图片资源为 `.webp`

## 默认行为

- 支持输入：`.png`、`.jpg`、`.jpeg`
- PNG 默认输出为无损 WebP
- JPG/JPEG 默认输出为高质量 WebP
- 不缩放、不裁剪、不改尺寸
- 默认保留原图，只新增 `.webp`
- 已经是 `.webp` 的文件会跳过

## 执行方式

将以下脚本内容写入临时文件，然后执行。

### 准备临时目录和依赖

```powershell
$tmp = "$env:TEMP\image-webp-convert-skill"
New-Item -ItemType Directory -Path $tmp -Force | Out-Null
Set-Content -Path "$tmp\package.json" -Value '{"type":"module"}' -Encoding UTF8
npm install --prefix $tmp sharp
```

### 脚本内容（写入 $tmp\convert.mjs）

```js
#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const SUPPORTED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg'])

function parseArgs(argv) {
  const options = { inputPath: '', recursive: false, replace: false, quality: 100, jpgMode: 'preserve', outputDir: '', skipLarger: false, dryRun: false }
  const args = [...argv]
  options.inputPath = args.shift() ?? ''
  while (args.length > 0) {
    const arg = args.shift()
    if (arg === '--recursive') { options.recursive = true; continue }
    if (arg === '--replace') { options.replace = true; continue }
    if (arg === '--skip-larger') { options.skipLarger = true; continue }
    if (arg === '--dry-run') { options.dryRun = true; continue }
    if (arg === '--quality') { const v = Number(args.shift()); if (!Number.isInteger(v) || v < 1 || v > 100) throw new Error('--quality must be 1-100'); options.quality = v; continue }
    if (arg === '--jpg-mode') { const v = args.shift(); if (v !== 'preserve' && v !== 'skip') throw new Error('--jpg-mode must be preserve or skip'); options.jpgMode = v; continue }
    if (arg === '--output-dir') { const v = args.shift(); if (!v) throw new Error('--output-dir requires a path'); options.outputDir = v; continue }
    throw new Error(`Unknown argument: ${arg}`)
  }
  if (!options.inputPath) throw new Error('Missing <file-or-dir>')
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
function getOutputPath(filePath, rootInputPath, outputDir) {
  const parsed = path.parse(filePath)
  const relativeDir = path.relative(rootInputPath, parsed.dir)
  const normalizedRelativeDir = relativeDir === '.' ? '' : relativeDir
  if (!outputDir) return path.join(parsed.dir, `${parsed.name}.webp`)
  return path.join(outputDir, normalizedRelativeDir, `${parsed.name}.webp`)
}
async function convertFile(filePath, options, rootInputPath, stats) {
  const ext = path.extname(filePath).toLowerCase()
  if (!SUPPORTED_EXTENSIONS.has(ext)) { stats.skipped += 1; console.log(`SKIPPED ${filePath} unsupported format`); return }
  if ((ext === '.jpg' || ext === '.jpeg') && options.jpgMode === 'skip') { stats.skipped += 1; console.log(`SKIPPED ${filePath} jpg-mode=skip`); return }
  const outputPath = getOutputPath(filePath, rootInputPath, options.outputDir)
  const sourceBuffer = await fs.readFile(filePath)
  const sourceSize = sourceBuffer.byteLength
  let pipeline = sharp(sourceBuffer, { animated: true }).withMetadata()
  if (ext === '.png') { pipeline = pipeline.webp({ lossless: true, effort: 6 }) }
  else { pipeline = pipeline.webp({ quality: options.quality, alphaQuality: 100, effort: 6, smartSubsample: true }) }
  const outputBuffer = await pipeline.toBuffer()
  const outputSize = outputBuffer.byteLength
  if (options.skipLarger && outputSize >= sourceSize) { stats.skipped += 1; console.log(`SKIPPED ${filePath} output larger (${formatBytes(sourceSize)} -> ${formatBytes(outputSize)})`); return }
  if (options.dryRun) { stats.previewed += 1; console.log(`DRY-RUN ${filePath} -> ${outputPath} (${formatBytes(sourceSize)} -> ${formatBytes(outputSize)})`); return }
  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  await fs.writeFile(outputPath, outputBuffer)
  if (options.replace && path.resolve(outputPath) !== path.resolve(filePath)) await fs.unlink(filePath)
  stats.created += 1; stats.sourceBytes += sourceSize; stats.outputBytes += outputSize
  console.log(`CREATED ${filePath} -> ${outputPath} (${formatBytes(sourceSize)} -> ${formatBytes(outputSize)})`)
}
async function main() {
  try {
    const options = parseArgs(process.argv.slice(2))
    const absoluteInputPath = path.resolve(options.inputPath)
    const inputStat = await fs.stat(absoluteInputPath)
    const rootInputPath = inputStat.isDirectory() ? absoluteInputPath : path.dirname(absoluteInputPath)
    const files = await collectFiles(absoluteInputPath, options.recursive)
    const stats = { created: 0, skipped: 0, previewed: 0, errors: 0, sourceBytes: 0, outputBytes: 0 }
    for (const filePath of files) {
      try { await convertFile(filePath, options, rootInputPath, stats) }
      catch (error) { stats.errors += 1; console.log(`ERROR ${filePath} ${error instanceof Error ? error.message : String(error)}`) }
    }
    console.log('---')
    console.log(`created: ${stats.created}`)
    console.log(`skipped: ${stats.skipped}`)
    console.log(`previewed: ${stats.previewed}`)
    console.log(`errors: ${stats.errors}`)
    if (stats.created > 0) { const delta = stats.outputBytes - stats.sourceBytes; console.log(`source-bytes: ${stats.sourceBytes}`); console.log(`output-bytes: ${stats.outputBytes}`); console.log(`delta: ${delta > 0 ? '+' : ''}${delta}`) }
  } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1 }
}
main()
```

## 示例

```powershell
$tmp = "$env:TEMP\image-webp-convert-skill"
# 将上方脚本写入 $tmp\convert.mjs 后执行：

# 单文件转换
node "$tmp\convert.mjs" "C:\path\to\image.png"

# 批量转换目录
node "$tmp\convert.mjs" "C:\path\to\images" --recursive

# 转换后删除原图
node "$tmp\convert.mjs" "C:\path\to\images" --recursive --replace

# JPEG 高质量转换
node "$tmp\convert.mjs" "C:\path\to\photo.jpg" --quality 100

# 跳过 JPEG，只处理 PNG
node "$tmp\convert.mjs" "C:\path\to\images" --recursive --jpg-mode skip

# 转换结果比原图更大时跳过写入
node "$tmp\convert.mjs" "C:\path\to\images" --recursive --skip-larger
```

## 参数说明

| 参数 | 说明 |
|------|------|
| `<file-or-dir>` | 输入文件或目录 |
| `--recursive` | 递归处理目录 |
| `--replace` | 成功生成 `.webp` 后删除原图 |
| `--quality <1-100>` | JPEG 转 WebP 质量，默认 `100` |
| `--jpg-mode preserve|skip` | JPEG 处理模式，默认 `preserve` |
| `--output-dir <dir>` | 指定输出目录，保持相对目录结构 |
| `--skip-larger` | 当 `.webp` 比原文件更大时跳过写入 |
| `--dry-run` | 只打印计划，不实际写文件 |

## 规则

- 用户强调“不改变图片质量”时，优先使用默认参数
- PNG 走无损 WebP
- JPG/JPEG 走高质量转码，不承诺数学意义上的严格无损
- 不主动删除原图，除非明确使用 `--replace`
- 大批量处理前，优先先跑单张或 `--dry-run`

## 输出

脚本会逐文件输出：

- `CREATED`：成功生成 `.webp`
- `SKIPPED`：跳过处理
- `DRY-RUN`：仅预览
- `ERROR`：处理失败

结束时输出汇总统计。
