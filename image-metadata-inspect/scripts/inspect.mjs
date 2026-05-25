#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const SUPPORTED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.bmp', '.tiff', '.tif'])

function printUsage() {
  console.log(`Usage:
  node inspect.mjs <file-or-dir> [--recursive] [--json] [--exif] [--output <file>]`)
}

function parseArgs(argv) {
  const options = {
    inputPath: '',
    recursive: false,
    json: false,
    exif: false,
    output: '',
  }

  const args = [...argv]
  options.inputPath = args.shift() ?? ''

  while (args.length > 0) {
    const arg = args.shift()

    if (arg === '--recursive') {
      options.recursive = true
      continue
    }

    if (arg === '--json') {
      options.json = true
      continue
    }

    if (arg === '--exif') {
      options.exif = true
      continue
    }

    if (arg === '--output') {
      const value = args.shift()
      if (!value) {
        throw new Error('--output requires a file path')
      }
      options.output = value
      continue
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  if (!options.inputPath) {
    throw new Error('Missing <file-or-dir>')
  }

  return options
}

async function collectFiles(targetPath, recursive) {
  const stat = await fs.stat(targetPath)
  if (stat.isFile()) {
    return [targetPath]
  }

  if (!stat.isDirectory()) {
    return []
  }

  const results = []
  const entries = await fs.readdir(targetPath, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = path.join(targetPath, entry.name)
    if (entry.isFile()) {
      results.push(fullPath)
      continue
    }
    if (entry.isDirectory() && recursive) {
      results.push(...await collectFiles(fullPath, true))
    }
  }

  return results
}

function formatBytes(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function summarizeExif(exifBuffer) {
  if (!exifBuffer) {
    return null
  }

  return {
    byteLength: exifBuffer.byteLength,
  }
}

async function inspectFile(filePath, includeExif) {
  const ext = path.extname(filePath).toLowerCase()
  if (!SUPPORTED_EXTENSIONS.has(ext)) {
    return { skipped: true, reason: 'unsupported format' }
  }

  const [fileStat, metadata] = await Promise.all([
    fs.stat(filePath),
    sharp(filePath, { animated: true }).metadata(),
  ])

  return {
    skipped: false,
    path: filePath,
    format: metadata.format ?? null,
    width: metadata.width ?? null,
    height: metadata.height ?? null,
    channels: metadata.channels ?? null,
    hasAlpha: metadata.hasAlpha ?? false,
    space: metadata.space ?? null,
    density: metadata.density ?? null,
    fileSize: fileStat.size,
    fileSizeText: formatBytes(fileStat.size),
    animated: metadata.pages ? metadata.pages > 1 : false,
    pages: metadata.pages ?? 1,
    hasProfile: Boolean(metadata.icc),
    hasExif: Boolean(metadata.exif),
    exif: includeExif ? summarizeExif(metadata.exif) : undefined,
  }
}

function formatHumanReadable(item, includeExif) {
  const lines = [
    `path: ${item.path}`,
    `format: ${item.format}`,
    `size: ${item.width}x${item.height}`,
    `channels: ${item.channels}`,
    `hasAlpha: ${item.hasAlpha}`,
    `space: ${item.space}`,
    `density: ${item.density}`,
    `fileSize: ${item.fileSizeText}`,
    `animated: ${item.animated}`,
    `pages: ${item.pages}`,
    `hasProfile: ${item.hasProfile}`,
    `hasExif: ${item.hasExif}`,
  ]

  if (includeExif) {
    lines.push(`exif: ${item.exif ? JSON.stringify(item.exif) : 'null'}`)
  }

  return lines.join('\n')
}

async function writeOutput(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, content, 'utf8')
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2))
    const absoluteInputPath = path.resolve(options.inputPath)
    const files = await collectFiles(absoluteInputPath, options.recursive)

    const stats = {
      inspected: 0,
      skipped: 0,
      errors: 0,
    }

    const items = []
    const textBlocks = []

    for (const filePath of files) {
      try {
        const result = await inspectFile(filePath, options.exif)
        if (result.skipped) {
          stats.skipped += 1
          if (!options.json) {
            textBlocks.push(`SKIPPED ${filePath} ${result.reason}`)
          }
          continue
        }

        stats.inspected += 1
        items.push(result)
        if (!options.json) {
          textBlocks.push(formatHumanReadable(result, options.exif))
        }
      } catch (error) {
        stats.errors += 1
        const message = error instanceof Error ? error.message : String(error)
        if (!options.json) {
          textBlocks.push(`ERROR ${filePath} ${message}`)
        }
      }
    }

    let output = ''

    if (options.json) {
      output = JSON.stringify({
        summary: stats,
        items,
      }, null, 2)
    } else {
      const summary = [
        '---',
        `inspected: ${stats.inspected}`,
        `skipped: ${stats.skipped}`,
        `errors: ${stats.errors}`,
      ].join('\n')

      output = [...textBlocks, summary].filter(Boolean).join('\n\n')
    }

    if (options.output) {
      const outputPath = path.resolve(options.output)
      await writeOutput(outputPath, output)
      console.log(`WROTE ${outputPath}`)
      return
    }

    console.log(output)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(message)
    printUsage()
    process.exitCode = 1
  }
}

main()
