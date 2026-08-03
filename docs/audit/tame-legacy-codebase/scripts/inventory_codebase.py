#!/usr/bin/env python3
"""Produce a conservative, language-agnostic codebase inventory.

The output is evidence for triage, not a quality score. It only reads files.
"""

from __future__ import annotations

import argparse
import collections
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from typing import Iterable

from inventory_markdown import markdown


DEFAULT_EXCLUDES = {
    ".git",
    ".hg",
    ".svn",
    ".idea",
    ".vscode",
    ".cache",
    ".next",
    ".nuxt",
    ".pytest_cache",
    ".mypy_cache",
    ".ruff_cache",
    ".tox",
    ".venv",
    "venv",
    "__pycache__",
    "node_modules",
    "bower_components",
    "vendor",
    "dist",
    "build",
    "target",
    "coverage",
}

MANIFEST_NAMES = {
    "package.json",
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "pyproject.toml",
    "requirements.txt",
    "poetry.lock",
    "Pipfile",
    "Pipfile.lock",
    "go.mod",
    "go.sum",
    "Cargo.toml",
    "Cargo.lock",
    "pom.xml",
    "build.gradle",
    "build.gradle.kts",
    "settings.gradle",
    "settings.gradle.kts",
    "composer.json",
    "composer.lock",
    "Gemfile",
    "Gemfile.lock",
    "mix.exs",
    "pubspec.yaml",
    "Package.swift",
    "Podfile",
    "Dockerfile",
    "docker-compose.yml",
    "docker-compose.yaml",
    "Makefile",
    "CMakeLists.txt",
}

CI_PARTS = {
    ".github/workflows",
    ".gitlab-ci.yml",
    "Jenkinsfile",
    ".circleci",
    "azure-pipelines.yml",
    "bitbucket-pipelines.yml",
    ".buildkite",
}

MARKER_RE = re.compile(r"\b(TODO|FIXME|HACK|XXX)\b", re.IGNORECASE)
TEST_RE = re.compile(
    r"(^|/)(test|tests|spec|specs|__tests__)(/|$)|"
    r"(^|/)(test_|spec_).+|(_test|_spec|Test)\.[^/]+$"
)
GENERATED_RE = re.compile(
    r"(^|/)(generated|gen|dist|build|vendor|third_party|third-party)(/|$)|"
    r"(\.min\.(js|css)$)|(\.g\.[^/]+$)|(\.generated\.[^/]+$)",
    re.IGNORECASE,
)

SOURCE_EXTENSIONS = {
    ".asm",
    ".bash",
    ".c",
    ".cc",
    ".clj",
    ".cljc",
    ".cljs",
    ".coffee",
    ".cpp",
    ".cs",
    ".css",
    ".cxx",
    ".dart",
    ".el",
    ".erl",
    ".ex",
    ".exs",
    ".fs",
    ".fsx",
    ".go",
    ".graphql",
    ".groovy",
    ".h",
    ".hpp",
    ".hrl",
    ".htm",
    ".html",
    ".java",
    ".jl",
    ".js",
    ".jsx",
    ".kt",
    ".kts",
    ".less",
    ".lua",
    ".m",
    ".mm",
    ".php",
    ".pl",
    ".pm",
    ".proto",
    ".ps1",
    ".psm1",
    ".py",
    ".r",
    ".rb",
    ".rs",
    ".sass",
    ".scala",
    ".scss",
    ".sh",
    ".sol",
    ".sql",
    ".svelte",
    ".swift",
    ".tcl",
    ".ts",
    ".tsx",
    ".vb",
    ".vue",
    ".zig",
    ".zsh",
}

SOURCE_NAMES = {
    "Rakefile",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate a read-only, heuristic codebase inventory."
    )
    parser.add_argument("root", nargs="?", default=".", help="Repository root")
    parser.add_argument(
        "--format",
        choices=("markdown", "json"),
        default="markdown",
        help="Output format",
    )
    parser.add_argument(
        "--top",
        type=int,
        default=20,
        help="Number of largest source/text/byte-size files to show",
    )
    parser.add_argument(
        "--max-marker-samples",
        type=int,
        default=0,
        help="Maximum TODO/FIXME/HACK/XXX occurrences; 0 keeps all",
    )
    parser.add_argument(
        "--large-file-lines",
        type=int,
        default=500,
        help="Physical-line threshold for first-party source candidates",
    )
    parser.add_argument(
        "--include-untracked",
        action="store_true",
        help="Walk the tree instead of limiting a Git repository to tracked files",
    )
    parser.add_argument(
        "--exclude",
        action="append",
        default=[],
        help="Additional directory name to exclude; repeat as needed",
    )
    return parser.parse_args()


def git_tracked_files(root: Path) -> list[Path] | None:
    try:
        proc = subprocess.run(
            ["git", "-C", str(root), "ls-files", "-z"],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
        )
    except (OSError, subprocess.CalledProcessError):
        return None
    paths = []
    for raw in proc.stdout.split(b"\0"):
        if not raw:
            continue
        paths.append(root / os.fsdecode(raw))
    return paths


def walked_files(root: Path, excludes: set[str]) -> Iterable[Path]:
    for current, dirs, names in os.walk(root):
        dirs[:] = sorted(d for d in dirs if d not in excludes)
        for name in sorted(names):
            yield Path(current) / name


def is_binary(head: bytes) -> bool:
    if b"\0" in head:
        return True
    if not head:
        return False
    suspicious = sum(byte < 9 or 13 < byte < 32 for byte in head)
    return suspicious / len(head) > 0.10


def extension_for(path: Path) -> str:
    if path.name in {"Dockerfile", "Makefile", "Jenkinsfile", "Gemfile"}:
        return f"[{path.name}]"
    suffix = path.suffix.lower()
    return suffix if suffix else "[no extension]"


def is_source_candidate(path: Path) -> bool:
    return path.name in SOURCE_NAMES or path.suffix.lower() in SOURCE_EXTENSIONS


def rel_text(path: Path, root: Path) -> str:
    return path.relative_to(root).as_posix()


def collect(root: Path, args: argparse.Namespace) -> dict:
    excludes = DEFAULT_EXCLUDES | set(args.exclude)
    tracked = None if args.include_untracked else git_tracked_files(root)
    candidates = tracked if tracked is not None else list(walked_files(root, excludes))
    source = "git tracked files" if tracked is not None else "filesystem walk"

    extension_counts: collections.Counter[str] = collections.Counter()
    extension_lines: collections.Counter[str] = collections.Counter()
    markers: collections.Counter[str] = collections.Counter()
    marker_samples: list[dict] = []
    largest_by_bytes: list[tuple[int, str]] = []
    largest_text_by_lines: list[tuple[int, int, int, str]] = []
    production_source_by_lines: list[tuple[int, int, int, str]] = []
    manifests: list[str] = []
    ci_files: list[str] = []
    test_files: list[str] = []
    generated_suspects: list[str] = []
    symlink_files: list[str] = []
    unreadable: list[str] = []
    total_bytes = 0
    text_physical_lines = 0
    text_nonblank_lines = 0
    text_files = 0
    binary_files = 0
    source_stats = {
        "first_party_production": {
            "files": 0,
            "physical_lines": 0,
            "nonblank_lines": 0,
        },
        "tests": {"files": 0, "physical_lines": 0, "nonblank_lines": 0},
        "generated_or_vendored": {
            "files": 0,
            "physical_lines": 0,
            "nonblank_lines": 0,
        },
    }

    for path in candidates:
        if path.is_symlink():
            try:
                symlink_files.append(rel_text(path, root))
            except ValueError:
                symlink_files.append(str(path))
            continue
        if not path.is_file():
            continue
        rel = rel_text(path, root)
        parts = set(path.relative_to(root).parts[:-1])
        if parts & excludes:
            continue
        try:
            size = path.stat().st_size
            with path.open("rb") as handle:
                head = handle.read(8192)
        except OSError:
            unreadable.append(rel)
            continue

        total_bytes += size
        largest_by_bytes.append((size, rel))
        ext = extension_for(path)
        extension_counts[ext] += 1

        is_test = bool(TEST_RE.search(rel))
        is_generated = bool(GENERATED_RE.search(rel))
        if path.name in MANIFEST_NAMES:
            manifests.append(rel)
        if any(rel == part or rel.startswith(part + "/") for part in CI_PARTS):
            ci_files.append(rel)
        if is_test:
            test_files.append(rel)
        if is_generated:
            generated_suspects.append(rel)

        if is_binary(head):
            binary_files += 1
            continue

        physical_lines = 0
        nonblank_lines = 0
        try:
            with path.open("r", encoding="utf-8", errors="replace") as handle:
                for line_number, line in enumerate(handle, 1):
                    physical_lines += 1
                    if line.strip():
                        nonblank_lines += 1
                    extension_lines[ext] += 1
                    for match in MARKER_RE.finditer(line):
                        marker = match.group(1).upper()
                        markers[marker] += 1
                        if (
                            args.max_marker_samples <= 0
                            or len(marker_samples) < args.max_marker_samples
                        ):
                            marker_samples.append(
                                {
                                    "marker": marker,
                                    "path": rel,
                                    "line": line_number,
                                }
                            )
        except OSError:
            unreadable.append(rel)
            continue

        text_files += 1
        text_physical_lines += physical_lines
        text_nonblank_lines += nonblank_lines
        largest_text_by_lines.append(
            (physical_lines, nonblank_lines, size, rel)
        )

        if is_source_candidate(path):
            if is_generated:
                category = "generated_or_vendored"
            elif is_test:
                category = "tests"
            else:
                category = "first_party_production"
                production_source_by_lines.append(
                    (physical_lines, nonblank_lines, size, rel)
                )
            source_stats[category]["files"] += 1
            source_stats[category]["physical_lines"] += physical_lines
            source_stats[category]["nonblank_lines"] += nonblank_lines

    largest_by_bytes.sort(reverse=True)
    largest_text_by_lines.sort(reverse=True)
    production_source_by_lines.sort(reverse=True)
    source_stats["all_candidate_source"] = {
        key: sum(category[key] for category in source_stats.values())
        for key in ("files", "physical_lines", "nonblank_lines")
    }
    top = max(args.top, 0)
    large_file_lines = max(args.large_file_lines, 0)
    large_source_candidates = [
        {
            "path": rel,
            "physical_lines": physical,
            "nonblank_lines": nonblank,
            "bytes": size,
        }
        for physical, nonblank, size, rel in production_source_by_lines
        if physical >= large_file_lines
    ]
    return {
        "root": str(root),
        "selection": source,
        "excluded_directory_names": sorted(excludes),
        "summary": {
            "files": text_files + binary_files,
            "text_files": text_files,
            "binary_files": binary_files,
            "symlink_files": len(symlink_files),
            "bytes": total_bytes,
            "text_physical_lines": text_physical_lines,
            "text_nonblank_lines": text_nonblank_lines,
            "test_file_candidates": len(test_files),
            "generated_or_vendored_candidates": len(generated_suspects),
        },
        "source_lines": source_stats,
        "files_by_extension": [
            {
                "extension": ext,
                "files": count,
                "lines": extension_lines.get(ext, 0),
            }
            for ext, count in extension_counts.most_common()
        ],
        "largest_files": [
            {"path": rel, "bytes": size}
            for size, rel in largest_by_bytes[:top]
        ],
        "largest_text_files": [
            {
                "path": rel,
                "physical_lines": physical,
                "nonblank_lines": nonblank,
                "bytes": size,
            }
            for physical, nonblank, size, rel in largest_text_by_lines[:top]
        ],
        "largest_first_party_source_files": [
            {
                "path": rel,
                "physical_lines": physical,
                "nonblank_lines": nonblank,
                "bytes": size,
            }
            for physical, nonblank, size, rel in production_source_by_lines[:top]
        ],
        "large_source_file_threshold": large_file_lines,
        "large_source_file_candidates": large_source_candidates,
        "markers": dict(markers),
        "marker_samples": marker_samples,
        "marker_occurrences_truncated": sum(markers.values()) > len(marker_samples),
        "manifests": sorted(set(manifests)),
        "ci_files": sorted(set(ci_files)),
        "test_files": sorted(test_files),
        "test_file_samples": sorted(test_files)[:50],
        "generated_or_vendored_files": sorted(generated_suspects),
        "generated_or_vendored_samples": sorted(generated_suspects)[:50],
        "symlink_files": sorted(symlink_files),
        "symlink_samples": sorted(symlink_files)[:50],
        "unreadable_files": sorted(set(unreadable)),
        "caveat": (
            "Heuristic inventory only. Generated/test classification, line counts, and "
            "markers require contextual review and are not quality findings by themselves."
        ),
    }



def main() -> int:
    args = parse_args()
    root = Path(args.root).expanduser().resolve()
    if not root.is_dir():
        print(f"error: not a directory: {root}", file=sys.stderr)
        return 2
    data = collect(root, args)
    if args.format == "json":
        print(json.dumps(data, ensure_ascii=False, indent=2))
    else:
        print(markdown(data))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
