---
name: image-resize
version: 1.2.0
description: "按宽高缩放图片，默认使用 Tinify 云端引擎（智能裁剪+压缩）。也支持本地 sharp 引擎。适用于用户提到调整图片尺寸、缩小图片、限制最长边、批量缩放、生成缩略图、resize image、智能裁剪。"
argument-hint: <file-or-dir> --width <n> [--height <n>] [--method scale|fit|cover|thumb] [--api-key key1,...] [--recursive] [--replace] [--output-dir <dir>] [--skip-larger] [--engine local|tinify]
metadata:
  requires:
    bins: ["node"]
---

**CRITICAL — 开始前 MUST 先用 Read 工具读取 [`../image-shared/SKILL.md`](../image-shared/SKILL.md)，其中包含通用参数、安全规则和跨 skill 路由。**

# image-resize

按宽高缩放图片。**默认使用 Tinify 云端引擎**（压缩+缩放，支持 AI 智能裁剪），也支持本地 sharp 引擎。

## 引擎对比

| | tinify（默认） | local |
|---|---|---|
| 需要网络 | 是 | 否 |
| 智能裁剪 | `cover`/`thumb` 有 AI 算法 | 无 |
| API 额度 | 免费 500 次/月/key，每文件消耗 2 次 | 无限制 |
| 支持输入格式 | PNG / JPG / JPEG / WebP / AVIF | 全格式 |
| 输出格式 | 保持原格式 | 可转换格式 |
| 特殊能力 | `thumb` 自动处理纯色背景主体 | `--max-side` 限制最长边 |

## Tinify resize 方法说明

| method | 说明 | 需要参数 |
|---|---|---|
| `fit`（默认）| 等比缩小至尺寸框内，不裁剪 | width + height |
| `scale` | 按单边等比缩放 | width 或 height（二选一）|
| `cover` | 等比缩放后智能裁剪，结果严格等于目标尺寸 | width + height |
| `thumb` | cover 的进阶版，能识别纯色背景主体，自动加背景或裁剪 | width + height |

## 命令

```powershell
# ── Tinify 引擎（默认，环境变量已配置 key 时无需 --api-key）────

# fit：等比缩小至 200x200 框内
npx @jany555/image-cli resize "C:\path\to\image.png" --width 200 --height 200

# scale：按宽度缩放
npx @jany555/image-cli resize "C:\path\to\image.png" --width 400 --method scale

# cover：AI 智能裁剪到精确尺寸（生成缩略图推荐）
npx @jany555/image-cli resize "C:\path\to\image.jpg" --width 200 --height 200 --method cover

# thumb：识别主体，自动处理背景
npx @jany555/image-cli resize "C:\path\to\sticker.png" --width 200 --height 200 --method thumb

# 批量处理
npx @jany555/image-cli resize "C:\path\to\images" --recursive --width 800 --height 600 --method cover

# 批量 + 输出到指定目录
npx @jany555/image-cli resize "C:\path\to\images" --recursive --width 200 --height 200 --method cover --output-dir "C:\path\to\thumbs"

# 预览（不消耗 API 额度）
npx @jany555/image-cli resize "C:\path\to\images" --recursive --width 200 --height 200 --dry-run

# ── 本地引擎────────────────────────────────────────
npx @jany555/image-cli resize "C:\path\to\image.png" --engine local --width 750
npx @jany555/image-cli resize "C:\path\to\image.png" --engine local --max-side 1024 --without-enlargement
npx @jany555/image-cli resize "C:\path\to\images" --recursive --engine local --width 512 --format webp
```

## 参数说明

| 参数 | 说明 |
|------|------|
| `<file-or-dir>` | 输入文件或目录 |
| `--width <n>` | 目标宽度 |
| `--height <n>` | 目标高度 |
| `--method scale\|fit\|cover\|thumb` | Tinify 缩放方式，默认 `fit`（仅 tinify 引擎） |
| `--api-key <key[,key2,...]>` | Tinify API key 池，也可用 `TINIFY_API_KEYS` / `TINIFY_API_KEY` 环境变量 |
| `--engine local\|tinify` | 转换引擎，默认 `tinify` |
| `--recursive` | 递归处理目录 |
| `--replace` | 成功后删除原图 |
| `--output-dir <dir>` | 输出到指定目录，保持相对目录结构 |
| `--skip-larger` | 输出比原图更大时跳过写入 |
| `--dry-run` | 只打印计划，不实际写文件（不消耗 API 额度） |
| `--max-side <n>` | 限制最长边（仅 local 引擎） |
| `--fit inside\|outside\|fill\|contain` | sharp 缩放模式，默认 `inside`（仅 local 引擎） |
| `--without-enlargement` | 不放大更小的图片（仅 local 引擎） |
| `--format keep\|png\|jpeg\|webp` | 输出格式，默认 `keep`（仅 local 引擎） |

## 规则

- tinify 引擎默认 `fit` 方式，需提供 `--width` 和/或 `--height`
- `scale` 只能传 width 或 height 之一；`fit/cover/thumb` 必须同时传 width 和 height
- Tinify 不会放大图片（目标尺寸大于原始尺寸时保持原尺寸）
- 不主动删除原图，除非明确使用 `--replace`
- key 池耗尽所有额度时，停止处理剩余文件

## 输出

- `RESIZED`：成功输出缩放结果
- `SKIPPED`：跳过处理
- `DRY-RUN`：仅预览
- `ERROR`：处理失败
- `WARN key[N/M] quota exhausted`：当前 key 额度用完，已切换下一个

结束时输出汇总统计。Tinify 引擎额外显示本月已用压缩次数。
