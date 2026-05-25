#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const SUPPORTED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.bmp', '.tiff', '.tif'])
const SUPPORTED_FORMATS = new Set(['keep', 'png', 'jpeg', 'webp'])
const SUPPORTED_POSITIONS = new Set(['center', 'north', 'south', 'east', 'west', 'northeast', 'northwest', 'southeast', 'southwest', 'entropy', 'attention'])

function printUsage() {
  console.log(`Usage:
  node crop.mjs <file-or-dir> [--width <n> --height <n>] [--left <n> --top <n> --crop-width <n> --crop-height <n>] [--recursive] [--replace] [--output-dir <dir>] [--position center|north|south|east|west|northeast|northwest|southeast|southwest|entropy|attention] [--format keep|png|jpeg|webp] [--dry-run]`)
}

function parsePositiveInteger(value, flagName) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flagName} must be a positive integer`)
  }
  return parsed
}

function parseNonNegativeInteger(value, flagName) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${flagName} must be a non-negative integer`)
  }
  return parsed
}

function parseArgs(argv) {
  const options = {
    inputPath: '',
    width: null,
    height: null,
    left: null,
    top: null,
    cropWidth: null,
    cropHeight: null,
    recursive: false,
    replace: false,
    outputDir: '',
    position: 'center',
    format: 'keep',
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

    if (arg === '--dry-run') {
      options.dryRun = true
      continue
    }

    if (arg === '--width') {
      options.width = parsePositiveInteger(args.shift(), '--width')
      continue
    }

    if (arg === '--height') {
      options.height = parsePositiveInteger(args.shift(), '--height')
      continue
    }

    if (arg === '--left') {
      options.left = parseNonNegativeInteger(args.shift(), '--left')
      continue
    }

    if (arg === '--top') {
      options.top = parseNonNegativeInteger(args.shift(), '--top')
      continue
    }

    if (arg === '--crop-width') {
      options.cropWidth = parsePositiveInteger(args.shift(), '--crop-width')
      continue
    }

    if (arg === '--crop-height') {
      options.cropHeight = parsePositiveInteger(args.shift(), '--crop-height')
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

    if (arg === '--position') {
      const value = args.shift()
      if (!SUPPORTED_POSITIONS.has(value)) {
        throw new Error('--position is invalid')
      }
      options.position = value
      continue
    }

    if (arg === '--format') {
      const value = args.shift()
      if (!SUPPORTED_FORMATS.has(value)) {
        throw new Error('--format must be one of keep, png, jpeg, webp')
      }
      options.format = value
      continue
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  if (!options.inputPath) {
    throw new Error('Missing <file-or-dir>')
  }

  const hasSizeCrop = options.width !== null || options.height !== null
  const hasRegionCrop = options.left !== null || options.top !== null || options.cropWidth !== null || options.cropHeight !== null

  const validSizeCrop = options.width !== null && options.height !== null && !hasRegionCrop
  const validRegionCrop = options.left !== null && options.top !== null && options.cropWidth !== null && options.cropHeight !== null && !hasSizeCrop

  if (!validSizeCrop && !validRegionCrop) {
    throw new Error('You must provide either --width + --height, or --left + --top + --crop-width + --crop-height')
  }

  options.mode = validSizeCrop ? 'size' : 'region'
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

function getOriginalFormat(ext) {
  if (ext === '.jpg' || ext === '.jpeg') {
    return 'jpeg'
  }
  if (ext === '.tif' || ext === '.tiff') {
    return 'png'
  }
  return ext.slice(1)
}

function getTargetFormat(ext, requestedFormat) {
  if (requestedFormat !== 'keep') {
    return requestedFormat
  }
  const originalFormat = getOriginalFormat(ext)
  if (SUPPORTED_FORMATS.has(originalFormat)) {
    return originalFormat
  }
  return 'png'
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
    return path.join(parsed.dir, `${parsed.name}.cropped${outputExtension}`)
  }

  return path.join(outputDir, normalizedRelativeDir, `${parsed.name}${outputExtension}`)
}

async function ensureDirectoryForFile(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
}

function applyFormat(pipeline, targetFormat) {
  if (targetFormat === 'png') {
    return pipeline.png()
  }
  if (targetFormat === 'jpeg') {
    return pipeline.jpeg({ quality: 95, mozjpeg: true })
  }
  if (targetFormat === 'webp') {
    return pipeline.webp({ quality: 95 })
  }
  return pipeline
}

function buildPipeline(sourceBuffer, options) {
  let pipeline = sharp(sourceBuffer, { animated: true }).withMetadata()

  if (options.mode === 'size') {
    pipeline = pipeline.resize({
      width: options.width,
      height: options.height,
      fit: 'cover',
      position: options.position,
    })
  } else {
    pipeline = pipeline.extract({
      left: options.left,
      top: options.top,
      width: options.cropWidth,
      height: options.cropHeight,
    })
  }

  return pipeline
}

async function cropFile(filePath, options, rootInputPath, stats) {
  const ext = path.extname(filePath).toLowerCase()

  if (!SUPPORTED_EXTENSIONS.has(ext)) {
    stats.skipped += 1
    console.log(`SKIPPED ${filePath} unsupported format`)
    return
  }

  const sourceBuffer = await fs.readFile(filePath)
  const sourceSize = sourceBuffer.byteLength
  const targetFormat = getTargetFormat(ext, options.format)

  if (options.mode === 'region') {
    const metadata = await sharp(sourceBuffer, { animated: true }).metadata()
    const imageWidth = metadata.width ?? 0
    const imageHeight = metadata.height ?? 0

    if (options.left + options.cropWidth > imageWidth || options.top + options.cropHeight > imageHeight) {
      throw new Error(`crop region exceeds image bounds (${imageWidth}x${imageHeight})`)
    }
  }

  let pipeline = buildPipeline(sourceBuffer, options)
  pipeline = applyFormat(pipeline, targetFormat)

  const outputBuffer = await pipeline.toBuffer()
  const outputPath = getOutputPath(filePath, rootInputPath, options.outputDir, options.replace, targetFormat)
  const outputSize = outputBuffer.byteLength

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

    const stats = {
      cropped: 0,
      skipped: 0,
      previewed: 0,
      errors: 0,
    }

    for (const filePath of files) {
      try {
        await cropFile(filePath, options, rootInputPath, stats)
      } catch (error) {
        stats.errors += 1
        const message = error instanceof Error ? error.message : String(error)
        console.log(`ERROR ${filePath} ${message}`)
      }
    }

    console.log('---')
    console.log(`cropped: ${stats.cropped}`)
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
