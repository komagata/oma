# Verification

## Publication preparation — September 23, 2026

Tested locally on Omarchy 4.0.4 with Qt 6.11.2 and Node.js 24+.

- Portable and installed Omarchy manifest validation passed.
- Node tests and runtime syntax checks passed.
- QML conversation, caption, startup/shutdown, lip timing, and settings tests passed.
- The OpenGL theme-tint test passed separately from software-rendered QML tests.
- A fictional GPU-rendered preview was generated from the current UI.

The tests exercise memory persistence and deletion, task checkpoints, bounded
context, locale instructions, interrupted responses, audio recorder handoff,
quiet speech detection, whole-line captions, key handling, desktop tool validation,
camera selection, and restart helpers. See the test output and CI for exact counts.

## Earlier host checks

During development, the following were exercised on the author's desktop:

- Opening, closing, and reopening the panel; returning from Settings.
- Reloading O.M.A. without replacing the desktop bar process.
- Shared microphone capture with a second PipeWire recorder.
- Theme changes and face tint updates.
- Fictional API conversation, Codex file operations, and persistent memory.
- Local camera enumeration and a single color-camera capture.

These are historical checks, not claims that every combination of device, accent,
model account, or Omarchy version has been tested. In particular, camera-to-model
recognition has not been verified end to end in this preparation pass.

## Limits

Physical microphone acoustics, wake pronunciation, perceived voice quality, and
lip-sync appearance require real-user testing. Wake detection currently uses a
Japanese model. The face is a shallow portrait with amplitude/spectrum-driven
mouth shapes, not phoneme-level animation.

GitHub Actions runs portable checks; it does not emulate a live Omarchy desktop.
The current preparation is a source publication, not a signed binary release or
marketplace certification. No security audit is implied.

## Guided setup verification

The setup regression tests exercise missing Node/Codex dependencies before the
runtime can start. On Linux with bubblewrap available, the wizard runs with an
empty home and isolated command path, a read-only host filesystem, and fake
package-manager/tool installers. Both successful provisioning and package
installation failure are checked. These fixtures do not verify actual package
downloads, sudo authentication, gopass key generation, or a fresh Omarchy VM.
Tests skip the bubblewrap cases when user namespaces are unavailable.

The missing-dependency Settings screen is rendered with fictional data using
`demo/SetupPreview.qml -- --capture`. The QML test checks that key entry is
disabled until dependencies are available and that SET UP invokes the service.
