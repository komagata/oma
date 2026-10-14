# Install O.M.A. with a coding agent

Give your coding agent `https://github.com/komagata/oma` and ask:

> Install O.M.A. by following docs/INSTALL.md. Preserve my existing configuration.
> Report installation, credentials, task-agent authentication and voice verification
> separately. Ask me to handle credentials in the UI or the CLI's own login flow.

This runbook is for **Omarchy Quattro on a Linux Wayland desktop session**, with
its desktop shell and official Omarchy skill installed. It does not install
Omarchy, migrate another desktop, configure remote/headless audio, or support
macOS/Windows. A GitHub clone by itself is not an installation. Omarchy's plugin
add command clones, validates and optionally enables the plugin; it does **not**
run O.M.A. setup or `npm ci`.

Voice needs an OpenAI project API key with GPT-Live access, API billing, a working
microphone and output device. ChatGPT subscriptions do not include API usage.
The default task agent is **Codex CLI**, installed and authenticated separately;
its executable being present is not proof it works. Preserve any existing selected
agent/provider and account. See [task-agent interfaces](../README.md#choose-a-task-agent).
AO is needed only for durable development jobs, not basic voice installation.

## 1. Preflight the supported session

Work as the desktop user, not root. Verify Linux, a Wayland session and the running
Quattro shell before installing. If tools/session are missing, stop with the exact
blocker instead of using ad hoc sudo commands or changing the desktop.

```sh
uname -s
printf 'Wayland session: %s\n' "${WAYLAND_DISPLAY:-unset}"
command -v omarchy omarchy-shell hyprctl python3 git
omarchy-shell shell ping
omarchy plugin add --help
omarchy plugin update --help
omarchy plugin enable --help
```

Check that `omarchy plugin list --json` works and that the official Omarchy skill
file exists at `${OMARCHY_PATH:-/usr/share/omarchy}/default/agents/skills/omarchy/SKILL.md`.
O.M.A. searches an explicit `OMA_OMARCHY_SKILL` first, then the user's
`.agents/skills/omarchy/SKILL.md`, `.pi/agent/skills/omarchy/SKILL.md` and
`.codex/skills/omarchy/SKILL.md`, then that canonical system file. The older
`$OMARCHY_PATH/default/skills/omarchy/SKILL.md` layout remains a final compatibility
fallback. A directory is not a skill file. A fresh Omarchy installation needs no
personal symlink or copied developer skill. If the official file is missing,
stop and restore it through supported Omarchy setup. No version-number minimum
beyond Quattro is assumed.

Setup checks Node.js **24+**, npm, Python 3 with NumPy, PipeWire tools/recording/
playback, WirePlumber, grim, wtype, bubblewrap, setpriv, xdg-open, libsecret's
secret-tool, xdg-terminal-exec and systemd-run. Check the Node selected by PATH;
a different GUI PATH can select an older Node or hide the task CLI.

## 2. Locate or add the plugin

Inspect `omarchy plugin list --json` and the catalog before deciding to add. The
installed add/update commands currently use `$HOME/.config/omarchy/plugins`;
O.M.A.'s own CLI/diagnostics use `$XDG_CONFIG_HOME` when set. If these differ,
locate the authoritative manifest in `omarchy-plugin-catalog`; use its folder
explicitly rather than cloning a duplicate. Commands below use the usual add path.

```sh
plugin="$HOME/.config/omarchy/plugins/io.github.komagata.oma"
```

If absent, and the user authorized installing this repository:

```sh
omarchy plugin add https://github.com/komagata/oma --enable --yes
```

`--yes` explicitly approves the trusted repository's clone; `--enable` is required
for unattended enabling. Plugins execute with the desktop user's permissions.
These flags are supported by Quattro's add command; if local `--help` disagrees,
stop and report it. Do not feed `yes` to commands.

If already installed, reuse it. Before a requested update, inspect:

```sh
git -C "$plugin" status --short
git -C "$plugin" remote -v
omarchy plugin validate "$plugin"
```

Stop before updating a dirty, unexpected-origin or non-Git installation; preserve
its files and ask the user how to proceed. For a clean, expected Git install and
an authorized update, use only `omarchy plugin update io.github.komagata.oma --yes`.
Never update all plugins, reset local changes, or replace a packaged installation
with a Git clone. Re-resolve the payload after every update.

## 3. Resolve the payload and complete setup

Git installs point at `qml/Service.qml`; local packages can point at
`builds/<hash>/qml/Service.qml`. Resolve the manifest rather than guessing a build
folder or running setup in a development checkout:

```sh
payload="$(python3 - "$plugin" <<'PY'
import json, sys
from pathlib import Path
plugin = Path(sys.argv[1]).resolve()
manifest = json.loads((plugin / 'manifest.json').read_text())
assert manifest['id'] == 'io.github.komagata.oma'
service = (plugin / manifest['entryPoints']['service']).resolve()
print(service.parent.parent if service.parent.name == 'qml' else service.parent)
PY
)"
python3 "$payload/scripts/check-setup.py"
bash "$payload/scripts/setup" --help
bash "$payload/scripts/setup" --non-interactive
```

Without `--install-missing`, unattended setup verifies existing dependencies and
installs the local `~/.local/bin/oma` helper, but refuses missing packages/SDK.
It never prompts. If required dependencies are missing and installing them is
within the user's authorized scope, rerun:

```sh
bash "$payload/scripts/setup" --non-interactive --install-missing
```

This consents only to the listed missing required Arch packages and locked local
npm dependencies. It runs `sudo -n pacman -S --needed --noconfirm <packages>` and
`npm ci --omit=dev --ignore-scripts --bin-links=false` as the desktop user.
There is no system upgrade, privilege/password bypass or root npm installation.
Unavailable privilege or package/npm failure exits nonzero, with retry guidance.
If privilege is unavailable, the user must run `bash "$payload/scripts/setup"`
in their own terminal and approve the listed packages there. Never automate a
password, alter sudo rules or run a blanket system upgrade.

Optional echo cancellation installation, pointer, wake and F8 configuration are
skipped in unattended mode. The no-flag setup remains interactive, with EOF
meaning decline. Successful retries preserve saved conversations, keys and
existing shortcuts. F8 edits use `$XDG_CONFIG_HOME/hypr/bindings.lua` (otherwise
`~/.config/hypr/bindings.lua`), with a backup before an accepted edit.

If Python itself is missing, hand off to the supported desktop's package setup;
the Python checker cannot bootstrap its own interpreter. An old Node on PATH
requires fixing that selected installation, not changing dependency versions.

Setup installs the transcript CLI; verify/reinstall explicitly after an update:

```sh
bash "$payload/scripts/install-cli"
test -x "$HOME/.local/bin/oma"
command -v oma
python3 "$payload/scripts/check-setup.py"
```

The final dependency JSON must say `setupRequired: false`. A conflicting
`~/.local/bin/oma` is preserved and setup fails; ask the user to resolve it.
Keep `~/.local/bin` on PATH. Do not overwrite an unrelated command or silently
edit shell profiles. For a nonstandard plugin folder, set `OMA_PLUGIN_DIR` to the
manifest folder when using `oma` or doctor; O.M.A.'s CLI defaults to the XDG folder.

## 4. Refresh and verify O.M.A.'s service

A fresh enable may have stopped at the missing SDK. Setup in a terminal does not
by itself rerun the service check. `retry` rechecks dependencies when setup is
required and starts the worker after success. Use the existing IPC:

```sh
if omarchy-shell io.github.komagata.oma status | python3 -c 'import json,sys; sys.exit(0 if json.load(sys.stdin).get("setupRequired") is True else 1)'; then
  omarchy-shell io.github.komagata.oma retry
fi
python3 "$payload/scripts/doctor" --plugin-dir "$plugin" --json
```

Wait briefly for the check/worker, then recheck status (do not repeatedly call
`retry` once `setupRequired` is false: it can connect a paid voice session).
Require `setupRequired: false`, and inspect `agentBackend`, `agentOptions` and
`keyConfigured`. Do not print whole status into shared logs: other runtime status
fields can contain user/provider text. Doctor emits only whitelisted readiness
fields and no secret values. It has subprocess timeouts, performs no key lookup,
paid test, agent call, microphone capture, or optional feature check. It returns
nonzero for missing installation prerequisites, skill, service or selected agent
executable. Credentials/authentication/audio remain separate checkpoints;
`voiceReady` stays false until the human checks below are reported separately.

If discovery/service is absent, validate the located manifest and run
`omarchy-shell shell rescanPlugins`, then enable only O.M.A. If retry cannot
refresh an already running instance after update, record the existing O.M.A. bar
placement, stop active work with the user, and narrowly disable/enable
`io.github.komagata.oma`, retaining its placement. Never restart the whole shell,
change another plugin, or use `scripts/install-local` on a Git install.

## 5. User credential handoff and voice verification

Open **Settings** through the bar icon or
`omarchy-shell io.github.komagata.oma settings`. **Get started** leads through
computer setup to the API key page. Have the user enter their OpenAI project key
in that masked UI and select **Save key**. Existing keys stay masked; replacement
uses **Update key**. Never request a key in chat or argv, copy another developer's
key, read gopass/keyring entries, or retrieve the account's credentials for them.
If saving fails, ask the user to unlock their desktop keyring and retry; having
`secret-tool` installed alone does not prove the keyring is usable.

For the default Codex task agent, first inspect availability without starting an
agent turn:

```sh
command -v codex
```

If absent and CLI installation is authorized, use Omarchy's supported wrapper:

```sh
omarchy mise install codex
```

Inspect the installed `omarchy-mise-install` procedure first; this wrapper writes
`~/.local/bin/codex`. Preserve any existing file there, even if it is outside PATH,
and ask the user to resolve a conflict rather than overwrite it. The wrapper
downloads/installs Codex on its first invocation. With installation authorized,
wait for the first `codex --version` to finish successfully before reporting the
CLI installed; wrapper presence alone is not readiness. For an existing CLI,
verify it with the same version command. Then check authentication read-only:

```sh
codex --version
codex login status
codex login --help
```

The user authenticates in their own terminal with `codex login`, or
`codex login --device-auth` when their local login help supports it. Do not request
or retrieve credentials, change an existing provider/model/account, or log out an
authenticated user. For an existing different selected agent, follow its own
login/configuration flow and preserve that selection. Compare terminal
availability with `agentOptions` reported by the GUI service. Successful login
does not verify delegated task execution; never start an agent turn as a
supposedly read-only authentication probe.

In Settings choose **Microphone** and **Spoken language**; **Refresh devices**
after attaching hardware. With explicit consent to API charges, have the user
select **Test voice** (a short playback test; it does not record the microphone).
Then start a brief conversation to verify physical microphone, heard response
and captions. Request one harmless desktop check, such as listing open windows,
and confirm the result against the visible desktop. If the user wants a changing
action, discuss that action and its permissions before trying it. O.M.A.'s
instructions ask for `confirm_action` before consequential tools; this is a
prompt policy, not an automatic enforcement gate on every operation.

Report each checkpoint explicitly:

| Checkpoint | Evidence / blocker |
| --- | --- |
| Plugin installed and enabled | Correct manifest/catalog ID, service responds |
| Dependencies ready | Payload checker and service both `setupRequired: false` |
| Credential configuration | `keyConfigured: true`; this does not prove API access/billing |
| Task agent | Selected CLI found on GUI PATH; user completes its authentication separately |
| Voice API/playback | User-approved billable Test voice passes and user hears output |
| Microphone and desktop tools | User confirms brief conversation and harmless desktop check |

If credential, provider access, billing, agent auth or physical hardware checks
remain unavailable, report **dependencies ready, voice readiness blocked or
unverified** with the next human action. Do not call a plugin icon or green
`modelReady`/`speechReady` a successful voice installation.

## Optional features

Rerun interactive setup only when the user requests optional features. Pointer
control builds a C/Wayland helper. Voice wake downloads Japanese and English
Vosk models, then must be enabled in Preferences. F8 is offered only when the
binding is available; existing assignments are preserved. Echo cancellation
uses PipeWire's WebRTC support; missing support affects acoustics and needs user
listening checks. Camera support separately needs FFmpeg and v4l2-ctl; install
only when requested, with camera permission and hardware checks. None is
required for doctor to report core installation prerequisites.

## Troubleshooting, updates and removal

- **Plugin not discovered:** verify ID/manifest, validation and catalog path;
  rescan, then enable only O.M.A. Do not reclone over an existing folder.
- **SDK missing or setup still shown:** run setup from the manifest-resolved
  payload, check its npm error, rerun the checker, then service `retry` while
  `setupRequired` is true. A staged package has its own node_modules.
- **Node or agent differs in GUI:** compare terminal PATH with GUI readiness.
  Fix the user's session PATH through their supported desktop setup, then reload
  only O.M.A. Do not assume a shell alias or terminal-only version manager works
  in the GUI, or restart the desktop automatically.
- **No CLI:** rerun `install-cli`, check conflicts and `~/.local/bin` on PATH;
  set `OMA_PLUGIN_DIR` if the actual manifest is outside the default XDG folder.
- **Key save fails:** user unlocks/sets up the desktop keyring; never diagnose by
  dumping stored secrets. `keyConfigured: false` may also reflect a missing
  official Omarchy skill. Recheck doctor and UI errors.
- **No audio:** user checks microphone selection, PipeWire/WirePlumber and
  output routing. Doctor deliberately leaves physical devices UNVERIFIED.
- **Update:** inspect clean/dirty/origin first, update only O.M.A. when authorized,
  resolve the payload again, rerun setup/install-cli and the checkpoints. Update
  retains local memories, transcripts, keyring keys and user shortcuts; do not
  migrate/delete them. Locally packaged older builds are retained.
- **Remove, only on request:** `omarchy plugin remove io.github.komagata.oma`
  removes the plugin (Git checkout deletion is confirmed). Memories/transcripts
  remain under `OMA_DATA_DIR`, else `$XDG_DATA_HOME/oma`, else
  `~/.local/share/oma`; keyring credentials, optional downloaded models, F8 edits
  and `~/.local/bin/oma` may remain. Explain these remnants; do not delete data,
  credentials, bindings or unrelated dependencies as part of normal removal.
