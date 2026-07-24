---
name: image-sticker-cutout
version: 1.0.0
description: 去纯色背景并按连通域自动拆分贴纸图，适用于黑底贴纸墙、角色表、精灵贴纸、sticker cutout、去黑底、自动拆单图。
argument-hint: <image-path> [--threshold 24] [--split] [--no-split] [--min-area 400] [--feather 1]
---

**CRITICAL — 开始前 MUST 先用 Read 工具读取 [`../image-shared/SKILL.md`](../image-shared/SKILL.md)，其中包含通用参数、安全规则和跨 skill 路由。**

# Sticker Cutout

处理纯底色贴纸图：将连通到画面边缘的纯色背景变透明，并可按连通域自动拆分为多个独立 PNG。

支持黑底、白底、任意纯色底。这类图优先用传统图像处理，不走通用 AI 抠图模型。

## 选哪种模式

| 想做什么 | 参数 |
|---|---|
| 黑底图去背（默认） | 不传 `--bg-color` |
| 白底图去背 | `--bg-color white` |
| 自动检测背景色（采样四角） | `--bg-color auto` |
| 指定任意 RGB 背景色 | `--bg-color R,G,B`（如 `0,128,0`） |
| 只要整张透明图，不拆单图 | `--no-split` |
| 过滤掉空白切片 | `--trim-empty` |
| 边缘不干净、有杂色 | 调大 `--threshold`（PNG 用 `8~16`，JPEG 用 `16~30`） |

## 适用场景

- 黑底/纯色底的贴纸墙
- 多个角色排布在一张大图上
- 主体边缘清晰，不互相重叠
- 需要透明底 PNG 或自动切成单个素材

这类图优先用传统图像处理，不走通用 AI 抠图模型。

## 快速使用

```bash
# 黑底图（默认行为）
python .claude/skills/image-sticker-cutout/scripts/cutout.py <image-path>

# 白底图
python .claude/skills/image-sticker-cutout/scripts/cutout.py <image-path> --bg-color white

# 自动检测背景色（采样四角）
python .claude/skills/image-sticker-cutout/scripts/cutout.py <image-path> --bg-color auto

# 指定任意 RGB 背景色
python .claude/skills/image-sticker-cutout/scripts/cutout.py <image-path> --bg-color 0,128,0
```

默认行为：

- 输出一张透明底总图
- 自动按连通域拆出多个单图
- 输出到原图同级目录下的 `<文件名>_cutout/`

## 常用参数

```bash
python .claude/skills/image-sticker-cutout/scripts/cutout.py <image-path> \
  --threshold 24 \
  --min-area 400 \
  --feather 1
```

| 参数 | 说明 |
|---|---|
| `--bg-color` | 背景色：`auto`（自动检测）、`white`、`black`、或 `R,G,B`（如 `255,255,255`）。不传则默认黑底模式 |
| `--threshold` | 背景色容差阈值，默认 `24` |
| `--split` | 强制拆分单图（默认开启） |
| `--no-split` | 只输出透明总图，不拆单图 |
| `--min-area` | 忽略小连通域，默认 `400` |
| `--feather` | 边缘轻微羽化像素，默认 `1` |
| `--pad` | 单图导出时四周留白，默认 `8` |
| `--merge-gap` | 小配件并入附近主贴纸的最大距离，默认 `120` |
| `--accessory-max-area` | 视为配件的小连通域面积上限，默认 `5000` |

## 输出内容

输出目录：`<原图目录>/<文件名>_cutout/`

- `sheet.png`：透明底整张图
- `preview.png`：棋盘格预览图
- `stickers/sticker-01.png ...`：拆分后的单图
- `manifest.json`：每个连通域的边界框和面积

## 原理

1. 识别近黑像素
2. 从图像四边做 flood fill，只移除与边缘连通的背景
3. 保留主体内部的深色区域
4. 生成 alpha mask 并轻微柔化边缘
5. 对前景做连通域分析并导出单图

## 阈值建议

- PNG 干净底图：`8 ~ 16`
- JPEG 黑底图：`16 ~ 30`
- JPEG 白底图：`12 ~ 20`（白底 JPEG 压缩噪点通常比黑底小）
- 先用低阈值，避免吃掉主体描边

## 注意事项

- 该 skill 适合纯底色贴纸图，不适合复杂场景照片
- 如果主体互相接触，连通域会被视为一个整体
- `--bg-color auto` 通过采样四角均值自动判断背景色，适合大多数纯色底图
- 不传 `--bg-color` 时保持原有黑底模式，向后兼容

## 不在本 skill 范围

- 复杂背景 / 照片抠图（背景非纯色）→ 使用 `image-bg-remove`
- 精灵图切片（不是去背，是按网格切分）→ 使用 `image-sprite-slice`
