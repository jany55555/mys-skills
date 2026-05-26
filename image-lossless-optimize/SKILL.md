---
name: image-lossless-optimize
version: 1.0.0
description: "对 PNG/JPG/JPEG/WebP 做尽量无视觉损失的图片优化，保留尺寸与主要视觉效果。适用于用户提到无损压缩、图片瘦身、优化图片大小、保真压缩、lossless optimize。"
argument-hint: <file-or-dir> [--recursive] [--replace] [--output-dir <dir>] [--include-jpeg] [--dry-run]
metadata:
  requires:
    bins: ["node"]
---

# image-lossless-optimize

对图片做尽量无视觉损失的优化，保留宽高、透明通道和主要视觉效果。

## 适用场景

- 想减小图片体积，但不想改尺寸
- 优化 PNG / WebP 素材
- 在上传 CDN 前先做资源瘦身
- 批量检查哪些图片可以安全变小

## 默认行为

- 支持输入：`.png`、`.jpg`、`.jpeg`、`.webp`
- PNG：无损重编码优化
- WebP：无损重编码优化
- JPEG：默认跳过，避免二次有损重编码
- 只有当输出文件更小时才写入
- 不缩放、不裁剪、不改尺寸
- 默认保留原图，只写优化结果

## 执行方式

将以下脚本内容写入临时文件，然后执行。

### 准备临时目录和依赖

```powershell
$tmp = "$env:TEMP\image-lossless-optimize-skill"
New-Item -ItemType Directory -Path $tmp -Force | Out-Null
Set-Content -Path "$tmp\package.json" -Value '{"type":"module"}' -Encoding UTF8
npm install --prefix $tmp sharp
```

### 脚本内容（写入 $tmp\optimize.mjs）

```js
#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const SUPPORTED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp'])

function parseArgs(argv) {
  const options = { inputPath: '', recursive: false, replace: false, outputDir: '', includeJpeg: false, dryRun: false }
  const args = [...argv]
  options.inputPath = args.shift() ?? ''
  while (args.length > 0) {
    const arg = args.shift()
    if (arg === '--recursive') { options.recursive = true; continue }
    if (arg === '--replace') { options.replace = true; continue }
    if (arg === '--include-jpeg') { options.includeJpeg = true; continue }
    if (arg === '--dry-run') { options.dryRun = true; continue }
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
function getOutputPath(filePath, rootInputPath, outputDir, replace) {
  if (replace && !outputDir) return filePath
  const parsed = path.parse(filePath)
  const relativeDir = path.relative(rootInputPath, parsed.dir)
  const normalizedRelativeDir = relativeDir === '.' ? '' : relativeDir
  if (!outputDir) return path.join(parsed.dir, `${parsed.name}.optimized${parsed.ext}`)
  return path.join(outputDir, normalizedRelativeDir, `${parsed.name}${parsed.ext}`)
}
async function optimizeBuffer(filePath, sourceBuffer, includeJpeg) {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.png') return sharp(sourceBuffer, { animated: true }).withMetadata().png({ compressionLevel: 9, effort: 10 }).toBuffer()
  if (ext === '.webp') return sharp(sourceBuffer, { animated: true }).withMetadata().webp({ lossless: true, effort: 6 }).toBuffer()
  if ((ext === '.jpg' || ext === '.jpeg') && includeJpeg) return sharp(sourceBuffer, { animated: true }).withMetadata().jpeg({ quality: 100, mozjpeg: true }).toBuffer()
  return null
}
async function optimizeFile(filePath, options, rootInputPath, stats) {
  const ext = path.extname(filePath).toLowerCase()
  if (!SUPPORTED_EXTENSIONS.has(ext)) { stats.skipped += 1; console.log(`SKIPPED ${filePath} unsupported format`); return }
  if ((ext === '.jpg' || ext === '.jpeg') && !options.includeJpeg) { stats.skipped += 1; console.log(`SKIPPED ${filePath} jpeg disabled by default`); return }
  const sourceBuffer = await fs.readFile(filePath)
  const sourceSize = sourceBuffer.byteLength
  const optimizedBuffer = await optimizeBuffer(filePath, sourceBuffer, options.includeJpeg)
  if (!optimizedBuffer) { stats.skipped += 1; console.log(`SKIPPED ${filePath} no optimizer available`); return }
  const optimizedSize = optimizedBuffer.byteLength
  if (optimizedSize >= sourceSize) { stats.skipped += 1; console.log(`SKIPPED ${filePath} not smaller (${formatBytes(sourceSize)} -> ${formatBytes(optimizedSize)})`); return }
  const outputPath = getOutputPath(filePath, rootInputPath, options.outputDir, options.replace)
  if (options.dryRun) { stats.previewed += 1; console.log(`DRY-RUN ${filePath} -> ${outputPath} (${formatBytes(sourceSize)} -> ${formatBytes(optimizedSize)})`); return }
  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  await fs.writeFile(outputPath, optimizedBuffer)
  stats.optimized += 1; stats.sourceBytes += sourceSize; stats.outputBytes += optimizedSize
  console.log(`OPTIMIZED ${filePath} -> ${outputPath} (${formatBytes(sourceSize)} -> ${formatBytes(optimizedSize)})`)
}
async function main() {
  try {
    const options = parseArgs(process.argv.slice(2))
    const absoluteInputPath = path.resolve(options.inputPath)
    const inputStat = await fs.stat(absoluteInputPath)
    const rootInputPath = inputStat.isDirectory() ? absoluteInputPath : path.dirname(absoluteInputPath)
    const files = await collectFiles(absoluteInputPath, options.recursive)
    const stats = { optimized: 0, skipped: 0, previewed: 0, errors: 0, sourceBytes: 0, outputBytes: 0 }
    for (const filePath of files) {
      try { await optimizeFile(filePath, options, rootInputPath, stats) }
      catch (error) { stats.errors += 1; console.log(`ERROR ${filePath} ${error instanceof Error ? error.message : String(error)}`) }
    }
    console.log('---')
    console.log(`optimized: ${stats.optimized}`)
    console.log(`skipped: ${stats.skipped}`)
    console.log(`previewed: ${stats.previewed}`)
    console.log(`errors: ${stats.errors}`)
    if (stats.optimized > 0) { console.log(`source-bytes: ${stats.sourceBytes}`); console.log(`output-bytes: ${stats.outputBytes}`); console.log(`saved-bytes: ${stats.sourceBytes - stats.outputBytes}`) }
  } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1 }
}
main()
```

## 示例

```powershell
$tmp = "$env:TEMP\image-lossless-optimize-skill"
# 将上方脚本写入 $tmp\optimize.mjs 后执行：

# 优化单张图片
node "$tmp\optimize.mjs" "C:\path\to\image.png"

# 批量优化目录
node "$tmp\optimize.mjs" "C:\path\to\images" --recursive

# 优化后覆盖原图
node "$tmp\optimize.mjs" "C:\path\to\images" --recursive --replace

# 包含 JPEG
node "$tmp\optimize.mjs" "C:\path\to\photos" --recursive --include-jpeg

# 只预览结果
node "$tmp\optimize.mjs" "C:\path\to\images" --recursive --dry-run
```

## 参数说明

| 参数 | 说明 |
|------|------|
| `<file-or-dir>` | 输入文件或目录 |
| `--recursive` | 递归处理目录 |
| `--replace` | 成功优化后覆盖原文件 |
| `--output-dir <dir>` | 输出到指定目录，保持相对目录结构 |
| `--include-jpeg` | 允许处理 JPEG |
| `--dry-run` | 只打印计划，不实际写文件 |

## 规则

- 默认安全优先：JPEG 不处理
- 只有输出更小时才落盘
- `--replace` 只在成功生成更小结果后生效
- 大批量处理前，优先用 `--dry-run`

## 输出

脚本会逐文件输出：

- `OPTIMIZED`：成功生成更小文件
- `SKIPPED`：跳过处理
- `DRY-RUN`：仅预览
- `ERROR`：处理失败

结束时输出汇总统计和节省字节数。
