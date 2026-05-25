#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const SUPPORTED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.bmp', '.tiff', '.tif'])
const SUPPORTED_FORMATS = new Set(['keep', 'png', 'jpeg', 'webp'])

function printUsage() {
  console.log(`Usage:
  node slice.mjs <file-or-dir> [--tile-width <n> --tile-height <n> | --columns <n> --rows <n>] [--recursive] [--output-dir <dir>] [--prefix <name>] [--trim-empty] [--background-threshold <0-255>] [--format keep|png|jpeg|webp] [--dry-run]`)
}

function parsePositiveInteger(value, flagName) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flagName} must be a positive integer`)
  }
  return parsed
}

function parseThreshold(value) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 255) {
    throw new Error('--background-threshold must be an integer between 0 and 255')
  }
  return parsed
}

function parseArgs(argv) {
  const options = {
    inputPath: '',
    tileWidth: null,
    tileHeight: null,
    columns: null,
    rows: null,
    recursive: false,
    outputDir: '',
    prefix: '',
    trimEmpty: false,
    backgroundThreshold: 0,
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

    if (arg === '--trim-empty') {
      options.trimEmpty = true
      continue
    }

    if (arg === '--dry-run') {
      options.dryRun = true
      continue
    }

    if (arg === '--tile-width') {
      options.tileWidth = parsePositiveInteger(args.shift(), '--tile-width')
      continue
    }

    if (arg === '--tile-height') {
      options.tileHeight = parsePositiveInteger(args.shift(), '--tile-height')
      continue
    }

    if (arg === '--columns') {
      options.columns = parsePositiveInteger(args.shift(), '--columns')
      continue
    }

    if (arg === '--rows') {
      options.rows = parsePositiveInteger(args.shift(), '--rows')
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

    if (arg === '--prefix') {
      const value = args.shift()
      if (!value) {
        throw new Error('--prefix requires a name')
      }
      options.prefix = value
      continue
    }

    if (arg === '--background-threshold') {
      options.backgroundThreshold = parseThreshold(args.shift())
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

  const hasTileMode = options.tileWidth !== null || options.tileHeight !== null
  const hasGridMode = options.columns !== null || options.rows !== null

  const validTileMode = options.tileWidth !== null && options.tileHeight !== null && !hasGridMode
  const validGridMode = options.columns !== null && options.rows !== null && !hasTileMode

  if (!validTileMode && !validGridMode) {
    throw new Error('You must provide either --tile-width + --tile-height, or --columns + --rows')
  }

  options.mode = validTileMode ? 'tile' : 'grid'
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

function getSliceOutputPath(filePath, rootInputPath, outputDir, prefix, rowIndex, columnIndex, targetFormat) {
  const parsed = path.parse(filePath)
  const relativeDir = path.relative(rootInputPath, parsed.dir)
  const normalizedRelativeDir = relativeDir === '.' ? '' : relativeDir
  const baseName = prefix || parsed.name
  const fileName = `${baseName}_r${String(rowIndex).padStart(2, '0')}_c${String(columnIndex).padStart(2, '0')}${getOutputExtension(targetFormat)}`

  if (!outputDir) {
    return path.join(parsed.dir, `${parsed.name}.slices`, fileName)
  }

  return path.join(outputDir, normalizedRelativeDir, parsed.name, fileName)
}

async function ensureDirectoryForFile(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
}

async function isEffectivelyEmpty(buffer, threshold) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const channels = info.channels
  const firstRed = data[0] ?? 0
  const firstGreen = data[1] ?? 0
  const firstBlue = data[2] ?? 0
  const firstAlpha = data[3] ?? 0

  for (let index = 0; index < data.length; index += channels) {
    const red = data[index]
    const green = data[index + 1]
    const blue = data[index + 2]
    const alpha = data[index + 3]

    const alphaDiff = Math.abs(alpha - firstAlpha)
    const redDiff = Math.abs(red - firstRed)
    const greenDiff = Math.abs(green - firstGreen)
    const blueDiff = Math.abs(blue - firstBlue)

    if (alphaDiff > threshold || redDiff > threshold || greenDiff > threshold || blueDiff > threshold) {
      return false
    }
  }

  return true
}

function resolveGrid(metadata, options) {
  const imageWidth = metadata.width ?? 0
  const imageHeight = metadata.height ?? 0

  if (options.mode === 'tile') {
    if (imageWidth % options.tileWidth !== 0 || imageHeight % options.tileHeight !== 0) {
      throw new Error(`image size ${imageWidth}x${imageHeight} is not divisible by tile size ${options.tileWidth}x${options.tileHeight}`)
    }

    return {
      tileWidth: options.tileWidth,
      tileHeight: options.tileHeight,
      columns: imageWidth / options.tileWidth,
      rows: imageHeight / options.tileHeight,
    }
  }

  if (imageWidth % options.columns !== 0 || imageHeight % options.rows !== 0) {
    throw new Error(`image size ${imageWidth}x${imageHeight} is not divisible by grid ${options.columns}x${options.rows}`)
  }

  return {
    tileWidth: imageWidth / options.columns,
    tileHeight: imageHeight / options.rows,
    columns: options.columns,
    rows: options.rows,
  }
}

async function sliceFile(filePath, options, rootInputPath, stats) {
  const ext = path.extname(filePath).toLowerCase()

  if (!SUPPORTED_EXTENSIONS.has(ext)) {
    stats.skipped += 1
    console.log(`SKIPPED ${filePath} unsupported format`)
    return
  }

  const sourceBuffer = await fs.readFile(filePath)
  const sourceSize = sourceBuffer.byteLength
  const metadata = await sharp(sourceBuffer, { animated: true }).metadata()
  const { tileWidth, tileHeight, columns, rows } = resolveGrid(metadata, options)
  const targetFormat = getTargetFormat(ext, options.format)

  for (let rowIndex = 0; rowIndex < rows; rowIndex += 1) {
    for (let columnIndex = 0; columnIndex < columns; columnIndex += 1) {
      const left = columnIndex * tileWidth
      const top = rowIndex * tileHeight

      let pipeline = sharp(sourceBuffer, { animated: true }).extract({
        left,
        top,
        width: tileWidth,
        height: tileHeight,
      }).withMetadata()

      pipeline = applyFormat(pipeline, targetFormat)
      const outputBuffer = await pipeline.toBuffer()

      if (options.trimEmpty && await isEffectivelyEmpty(outputBuffer, options.backgroundThreshold)) {
        stats.skipped += 1
        console.log(`SKIPPED ${filePath} [r${rowIndex} c${columnIndex}] empty slice`)
        continue
      }

      const outputPath = getSliceOutputPath(filePath, rootInputPath, options.outputDir, options.prefix, rowIndex, columnIndex, targetFormat)

      if (options.dryRun) {
        stats.previewed += 1
        console.log(`DRY-RUN ${filePath} [r${rowIndex} c${columnIndex}] -> ${outputPath} (${formatBytes(sourceSize)} -> ${formatBytes(outputBuffer.byteLength)})`)
        continue
      }

      await ensureDirectoryForFile(outputPath)
      await fs.writeFile(outputPath, outputBuffer)
      stats.sliced += 1
      console.log(`SLICED ${filePath} [r${rowIndex} c${columnIndex}] -> ${outputPath} (${tileWidth}x${tileHeight}, ${formatBytes(outputBuffer.byteLength)})`)
    }
  }
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2))
    const absoluteInputPath = path.resolve(options.inputPath)
    const inputStat = await fs.stat(absoluteInputPath)
    const rootInputPath = inputStat.isDirectory() ? absoluteInputPath : path.dirname(absoluteInputPath)
    const files = await collectFiles(absoluteInputPath, options.recursive)

    const stats = {
      sliced: 0,
      skipped: 0,
      previewed: 0,
      errors: 0,
    }

    for (const filePath of files) {
      try {
        await sliceFile(filePath, options, rootInputPath, stats)
      } catch (error) {
        stats.errors += 1
        const message = error instanceof Error ? error.message : String(error)
        console.log(`ERROR ${filePath} ${message}`)
      }
    }

    console.log('---')
    console.log(`sliced: ${stats.sliced}`)
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
