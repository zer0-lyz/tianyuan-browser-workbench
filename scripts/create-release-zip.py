#!/usr/bin/env python3

import os
import sys
import zipfile
from pathlib import Path


def archive_entries(source: Path):
    yield source
    for directory, directory_names, file_names in os.walk(source):
        directory_names.sort()
        file_names.sort()
        current = Path(directory)
        for name in directory_names:
            yield current / name
        for name in file_names:
            yield current / name


def main():
    if len(sys.argv) != 3:
        raise SystemExit(
            "Usage: create-release-zip.py <source-directory> <output.zip>"
        )

    source = Path(sys.argv[1]).resolve()
    output = Path(sys.argv[2]).resolve()
    if not source.is_dir():
        raise SystemExit(f"Source directory not found: {source}")

    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_name(f"{output.name}.tmp-{os.getpid()}")
    temporary.unlink(missing_ok=True)

    try:
        with zipfile.ZipFile(
            temporary,
            "w",
            compression=zipfile.ZIP_DEFLATED,
            compresslevel=9,
            allowZip64=True,
        ) as archive:
            for entry in archive_entries(source):
                archive_name = entry.relative_to(source.parent).as_posix()
                if entry.is_dir():
                    archive_name = f"{archive_name}/"
                archive.write(entry, archive_name)
        os.replace(temporary, output)
    finally:
        temporary.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
