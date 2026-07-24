---
name: image-shared
version: 1.0.0
description: "image-* 系列 skill 的公共规则、工具约定和跨 skill 路由。不直接调用，由各 image-* skill 引用。"
---

# image-shared

本文件是 `image-*` 系列 skill 的公共基础。所有 image skill 在开始前 **MUST** 先读取本文件。

---

## 工具约定

所有 image-* skill 统一使用同一个 CLI 工具：

```powershell
npx @jany555/image-cli <subcommand> <file-or-dir> [options]
```

- 运行时不需要全局安装，`npx` 即可
- Windows 路径用双引号包裹，避免空格和中文路径问题
- 子命令：`webp` / `convert` / `resize` / `crop` / `slice` / `optimize` / `inspect`

---

## 通用参数（多数子命令共用）

| 参数 | 说明 |
|---|---|
| `<file-or-dir>` | 输入文件或目录，必填 |
| `--recursive` | 递归处理目录下所有支持格式的图片 |
| `--replace` | 成功后覆盖 / 删除原文件（不可逆，需向用户确认） |
| `--output-dir <dir>` | 输出到指定目录，保持相对子目录结构 |
| `--dry-run` | 只打印计划，不实际写文件 |

---

## 支持的输入格式

`.png` `.jpg` `.jpeg` `.webp` `.gif` `.avif` `.bmp` `.tiff` `.tif`

> `image-webp-convert` 和 `image-lossless-optimize` 的支持范围更窄，以各自 skill 说明为准。

---

## 安全规则

- `--replace` 会覆盖或删除原文件，**不可逆**。执行前必须向用户确认，确认后再运行。
- 大批量处理前，优先建议先跑单张或加 `--dry-run` 预览，再正式执行。
- 遇到 `ERROR` 状态：向用户报告失败文件路径和错误原因，不要静默跳过。

---

## 通用输出状态

| 状态 | 含义 |
|---|---|
| `CREATED` / `CONVERTED` / `RESIZED` / `CROPPED` / `SLICED` / `OPTIMIZED` | 成功，各 skill 有各自的成功状态词 |
| `SKIPPED` | 跳过（非支持格式、输出更大时跳过、或已有同名输出） |
| `DRY-RUN` | 仅预览，未写文件 |
| `ERROR` | 处理失败，附原因 |

命令结束时输出汇总统计（处理数 / 跳过数 / 失败数）。

---

## 选哪个 skill

| 想做什么 | 用哪个 skill |
|---|---|
| 查看图片尺寸、格式、是否有透明通道 | `image-metadata-inspect` |
| 缩放图片（改尺寸，保比例） | `image-resize` |
| 裁剪图片（固定尺寸或按区域抠图） | `image-crop` |
| 转换图片格式（png→jpg、jpg→avif 等） | `image-format-convert` |
| 专门转成 WebP（保真优先） | `image-webp-convert` |
| 无损压缩 / 瘦身（不改尺寸和格式） | `image-lossless-optimize` |
| 切雪碧图 / sprite sheet | `image-sprite-slice` |
| 只是格式转换但用户特别说"转 webp" | `image-webp-convert`（默认保真，比 format-convert 更省心） |
| 纯色底贴纸 / 精灵图集去背 + 自动拆单图 | `image-sticker-cutout` |
| 照片或复杂背景 AI 去背（任意图片） | `image-bg-remove` |

**不在 image-* 范围：**
- 纯色底贴纸 / 精灵图集去背 + 自动拆单图 → `image-sticker-cutout`
- 照片或复杂背景 AI 去背（任意图片） → `image-bg-remove`
- AI 生图 / 编辑图片内容 → 图像生成工具
