#!/usr/bin/env python3
"""Read-only preflight that works before the Node runtime is available."""
import json
import os
import shutil
import subprocess

missing = []
try:
    major = int(subprocess.check_output(["node", "-p", "process.versions.node.split('.')[0]"],
                                      timeout=5, stderr=subprocess.DEVNULL).strip())
    if major < 24:
        missing.append("Node.js 24+")
except (OSError, ValueError, subprocess.SubprocessError):
    missing.append("Node.js 24+")
for command, label in [
    ("codex", "Codex CLI"), ("pw-record", "PipeWire recording"),
    ("pw-play", "PipeWire playback"), ("pw-cli", "PipeWire tools"),
    ("wpctl", "WirePlumber"), ("grim", "Screenshots"),
    ("wtype", "Keyboard control"), ("hyprctl", "Hyprland"),
    ("xdg-open", "Desktop launcher"), ("setpriv", "util-linux"),
]:
    if not shutil.which(command):
        missing.append(label)
if not os.environ.get("OPENAI_API_KEY") and not shutil.which("secret-tool"):
    missing.append("desktop key storage (run SET UP)")
print(json.dumps({"setupRequired": bool(missing),
                  "setupMessage": "Missing: " + ", ".join(missing) if missing else
                  "Runtime dependencies are available. Setup also configures optional features and secure key storage."}))
