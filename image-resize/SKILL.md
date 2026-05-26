---
name: image-resize
version: 1.1.0
description: "按宽高或最长边缩放图片，适用于用户提到调整图片尺寸、缩小图片、放大图片、限制最长边、批量缩放、resize image。"
argument-hint: <file-or-dir> [--width <n>] [--height <n>] [--max-side <n>] [--recursive] [--replace] [--output-dir <dir>] [--fit inside|outside|fill|contain] [--without-enlargement] [--format keep|png|jpeg|webp]
metadata:
  requires:
    bins: ["node"]
---

# image-resize

按宽高或最长边缩放图片，不负责裁剪。

## 适用场景

- 把图片缩小到指定宽度或高度
- 限制最长边
- 批量生成较小尺寸的素材

## 默认行为

- 支持输入：`.png`、`.jpg`、`.jpeg`、`.webp`、`.gif`、`.avif`、`.bmp`、`.tiff`、`.tif`
- 不裁剪，只缩放
- 默认保持原格式 `keep`
- 默认不覆盖原图

## 命令

```powershell
# 按宽度缩放
npx jany-image-cli resize "C:\path\to\image.png" --width 750

# 按高度缩放
npx jany-image-cli resize "C:\path\to\image.png" --height 1334

# 限制最长边
npx jany-image-cli resize "C:\path\to\images" --recursive --max-side 1024 --without-enlargement

# 指定输出目录
npx jany-image-cli resize "C:\path\to\images" --recursive --width 512 --output-dir "C:\path\to\out"

# 转成指定格式
npx jany-image-cli resize "C:\path\to\image.png" --width 750 --format webp

# 覆盖原图
npx jany-image-cli resize "C:\path\to\images" --recursive --max-side 1024 --replace
```

## 参数说明

| 参数 | 说明 |
|------|------|
| `<file-or-dir>` | 输入文件或目录 |
| `--width <n>` | 目标宽度 |
| `--height <n>` | 目标高度 |
| `--max-side <n>` | 限制最长边 |
| `--recursive` | 递归处理目录 |
| `--replace` | 成功后替换原图 |
| `--output-dir <dir>` | 输出到指定目录，保持相对目录结构 |
| `--fit inside\|outside\|fill\|contain` | 缩放模式，默认 `inside` |
| `--without-enlargement` | 不放大原本更小的图片 |
| `--format keep\|png\|jpeg\|webp` | 输出格式，默认 `keep` |
| `--dry-run` | 只打印计划，不实际写文件 |

## 规则

- 必须至少提供 `--width`、`--height`、`--max-side` 之一
- 只负责缩放，不做裁剪
- 批量处理前优先先跑单张或 `--dry-run`

## 输出

- `RESIZED`：成功输出缩放结果
- `SKIPPED`：跳过处理
- `DRY-RUN`：仅预览
- `ERROR`：处理失败

结束时输出汇总统计。
