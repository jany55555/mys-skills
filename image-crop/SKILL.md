---
name: image-crop
version: 1.0.0
description: "按目标尺寸或指定矩形裁剪图片，适用于用户提到裁剪图片、居中裁剪、按区域裁图、批量裁剪、crop image。"
argument-hint: <file-or-dir> [--width <n> --height <n>] [--left <n> --top <n> --crop-width <n> --crop-height <n>] [--recursive] [--replace] [--output-dir <dir>] [--position center|north|south|east|west|northeast|northwest|southeast|southwest|entropy|attention] [--format keep|png|jpeg|webp]
metadata:
  requires:
    bins: ["node"]
---

# image-crop

按目标尺寸或指定矩形裁剪图片。

## 适用场景

- 按目标宽高做封面裁剪
- 做居中裁剪
- 按指定区域裁图
- 批量生成统一尺寸素材

## 默认行为

- 支持输入：`.png`、`.jpg`、`.jpeg`、`.webp`、`.gif`、`.avif`、`.bmp`、`.tiff`、`.tif`
- 支持两种模式：
  - 尺寸裁剪：`--width` + `--height`
  - 区域裁剪：`--left` + `--top` + `--crop-width` + `--crop-height`
- 默认保持原格式 `keep`
- 默认不覆盖原图

## 首次使用

先安装依赖：

```powershell
npm install --prefix "C:\Users\huanglinhuan\.claude\skills\image-crop"
```

## 命令

### 居中裁剪到指定尺寸

```powershell
node "C:\Users\huanglinhuan\.claude\skills\image-crop\scripts\crop.mjs" "C:\path\to\image.png" --width 750 --height 750
```

### 顶部裁剪

```powershell
node "C:\Users\huanglinhuan\.claude\skills\image-crop\scripts\crop.mjs" "C:\path\to\image.png" --width 750 --height 1334 --position north
```

### 按矩形区域裁剪

```powershell
node "C:\Users\huanglinhuan\.claude\skills\image-crop\scripts\crop.mjs" "C:\path\to\image.png" --left 100 --top 50 --crop-width 400 --crop-height 300
```

### 批量裁剪目录

```powershell
node "C:\Users\huanglinhuan\.claude\skills\image-crop\scripts\crop.mjs" "C:\path\to\images" --recursive --width 512 --height 512
```

### 输出到指定目录

```powershell
node "C:\Users\huanglinhuan\.claude\skills\image-crop\scripts\crop.mjs" "C:\path\to\images" --recursive --width 512 --height 512 --output-dir "C:\path\to\out"
```

### 转成指定格式

```powershell
node "C:\Users\huanglinhuan\.claude\skills\image-crop\scripts\crop.mjs" "C:\path\to\image.png" --width 512 --height 512 --format webp
```

### 覆盖原图

```powershell
node "C:\Users\huanglinhuan\.claude\skills\image-crop\scripts\crop.mjs" "C:\path\to\images" --recursive --width 512 --height 512 --replace
```

## 参数说明

| 参数 | 说明 |
|------|------|
| `<file-or-dir>` | 输入文件或目录 |
| `--width <n>` | 目标裁剪宽度 |
| `--height <n>` | 目标裁剪高度 |
| `--left <n>` | 矩形裁剪起点 X |
| `--top <n>` | 矩形裁剪起点 Y |
| `--crop-width <n>` | 矩形裁剪宽度 |
| `--crop-height <n>` | 矩形裁剪高度 |
| `--recursive` | 递归处理目录 |
| `--replace` | 成功后替换原图；若同时改格式，则写入新扩展名并删除原文件 |
| `--output-dir <dir>` | 输出到指定目录，保持相对目录结构 |
| `--position ...` | 尺寸裁剪时的重力位置，默认 `center` |
| `--format keep|png|jpeg|webp` | 输出格式，默认 `keep` |
| `--dry-run` | 只打印计划，不实际写文件 |

## 规则

- 必须二选一：
  - `--width` + `--height`
  - `--left` + `--top` + `--crop-width` + `--crop-height`
- 不允许两种裁剪模式混用
- `image-crop` 负责裁剪，不负责普通缩放
- 只想缩放不裁剪时，应使用 `image-resize`

## 输出

脚本会逐文件输出：

- `CROPPED`：成功输出裁剪结果
- `SKIPPED`：跳过处理
- `DRY-RUN`：仅预览
- `ERROR`：处理失败

结束时输出汇总统计。
