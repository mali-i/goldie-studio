# Goldie Studio

Goldie Studio is a self-contained, upload-first Vite application. It starts
with bundled demo data and does not require a simulator, capture flow, or
generated manifest.

```bash
bun install
bun run dev
```

Open <http://localhost:4321>. Demo design changes are saved in browser local
storage. Create a project from the project picker, upload PNG, JPEG or WebP
screenshots, adjust the design, and export a ZIP directly in the browser.

Each project lives under `workspace/<project-name>/` with its own managed
`goldie.config.ts` and `screenshots/` directory. `workspace/` is ignored by
Git. Unsafe path characters in a project name are replaced with `-`, and a
numeric suffix distinguishes duplicate names. Set `GOLDIE_STUDIO_WORKSPACE`
to store projects somewhere else.

## Discuss screenshot copy with Codex (local preview)

Open a workspace project and choose **Discuss with Codex** above the canvas.
In **App source**, use **Choose folder** to open the macOS native folder picker.
Select a source folder, then choose **Link project** (or **Save project**) to
confirm. Cancelling the picker keeps the existing selection and source link.
Linking your app's source directory is optional. You can also
chat using screenshots and descriptions alone. Studio starts its own
`codex app-server` process and uses the local Codex authentication/provider
configuration; no API key is stored in the browser. If needed, choose
**Sign in with ChatGPT** and follow the browser link, or authenticate with
the Codex CLI first. Studio checks your PATH and, on macOS, the bundled Codex
executable in an installed ChatGPT app. To select another executable, start
Studio with `GOLDIE_CODEX_BIN=/absolute/path/to/codex bun run dev`. A missing
or invalid executable shows a connection error without stopping the web server.

A **Frame** is one App promotional image on the canvas. Type **@** in the
assistant’s message box to choose a Frame from the current canvas. Type to
filter, use arrow keys and Enter to select, or Escape to dismiss. The selected
Frames appear above the message. Repeat **@** to add more Frames; already
selected Frames are excluded from the list. Each tag has an **×** to remove
that reference. All selected Frames, their current copy, and their uploaded
screenshots are included in the turn. When discussing multiple scenes, copy
suggestions appear in the reply rather than a single ambiguous Apply action.
Before explicitly choosing references, opening a promotional image on the
canvas sets the initial Frame. Each message also includes the current device
and language.
Codex can read relevant app code to ground its suggestions. Tool activity
appears while it works. Replies render Markdown headings, emphasis, lists,
quotes, links, tables, and code blocks. Wide tables and code scroll horizontally;
text highlighting still points to the original reply, including existing excerpts.
The conversational reply and optional copy proposal
appear when the turn finishes. **Apply copy** changes both text fields in one
undo step and follows the existing autosave/export flow. Use **Undo last edit**
or the editor's Cmd/Ctrl+Z to undo. **Stop** interrupts an active reply;
**Reconnect Codex** restarts a disconnected runtime.

Each Studio project persists multiple chats and the active chat ID in
`workspace/<project>/goldie.codex.json`. Use **New chat** to start a separate
conversation. Click the speech-bubble icon in the panel header to switch to the conversation
directory. Select a chat or use **Back to chat** to return. The directory replaces
the chat view without taking up space above messages. History is grouped by
Today, Yesterday, and Earlier. Search titles, messages, or linked app names to
find a chat; the list shows message previews and marks the active chat.
Each chat has its own linked
directory, Codex thread ID and messages; its title comes from the first message.
Empty drafts are excluded from the conversation directory and its count until
a user message has been accepted and saved. Repeated **New chat** clicks reuse
the empty draft. Leaving an empty draft for
another conversation removes it from history; chats with accepted messages stay
saved, including failed or interrupted replies.
New chats inherit the current source link, with an empty history and a new Codex
thread on first send. Reloading restores the active chat. Existing single-chat
files migrate automatically on the next save. Excerpt source links also switch
to the original chat. Stop an active reply before creating or switching chats.
Linking source for the first time or unlinking it preserves the
conversation. While unlinked, source reading is disabled; previously read code
remains in conversation context. Linking a different app starts a new chat and
keeps the previous chat in history, including when the previous app was unlinked first.
Closing the panel or leaving the project stops its active reply.

This preview uses read-only Codex sessions, rejects approval escalations,
and disables inherited MCP servers/plugins for these sessions. The directory
is a working directory, not a filesystem read-isolation boundary when linked.
Unlinked turns restrict filesystem reads to an empty context directory and the
attached screenshots. Relevant
source code and screenshots are sent to the configured model provider. The
Codex endpoints accept only same-origin requests on a loopback host. The
bundled demo does not connect to Codex. This is a local integration; a hosted
Web version still needs a local connector and a suitable authentication flow.
Commercial/hosted distribution must use supported API authentication or the
app's own approved [Sign in with ChatGPT](https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server)
integration rather than reusing local Codex-managed authentication.

`bun run build` includes both frontend and server type checks. `bun test`
includes a deterministic stdio Codex fixture and temporary localhost HTTP
servers; these tests do not call a model or use real credentials.

## Origins & acknowledgments

Goldie Studio began as a fork of
[Goldie](https://github.com/software-mansion-labs/goldie) by Software Mansion.
It has since evolved into an independently maintained project focused on
uploading, editing, and exporting screenshots. The repository is no longer
part of the original project's GitHub fork network.

Thanks to the original authors and contributors for their work.
See [LICENSE](LICENSE) for the license and attribution details.

### Workspace value notes

Open **Value notes** above the canvas to collect your thinking across the whole
workspace. **Notes** is a collection of cards: create a note for each idea, open
a card to edit its title and plain-text document, or delete a card when it is no
longer needed. Every card saves automatically and keeps up to 20 previous text
versions available to restore. Existing single-document notes and their history
are preserved in a **Current understanding** card.

Select text in a Codex reply and choose **Highlight**. The highlighted passage
appears in **Excerpts**, where you can copy it, return to its source, or remove
the highlight. Excerpts keep a text snapshot even if linking a different app
starts a new conversation. Notes belong to the workspace, independently of any
screenshot, device or language. There are no annotations or automatic document
insertion in this MVP.

Notes are stored in each project folder as `goldie.notes.json`, separately from
design config and chat history. Unsaved edits also have a browser-local recovery
draft. Saving errors are shown with a retry action; conflicting edits from another
window are rejected instead of silently overwritten. If a conflict occurs, copy
your draft before reloading and reconcile it with the saved version.
