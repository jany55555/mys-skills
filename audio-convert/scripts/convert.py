#!/usr/bin/env python3
"""音频格式转换脚本，底层使用 ffmpeg。"""

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

SUPPORTED_INPUT = {'.mp3', '.wav', '.aac', '.flac', '.ogg', '.m4a'}
FORMAT_EXT = {'ogg': '.ogg', 'mp3': '.mp3', 'wav': '.wav'}
DEFAULT_BITRATE = {'ogg': '64', 'mp3': '128', 'wav': None}


def get_file_size(path: Path) -> int:
    return path.stat().st_size if path.exists() else 0


def build_ffmpeg_cmd(src: Path, dst: Path, fmt: str, bitrate: str) -> list:
    cmd = ['ffmpeg', '-y', '-i', str(src)]
    if fmt == 'ogg':
        cmd += ['-c:a', 'libopus', '-b:a', f'{bitrate}k', '-vn']
    elif fmt == 'mp3':
        cmd += ['-c:a', 'libmp3lame', '-b:a', f'{bitrate}k', '-vn']
    elif fmt == 'wav':
        cmd += ['-c:a', 'pcm_s16le', '-vn']
    cmd.append(str(dst))
    return cmd


def convert_file(src: Path, dst: Path, fmt: str, bitrate: str,
                 replace: bool, skip_larger: bool, dry_run: bool) -> dict:
    src_size = get_file_size(src)

    if dry_run:
        print(f'DRY-RUN  {src} -> {dst}')
        return {'status': 'dry-run', 'src': str(src), 'dst': str(dst)}

    dst.parent.mkdir(parents=True, exist_ok=True)
    cmd = build_ffmpeg_cmd(src, dst, fmt, bitrate)

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f'ERROR    {src}: {result.stderr.strip().splitlines()[-1] if result.stderr else "unknown"}')
        return {'status': 'error', 'src': str(src)}

    dst_size = get_file_size(dst)

    if skip_larger and dst_size >= src_size:
        dst.unlink(missing_ok=True)
        print(f'SKIPPED  {src} (result larger: {dst_size} >= {src_size})')
        return {'status': 'skipped', 'src': str(src)}

    saved = src_size - dst_size
    pct = round(saved / src_size * 100, 1) if src_size > 0 else 0
    print(f'CONVERTED {src} -> {dst.name}  {src_size//1024}KB -> {dst_size//1024}KB  ({pct:+.1f}%)')

    if replace and src != dst:
        src.unlink(missing_ok=True)

    return {'status': 'converted', 'src': str(src), 'dst': str(dst),
            'src_size': src_size, 'dst_size': dst_size, 'saved': saved}


def collect_files(input_path: Path, recursive: bool) -> list[Path]:
    if input_path.is_file():
        return [input_path] if input_path.suffix.lower() in SUPPORTED_INPUT else []
    pattern = '**/*' if recursive else '*'
    return sorted(p for p in input_path.glob(pattern)
                  if p.is_file() and p.suffix.lower() in SUPPORTED_INPUT)


def main():
    parser = argparse.ArgumentParser(description='音频格式转换')
    parser.add_argument('input', help='输入文件或目录')
    parser.add_argument('--to', required=True, choices=['ogg', 'mp3', 'wav'], help='目标格式')
    parser.add_argument('--bitrate', help='码率 kbps（OGG 默认 64，MP3 默认 128）')
    parser.add_argument('--recursive', action='store_true', help='递归处理子目录')
    parser.add_argument('--replace', action='store_true', help='成功后删除原文件')
    parser.add_argument('--output-dir', help='输出目录')
    parser.add_argument('--skip-larger', action='store_true', help='结果更大时跳过')
    parser.add_argument('--dry-run', action='store_true', help='只打印计划')
    args = parser.parse_args()

    fmt = args.to
    bitrate = args.bitrate or DEFAULT_BITRATE[fmt] or '64'
    ext = FORMAT_EXT[fmt]
    input_path = Path(args.input)
    output_dir = Path(args.output_dir) if args.output_dir else None

    if not input_path.exists():
        print(f'ERROR: 路径不存在: {input_path}', file=sys.stderr)
        sys.exit(1)

    files = collect_files(input_path, args.recursive)
    if not files:
        print('没有找到支持的音频文件')
        sys.exit(0)

    print(f'找到 {len(files)} 个文件，目标格式: {fmt.upper()} {bitrate}k\n')

    results = []
    for src in files:
        if output_dir:
            # 保持相对目录结构
            try:
                rel = src.relative_to(input_path if input_path.is_dir() else input_path.parent)
            except ValueError:
                rel = Path(src.name)
            dst = output_dir / rel.with_suffix(ext)
        else:
            dst = src.with_suffix(ext)

        # 同格式同路径跳过
        if dst == src:
            print(f'SKIPPED  {src} (same path)')
            results.append({'status': 'skipped', 'src': str(src)})
            continue

        r = convert_file(src, dst, fmt, bitrate, args.replace, args.skip_larger, args.dry_run)
        results.append(r)

    # 汇总
    converted = [r for r in results if r['status'] == 'converted']
    skipped = [r for r in results if r['status'] == 'skipped']
    errors = [r for r in results if r['status'] == 'error']
    total_saved = sum(r.get('saved', 0) for r in converted)

    print(f'\n完成: 转换 {len(converted)} | 跳过 {len(skipped)} | 失败 {len(errors)}', end='')
    if total_saved > 0:
        print(f' | 节省 {total_saved // 1024} KB')
    else:
        print()

    # 输出 JSON 供脚本捕获
    print(json.dumps({'converted': len(converted), 'skipped': len(skipped),
                      'errors': len(errors), 'saved_bytes': total_saved}))


if __name__ == '__main__':
    main()
