---
name: image-webp-convert
version: 1.0.0
description: "将 PNG/JPG/JPEG 批量转换为 WebP，默认保真优先。适用于用户提到转 webp、批量转 webp、图片转 webp、png 转 webp、jpg 转 webp、保真转换、无损 webp。"
argument-hint: <file-or-dir> [--recursive] [--replace] [--quality 100] [--jpg-mode preserve|skip] [--output-dir <dir>] [--skip-larger]
metadata:
  requires:
    bins: ["node"]
---

# image-webp-convert

将图片转换为 WebP，默认保真优先。

## 适用场景

- 单张图片转 WebP
- 批量目录转 WebP
- PNG 无损转 WebP
- JPG/JPEG 高质量转 WebP
- 批量整理游戏图片资源为 `.webp`

## 默认行为

- 支持输入：`.png`、`.jpg`、`.jpeg`
- PNG 默认输出为无损 WebP
- JPG/JPEG 默认输出为高质量 WebP
- 不缩放、不裁剪、不改尺寸
- 默认保留原图，只新增 `.webp`
- 已经是 `.webp` 的文件会跳过

## 首次使用

先安装依赖：

```powershell
npm install --prefix "C:\Users\huanglinhuan\.claude\skills\image-webp-convert"
```

## 命令

### 单文件转换

```powershell
node "C:\Users\huanglinhuan\.claude\skills\image-webp-convert\scripts\convert.mjs" "C:\path\to\image.png"
```

### 批量转换目录

```powershell
node "C:\Users\huanglinhuan\.claude\skills\image-webp-convert\scripts\convert.mjs" "C:\path\to\images" --recursive
```

### 转换后删除原图

```powershell
node "C:\Users\huanglinhuan\.claude\skills\image-webp-convert\scripts\convert.mjs" "C:\path\to\images" --recursive --replace
```

### JPEG 高质量转换

```powershell
node "C:\Users\huanglinhuan\.claude\skills\image-webp-convert\scripts\convert.mjs" "C:\path\to\photo.jpg" --quality 100
```

### 跳过 JPEG，只处理 PNG

```powershell
node "C:\Users\huanglinhuan\.claude\skills\image-webp-convert\scripts\convert.mjs" "C:\path\to\images" --recursive --jpg-mode skip
```

### 转换结果比原图更大时跳过写入

```powershell
node "C:\Users\huanglinhuan\.claude\skills\image-webp-convert\scripts\convert.mjs" "C:\path\to\images" --recursive --skip-larger
```

## 参数说明

| 参数 | 说明 |
|------|------|
| `<file-or-dir>` | 输入文件或目录 |
| `--recursive` | 递归处理目录 |
| `--replace` | 成功生成 `.webp` 后删除原图 |
| `--quality <1-100>` | JPEG 转 WebP 质量，默认 `100` |
| `--jpg-mode preserve|skip` | JPEG 处理模式，默认 `preserve` |
| `--output-dir <dir>` | 指定输出目录，保持相对目录结构 |
| `--skip-larger` | 当 `.webp` 比原文件更大时跳过写入 |
| `--dry-run` | 只打印计划，不实际写文件 |

## 规则

- 用户强调“不改变图片质量”时，优先使用默认参数
- PNG 走无损 WebP
- JPG/JPEG 走高质量转码，不承诺数学意义上的严格无损
- 不主动删除原图，除非明确使用 `--replace`
- 大批量处理前，优先先跑单张或 `--dry-run`

## 输出

脚本会逐文件输出：

- `CREATED`：成功生成 `.webp`
- `SKIPPED`：跳过处理
- `DRY-RUN`：仅预览
- `ERROR`：处理失败

结束时输出汇总统计。
