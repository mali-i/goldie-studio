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
Link the absolute path to your app's source directory. Studio starts its own
`codex app-server` process and uses the local Codex authentication/provider
configuration; no API key is stored in the browser. If needed, choose
**Sign in with ChatGPT** and follow the browser link, or authenticate with
the Codex CLI first. If the executable is not on your PATH, start Studio with
`GOLDIE_CODEX_BIN=/absolute/path/to/codex bun run dev`.

Select a scene in the assistant, or open a screenshot on the canvas to select
it. Each message includes the selected scene, device, language, current
headline/subhead (including unsaved edits), and uploaded app screenshots.
Codex can read relevant app code to ground its suggestions. Tool activity
appears while it works; the conversational reply and optional copy proposal
appear when the turn finishes. **Apply copy** changes both text fields in one
undo step and follows the existing autosave/export flow. Use **Undo last edit**
or the editor's Cmd/Ctrl+Z to undo. **Stop** interrupts an active reply;
**Reconnect Codex** restarts a disconnected runtime.

Each Studio project persists its own linked directory, Codex thread ID and
conversation in `workspace/<project>/goldie.codex.json`. Reloading resumes the
conversation. Changing or unlinking the app directory clears the Studio chat
and detaches the previous thread (it does not delete Codex's own history).
Closing the panel or leaving the project stops its active reply.

This preview uses read-only Codex sessions, rejects approval escalations,
and disables inherited MCP servers/plugins for these sessions. The directory
is a working directory, not a filesystem read-isolation boundary. Relevant
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
