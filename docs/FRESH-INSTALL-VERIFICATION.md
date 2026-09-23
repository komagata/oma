# Official ISO installation verification

Date: 2026-09-23. This is installation evidence, not an audio-quality or API-model certification.

## Environment

- Official download: https://iso.omarchy.org/omarchy-4.0.4.iso
- SHA-256 checked against the adjacent official `.sha256` file:
  `ddeded2758c48318d201dfdac905ecb28f570441883f0c052ea3cd5d05acf92d`.
- Two separate, empty 40 GiB QCOW2 disks; QEMU/KVM, x86-64, UEFI, 8 GiB RAM.
- The unmodified official ISO installed both guests using its documented
  `cidata` unattended-install support. Neither guest used the Japanese ISO or
  an existing desktop disk. Guest `/etc/os-release` reported Omarchy 4.0.4.
- Standard English desktop login, PipeWire virtual audio, default theme.
- SSH access and a helper to import the guest desktop environment were used
  for automation; they did not provision O.M.A. dependencies.

## Findings and fixes

The first guest exposed issues that fixtures on an established desktop missed:

1. Package databases were absent immediately after ISO installation. Direct
   `pacman -S` could not locate gopass; direct `pacman -Syu` was correctly blocked
   by Omarchy's update guard. Setup now invokes `omarchy update -y` before the
   first necessary package installation and preserves its normal hooks.
2. The assistant panel covered the setup terminal. SET UP now dismisses the
   panel before the user interacts with the terminal.
3. Gopass initialization and unlock were unnecessary onboarding friction.
   New keys now use the standard desktop login keyring through `secret-tool`.
   Existing gopass entries remain readable and are not migrated or deleted.
4. A slow wake-model download reached the old 180-second limit. Downloads now
   have a longer timeout and retries; optional installation failures explicitly
   report the missing feature and allow F8/basic setup to continue.

## Published-code recheck

The second empty-disk installation cloned commit
`fa52b7b9b2ecb04598460ff0fdbe55ec7e11eae3` from the public repository with:

```sh
omarchy plugin add https://github.com/komagata/oma --enable --yes
```

`--yes` bypassed the plugin manager's confirmation for test automation; it did
not install extra dependencies. The guest was then updated through the standard
plugin manager to `50cf179` to test optional-download recovery.

Verified on that guest:

- Discovery, enablement, and the first-launch API-key screen.
- No gopass installation or GPG identity was required.
- A fictional `sk-…` value was pasted into the masked Settings field and saved.
  An exact lookup comparison confirmed storage in Secret Service. The worker
  reloaded it and reached `idle` with `keyConfigured: true` and an empty error.
- The mouse helper compiled from the published source.
- Missing voice-wake Python dependencies installed through the setup wizard.
- The original model download timed out; after updating, intentionally stopping
  a slow retry showed the explicit optional-feature warning. Setup still
  registered F8, passed its final preflight, and exited successfully.
- The same model download and Vosk model loading had succeeded on the first
  official-ISO guest. The second guest's interrupted model download is not
  claimed as a successful installation or wake-phrase recognition test.

Additional lifecycle checks on the second guest passed:

- After a full guest reboot and desktop login, the exact fictional key remained
  readable and O.M.A. returned to idle with no error.
- Standard plugin removal preserved the local data directory and keyring entry.
  Re-adding the public repository restored the configured idle state.
- After deleting only the fictional key, pressing the registered F8 key opened
  the first-launch Settings panel. Hyprland reported no configuration errors.
- The second guest's plugin Git checkout remained clean throughout the
  published-code check. The test key was removed before handoff.

No real OpenAI key was copied to either guest. Billed Realtime/Codex calls,
physical-microphone recognition, and spoken wake detection are outside this
installation check.
