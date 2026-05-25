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

## 首次使用

先安装依赖：

```powershell
npm install --prefix "C:\Users\huanglinhuan\.claude\skills\image-metadata-inspect"
```

## 命令

### 查看单张图片

```powershell
node "C:\Users\huanglinhuan\.claude\skills\image-metadata-inspect\scripts\inspect.mjs" "C:\path\to\image.png"
```

### 批量查看目录

```powershell
node "C:\Users\huanglinhuan\.claude\skills\image-metadata-inspect\scripts\inspect.mjs" "C:\path\to\images" --recursive
```

### 输出 JSON

```powershell
node "C:\Users\huanglinhuan\.claude\skills\image-metadata-inspect\scripts\inspect.mjs" "C:\path\to\images" --recursive --json
```

### 输出 EXIF 摘要

```powershell
node "C:\Users\huanglinhuan\.claude\skills\image-metadata-inspect\scripts\inspect.mjs" "C:\path\to\photo.jpg" --exif
```

### 写入 JSON 文件

```powershell
node "C:\Users\huanglinhuan\.claude\skills\image-metadata-inspect\scripts\inspect.mjs" "C:\path\to\images" --recursive --json --output "C:\path\to\report.json"
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
