# Goldie Studio

The Studio is a self-contained, upload-first Vite application. It starts with
bundled demo data and does not require a simulator, capture flow, generated
manifest, or the parent repository's source files.

```bash
bun install
bun run dev
```

Open <http://localhost:4321>. Demo design changes are saved in browser local
storage. Create a project from the project picker, upload PNG, JPEG or WebP
screenshots, adjust the design, and export a ZIP directly in the browser.

Each project lives under `workspace/<id>/` with its own managed
`goldie.config.ts` and `screenshots/` directory. `workspace/` is ignored by
Git. Set `GOLDIE_STUDIO_WORKSPACE` to store projects somewhere else.
