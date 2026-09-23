#!/usr/bin/env python3
"""Compatibility entry point: the authored Blender rig replaces the old portrait triangulator."""
import os, pathlib, shutil
blender = os.environ.get("BLENDER") or shutil.which("blender")
if not blender:
    raise SystemExit("Set BLENDER to the Blender executable, then rerun. See README.md.")
os.execv(blender, [blender, "--background", "--python", str(pathlib.Path(__file__).with_name("build_face_blender.py"))])
