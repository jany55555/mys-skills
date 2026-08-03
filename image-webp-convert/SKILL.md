---
name: image-webp-convert
version: 1.3.0
description: "将 PNG/JPG/JPEG 批量转换为 WebP，默认使用 Tinify 云端引擎（压缩+转换），支持 API key 池自动轮换。也支持本地 sharp 引擎。适用于用户提到转 webp、批量转 webp、图片转 webp、png 转 webp、jpg 转 webp、保真转换、无损 webp、tinify webp。"
argument-hint: <file-or-dir> [--api-key key1,key2,...] [--recursive] [--replace] [--output-dir <dir>] [--skip-larger] [--engine local|tinify]
metadata:
  requires:
    bins: ["node"]
---

**CRITICAL — 开始前 MUST 先用 Read 工具读取 [`../image-shared/SKILL.md`](../image-shared/SKILL.md)，其中包含通用参数、安全规则和跨 skill 路由。**

# image-webp-convert

将图片转换为 WebP。**默认使用 Tinify 云端引擎**（压缩+转换，效果更优），也支持本地 sharp 引擎。

## 引擎对比

| | tinify（默认） | local |
|---|---|---|
| 需要网络 | 是 | 否 |
| 压缩率 | 更优（TinyPNG 算法） | 高质量 |
| API 额度 | 免费 500 次/月/key，每文件消耗 2 次 | 无限制 |
| 支持输入格式 | PNG / JPG / JPEG / WebP / AVIF | PNG / JPG / JPEG |
| Key 池 | 支持多个 key 自动轮换 | 不需要 |

## 命令

```powershell
# ── Tinify 引擎（默认，需要 API key）────────────────

# 设置好环境变量后直接用，无需传 --api-key
npx @jany555/image-cli webp "C:\path\to\image.png"
npx @jany555/image-cli webp "C:\path\to\images" --recursive
npx @jany555/image-cli webp "C:\path\to\images" --recursive --skip-larger
npx @jany555/image-cli webp "C:\path\to\images" --recursive --replace

# 临时覆盖 key
npx @jany555/image-cli webp "C:\path\to\image.png" --api-key YOUR_KEY
npx @jany555/image-cli webp "C:\path\to\images" --recursive --api-key key1,key2,key3

# 预览（不写文件，不消耗额度）
npx @jany555/image-cli webp "C:\path\to\images" --recursive --dry-run

# ── 本地引擎（不需要 API key）────────────────────────
npx @jany555/image-cli webp "C:\path\to\image.png" --engine local
npx @jany555/image-cli webp "C:\path\to\images" --recursive --engine local --quality 95
npx @jany555/image-cli webp "C:\path\to\images" --recursive --engine local --jpg-mode skip
```

## 参数说明

| 参数 | 说明 |
|------|------|
| `<file-or-dir>` | 输入文件或目录 |
| `--api-key <key[,key2,...]>` | Tinify API key，逗号分隔多个组成 key 池。优先级低于命令行参数的是环境变量 `TINIFY_API_KEYS`（多个）或 `TINIFY_API_KEY`（单个） |
| `--engine local\|tinify` | 转换引擎，默认 `tinify` |
| `--recursive` | 递归处理目录 |
| `--replace` | 成功生成 `.webp` 后删除原图 |
| `--output-dir <dir>` | 指定输出目录，保持相对目录结构 |
| `--skip-larger` | 当 `.webp` 比原文件更大时跳过写入 |
| `--dry-run` | 只打印计划，不实际写文件（不消耗 API 额度） |
| `--quality <1-100>` | JPEG 转 WebP 质量，默认 `100`（仅 local 引擎） |
| `--jpg-mode preserve\|skip` | JPEG 处理模式，默认 `preserve`（仅 local 引擎） |

## Key 池工作机制

- 多个 key 逗号分隔，内部按顺序使用
- 当前 key 触发 `AccountError`（额度耗尽）时，自动切换到下一个 key 并重试当前文件
- 日志中标注当前使用的是哪个 key：`[tinify key[1/3], used: 42]`
- 所有 key 都耗尽时，输出 `ERROR ... All Tinify API keys have exhausted their monthly quota.` 并终止

## 环境变量配置

推荐写入 `~\.env` 并在 PowerShell profile 中自动加载，避免 key 出现在命令历史：

```
TINIFY_API_KEYS=key1,key2,key3
```

读取优先级（从高到低）：`--api-key 参数` > `TINIFY_API_KEYS` > `TINIFY_API_KEY`

## Tinify API Key 获取

免费注册即可获得，每月 500 次压缩额度：https://tinify.com/developers

> **注意：** 每个文件消耗 **2 次**额度（1次上传压缩 + 1次格式转换）。

## 输出状态

- `CREATED`：成功生成 `.webp`
- `SKIPPED`：跳过（格式不支持、输出更大、jpg-mode=skip）
- `DRY-RUN`：仅预览
- `ERROR`：处理失败
- `WARN key[N/M] quota exhausted`：当前 key 额度用完，已切换下一个

结束时输出汇总统计。Tinify 引擎额外显示当前 key 本月已用压缩次数。
