#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const SUPPORTED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp'])

function printUsage() {
  console.log(`Usage:
  node optimize.mjs <file-or-dir> [--recursive] [--replace] [--output-dir <dir>] [--include-jpeg] [--dry-run]`)
}

function parseArgs(argv) {
  const options = {
    inputPath: '',
    recursive: false,
    replace: false,
    outputDir: '',
    includeJpeg: false,
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

    if (arg === '--include-jpeg') {
      options.includeJpeg = true
      continue
    }

    if (arg === '--dry-run') {
      options.dryRun = true
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

function getOutputPath(filePath, rootInputPath, outputDir, replace) {
  if (replace && !outputDir) {
    return filePath
  }

  const parsed = path.parse(filePath)
  const relativeDir = path.relative(rootInputPath, parsed.dir)
  const normalizedRelativeDir = relativeDir === '.' ? '' : relativeDir

  if (!outputDir) {
    return path.join(parsed.dir, `${parsed.name}.optimized${parsed.ext}`)
  }

  return path.join(outputDir, normalizedRelativeDir, `${parsed.name}${parsed.ext}`)
}

async function ensureDirectoryForFile(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
}

async function optimizeBuffer(filePath, sourceBuffer, includeJpeg) {
  const ext = path.extname(filePath).toLowerCase()

  if (ext === '.png') {
    return sharp(sourceBuffer, { animated: true }).withMetadata().png({ compressionLevel: 9, effort: 10 }).toBuffer()
  }

  if (ext === '.webp') {
    return sharp(sourceBuffer, { animated: true }).withMetadata().webp({ lossless: true, effort: 6 }).toBuffer()
  }

  if (ext === '.jpg' || ext === '.jpeg') {
    if (!includeJpeg) {
      return null
    }

    return sharp(sourceBuffer, { animated: true }).withMetadata().jpeg({ quality: 100, mozjpeg: true }).toBuffer()
  }

  return null
}

async function optimizeFile(filePath, options, rootInputPath, stats) {
  const ext = path.extname(filePath).toLowerCase()

  if (!SUPPORTED_EXTENSIONS.has(ext)) {
    stats.skipped += 1
    console.log(`SKIPPED ${filePath} unsupported format`)
    return
  }

  if ((ext === '.jpg' || ext === '.jpeg') && !options.includeJpeg) {
    stats.skipped += 1
    console.log(`SKIPPED ${filePath} jpeg disabled by default`)
    return
  }

  const sourceBuffer = await fs.readFile(filePath)
  const sourceSize = sourceBuffer.byteLength
  const optimizedBuffer = await optimizeBuffer(filePath, sourceBuffer, options.includeJpeg)

  if (!optimizedBuffer) {
    stats.skipped += 1
    console.log(`SKIPPED ${filePath} no optimizer available`)
    return
  }

  const optimizedSize = optimizedBuffer.byteLength
  if (optimizedSize >= sourceSize) {
    stats.skipped += 1
    console.log(`SKIPPED ${filePath} not smaller (${formatBytes(sourceSize)} -> ${formatBytes(optimizedSize)})`)
    return
  }

  const outputPath = getOutputPath(filePath, rootInputPath, options.outputDir, options.replace)

  if (options.dryRun) {
    stats.previewed += 1
    console.log(`DRY-RUN ${filePath} -> ${outputPath} (${formatBytes(sourceSize)} -> ${formatBytes(optimizedSize)})`)
    return
  }

  await ensureDirectoryForFile(outputPath)
  await fs.writeFile(outputPath, optimizedBuffer)

  stats.optimized += 1
  stats.sourceBytes += sourceSize
  stats.outputBytes += optimizedSize
  console.log(`OPTIMIZED ${filePath} -> ${outputPath} (${formatBytes(sourceSize)} -> ${formatBytes(optimizedSize)})`)
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2))
    const absoluteInputPath = path.resolve(options.inputPath)
    const inputStat = await fs.stat(absoluteInputPath)
    const rootInputPath = inputStat.isDirectory() ? absoluteInputPath : path.dirname(absoluteInputPath)
    const files = await collectFiles(absoluteInputPath, options.recursive)

    const stats = {
      optimized: 0,
      skipped: 0,
      previewed: 0,
      errors: 0,
      sourceBytes: 0,
      outputBytes: 0,
    }

    for (const filePath of files) {
      try {
        await optimizeFile(filePath, options, rootInputPath, stats)
      } catch (error) {
        stats.errors += 1
        const message = error instanceof Error ? error.message : String(error)
        console.log(`ERROR ${filePath} ${message}`)
      }
    }

    console.log('---')
    console.log(`optimized: ${stats.optimized}`)
    console.log(`skipped: ${stats.skipped}`)
    console.log(`previewed: ${stats.previewed}`)
    console.log(`errors: ${stats.errors}`)

    if (stats.optimized > 0) {
      const saved = stats.sourceBytes - stats.outputBytes
      console.log(`source-bytes: ${stats.sourceBytes}`)
      console.log(`output-bytes: ${stats.outputBytes}`)
      console.log(`saved-bytes: ${saved}`)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(message)
    printUsage()
    process.exitCode = 1
  }
}

main()
