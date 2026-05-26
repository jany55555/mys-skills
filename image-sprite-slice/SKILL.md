---
name: image-sprite-slice
version: 1.1.0
description: "按精灵图网格或指定切片尺寸拆分 sprite sheet，适用于用户提到切雪碧图、切图集、切 spritesheet、切序列帧、sprite slice。"
argument-hint: <file-or-dir> [--tile-width <n> --tile-height <n> | --columns <n> --rows <n>] [--recursive] [--output-dir <dir>] [--prefix <name>] [--trim-empty] [--background-threshold <0-255>] [--format keep|png|jpeg|webp]
metadata:
  requires:
    bins: ["node"]
---

# image-sprite-slice

按精灵图网格或指定切片尺寸拆分 sprite sheet。

## 适用场景

- 按固定格子切雪碧图
- 把角色动作图集拆成单帧
- 批量切分多张 sprite sheet
- 过滤掉空白切片

## 默认行为

- 支持输入：`.png`、`.jpg`、`.jpeg`、`.webp`、`.gif`、`.avif`、`.bmp`、`.tiff`、`.tif`
- 支持两种切分模式：
  - 指定切片尺寸：`--tile-width` + `--tile-height`
  - 指定网格数量：`--columns` + `--rows`
- 默认保留空白切片
- 默认保持原格式 `keep`

## 命令

```powershell
# 按切片尺寸拆分
npx @jany555/image-cli slice "C:\path\to\sheet.png" --tile-width 128 --tile-height 128

# 按行列数拆分
npx @jany555/image-cli slice "C:\path\to\sheet.png" --columns 6 --rows 4

# 批量处理目录
npx @jany555/image-cli slice "C:\path\to\sheets" --recursive --tile-width 64 --tile-height 64

# 跳过空白切片
npx @jany555/image-cli slice "C:\path\to\sheet.png" --columns 8 --rows 8 --trim-empty

# 输出到指定目录并指定前缀
npx @jany555/image-cli slice "C:\path\to\sheet.png" --tile-width 64 --tile-height 64 --output-dir "C:\path\to\out" --prefix hero

# 转成指定格式
npx @jany555/image-cli slice "C:\path\to\sheet.png" --columns 4 --rows 4 --format png
```

## 参数说明

| 参数 | 说明 |
|------|------|
| `<file-or-dir>` | 输入文件或目录 |
| `--tile-width <n>` | 单个切片宽度 |
| `--tile-height <n>` | 单个切片高度 |
| `--columns <n>` | 网格列数 |
| `--rows <n>` | 网格行数 |
| `--recursive` | 递归处理目录 |
| `--output-dir <dir>` | 输出到指定目录，保持相对目录结构 |
| `--prefix <name>` | 输出文件名前缀，默认使用原文件名 |
| `--trim-empty` | 跳过近似空白切片 |
| `--background-threshold <0-255>` | 判定空白切片时的阈值，默认 `0` |
| `--format keep\|png\|jpeg\|webp` | 输出格式，默认 `keep` |
| `--dry-run` | 只打印计划，不实际写文件 |

## 规则

- 必须二选一：`--tile-width` + `--tile-height`，或 `--columns` + `--rows`
- 图像宽高必须能被对应网格整除
- 只负责切片，不负责拼图

## 输出

- `SLICED`：成功输出切片
- `SKIPPED`：跳过处理
- `DRY-RUN`：仅预览
- `ERROR`：处理失败

结束时输出汇总统计。
