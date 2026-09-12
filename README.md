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

## Upstream

This project is forked from
[kacperkapusciak/goldie](https://github.com/kacperkapusciak/goldie) and has
been refactored into a standalone, upload-first Studio.
