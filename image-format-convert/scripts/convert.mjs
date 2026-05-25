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
  if (!value) {
    throw new Error('--flatten-bg requires a hex color')
  }

  const normalized = value.replace(/^#/, '')
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    throw new Error('--flatten-bg must be a 6-digit hex color like ffffff')
  }

  return `#${normalized.toLowerCase()}`
}

function parseArgs(argv) {
  const options = {
    inputPath: '',
    to: '',
    recursive: false,
    replace: false,
    outputDir: '',
    quality: 95,
    lossless: false,
    flattenBg: '',
    skipLarger: false,
    dryRun: false,
  }

  const args = [...argv]
  options.inputPath = args.shift() ?? ''

  while (args.length > 0) {
    const arg = args.shift()

    if (arg === '--recursive') {
      options.recursive = true
      continue
    }

    if (arg === '--replace') {
      options.replace = true
      continue
    }

    if (arg === '--lossless') {
      options.lossless = true
      continue
    }

    if (arg === '--skip-larger') {
      options.skipLarger = true
      continue
    }

    if (arg === '--dry-run') {
      options.dryRun = true
      continue
    }

    if (arg === '--to') {
      const value = args.shift()
      if (!SUPPORTED_OUTPUT_FORMATS.has(value)) {
        throw new Error('--to must be one of png, jpeg, webp, avif, bmp, tiff')
      }
      options.to = value
      continue
    }

    if (arg === '--output-dir') {
      const value = args.shift()
      if (!value) {
        throw new Error('--output-dir requires a directory path')
      }
      options.outputDir = value
      continue
    }

    if (arg === '--quality') {
      const value = parsePositiveInteger(args.shift(), '--quality')
      if (value > 100) {
        throw new Error('--quality must be between 1 and 100')
      }
      options.quality = value
      continue
    }

    if (arg === '--flatten-bg') {
      options.flattenBg = normalizeHexColor(args.shift())
      continue
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  if (!options.inputPath) {
    throw new Error('Missing <file-or-dir>')
  }

  if (!options.to) {
    throw new Error('Missing required --to <format>')
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

function getOutputExtension(format) {
  if (format === 'jpeg') {
    return '.jpg'
  }
  return `.${format}`
}

function getOutputPath(filePath, rootInputPath, outputDir, replace, targetFormat) {
  const parsed = path.parse(filePath)
  const relativeDir = path.relative(rootInputPath, parsed.dir)
  const normalizedRelativeDir = relativeDir === '.' ? '' : relativeDir
  const outputExtension = getOutputExtension(targetFormat)

  if (replace && !outputDir) {
    if (outputExtension === parsed.ext.toLowerCase()) {
      return filePath
    }
    return path.join(parsed.dir, `${parsed.name}${outputExtension}`)
  }

  if (!outputDir) {
    return path.join(parsed.dir, `${parsed.name}.converted${outputExtension}`)
  }

  return path.join(outputDir, normalizedRelativeDir, `${parsed.name}${outputExtension}`)
}

async function ensureDirectoryForFile(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
}

function applyOutputFormat(pipeline, targetFormat, options) {
  if (targetFormat === 'png') {
    return pipeline.png({ compressionLevel: 9, effort: 10 })
  }

  if (targetFormat === 'jpeg') {
    return pipeline.jpeg({ quality: options.quality, mozjpeg: true })
  }

  if (targetFormat === 'webp') {
    if (options.lossless) {
      return pipeline.webp({ lossless: true, effort: 6 })
    }
    return pipeline.webp({ quality: options.quality, effort: 6 })
  }

  if (targetFormat === 'avif') {
    if (options.lossless) {
      return pipeline.avif({ lossless: true, effort: 6 })
    }
    return pipeline.avif({ quality: options.quality, effort: 6 })
  }

  if (targetFormat === 'bmp') {
    return pipeline.bmp()
  }

  if (targetFormat === 'tiff') {
    return pipeline.tiff({ quality: options.quality, compression: options.lossless ? 'lzw' : 'jpeg' })
  }

  return pipeline
}

async function convertFile(filePath, options, rootInputPath, stats) {
  const ext = path.extname(filePath).toLowerCase()

  if (!SUPPORTED_INPUT_EXTENSIONS.has(ext)) {
    stats.skipped += 1
    console.log(`SKIPPED ${filePath} unsupported format`)
    return
  }

  const sourceBuffer = await fs.readFile(filePath)
  const sourceSize = sourceBuffer.byteLength
  const outputPath = getOutputPath(filePath, rootInputPath, options.outputDir, options.replace, options.to)

  let pipeline = sharp(sourceBuffer, { animated: true }).withMetadata()

  if (options.to === 'jpeg' || options.to === 'bmp') {
    pipeline = pipeline.flatten({ background: options.flattenBg || '#ffffff' })
  }

  pipeline = applyOutputFormat(pipeline, options.to, options)

  const outputBuffer = await pipeline.toBuffer()
  const outputSize = outputBuffer.byteLength

  if (options.skipLarger && outputSize >= sourceSize) {
    stats.skipped += 1
    console.log(`SKIPPED ${filePath} output larger (${formatBytes(sourceSize)} -> ${formatBytes(outputSize)})`)
    return
  }

  if (options.dryRun) {
    stats.previewed += 1
    console.log(`DRY-RUN ${filePath} -> ${outputPath} (${formatBytes(sourceSize)} -> ${formatBytes(outputSize)})`)
    return
  }

  await ensureDirectoryForFile(outputPath)
  await fs.writeFile(outputPath, outputBuffer)

  if (options.replace && path.resolve(outputPath) !== path.resolve(filePath)) {
    await fs.unlink(filePath)
  }

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

    const stats = {
      converted: 0,
      skipped: 0,
      previewed: 0,
      errors: 0,
    }

    for (const filePath of files) {
      try {
        await convertFile(filePath, options, rootInputPath, stats)
      } catch (error) {
        stats.errors += 1
        const message = error instanceof Error ? error.message : String(error)
        console.log(`ERROR ${filePath} ${message}`)
      }
    }

    console.log('---')
    console.log(`converted: ${stats.converted}`)
    console.log(`skipped: ${stats.skipped}`)
    console.log(`previewed: ${stats.previewed}`)
    console.log(`errors: ${stats.errors}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(message)
    printUsage()
    process.exitCode = 1
  }
}

main()
