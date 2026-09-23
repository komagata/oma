# Architecture

O.M.A. means Omarchy Machine Assistant, pronounced OH-mah. It uses OpenAI Realtime
for spoken interaction and Codex App Server for requested desktop tasks.

## Ownership

The plugin (`io.github.komagata.oma`) exposes a bar widget, panel, and service.
QML runs inside the existing Omarchy shell. Service.qml owns one Node worker;
the worker owns audio, wake detection, memory, and the dedicated Codex child.
F8 opens the panel. Conversation capture is automatic while the panel is open.

The overlay appears on the focused monitor with a local feathered backdrop,
not a full-screen scrim. Theme updates flow from the active-window border color.
Closing stops playback and requests task cancellation; completed actions remain.
Generation fences reject late audio and tool events after interruption.

## Audio and rendering

Speech uses 24 kHz mono PCM. A private PipeWire WebRTC echo canceller routes
playback and input without changing default devices. Standby capture retains
pre-roll and transfers its recorder to the conversation after speech detection.
Five seconds of detected silence ends the turn; a hard limit bounds recordings.
Other applications can record the same microphone concurrently.

Cedar output receives an electronic effect and lookahead limiting. The face uses
an authored triangular mesh with jawOpen, lipRound, and lipWide shape keys.
Playback amplitude and spectral cues drive the mouth; head motion is procedural.
There are no teeth, tongue, or pupils. This is not phoneme-level lip synchronization.

The optional wake detector is local Vosk with a Japanese phrase grammar. It pauses
on mute, lock, or unavailable status. It is not speaker authentication.

## Memory and restart

SQLite stores conversations, facts, exact URLs, action results, and task checkpoints.
Context is bounded to 18,000 bytes with separate allocations for recent turns,
references, facts, history, summary, and current work. Search uses literal substrings.
Older conversation context is summarized after 10,000 uncompressed characters;
twelve recent events stay verbatim. Original text remains locally searchable.

Forget removes matching source records, derived summary/checkpoint state, and
executor context. Revision fences reject stale asynchronous results. It does not
erase external files or backups.

An independent systemd user job reloads O.M.A. and verifies the panel reopened.
The development installer uses the same isolation. Normal installation and
updates use the Omarchy plugin manager; the ws library is vendored so no npm
installation hook is required. The optional mouse helper is built explicitly.
A hash of the bundled skills prevents reusing a Codex thread with obsolete instructions.
Task checkpoints record requests and commands before execution completes; after a
restart they are evidence of potentially interrupted work, not proof of success.

## Access and data boundaries

Keys are retrieved in the Node worker. QML does not retain or display secret values.
The dedicated CODEX_HOME avoids changing the user's normal Codex login.
Requested screenshot and camera operations send images to OpenAI; audio input
is streamed for conversation but not saved locally by O.M.A.

Codex has full desktop access. Consequential-action confirmation is an agent-level
policy, not an OS sandbox. External text, images, and saved memory are reference
data rather than instructions. Desktop actions require recent observations.

See README.md for dependencies, installation, supported environment options,
privacy behavior, and current limitations.
