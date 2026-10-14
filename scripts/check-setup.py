#!/usr/bin/env python3
"""Read-only preflight that works before the Node runtime is available."""
import json
import os
import shutil
import subprocess
from pathlib import Path

missing = []
try:
    import numpy
except ImportError:
    missing.append("Python NumPy (voice effects)")
try:
    major = int(subprocess.check_output(["node", "-p", "process.versions.node.split('.')[0]"],
                                      timeout=5, stderr=subprocess.DEVNULL).strip())
    if major < 24:
        missing.append("Node.js 24+")
except (OSError, ValueError, subprocess.SubprocessError):
    missing.append("Node.js 24+")
for command, label in [
    ("npm", "npm"),
    ("secret-tool", "Desktop keyring (libsecret)"),
    ("xdg-terminal-exec", "Terminal launcher (run scripts/setup in a terminal)"),
    ("systemd-run", "systemd setup launcher"),
    ("pw-record", "PipeWire recording"),
    ("pw-play", "PipeWire playback"), ("pw-cli", "PipeWire tools"),
    ("wpctl", "WirePlumber"), ("grim", "Screenshots"),
    ("wtype", "Keyboard control"), ("hyprctl", "Hyprland"),
    ("bwrap", "bubblewrap (Hermes native memory isolation)"),
    ("xdg-open", "Desktop launcher"), ("setpriv", "util-linux"),
]:
    if not shutil.which(command):
        missing.append(label)
try:
    subprocess.run(["node", "--input-type=module", "-e",
                    "await import('openai/resources/live/ws')"],
                   cwd=Path(__file__).resolve().parent.parent, timeout=15,
                   check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
except (OSError, subprocess.SubprocessError):
    missing.append("GPT-Live SDK (run SET UP)")
print(json.dumps({"setupRequired": bool(missing),
                  "setupMessage": "Missing: " + ", ".join(missing) if missing else
                  "Runtime dependencies are available. Setup also configures optional features and secure key storage."}))
