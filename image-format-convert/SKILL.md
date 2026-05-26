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

## 命令

```powershell
# PNG 转 JPEG
npx jany-image-cli convert "C:\path\to\image.png" --to jpeg

# JPEG 转 WebP
npx jany-image-cli convert "C:\path\to\image.jpg" --to webp --quality 95

# PNG 无损转 WebP
npx jany-image-cli convert "C:\path\to\image.png" --to webp --lossless

# 批量转格式
npx jany-image-cli convert "C:\path\to\images" --recursive --to webp

# 输出更大时跳过
npx jany-image-cli convert "C:\path\to\images" --recursive --to avif --skip-larger

# 透明图转 JPEG 并铺底色
npx jany-image-cli convert "C:\path\to\image.png" --to jpeg --flatten-bg ffffff
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

- `CONVERTED`：成功输出转换结果
- `SKIPPED`：跳过处理
- `DRY-RUN`：仅预览
- `ERROR`：处理失败

结束时输出汇总统计。
