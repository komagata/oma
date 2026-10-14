# O.M.A.

**Omarchy Machine Assistant**, pronounced **OH-mah（オーマ）**.

A voice assistant for the Omarchy desktop with a theme-colored low-poly face.
Talk with GPT-Live, ask it to operate your PC, and remember useful preferences
between conversations.

## Quick start

Give this repository URL to your coding agent and ask it to follow
[the installation runbook](docs/INSTALL.md). It covers Omarchy Quattro setup,
unattended dependency installation, diagnostics, and the user steps for your
OpenAI API key, separately authenticated Codex CLI, and microphone/playback checks.

On an existing Omarchy Quattro desktop:

```sh
omarchy plugin add https://github.com/komagata/oma --enable
```

Then complete **Settings → Get started**, computer setup and API-key onboarding.
Plugin add alone does not install the voice SDK or authenticate your task agent.
Voice API usage requires separate billing; see [requirements](#requirements).

![O.M.A. running on the Omarchy desktop](docs/images/oma-main-20261001.png)

![Real screenshots recorded in an Omarchy VM with the Neon Glow theme: O.M.A. beside Chromium, the approval dialog, and mini mode](docs/images/screenshots.png)

- Spoken conversation with captions, microphone selection, and language settings.
- A holographic interface in your theme color. Every part reports real state: the
  desktop map shows the windows O.M.A. knows about and marks the task target, the
  ring lights LISTEN, THINK, SPEAK, or WORK, the MIC and VOX meters show your voice
  and O.M.A.'s, and the task bar shows running work.
- Desktop tools guided by the bundled O.M.A. skills and your installed Omarchy skill.
- Locally stored memories and searchable conversation transcripts.
- A compact mini mode and a companion tile beside an application.
- Optional voice wake and camera support.

## Requirements

- **Omarchy Quattro**, with its desktop shell and Omarchy skill installed.
- **Codex CLI** (the default task agent), separately installed and authenticated
  on the desktop session PATH, or another explicitly configured task agent.
- **An OpenAI project API key with GPT-Live access** and API billing enabled.
  ChatGPT subscriptions do not include API usage. Voice sessions incur duration
  charges, with additional usage for the selected task agent.
- A working microphone and audio output. Setup checks for **Node.js 24+**, npm,
  **Python 3 with NumPy**, PipeWire with WebRTC echo cancellation, WirePlumber,
  grim, wtype, xdg-open, setpriv, secret-tool for desktop keyring support,
  xdg-terminal-exec, and systemd-run, and offers to
  install missing dependencies.

Mouse control requires the optional C/Wayland helper built during setup.
Camera support requires FFmpeg and v4l2-ctl. Optional voice wake uses local Vosk
recognition and downloads Japanese and English models during setup.

## Choose a task agent

Settings → **Task agent** selects **Codex CLI** (default),
**Claude Code**, **Hermes Agent**, or **OpenClaw**. GPT-Live continues to handle the microphone,
voice, captions and voice effects, so its OpenAI API key is required for every
choice. The choice is saved locally and changing it restarts the voice session.
On upgrade, an unset selection or the retired `openai` selection is saved as
`codex`. Existing Claude, Hermes and OpenClaw selections are preserved. If Codex
is unavailable, install/configure it or select another configured agent; there
is no automatic fallback.
Switching is refused during tasks, connection tests, key saving or other busy
session work. Stop the current task or wait for it to finish first.

External agents must already be installed on O.M.A.'s `PATH` and configured with
their own credentials and provider/model. O.M.A. does not install them, change
providers, pass approval-bypass flags or fall back to another agent. “CLI found”
only means an executable exists; a bootstrap wrapper can still be unusable.
Errors appear in Settings and the conversation task bar with a brief spoken
failure. Use the CLI directly to diagnose setup and authentication errors.

| Agent | Required interface | Successful reply |
| --- | --- | --- |
| Codex CLI | By default, `codex exec --json --ephemeral --sandbox read-only --skip-git-repo-check --cd <OMA-data>/workspace -`; with `OMA_WORKSPACE` set to a Git repository root, `--sandbox workspace-write --cd <repository> -` | Final agent message after a completed turn |
| Claude Code | `claude -p --output-format json --no-session-persistence --permission-prompts none --mcp-config <private config> --allowedTools <named OMA MCP tools>`; request and bounded context arrive on stdin | Exit 0 and a single JSON `type: "result"`, `subtype: "success"`, `is_error: false` with a nonempty string `result` |
| Hermes Agent | `hermes -z <fixed instruction containing the temporary file path>`; the UTF-8 prompt file is private (`0700` directory, `0600` file) | Nonempty final stdout and exit 0; a provider and model must be configured |
| OpenClaw | `openclaw agent --local --agent main --message-file <private file> --json`; authentication must be configured | Completed response in `payloads` or `meta.terminalReply`, with exit 0 |

Codex runs in `OMA_WORKSPACE`, or the private `<OMA-data>/workspace` if unset. OMA data is
`OMA_DATA_DIR`, otherwise `$XDG_DATA_HOME/oma`, otherwise `~/.local/share/oma`.
OMA creates its default workspace with mode 0700 before launching a task agent;
LocalTools file and command operations use the same canonical directory.
Explicit `OMA_WORKSPACE` must be an existing absolute directory; invalid values
fail without creating the selected directory. Codex additionally requires an
exact Git repository root to enable workspace writes. HOME remains unchanged,
so Codex's existing `~/.codex/AGENTS.md` instructions still apply.
Codex's built-in tools use a read-only sandbox by default. To allow those tools to edit a project, set `OMA_WORKSPACE` to the absolute
root of a trusted Git repository or worktree. O.M.A. rejects broad, missing and
non-repository paths before starting Codex. This sandbox does not constrain OMA
MCP tools: `write_file`, `run_command` and desktop actions execute in O.M.A.'s
process with its OS permissions, including outside the Codex workspace.
For OpenClaw local, `OMA_WORKSPACE`
is included as a reference path; its tools run in the configured main-agent
workspace. Hermes and OpenClaw follow their own execution policies; O.M.A. does
not enforce a sandbox for either.

Codex and Claude receive user text, bounded recent conversation, saved memory and window
metadata on stdin. Hermes and OpenClaw receive the request through private
temporary UTF-8 files, deleted after the run; user text and context are absent
from process arguments, which contain only a file path. The CLI's configured
provider receives that context and may retain its own history under its existing
policy. Memory and window data are marked as untrusted reference. Each request
is a separate one-shot run. Codex and Claude receive a private per-task OMA MCP
server exposing the same local tools, structured camera/screenshot images,
confirmation buttons and durable AO job tools. O.M.A. owns these
calls and explicit `confirm_action` requests; tool results preserve image
blocks. Owner tool calls execute one at a time within each CLI task, with at most
32 pending bridge calls. Stop, disconnect or task completion skips queued calls;
failed calls are not retried automatically. Hermes and OpenClaw do not receive this MCP connection. The CLI prompt
points to O.M.A.'s bundled skill for supported operations.

Claude requires its own authentication, provider/model, settings, `CLAUDE.md`
and skills. Check `claude auth status` and, if needed, run `claude auth login`
yourself. The OpenAI API key still supplies GPT-Live voice; it does not sign in
Claude. O.M.A. reports authentication/setup failures without switching agents.
Claude runs in `OMA_WORKSPACE`, or the private `<OMA-data>/workspace` if unset; O.M.A. does not impose
Codex's filesystem sandbox on it. Use a trusted workspace. The adapter retains
Claude's existing settings and MCP servers, sets no model or permission mode,
and adds only explicit `mcp__oma__<tool_name>` allowances. Unanswered permission
prompts are denied by `--permission-prompts none` (Claude Code 2.1.259 or later).
Built-in tools follow existing Claude permissions; OMA buttons answer explicit
OMA `confirm_action` requests. The temporary MCP configuration contains the bridge token in a `0600`
file inside a `0700` directory and is deleted on every completion/error/abort.
Neither token nor prompt/context is placed on argv. No persistent Claude
configuration is changed by the adapter. `--no-session-persistence` disables
resumable CLI sessions; it does not change provider retention or user hook behavior.
Bridge tests cover all 27 registered LocalTools and structured image/approval
transport. Representative authenticated Codex and Claude runs used `camera_list`
and returned the camera count through speech. A Claude `confirm_action` run reached
O.M.A.'s approval state and Stop cancelled it. These checks do not establish that
every hardware action has been exercised live.

Selecting Codex or Claude exposes OMA MCP tools under O.M.A.'s OS permissions.
Their instructions and tool descriptions require `confirm_action` before
consequential operations; this is not an automatic enforcement gate on every
write, command or desktop action. O.M.A.'s buttons cannot approve CLI built-in
tool calls, which follow the CLI's own execution policy.
OpenClaw `agent --local` uses the configured main agent and its execution
policy in the main-agent workspace. Review that CLI's configuration before
selecting it for desktop work.

Voice delegations wait briefly for transcript fragments and use only new user
text. Typed requests go directly to the selected CLI once. A second request while
CLI work is active is refused with a wait-or-stop message, including corrections;
it is not queued or silently restarted. Completed replies return to GPT-Live for
speech. O.M.A. checks process exit and final-result format, not the truth of every
claim the agent makes. Calls time out after three minutes and combined output is
limited to 1 MiB. Stop/close aborts the local process and ignores late replies;
partial actions may already have happened, and detached or remote work may need
inspection in the owning CLI. Failed or incomplete runs never count as success.

The adapter contracts follow the official [Live client delegation guide](https://developers.openai.com/api/docs/guides/live-delegation),
[Hermes one-shot CLI](https://hermes-agent.nousresearch.com/docs/reference/cli-commands),
[Claude CLI reference](https://code.claude.com/docs/en/cli-reference),
[Claude MCP documentation](https://code.claude.com/docs/en/mcp),
and [OpenClaw `agent --local` reference](https://docs.openclaw.ai/cli/agent).

## Install and set up

For coding agents, unattended setup and troubleshooting, follow the complete
[installation runbook](docs/INSTALL.md).

```sh
omarchy plugin add https://github.com/komagata/oma --enable
```

1. Open O.M.A. from its bar icon, then open **Settings**. On the welcome screen,
   select **Get started**. If dependencies are missing, select
   **Set up this computer** on the next screen.
   If the setup terminal cannot open, run
   `bash ~/.config/omarchy/plugins/io.github.komagata.oma/scripts/setup`
   in your terminal, then reopen Settings.
2. Enter your **OpenAI API key** and select **Save key**. This key connects
   GPT-Live voice. Task agents use their own authentication. Saved keys stay masked; enter a replacement
   and select **Update key** to save it to the desktop keyring.
3. Choose **Microphone** and **Spoken language**. The microphone choice applies
   to conversation and voice wake without changing your system default.
   Use **Refresh devices** after connecting a device.
4. Select **Test voice** for a short, billable playback test that does not record
   your microphone, then **Start talking**.

Setup offers an optional **F8** shortcut when the key is available. Voice wake
also needs to be enabled in Preferences after setup. Setup does not update the
whole system or restart the desktop shell.

## Use

Open O.M.A. with the bar icon, F8 if configured, or by saying “Hey OH-mah” in
English or “ヘイ、オーマ” in Japanese if voice wake is enabled. Speak naturally; GPT-Live handles continuous listening and speech.
Try “Open the last URL”, “Create a new note in OmaText”, “Remember that I use
Chromium”, or, with camera support configured, “What am I holding?”

Task-agent instructions require local confirmation buttons for consequential
actions; this is a prompt policy, not an automatic enforcement gate on every
operation. A spoken “yes” does not answer an explicit confirmation button.
Talking over a reply does not cancel PC work. Use **Stop** or
**Escape** to close the session and cancel pending local operations; this does
not undo completed actions. Say “Thanks, bye” to end a conversation; O.M.A.
answers with a short recorded farewell and its closing sound.

Paid sessions connect when you open a conversation and close when it ends.
After inactivity, O.M.A. gives a reminder and then says goodbye and dismisses
itself. Pending tasks, approvals, and accompanying an application pause idle
dismissal. Opening Settings and the local wake listener do not open paid sessions.

### Transcripts

Setup installs the `oma` command in `~/.local/bin`; keep that directory on `PATH`.
After updating an existing installation, rerun `scripts/install-cli` from the
plugin directory so `~/.local/bin/oma` uses the current payload layout.

```sh
oma transcript          # Open the current or most recent conversation
oma transcript --today  # Open today's conversations (local timezone)
oma transcript --follow # Follow live captions in the terminal; Ctrl+C exits
```

Plain-text exports open in your default text application via `xdg-open`; a
terminal editor such as Omarchy's default Neovim opens in a terminal through
`omarchy-launch-editor`. Exports are stored under `~/.local/share/oma/transcripts/` by default. Run the command again
to refresh an export, or use `--follow`. Captions are model transcripts, not an
exact record of what you heard, especially when speech is interrupted.

### Durable development jobs

Ask O.M.A. to implement a local change, then later ask for that job's progress or
pending questions. Agent Orchestrator (AO) runs the development worker separately;
closing the voice session or reopening O.M.A. does not cancel a launched job.
O.M.A. returns a job ID and can also save it in local memory. If the session ends
before it saves the ID, ask for progress or pending questions: O.M.A. uses
`list_development_jobs` to rediscover jobs from durable AO records. When several
jobs could match, it asks which one before using the selected exact ID. Progress
and answers use AO's durable records; execution finishing still requires
independent diff review and validation.

While O.M.A.'s runtime is running, it checks these jobs every 25 seconds and
proactively speaks pending questions, terminal results, and changed progress.
It opens the normal microphone-enabled panel through the existing wake route
when hidden, then waits for conversation, tools, approval and opening audio to
be quiet. Progress is limited to once per three minutes per job; questions take
priority over results, and results replace obsolete progress. Answer a question
normally; O.M.A. still verifies the exact job and pending question before sending
your explicit answer. Quoted job text is untrusted data and cannot run tools
during a notice. Success means execution finished, with independent review still
required. Japanese and English notice wording follows the response language.

Notification observations and delivery cursors are saved locally in O.M.A.'s
memory database. First use baselines historical completed jobs. Newly launched
jobs are registered immediately, and queued changes survive restart; a notice
already handed to a started voice session is not replayed. This is a handoff
guarantee, not confirmation that every word was audible: interruption or a crash
after handoff can cut speech short. Polling failures retry silently and retain
pending state. Each poll reads at most four jobs (eight detail requests) from
the latest 20 O.M.A. jobs, rotating between them. Retention is bounded to 40 job
cursors, 128 delivered question IDs, eight queued questions and four pending
terminal transitions per job, and 32 ready notices. Older entries can be checked
explicitly with the job tools.

Starting requires all five fields: `workspace` (an existing clean Git repository
root), `request` (a specific change), `allowed_paths` (a bounded list of relative
files or subtree globs), `files_to_inspect` (named files, symbols and relevant
context), and `validation_commands` (focused checks). O.M.A. asks for missing scope
before launching. Inspection and validation fields are task text for the worker;
the bridge does not execute them as commands. For example, specify a label fix in
`/home/komagata/Projects/example`, allow `src/label.mjs` and `tests/label.test.mjs`,
name the renderer and existing test pattern, and request the focused Node test.

AO and an authenticated local Codex CLI must already be installed. The bridge
discovers AO's runner in the local Codex plugin cache, or uses an absolute
`OMA_AO_RUNNER` override. It verifies `codex-cli=gpt-6.1-sol` with `medium` effort
through AO's catalog and uses that exact executor; unavailable integration is an
error with no CLI/model fallback. Workspaces must be strictly beneath the user's HOME by default
(`OMA_DEVELOPMENT_ROOT` can select another existing root). Symlink escapes,
HOME itself, dirty workspaces, and non-Git directories are refused.
`~/Projects` is optional and is never created by OMA.

Each start creates a structured AO plan and task, then launches into a private
detached Git worktree under `~/.local/share/oma/dev-jobs/` (or the configured OMA
data directory). Short bridge commands have bounded duration and output; setup
has a 60-second deadline, while the detached development worker has a two-hour
timeout. Worktrees and task records are retained for review and are not removed
automatically. Changes stay in that worktree; this slice does not merge them back.
Failed setup can also leave a worktree or plan for inspection. If launch fails,
check the reported job ID before trying another start.

`list_development_jobs` takes no parameters and returns the latest 20 jobs with
ID, state, creation time and bounded workspace text, plus a `truncated` flag.
Only `oma-` IDs with workspaces under the current OMA `dev-jobs` state directory
are included; it does not expose raw worker logs. Older jobs beyond that limit
require their exact ID. Changing the OMA data directory changes the discovery scope.
Use `development_job_status` and `development_job_questions` with the job ID;
`answer_development_job_question` additionally requires the exact pending question
ID and your explicit answer. Answers travel through a temporary user-only file
that is removed afterward; AO retains the answered question and audit history.
These tools do not authorize commits, pushes, PRs, publishing, production or
credential changes, dependency installation, or destructive cleanup. A worker
must ask through its AO channel before consequential actions or unresolved
decisions, and those fixed restrictions remain in force after an answer.

### Mini mode

Say “Switch to mini mode” to show only the animated face in a small window.
Say “Return to normal mode” or double-click the face to toggle modes.
Audio and conversation continue; approvals, questions, and errors temporarily
show the full interface. The mode lasts until the plugin reloads.

### Window

O.M.A. is an ordinary window. At startup it registers its own Hyprland window
rules (floating, centered, opaque, and a borderless mini mode), and registers
them again after a Hyprland config reload, so your Hyprland configuration needs
no edits.

### Alongside an application

While O.M.A. is visible, opening a regular application on its workspace and
monitor automatically places O.M.A. in a narrow tile on its right, including
manual launches and launches while Settings is open. This layout handling does
not start an AI session. Existing windows, focus changes, other workspaces or
monitors, and detectable dialogs/popups do not trigger it.
Closing that application restores O.M.A.'s previous floating position, size,
and mode; changing focus does not. Say “Come back” to restore the floating
window without closing the application. This requires Hyprland's **dwindle**
layout and a regular, non-fullscreen application window.

## Data and configuration

O.M.A. uses cloud AI: conversation audio and voice-session context go to OpenAI.
The selected task CLI and its configured provider receive the context needed for
tasks, including recent conversation, saved facts and desktop window metadata. Local storage does not make conversations offline or keep all
content on this PC.

Memories and transcripts are stored locally in `~/.local/share/oma` by default.
Ask O.M.A. to remember preferences, search past captions and URLs, or forget
matching records. Forgetting also deletes matching transcript rows and generated
exports, and closes the current voice session. It does not erase copies or
backups saved elsewhere.

With Hermes selected, O.M.A. supplies its shared context while Hermes still loads
its own native memory snapshot. O.M.A. requires `bwrap` (bubblewrap) and mounts the
selected Hermes profile's existing `memories` directory read-only for each task.
Missing isolation support or a missing/symlinked memory directory stops that task;
OMA does not fall back to writable Hermes memory. Existing Hermes configuration,
authentication and skills remain in place; direct `hermes` use is unchanged.

To save an OMA fact with Hermes, state it explicitly, such as
`私の好きな飲み物はコーヒーです。覚えて` or `Remember that I prefer coffee`.
A private task connection accepts one exact fact proposal. OMA saves it to its own
memory only after successful CLI completion and connection cleanup, then confirms
the DB write. Failed or cancelled tasks discard proposals. Ambiguous references
need clarification; ordinary conversations do not automatically create facts.
This narrow connection does not expose OMA's other LocalTools to Hermes.

The defaults are `gpt-live-1` with voice `cedar` and Codex CLI for tasks.
`OMA_LIVE_VOICE` overrides the voice. Task models follow the selected CLI
configuration; the former `OMA_BACKEND_MODEL` override is no longer used.

## Update

For a Git-managed installation created with `omarchy plugin add`:

```sh
omarchy plugin update io.github.komagata.oma
```

## Development

Production QML lives in [`qml/`](qml): `BarWidget.qml`, `Overlay.qml` and
`Service.qml` are the host entry points; [`qml/views/`](qml/views) contains
Conversation and Settings; [`qml/components/`](qml/components) contains shared
visual components. The root `manifest.json` points into this tree. Directory
imports and relative resource paths work in both Git checkouts and immutable
`builds/<hash>/` packages; runtime, scripts and assets remain beside `qml/`.

From a development checkout:

```sh
npm ci --omit=dev --ignore-scripts --bin-links=false
bash tests/run
omarchy plugin validate .
```

The offline suite includes QML/GPU fixtures when Qt is available. The `tests/live*`
checks are opt-in and billable, and some use the real microphone or desktop;
inspect each file before running it. See [verification](docs/VERIFICATION.md)
for coverage and limitations.

To install a development checkout locally, run `scripts/install-local`. It
builds the mouse helper, installs the [runtime payload](scripts/runtime-files.txt)
with its own production dependencies, and reloads only O.M.A. Older builds are
retained. **This installer refuses Git-managed installations**; use the update
command above for those. Installing npm dependencies alone does not install the
Omarchy plugin.

See [design](docs/DESIGN.md), [architecture decisions](docs/adr/README.md),
[package footprint](docs/FOOTPRINT.md), and the [historical archive](docs/ARCHIVE.md)
for details.

## Remove

```sh
omarchy plugin remove io.github.komagata.oma
```

Local memories and transcripts remain in `~/.local/share/oma`.
