#!/usr/bin/env python3
import hashlib, pathlib, runpy
base = pathlib.Path("/srv/mijn-ruimte/mcp-staging/_fix")
folder = base / "go.d"
if folder.is_dir():
    man = (folder / "manifest").read_text().split()
    blobs = []
    for i in range(int(man[0])):
        raw = (folder / f"{i:02d}").read_bytes()
        head, _, body = raw.partition(b"\n")
        if hashlib.sha256(body).hexdigest() != head.decode().strip():
            raise SystemExit(f"CHUNK_BAD go.{i:02d}")
        blobs.append(body)
    body = b"".join(blobs)
    if hashlib.sha256(body).hexdigest() != man[1]:
        raise SystemExit("CHUNK_BAD go.manifest")
else:
    raw = (base / "go.py").read_bytes()
    head, _, body = raw.partition(b"\n")
    if hashlib.sha256(body).hexdigest() != head.decode().strip():
        raise SystemExit("CHUNK_BAD go.py")
tmp = pathlib.Path("/tmp/mijn-go-fix.py")
tmp.write_bytes(body)
runpy.run_path(str(tmp), run_name="__main__")
