"""Render codebase inventory data as Markdown."""

from __future__ import annotations


def format_bytes(value: int) -> str:
    units = ["B", "KiB", "MiB", "GiB"]
    number = float(value)
    for unit in units:
        if number < 1024 or unit == units[-1]:
            return f"{number:.1f} {unit}"
        number /= 1024
    return f"{value} B"


def markdown(data: dict) -> str:
    summary = data["summary"]
    source_lines = data["source_lines"]
    lines = [
        "# Codebase inventory",
        "",
        f"- Root: {data['root']}",
        f"- Selection: {data['selection']}",
        f"- Files: {summary['files']} "
        f"({summary['text_files']} text, {summary['binary_files']} binary, "
        f"{summary['symlink_files']} symlink skipped)",
        f"- Size: {format_bytes(summary['bytes'])}",
        f"- Physical text lines: {summary['text_physical_lines']} "
        f"({summary['text_nonblank_lines']} nonblank)",
        f"- Candidate source lines: "
        f"{source_lines['all_candidate_source']['physical_lines']} across "
        f"{source_lines['all_candidate_source']['files']} files",
        f"- Test-file candidates: {summary['test_file_candidates']}",
        f"- Generated/vendored candidates: "
        f"{summary['generated_or_vendored_candidates']}",
        "",
        "## Code line inventory",
        "",
        "| Category | Files | Physical lines | Nonblank lines |",
        "| --- | ---: | ---: | ---: |",
    ]
    for key, label in (
        ("first_party_production", "First-party production"),
        ("tests", "Tests"),
        ("generated_or_vendored", "Generated/vendored candidates"),
        ("all_candidate_source", "All candidate source"),
    ):
        item = source_lines[key]
        lines.append(
            f"| {label} | {item['files']} | {item['physical_lines']} | "
            f"{item['nonblank_lines']} |"
        )

    lines.extend(
        [
            "",
            "## Largest first-party production source files",
            "",
            "| File | Physical lines | Nonblank lines | Size |",
            "| --- | ---: | ---: | ---: |",
        ]
    )
    for item in data["largest_first_party_source_files"]:
        lines.append(
            f"| {item['path']} | {item['physical_lines']} | "
            f"{item['nonblank_lines']} | {format_bytes(item['bytes'])} |"
        )

    threshold = data["large_source_file_threshold"]
    lines.extend(
        [
            "",
            f"## First-party source candidates at or above {threshold} lines",
            "",
        ]
    )
    if data["large_source_file_candidates"]:
        lines.extend(
            [
                "| File | Physical lines | Nonblank lines |",
                "| --- | ---: | ---: |",
            ]
        )
        for item in data["large_source_file_candidates"]:
            lines.append(
                f"| {item['path']} | {item['physical_lines']} | "
                f"{item['nonblank_lines']} |"
            )
    else:
        lines.append("No candidates found.")

    lines.extend(
        [
            "",
            "## Languages and file types",
            "",
            "| Extension | Files | Physical lines |",
            "| --- | ---: | ---: |",
        ]
    )
    for item in data["files_by_extension"]:
        lines.append(
            f"| {item['extension']} | {item['files']} | {item['lines']} |"
        )

    lines.extend(
        [
            "",
            "## Largest text files by physical lines",
            "",
            "| File | Physical lines | Nonblank lines | Size |",
            "| --- | ---: | ---: | ---: |",
        ]
    )
    for item in data["largest_text_files"]:
        lines.append(
            f"| {item['path']} | {item['physical_lines']} | "
            f"{item['nonblank_lines']} | {format_bytes(item['bytes'])} |"
        )

    lines.extend(
        [
            "",
            "## Largest files by bytes",
            "",
            "| File | Size |",
            "| --- | ---: |",
        ]
    )
    for item in data["largest_files"]:
        lines.append(f"| {item['path']} | {format_bytes(item['bytes'])} |")

    lines.extend(["", "## Signals", ""])
    lines.append(
        "- Markers: "
        + (
            ", ".join(f"{key}={value}" for key, value in data["markers"].items())
            if data["markers"]
            else "none found"
        )
    )
    lines.append(
        "- Manifests: "
        + (", ".join(data["manifests"]) if data["manifests"] else "none found")
    )
    lines.append(
        "- CI files: "
        + (", ".join(data["ci_files"]) if data["ci_files"] else "none found")
    )
    if data["unreadable_files"]:
        lines.append("- Unreadable files: " + ", ".join(data["unreadable_files"]))
    if data["symlink_samples"]:
        lines.append("- Symlinks skipped: " + ", ".join(data["symlink_samples"]))

    if data["marker_samples"]:
        heading = "## Marker occurrences"
        if data["marker_occurrences_truncated"]:
            heading += " (truncated by --max-marker-samples)"
        lines.extend(["", heading, ""])
        for sample in data["marker_samples"]:
            lines.append(f"- {sample['marker']}: {sample['path']}:{sample['line']}")

    lines.extend(
        [
            "",
            "> Physical lines include comments and blank lines. "
            "Source/test/generated classification is heuristic.",
            "",
            f"> {data['caveat']}",
            "",
        ]
    )
    return "\n".join(lines)
