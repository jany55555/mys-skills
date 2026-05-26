---
name: image-metadata-inspect
version: 1.0.0
description: "查看图片元信息，适用于用户提到查看图片信息、检查尺寸、看格式、看 alpha、看 EXIF、批量检查图片、metadata inspect、image info。"
argument-hint: <file-or-dir> [--recursive] [--json] [--exif] [--output <file>]
metadata:
  requires:
    bins: ["node"]
---

# image-metadata-inspect

查看图片元信息，适合在转 WebP、压缩、换皮、上传素材前做检查。

## 适用场景

- 查看单张图片的尺寸、格式、大小
- 批量检查素材目录
- 确认图片是否带透明通道
- 确认图片是否带 EXIF / ICC / XMP
- 转换前后比对图片基础属性

## 默认输出

默认逐文件输出以下字段：

- `path`
- `format`
- `width`
- `height`
- `channels`
- `hasAlpha`
- `space`
- `density`
- `fileSize`
- `animated`
- `pages`
- `hasProfile`
- `hasExif`

## 执行方式

将以下脚本内容写入临时文件，然后执行。

### 准备临时目录和依赖

```powershell
$tmp = "$env:TEMP\image-metadata-inspect-skill"
New-Item -ItemType Directory -Path $tmp -Force | Out-Null
Set-Content -Path "$tmp\package.json" -Value '{"type":"module"}' -Encoding UTF8
npm install --prefix $tmp sharp
```

### 脚本内容（写入 $tmp\inspect.mjs）

```js
#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const SUPPORTED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.bmp', '.tiff', '.tif'])

function parseArgs(argv) {
  const options = { inputPath: '', recursive: false, json: false, exif: false, output: '' }
  const args = [...argv]
  options.inputPath = args.shift() ?? ''
  while (args.length > 0) {
    const arg = args.shift()
    if (arg === '--recursive') { options.recursive = true; continue }
    if (arg === '--json') { options.json = true; continue }
    if (arg === '--exif') { options.exif = true; continue }
    if (arg === '--output') { const v = args.shift(); if (!v) throw new Error('--output requires a file path'); options.output = v; continue }
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
async function inspectFile(filePath, includeExif) {
  const ext = path.extname(filePath).toLowerCase()
  if (!SUPPORTED_EXTENSIONS.has(ext)) return { skipped: true, reason: 'unsupported format' }
  const [fileStat, metadata] = await Promise.all([fs.stat(filePath), sharp(filePath, { animated: true }).metadata()])
  return {
    skipped: false, path: filePath, format: metadata.format ?? null, width: metadata.width ?? null,
    height: metadata.height ?? null, channels: metadata.channels ?? null, hasAlpha: metadata.hasAlpha ?? false,
    space: metadata.space ?? null, density: metadata.density ?? null, fileSize: fileStat.size,
    fileSizeText: formatBytes(fileStat.size), animated: metadata.pages ? metadata.pages > 1 : false,
    pages: metadata.pages ?? 1, hasProfile: Boolean(metadata.icc), hasExif: Boolean(metadata.exif),
    exif: includeExif ? (metadata.exif ? { byteLength: metadata.exif.byteLength } : null) : undefined,
  }
}
function formatHumanReadable(item, includeExif) {
  const lines = [`path: ${item.path}`, `format: ${item.format}`, `size: ${item.width}x${item.height}`,
    `channels: ${item.channels}`, `hasAlpha: ${item.hasAlpha}`, `space: ${item.space}`,
    `density: ${item.density}`, `fileSize: ${item.fileSizeText}`, `animated: ${item.animated}`,
    `pages: ${item.pages}`, `hasProfile: ${item.hasProfile}`, `hasExif: ${item.hasExif}`]
  if (includeExif) lines.push(`exif: ${item.exif ? JSON.stringify(item.exif) : 'null'}`)
  return lines.join('\n')
}
async function main() {
  try {
    const options = parseArgs(process.argv.slice(2))
    const absoluteInputPath = path.resolve(options.inputPath)
    const files = await collectFiles(absoluteInputPath, options.recursive)
    const stats = { inspected: 0, skipped: 0, errors: 0 }
    const items = [], textBlocks = []
    for (const filePath of files) {
      try {
        const result = await inspectFile(filePath, options.exif)
        if (result.skipped) { stats.skipped += 1; if (!options.json) textBlocks.push(`SKIPPED ${filePath} ${result.reason}`); continue }
        stats.inspected += 1; items.push(result)
        if (!options.json) textBlocks.push(formatHumanReadable(result, options.exif))
      } catch (error) { stats.errors += 1; if (!options.json) textBlocks.push(`ERROR ${filePath} ${error instanceof Error ? error.message : String(error)}`) }
    }
    let output = options.json
      ? JSON.stringify({ summary: stats, items }, null, 2)
      : [...textBlocks, `---\ninspected: ${stats.inspected}\nskipped: ${stats.skipped}\nerrors: ${stats.errors}`].filter(Boolean).join('\n\n')
    if (options.output) { await fs.mkdir(path.dirname(path.resolve(options.output)), { recursive: true }); await fs.writeFile(path.resolve(options.output), output, 'utf8'); console.log(`WROTE ${path.resolve(options.output)}`); return }
    console.log(output)
  } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1 }
}
main()
```

## 示例

```powershell
$tmp = "$env:TEMP\image-metadata-inspect-skill"
# 将上方脚本写入 $tmp\inspect.mjs 后执行：

# 查看单张图片
node "$tmp\inspect.mjs" "C:\path\to\image.png"

# 批量查看目录
node "$tmp\inspect.mjs" "C:\path\to\images" --recursive

# 输出 JSON
node "$tmp\inspect.mjs" "C:\path\to\images" --recursive --json

# 输出 EXIF 摘要
node "$tmp\inspect.mjs" "C:\path\to\photo.jpg" --exif

# 写入 JSON 文件
node "$tmp\inspect.mjs" "C:\path\to\images" --recursive --json --output "C:\path\to\report.json"
```

## 参数说明

| 参数 | 说明 |
|------|------|
| `<file-or-dir>` | 输入文件或目录 |
| `--recursive` | 递归处理目录 |
| `--json` | 以结构化 JSON 输出 |
| `--exif` | 额外输出 EXIF 摘要 |
| `--output <file>` | 将结果写入文件 |

## 支持格式

脚本按扩展名筛选常见图片格式：

- `.png`
- `.jpg`
- `.jpeg`
- `.webp`
- `.gif`
- `.avif`
- `.bmp`
- `.tiff`
- `.tif`

## 规则

- 默认只读取元信息，不改文件
- 目录模式下不加 `--recursive` 时，只检查当前层
- 遇到非支持格式会跳过
- 遇到损坏文件会标记为错误并继续处理其他文件

## 输出

- 默认：人类可读文本
- `--json`：结构化 JSON
- 结束时输出汇总统计
