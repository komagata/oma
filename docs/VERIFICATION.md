# Verification

The current supported implementation is GPT-Live only. Historical Local/Pi,
prototype and earlier desktop results remain in the
[pre-removal verification record](https://github.com/komagata/oma/blob/before-gpt-live-only-2026-09-29/docs/VERIFICATION.md).
They do not establish that the reduced tree has passed a new live check.

## Offline checks

```sh
npm ci --omit=dev --ignore-scripts --bin-links=false
bash tests/run
git diff --check
omarchy plugin validate .
```

The suite covers memory/transcript persistence and forgetting, credentials,
Live protocol/tool ordering/cancellation, desktop targeting, window restoration,
startup/farewell/playback, captions, language and microphone selection, wake,
face/CRT rendering, setup and packaging. Runtime entry tests use fictional keys,
isolated SQLite and blocked device/network adapters to confirm that old Local
preferences/environment cannot select a retired worker or initiate a paid session.
The real Python/NumPy FFT worker is tested with synthetic PCM, including fragmented
packets, lookahead, silence and reset. These are signal checks, not listening.

`tests/package_test.py` stages into a temporary directory with a fixture npm. It
checks role-based QML entry points, complete production QML payload, staged
directory imports/resources and actual nested Qt component/image loading when Qt
is available, same-hash reuse, separate dependencies for a new hash,
old-build retention and recovery from npm failure. A separate actual staged
production npm install and LiveWS/runtime import smoke are part of this migration's
record below. Neither invokes the live installer or reloads Omarchy.

Qt software fixtures render Settings at 800×900 and 420×700. They use labeled
`qs.Ui` interface doubles, so their appearance is not a native-shell visual check.
GPU fixtures remain enabled in `tests/run` when Qt is present. Setup fixtures
use bubblewrap; they skip only when user namespaces are unavailable.

## 2026-09-29 implementation-worker evidence

- Production npm installation from cache completed with the security flags above
  and `--offline`: OpenAI 7.23.0 and ws 8.21.3 only. LiveWS import succeeded.
- Real isolated package build, C pointer compilation and staged Live imports
  succeeded. Immutable-build/failure fixture and both Python FFT tests passed.
- Focused Live/startup/tools/profile suite: 44 passed, exit 0.
- Software QML: 40 passed, exit 0. Wide/narrow Settings captures were inspected.
- Manifest validation, shell syntax and `git diff --check`: exit 0.
- Full `bash tests/run` could not complete inside the worker sandbox: Node's
  `spawnSync` reports `EPERM` even for `true`; async child stdout is not delivered
  even for a child that only prints a number. Existing setup/restart subprocess
  tests fail and the owned-child termination test waits indefinitely. The run was
  interrupted (exit 130). No affected test was disabled or loosened.
- A diagnostic Node run excluding the two sandbox-hanging files completed with
  180 passes and 5 failures: four subprocess EPERM errors and transcript-follow
  output missing, consistent with the minimal stdout reproduction. This is a
  partial diagnostic, not a replacement for the full suite.
- Both OpenGL QML fixtures aborted with SIGABRT (exit 134) before running tests;
  automatic stack inspection reported `ptrace: Operation not permitted`.
  GPU success is not claimed. The coordinator must rerun the full suite and GPU
  fixtures outside the restricted implementation worker before accepting the diff.

No paid API call, user microphone capture, window action, installed-plugin update,
model download or shell restart was performed for this migration. No listening,
real cloud integration or perceived audio-quality claim follows from these checks.

## Opt-in checks

`tests/live_gpt.mjs` uses billed synthetic Japanese input and fictional memory.
`tests/live_playback.mjs`, greeting/farewell probes and other `tests/live*` files
can use a real speaker, microphone or desktop. Inspect each header and obtain the
appropriate task authorization before running them. `tests/hyprland-context-smoke.mjs`
is read-only but reflects the actual desktop. A real Omarchy session is required
for host UI and window behavior. Physical acoustics, wake pronunciation and
perceived speech quality require human verification.

## Coordinator verification, 2026-09-29

Independent review outside the implementation sandbox completed before integration:

- `bash tests/run`: exit 0; 187 Node tests, 3 Python tests, 40 software QML
  checks and both GPU fixtures (3 checks each) passed, with no Node skips.
- Clean offline production npm installation: exit 0, exactly two dependencies.
- A real isolated package build with npm, followed by staged LiveWS, live-config
  and local-tools imports: exit 0. The temporary package was removed.
- Wide/narrow Settings fixture captures inspected; these use UI doubles, not
  an installed-shell check. Manifest validation and `git diff --check` passed.
- The tagged snapshot's GitHub CI failed before this simplification: four tests
  expect a host-installed Omarchy skill, and Ubuntu's `mv` lacks
  `--update=none-fail`. These existing CI portability issues remain; local green
  tests are not a claim that GitHub CI passed. See
  [snapshot run](https://github.com/komagata/oma/actions/runs/36440900498).

The simplified changes have not been pushed or installed into the live shell.
No cloud/audio listening result is claimed.

## Installation runbook and unattended setup worker, 2026-10-14

- `node --test tests/setup.test.mjs tests/plugin-install.test.mjs tests/install-*.test.mjs`:
  exit 0 (four test files). With `--test-isolation=none`, all 38 individual checks
  passed, with no skips. Fixtures use temporary HOME/XDG paths, package/desktop
  stubs and fictional status values. They cover unattended consent, no prompts,
  package/npm failure and retry, incomplete installation, F8/config preservation,
  conflicting CLI files/symlinks, paths with spaces, manifest payload resolution,
  diagnostic redaction and unavailable service. These are not real hardware tests.
- `npm ci --omit=dev --ignore-scripts --bin-links=false`: exit 0, two dependencies.
- `bash -n scripts/setup scripts/install-cli scripts/oma`, Python compilation of
  `scripts/check-setup.py` and `scripts/doctor` with a temporary pycache prefix,
  and `git diff --check`: exit 0.
- The installed Quattro add/update/enable scripts and their `--help` output were
  inspected read-only to verify flags. This does not establish compatibility
  with every Omarchy installation; the runbook checks local help before proceeding.
- `npm test` was attempted, but did not complete in the restricted worker. It
  reported failures in unchanged agent bridge/MCP, CLI, Hermes and restart tests,
  then stalled in `stop-child.test.mjs`; it was interrupted (exit 130).
  Against the copied baseline, `agent-tool-bridge.test.mjs` reproduced 13 failures
  from Unix-socket `listen EPERM`, and `stop-child.test.mjs` reached the same
  pending-child wait before an eight-second timeout (exit 124). The full suite
  must be rerun independently in a suitable environment; full green is not claimed.

No host package installation, credential/keyring access, billable API call,
physical microphone capture, plugin deployment, GUI test or desktop restart was
performed by this worker. The coordinator owns fresh isolated plugin-install and
service refresh verification. Dependency readiness alone does not prove user
credentials, task-agent authentication, API billing/access or physical audio.

## Fresh Quattro installation investigation, 2026-10-14

- Before the canonical-skill repair, the coordinator independently reran the
  focused installation checks (37/37) and `npm test` (491/491, about 27 seconds,
  `/tmp/oma-install-independent-node.log`). These are offline checks of the
  pre-repair worktree, not evidence that this repair passed the full suite.
- The coordinator cloned public GitHub HEAD `2131c0b` with actual
  `omarchy plugin add --enable --yes` in a fresh Omabox HOME on Quattro 4.0.4-1.
  Clone/enable and npm setup succeeded. The service reported
  `setupRequired: false`, `state: unauthenticated`, and `Omarchy skill not found`.
  The official skill existed at
  `/usr/share/omarchy/default/agents/skills/omarchy/SKILL.md`; runtime and doctor
  only checked the older system layout. Developer HOME links had hidden this
  defect. This was a real isolated plugin installation, not a fixture.
- The repair adds the canonical system layout before legacy fallback, preserves
  explicit/personal overrides, uses the supplied HOME in the Node helper, and
  rejects directory candidates. Regression fixtures use empty temporary HOME
  and fake Omarchy trees without personal links. Doctor keeps credentials,
  agent authentication and physical audio UNVERIFIED even when prerequisites
  are ready. Missing dependencies retain the generic setup action; doctor does
  not forward the checker's free-text output or individual dependency labels.
- After the repair, the implementation worker ran
  `node --test --test-isolation=none tests/omarchy-skill.test.mjs tests/install-doctor.test.mjs tests/setup.test.mjs tests/plugin-install.test.mjs tests/install-guide.test.mjs`:
  43/43 passed, exit 0, no skips. The canonical fixtures failed before the fix.
  `node --check runtime/live-config.mjs`, shell syntax checks of setup/install-cli/
  oma, in-memory Python compilation of doctor/check-setup, and `git diff --check`
  also passed. The worker did not rerun the full suite or perform a GUI test.

The coordinator must independently review the repair, rerun the focused/full
checks and verify a fresh isolated installation of the repaired snapshot.
No repaired-snapshot live result, paid voice call, human-audible response or
physical microphone verification is claimed here.


## Independent installation verification, 2026-10-14

The coordinator reviewed the installation delta against the preserved dirty
baseline at repository HEAD `2131c0b`; unrelated agent/voice work was retained.
The repaired source was copied into a disposable Git repository, snapshot
`1bd54ee83befef13531dbf404e9aa0db7fdcaa87`, for a real local-clone installation.
This snapshot is test evidence, not a published repository commit.

- In a fresh Omabox HOME (Omarchy 4.0.4-1, stock bar, Neon Glow,
  1920×1080, private systemd user session), actual `omarchy plugin add
  /home/sbx/source --enable --yes` succeeded. No personal skill links, credentials,
  microphone or prior O.M.A. configuration were supplied.
- `scripts/setup --non-interactive --install-missing` installed the locked npm
  dependencies and exited 0. Repeating `scripts/setup --non-interactive` exited 0
  without prompts. System packages were already available from the host image;
  actual privileged package installation was not tested (failure/success paths
  use command fixtures).
- Service `retry` after missing-dependency setup started the worker. Doctor exited
  0 with `installationReady: true`, canonical Omarchy skill available,
  `setupRequired: false`, Codex executable available, `keyConfigured: false`, and
  `voiceReady: false` with authentication/audio UNVERIFIED. The earlier missing
  skill error disappeared. The real Settings screen reached API-key onboarding.
- Focused installation and skill regressions: **43 passed**, zero failures/skips.
  The complete Node suite in the box: **497 passed**, zero failures/skips, with
  an explicit test-only `xdg-mime` stub returning no terminal default. The first
  full run passed 496 and failed one existing transcript test because it inherited
  the box's Neovim default and opened an editor instead of its `xdg-open` fixture.
  No production editor behavior was changed; the terminal-editor test supplies
  its own stub and still runs.
- Package tests: **2 passed**; Python streaming-vocoder tests: **3 passed**;
  native Overlay geometry: **PASS**; software QML tests: **45 passed**, no skips.
  Plugin schema/Omarchy validation and whitespace checks passed.
- `bash tests/run` did not finish green: its OpenGL render fixture could not
  initialize an offscreen graphics context in the box. A surfaceless software-GL
  retry had the same failure. Later GPU fixtures were not run; software QML was
  run separately. This is not a claim that all rendering checks pass.
- The installed PC payload was updated to `c05e6f1f11787d1c`, preserving the
  previously installed runtime apart from the installation-related files. Only
  O.M.A. was disabled/enabled to load it. The running process uses that build;
  status and doctor confirm prerequisites ready, the existing key configured,
  and the panel closed/idle. No paid voice session was started.

Re-run the focused checks with:

```sh
node --test --test-isolation=none tests/omarchy-skill.test.mjs tests/install-doctor.test.mjs tests/setup.test.mjs tests/plugin-install.test.mjs tests/install-guide.test.mjs
```

The public GitHub URL was separately tested at pre-change HEAD for clone,
enablement and removal. The repaired snapshot is local and has not been pushed.
API access/billing, task-agent authentication and physically heard microphone/
speaker output still require each installing user's final checks; credentials
were not copied into the box. Test boxes and temporary worktrees are disposable.
