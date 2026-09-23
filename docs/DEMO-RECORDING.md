# Historical demo recording notes

An earlier Japanese-language demo was recorded in an Omarchy 4.0.4 VM at
1920 × 1080, starting in Neon Glow. Synthesized commands were played into a
virtual microphone to exercise real wake detection, transcription, and Codex actions.
These notes describe that historical recording, not a fresh verification of main.

Video used wf-recorder; desktop output and instructions used separate pw-record
tracks. Audio/video clock drift was corrected before trimming. The introduction
disclosed synthesized commands and editing. Media files are not included here.

Recorded scenes included fastfetch in a real terminal, a 71-line Lua clock plugin
edited in a live Neovim buffer, ten logo windows, and a switch to Tokyo Night.
The chosen logo shot used a floating five-by-two grid; it must not be described
as evidence of native tiling. A supplementary wallpaper shot was labeled separately.

Practical findings:

- Launch persistent terminals independently of the task process group.
- Neovim completion and autoindent can interfere with simulated typing. A clean
  instance with an RPC socket can edit the real buffer without replaying a
  prewritten finished file.
- Use the installed Hyprland Lua dispatcher contract, not obsolete commands.
- Verify the active theme rather than relying only on a spoken success message.
- Keep rehearsal data separate from the user's real conversation memory.

See DEMO-SCRIPT.md for the current English recording plan.
