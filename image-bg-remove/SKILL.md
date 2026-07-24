---
name: image-bg-remove
version: 1.0.0
description: "用 AI 模型去除图片背景，输出透明底 PNG。适用于照片、复杂背景、任意图片的抠图，支持人像/物体/产品图。当用户提到去背景、AI 抠图、去白底/杂色背景、remove background、bg remove 时使用。纯色底贴纸图用 image-sticker-cutout 更快。"
argument-hint: <file-or-dir> [--recursive] [--replace] [--output-dir <dir>] [--alpha-matting] [--dry-run]
metadata:
  requires:
    bins: ["python"]
    pip: ["rembg"]
---

**CRITICAL — 开始前 MUST 先用 Read 工具读取 [`../image-shared/SKILL.md`](../image-shared/SKILL.md)，其中包含通用参数、安全规则和跨 skill 路由。**

# image-bg-remove

用 AI 模型（rembg + U2Net）去除图片背景，输出透明底 PNG。支持任意背景类型，不要求纯色底。

## 选哪种模式

| 想做什么 | 参数 |
|---|---|
| 快速去背（人像、物体、产品图） | 只传文件路径，不加额外参数 |
| 毛发 / 半透明边缘精修 | 加 `--alpha-matting` |
| 批量处理整个目录 | 加 `--recursive` |
| 预览计划，不实际写文件 | 加 `--dry-run` |
| 输出到单独目录 | 加 `--output-dir <dir>` |

## 命令

```powershell
# 单张图片去背
python .claude/skills/image-bg-remove/scripts/remove_bg.py "C:\path\to\image.jpg"

# 毛发/复杂边缘（慢但准）
python .claude/skills/image-bg-remove/scripts/remove_bg.py "C:\path\to\image.jpg" --alpha-matting

# 批量处理目录
python .claude/skills/image-bg-remove/scripts/remove_bg.py "C:\path\to\images" --recursive

# 输出到指定目录
python .claude/skills/image-bg-remove/scripts/remove_bg.py "C:\path\to\images" --recursive --output-dir "C:\path\to\out"

# 预览，不写文件
python .claude/skills/image-bg-remove/scripts/remove_bg.py "C:\path\to\images" --recursive --dry-run

# 处理后替换原图（需向用户确认）
python .claude/skills/image-bg-remove/scripts/remove_bg.py "C:\path\to\image.jpg" --replace
```

## 参数说明

| 参数 | 说明 |
|---|---|
| `<file-or-dir>` | 输入文件或目录，必填 |
| `--recursive` | 递归处理目录下所有支持格式的图片 |
| `--replace` | 成功后删除原文件（不可逆，执行前必须向用户确认） |
| `--output-dir <dir>` | 输出到指定目录，保持相对子目录结构 |
| `--alpha-matting` | 启用 alpha matting 精修边缘，适合毛发/半透明场景，速度更慢 |
| `--dry-run` | 只打印计划，不实际写文件 |

## 输出

- 输出文件：同名 `_nobg.png`（透明底 PNG），例如 `photo.jpg` → `photo_nobg.png`
- `--output-dir` 时输出到指定目录，文件名规则相同
- `REMOVED`：成功去背
- `SKIPPED`：跳过（非支持格式或已有同名输出）
- `DRY-RUN`：仅预览
- `ERROR`：处理失败，附原因

结束时输出汇总统计。

## 首次运行说明

首次运行会自动下载 U2Net 模型（约 170MB），下载完成后缓存在本地，后续运行无需重新下载。

## 不在本 skill 范围

- 纯色底贴纸图 / 精灵图集 → 用 `image-sticker-cutout`（更快，不依赖 AI 模型）
- AI 生图 / 修改图片内容 → 图像生成工具
