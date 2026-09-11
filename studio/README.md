# Goldie Studio

The Studio is a self-contained Vite application. It starts with bundled demo
data and does not require a Goldie config, generated manifest, or the parent
repository's source files.

```bash
bun install
bun run dev
```

Open <http://localhost:4321>. Demo design changes are saved in browser local
storage. Export is disabled because rendering requires a connected Goldie CLI.

To show a real generated manifest instead of the demo, point the development
server at its web directory:

```bash
GOLDIE_WEB_DIR=/absolute/path/to/out/web bun run dev
```
