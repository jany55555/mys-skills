---
name: audio-convert
version: 1.0.0
description: "音频格式转换：将 MP3/WAV/AAC/FLAC/OGG 等音频批量转换为 OGG Opus / MP3 / WAV，优先推荐转 OGG Opus 以减小体积。适用于用户提到转音频、音频压缩、mp3 转 ogg、音频转 opus、批量转音频、audio convert、减小音频体积。"
argument-hint: <file-or-dir> --to <ogg|mp3|wav> [--bitrate <kbps>] [--recursive] [--replace] [--output-dir <dir>] [--skip-larger]
metadata:
  requires:
    bins: ["ffmpeg"]
---

# audio-convert

将游戏音频批量转换为目标格式，默认推荐 OGG Opus（体积最小，兼容性好）。

## 适用场景

- MP3 / WAV / AAC / FLAC 转 OGG Opus（减小 40~60% 体积）
- 批量转换游戏音效目录
- 转换后上传到 CDN 替换原有音频

## 默认行为

- 支持输入：`.mp3`、`.wav`、`.aac`、`.flac`、`.ogg`、`.m4a`
- 必须显式指定 `--to`
- 默认码率：OGG Opus `64k`（音效）/ `96k`（背景音乐），MP3 `128k`，WAV 无损
- 默认不覆盖原文件，输出到同目录同名新扩展名
- 底层使用 `ffmpeg`，需提前安装

## 命令

```powershell
# 单文件转 OGG Opus（音效，64k）
python .claude/skills/audio-convert/scripts/convert.py bgm.mp3 --to ogg

# 单文件转 OGG Opus（背景音乐，96k）
python .claude/skills/audio-convert/scripts/convert.py bgm.mp3 --to ogg --bitrate 96

# 批量转换目录
python .claude/skills/audio-convert/scripts/convert.py ./audio --to ogg --recursive

# 转换后替换原文件
python .claude/skills/audio-convert/scripts/convert.py ./audio --to ogg --recursive --replace

# 输出到指定目录
python .claude/skills/audio-convert/scripts/convert.py ./audio --to ogg --output-dir ./audio-ogg

# 结果更大时跳过
python .claude/skills/audio-convert/scripts/convert.py ./audio --to ogg --recursive --skip-larger
```

## 参数说明

| 参数 | 说明 |
|------|------|
| `<file-or-dir>` | 输入文件或目录 |
| `--to <ogg\|mp3\|wav>` | 目标格式，必填 |
| `--bitrate <kbps>` | 码率（kbps），OGG 默认 `64`，MP3 默认 `128`，WAV 忽略 |
| `--recursive` | 递归处理子目录 |
| `--replace` | 成功后删除原文件 |
| `--output-dir <dir>` | 输出到指定目录，保持相对目录结构 |
| `--skip-larger` | 结果比原文件更大时跳过写入 |
| `--dry-run` | 只打印计划，不实际转换 |

## 码率建议

| 场景 | 推荐码率 |
|------|---------|
| 短音效（点击、碰撞） | OGG Opus 48k |
| 普通音效 | OGG Opus 64k |
| 背景音乐 | OGG Opus 96k |
| 高质量背景音乐 | OGG Opus 128k |

## 兼容性说明

- OGG Opus：iOS 11+、Android 5+、微信浏览器全支持，2026 年可直接使用无需降级
- MP3：全平台兼容，体积较大
- WAV：无损但体积最大，不推荐用于 Web

## 输出

- `CONVERTED`：成功转换
- `SKIPPED`：跳过（已存在或结果更大）
- `DRY-RUN`：仅预览
- `ERROR`：转换失败

结束时输出汇总统计（转换数、跳过数、节省体积）。
