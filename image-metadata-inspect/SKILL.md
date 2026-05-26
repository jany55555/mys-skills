---
name: image-metadata-inspect
version: 1.1.0
description: "查看图片元信息，适用于用户提到查看图片信息、检查尺寸、看格式、看 alpha、看 EXIF、批量检查图片、metadata inspect、image info。"
argument-hint: <file-or-dir> [--recursive] [--json] [--exif] [--output <file>]
metadata:
  requires:
    bins: ["node"]
---

# image-metadata-inspect

查看图片元信息，适合在转 WebP、压缩、换皮、上传素材前做检查。

## 适用场景

- 查看单张图片的尺寸、格式、大小
- 批量检查素材目录
- 确认图片是否带透明通道
- 确认图片是否带 EXIF / ICC

## 默认输出字段

`path` / `format` / `width` / `height` / `channels` / `hasAlpha` / `space` / `density` / `fileSize` / `animated` / `pages` / `hasProfile` / `hasExif`

## 命令

```powershell
# 查看单张图片
npx @jany555/image-cli inspect "C:\path\to\image.png"

# 批量查看目录
npx @jany555/image-cli inspect "C:\path\to\images" --recursive

# 输出 JSON
npx @jany555/image-cli inspect "C:\path\to\images" --recursive --json

# 输出 EXIF 摘要
npx @jany555/image-cli inspect "C:\path\to\photo.jpg" --exif

# 写入 JSON 文件
npx @jany555/image-cli inspect "C:\path\to\images" --recursive --json --output "C:\path\to\report.json"
```

## 参数说明

| 参数 | 说明 |
|------|------|
| `<file-or-dir>` | 输入文件或目录 |
| `--recursive` | 递归处理目录 |
| `--json` | 以结构化 JSON 输出 |
| `--exif` | 额外输出 EXIF 摘要 |
| `--output <file>` | 将结果写入文件 |

## 规则

- 默认只读取元信息，不改文件
- 遇到非支持格式会跳过
- 遇到损坏文件会标记为错误并继续处理其他文件

## 输出

- 默认：人类可读文本
- `--json`：结构化 JSON
- 结束时输出汇总统计
