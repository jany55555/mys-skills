---
name: image-lossless-optimize
version: 1.1.0
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

## 默认行为

- 支持输入：`.png`、`.jpg`、`.jpeg`、`.webp`
- PNG：无损重编码优化
- WebP：无损重编码优化
- JPEG：默认跳过，避免二次有损重编码
- 只有当输出文件更小时才写入

## 命令

```powershell
# 优化单张图片
npx @jany555/image-cli optimize "C:\path\to\image.png"

# 批量优化目录
npx @jany555/image-cli optimize "C:\path\to\images" --recursive

# 优化后覆盖原图
npx @jany555/image-cli optimize "C:\path\to\images" --recursive --replace

# 包含 JPEG
npx @jany555/image-cli optimize "C:\path\to\photos" --recursive --include-jpeg

# 只预览结果
npx @jany555/image-cli optimize "C:\path\to\images" --recursive --dry-run
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
- 大批量处理前，优先用 `--dry-run`

## 输出

- `OPTIMIZED`：成功生成更小文件
- `SKIPPED`：跳过处理
- `DRY-RUN`：仅预览
- `ERROR`：处理失败

结束时输出汇总统计和节省字节数。
