import { createReadStream } from "node:fs";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rmdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { dirname, extname, join, resolve, sep } from "node:path";
import type { Plugin } from "vite";
import { LAYOUTS, TEMPLATES } from "../src/lib/layouts";
import {
  defaultProjectConfig,
  type GoldieProjectConfig,
  type ProjectDetail,
  type ProjectSummary,
  type UploadScreenshotInput,
  WORKSPACE_FRAME_VARIANTS,
  type WorkspaceFrameVariant,
} from "../src/project";

const CONFIG_START = "/* goldie-config:start */";
const CONFIG_END = "/* goldie-config:end */";
const LEGACY_PROJECT_ID = /^prj_[a-z0-9]{12}$/;
const SCENE_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const TARGET_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const MAX_BODY_BYTES = 35 * 1024 * 1024;

type Next = (err?: unknown) => void;

export function workspacePlugin(workspaceRoot: string): Plugin {
  const handler = createHandler(resolve(workspaceRoot));
  return {
    name: "goldie-workspace",
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

function createHandler(root: string) {
  return async (req: IncomingMessage, res: ServerResponse, next: Next) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (!url.pathname.startsWith("/api/projects")) return next();
    try {
      await prepareWorkspace(root);
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts.length === 2) {
        if (req.method === "GET") return sendJson(res, await listProjects(root));
        if (req.method === "POST") {
          const body = await readJson<{ name?: string }>(req);
          return sendJson(res, await createProject(root, body.name ?? "Untitled App"), 201);
        }
        return methodNotAllowed(res);
      }

      const requestedId = checkedProjectId(decodeURIComponent(parts[2] ?? ""));
      const id = await resolveProjectId(root, requestedId);
      if (parts.length === 3) {
        if (req.method === "GET") return sendJson(res, await readProject(root, id));
        return methodNotAllowed(res);
      }

      const action = parts[3];
      if (action === "manifest" && req.method === "GET") {
        return sendJson(res, await projectManifest(root, id));
      }
      if (action === "config") {
        if (req.method === "GET") return sendJson(res, await readProject(root, id));
        if (req.method === "PUT") {
          const config = await readJson<GoldieProjectConfig>(req);
          validateConfig(config);
          await writeConfig(root, id, config);
          return sendJson(res, await touchProject(root, id, config.store.name));
        }
        return methodNotAllowed(res);
      }
      if (action === "design") {
        if (req.method === "GET") return sendJson(res, await projectDesign(root, id));
        if (req.method === "PUT") {
          const design = await readJson<Record<string, unknown>>(req);
          await applyDesign(root, id, design);
          res.statusCode = 204;
          return res.end();
        }
        return methodNotAllowed(res);
      }
      if (action === "screenshots") {
        if (parts.length === 4 && req.method === "POST") {
          const upload = await readJson<UploadScreenshotInput>(req);
          return sendJson(res, await saveScreenshot(root, id, upload), 201);
        }
        if (parts.length === 5 && req.method === "DELETE") {
          return sendJson(
            res,
            await deleteScreenshot(
              root,
              id,
              decodeURIComponent(parts[4] ?? ""),
              url.searchParams.get("device") ?? "",
              url.searchParams.get("locale") ?? "",
            ),
          );
        }
        return methodNotAllowed(res);
      }
      if (action === "assets" && req.method === "GET") {
        const asset = decodeURIComponent(parts.slice(4).join("/"));
        return serveAsset(root, id, asset, res);
      }
      res.statusCode = 404;
      res.end("Not found");
    } catch (error) {
      res.statusCode = error instanceof HttpError ? error.status : 500;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
    }
  };
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const projectDir = (root: string, id: string) => join(root, checkedProjectId(id));
const metaFile = (root: string, id: string) => join(projectDir(root, id), "project.json");
const configFile = (root: string, id: string) => join(projectDir(root, id), "goldie.config.ts");

const workspacePreparations = new Map<string, Promise<void>>();

/** Move projects created before the flat workspace layout into workspace/<id>. */
function prepareWorkspace(root: string): Promise<void> {
  const key = resolve(root);
  const existing = workspacePreparations.get(key);
  if (existing) return existing;
  const preparation = migrateLegacyProjects(key).catch((error) => {
    workspacePreparations.delete(key);
    throw error;
  });
  workspacePreparations.set(key, preparation);
  return preparation;
}

async function migrateLegacyProjects(root: string): Promise<void> {
  await mkdir(root, { recursive: true });
  const legacyRoot = join(root, "projects");
  const entries = await readdir(legacyRoot, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory() || !isSafeProjectId(entry.name)) continue;
    const destination = join(root, entry.name);
    if (await stat(destination).catch(() => null)) continue;
    await rename(join(legacyRoot, entry.name), destination);
  }
  await rmdir(legacyRoot).catch(() => {});

  const flatEntries = await readdir(root, { withFileTypes: true });
  for (const entry of flatEntries) {
    if (!entry.isDirectory() || !LEGACY_PROJECT_ID.test(entry.name)) continue;
    const oldId = entry.name;
    const oldMetaPath = join(root, oldId, "project.json");
    const meta = JSON.parse(await readFile(oldMetaPath, "utf8")) as ProjectSummary;
    const id = await availableProjectId(root, meta.name);
    const destination = join(root, id);
    await rename(join(root, oldId), destination);
    await atomicJson(join(destination, "project.json"), {
      ...meta,
      id,
      legacyIds: [...new Set([...(meta.legacyIds ?? []), meta.id, oldId])],
    } satisfies ProjectSummary);
  }
}

function checkedProjectId(id: string | undefined): string {
  if (!id || !isSafeProjectId(id)) throw new HttpError(400, "Invalid project id.");
  return id;
}

function isSafeProjectId(id: string): boolean {
  return (
    id.length <= 80 &&
    id.trim() === id &&
    id !== "." &&
    id !== ".." &&
    id !== "demo" &&
    id !== "projects" &&
    !/[\\/\u0000-\u001f\u007f]/.test(id)
  );
}

function projectIdFromName(name: string): string {
  const cleaned = Array.from(
    name
      .normalize("NFC")
      .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]+/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^\.+|\.+$/g, "")
      .trim(),
  )
    .slice(0, 80)
    .join("");
  if (
    !cleaned ||
    cleaned === "demo" ||
    cleaned === "projects" ||
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i.test(cleaned)
  ) {
    return `${cleaned || "Untitled App"}-project`;
  }
  return cleaned;
}

async function availableProjectId(root: string, name: string): Promise<string> {
  const base = projectIdFromName(name);
  let id = base;
  for (let suffix = 2; await stat(join(root, id)).catch(() => null); suffix += 1) {
    id = `${base}-${suffix}`;
  }
  return id;
}

async function resolveProjectId(root: string, id: string): Promise<string> {
  if (await stat(join(root, id)).catch(() => null)) return id;
  const alias = (await listProjects(root)).find((project) => project.legacyIds?.includes(id));
  return alias?.id ?? id;
}

async function listProjects(root: string): Promise<ProjectSummary[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const projects = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && isSafeProjectId(entry.name))
      .map((entry) => readMeta(root, entry.name).catch(() => null)),
  );
  return projects
    .filter((project): project is ProjectSummary => project !== null)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

async function createProject(root: string, rawName: string): Promise<ProjectDetail> {
  const name = Array.from(rawName.trim()).slice(0, 80).join("") || "Untitled App";
  const id = await availableProjectId(root, name);
  const now = new Date().toISOString();
  const meta: ProjectSummary = { id, name, createdAt: now, updatedAt: now };
  await mkdir(join(projectDir(root, id), "screenshots"), { recursive: true });
  await atomicJson(metaFile(root, id), meta);
  await writeConfig(root, id, defaultProjectConfig(name));
  return { project: meta, config: defaultProjectConfig(name) };
}

async function readProject(root: string, id: string): Promise<ProjectDetail> {
  return { project: await readMeta(root, id), config: await readConfig(root, id) };
}

async function readMeta(root: string, id: string): Promise<ProjectSummary> {
  try {
    return JSON.parse(await readFile(metaFile(root, id), "utf8")) as ProjectSummary;
  } catch {
    throw new HttpError(404, `Project ${id} does not exist.`);
  }
}

async function touchProject(root: string, id: string, name?: string): Promise<ProjectDetail> {
  const meta = await readMeta(root, id);
  const next = { ...meta, ...(name ? { name } : {}), updatedAt: new Date().toISOString() };
  await atomicJson(metaFile(root, id), next);
  return { project: next, config: await readConfig(root, id) };
}

function serializeConfig(config: GoldieProjectConfig): string {
  return [
    "/** Upload-only Goldie project. Managed by Goldie Studio. */",
    `const config = ${CONFIG_START}`,
    JSON.stringify(config, null, 2),
    `${CONFIG_END};`,
    "",
    "export default config;",
    "",
  ].join("\n");
}

async function readConfig(root: string, id: string): Promise<GoldieProjectConfig> {
  let source: string;
  try {
    source = await readFile(configFile(root, id), "utf8");
  } catch {
    throw new HttpError(404, `Project ${id} has no goldie.config.ts.`);
  }
  const start = source.indexOf(CONFIG_START);
  const end = source.indexOf(CONFIG_END);
  if (start === -1 || end <= start) throw new HttpError(422, "The project config is not Studio-managed.");
  const config = JSON.parse(source.slice(start + CONFIG_START.length, end)) as Omit<
    GoldieProjectConfig,
    "frame"
  > & { frame?: { variant?: string } };
  // `17-pro-classic` briefly existed as a generated SVG option. Migrate
  // projects created during that version to the real bundled blue PNG.
  if (config.frame?.variant === "17-pro-classic") {
    config.frame.variant = "17-pro-blue";
    await atomicWrite(configFile(root, id), serializeConfig(config as GoldieProjectConfig));
  }
  validateConfig(config as GoldieProjectConfig);
  return config as GoldieProjectConfig;
}

async function writeConfig(root: string, id: string, config: GoldieProjectConfig): Promise<void> {
  validateConfig(config);
  await atomicWrite(configFile(root, id), serializeConfig(config));
}

function validateConfig(config: GoldieProjectConfig): void {
  if (!config || config.schemaVersion !== 1) throw new HttpError(422, "Unsupported config schemaVersion.");
  if (!config.store?.name?.trim()) throw new HttpError(422, "store.name is required.");
  if (!Array.isArray(config.devices) || config.devices.length === 0) {
    throw new HttpError(422, "At least one device is required.");
  }
  if (!Array.isArray(config.locales) || config.locales.length === 0) {
    throw new HttpError(422, "At least one locale is required.");
  }
  for (const device of config.devices) checkedTarget(device, "device");
  for (const locale of config.locales) checkedTarget(locale, "locale");
  if (!config.theme || typeof config.theme.background !== "string") {
    throw new HttpError(422, "theme.background is required.");
  }
  if (!isWorkspaceFrameVariant(config.frame?.variant)) {
    throw new HttpError(422, "Unsupported frame variant.");
  }
  const ids = new Set<string>();
  for (const scene of config.scenes ?? []) {
    if (!SCENE_ID.test(scene.id) || ids.has(scene.id)) throw new HttpError(422, `Invalid or duplicate scene id: ${scene.id}`);
    ids.add(scene.id);
    for (const locales of Object.values(scene.sources ?? {})) {
      for (const path of Object.values(locales)) checkedRelativeAsset(path);
    }
  }
}

async function saveScreenshot(
  root: string,
  id: string,
  input: UploadScreenshotInput,
): Promise<ProjectDetail> {
  if (!SCENE_ID.test(input.sceneId)) throw new HttpError(422, "Scene id must use lowercase letters, numbers, _ or -.");
  checkedTarget(input.device, "device");
  checkedTarget(input.locale, "locale");
  if (typeof input.base64 !== "string" || typeof input.mimeType !== "string") {
    throw new HttpError(422, "Screenshot data and MIME type are required.");
  }
  const bytes = Buffer.from(input.base64, "base64");
  if (bytes.byteLength === 0 || bytes.byteLength > 25 * 1024 * 1024) {
    throw new HttpError(413, "Screenshot must be between 1 byte and 25 MB.");
  }
  const format = imageFormat(bytes);
  if (!format || format.mime !== input.mimeType) throw new HttpError(415, "Only valid PNG, JPEG and WebP images are accepted.");

  const config = await readConfig(root, id);
  if (!config.devices.includes(input.device)) config.devices.push(input.device);
  if (!config.locales.includes(input.locale)) config.locales.push(input.locale);
  let scene = config.scenes.find((candidate) => candidate.id === input.sceneId);
  if (!scene) {
    scene = {
      id: input.sceneId,
      sources: {},
      headline: { [input.locale]: input.headline?.trim() || humanize(input.sceneId) },
      ...(input.subhead?.trim() ? { subhead: { [input.locale]: input.subhead.trim() } } : {}),
    };
    config.scenes.push(scene);
  }
  scene.headline[input.locale] = input.headline?.trim() || scene.headline[input.locale] || humanize(input.sceneId);
  if (input.subhead?.trim()) scene.subhead = { ...scene.subhead, [input.locale]: input.subhead.trim() };

  // Config files are portable between macOS, Linux and Windows, so asset
  // references always use URL/POSIX separators rather than node:path.join.
  const relativePath = ["screenshots", input.device, input.locale, `${input.sceneId}.${format.ext}`].join("/");
  const previous = scene.sources[input.device]?.[input.locale];
  const file = safeProjectPath(root, id, relativePath);
  await mkdir(dirname(file), { recursive: true });
  await atomicWrite(file, bytes);
  if (previous && previous !== relativePath) await rm(safeProjectPath(root, id, previous), { force: true });
  scene.sources[input.device] = { ...scene.sources[input.device], [input.locale]: relativePath };
  await writeConfig(root, id, config);
  return touchProject(root, id, config.store.name);
}

async function deleteScreenshot(
  root: string,
  id: string,
  sceneId: string,
  device: string,
  locale: string,
): Promise<ProjectDetail> {
  const config = await readConfig(root, id);
  const scene = config.scenes.find((candidate) => candidate.id === sceneId);
  const source = scene?.sources[device]?.[locale];
  if (!scene || !source) throw new HttpError(404, "Screenshot not found.");
  await rm(safeProjectPath(root, id, source), { force: true });
  delete scene.sources[device]![locale];
  if (Object.keys(scene.sources[device]!).length === 0) delete scene.sources[device];
  if (Object.values(scene.sources).every((locales) => Object.keys(locales).length === 0)) {
    config.scenes = config.scenes.filter((candidate) => candidate.id !== sceneId);
  }
  await writeConfig(root, id, config);
  return touchProject(root, id, config.store.name);
}

async function applyDesign(root: string, id: string, design: Record<string, unknown>): Promise<void> {
  const config = await readConfig(root, id);
  if (typeof design.background === "string") config.theme.background = design.background;
  if (typeof design.fontFamily === "string") config.theme.fontFamily = design.fontFamily;
  if (isWorkspaceFrameVariant(design.frame)) config.frame.variant = design.frame;
  if (typeof design.template === "string") config.theme.template = design.template || undefined;
  if (typeof design.layout === "string") config.theme.layout = design.layout;
  if (typeof design.screenOnly === "boolean") config.theme.screenOnly = design.screenOnly;

  const copy = design.copy as Record<string, { headline?: Record<string, string>; subhead?: Record<string, string> }> | undefined;
  const sceneLayouts = isRecord(design.sceneLayouts)
    ? (design.sceneLayouts as Record<string, unknown>)
    : undefined;
  for (const scene of config.scenes) {
    if (copy?.[scene.id]?.headline) scene.headline = { ...scene.headline, ...copy[scene.id]!.headline };
    if (copy?.[scene.id]?.subhead) scene.subhead = { ...scene.subhead, ...copy[scene.id]!.subhead };
    if (sceneLayouts) {
      const nextLayout = sceneLayouts[scene.id];
      if (typeof nextLayout === "string" && nextLayout in LAYOUTS) scene.layout = nextLayout;
      else delete scene.layout;
    }
  }
  if (Array.isArray(design.order)) {
    const rank = new Map((design.order as string[]).map((sceneId, index) => [sceneId, index]));
    config.scenes.sort((a, b) => (rank.get(a.id) ?? 1e6) - (rank.get(b.id) ?? 1e6));
  }
  await writeConfig(root, id, config);
  await touchProject(root, id, config.store.name);
}

async function projectDesign(root: string, id: string) {
  const config = await readConfig(root, id);
  return {
    background: config.theme.background,
    frame: config.frame.variant,
    fontFamily: config.theme.fontFamily,
    order: config.scenes.map((scene) => scene.id),
    ...(typeof config.theme.template === "string" ? { template: config.theme.template } : {}),
    layout: config.theme.layout ?? "classic",
    screenOnly: config.theme.screenOnly ?? false,
    sceneLayouts: Object.fromEntries(
      config.scenes.flatMap((scene) => (scene.layout ? [[scene.id, scene.layout]] : [])),
    ),
  };
}

async function projectManifest(root: string, id: string) {
  const { config } = await readProject(root, id);
  const capturesByLocale: Record<string, Record<string, { screenshots: Array<{ sceneId: string; url: string }>; clips: null }>> = {};
  for (const device of config.devices) {
    capturesByLocale[device] = {};
    for (const locale of config.locales) {
      capturesByLocale[device][locale] = {
        screenshots: config.scenes.flatMap((scene) => {
          const source = scene.sources[device]?.[locale];
          return source
            ? [{ sceneId: scene.id, url: `api/projects/${encodeURIComponent(id)}/assets/${source.split("/").map(encodeURIComponent).join("/")}` }]
            : [];
        }),
        clips: null,
      };
    }
  }
  const captures: Record<string, { screenshots: Array<{ sceneId: string; url: string }>; clips: null }> = {};
  for (const device of config.devices) captures[device] = capturesByLocale[device]?.[config.locales[0]!] ?? { screenshots: [], clips: null };
  return {
    generatedAt: new Date().toISOString(),
    app: config.store,
    devices: config.devices.map(deviceSpec),
    locales: config.locales,
    assets: {},
    design: {
      theme: config.theme,
      frameVariant: config.frame.variant,
      frameVariants: [...WORKSPACE_FRAME_VARIANTS],
      frameAssets: {
        "17-pro-silver": "frames/17-pro-silver.png",
        "17-pro-blue": "frames/17-pro-blue.png",
        "17-pro-orange": "frames/17-pro-orange.png",
      },
      customFrameUrl: null,
      fonts: [],
      layouts: Object.values(LAYOUTS).map(({ key, label, description, span }) => ({ key, label, description, span })),
      templates: Object.values(TEMPLATES),
      template: config.theme.template ?? null,
      layout: config.theme.layout ?? "classic",
      screenOnly: config.theme.screenOnly ?? false,
      decorations: config.theme.decorations ?? [],
      scenes: config.scenes.map(({ id: sceneId, headline, subhead, layout, secondScene, decorations }) => ({
        id: sceneId,
        headline,
        ...(subhead ? { subhead } : {}),
        ...(layout ? { layout } : {}),
        ...(secondScene ? { secondScene } : {}),
        ...(decorations ? { decorations } : {}),
      })),
      preview: null,
      captures,
      capturesByLocale,
    },
  };
}

function deviceSpec(key: string) {
  if (key === "pixel-10-pro") {
    return {
      key,
      label: "Pixel 10 Pro",
      platform: "android",
      simulatorName: null,
      screenshot: { width: 1080, height: 1920 },
      preview: null,
      frame: null,
    };
  }
  if (key === "mac-2880x1800") {
    return {
      key,
      label: "Mac 2880 × 1800",
      platform: "macos",
      simulatorName: null,
      screenshot: { width: 2880, height: 1800 },
      preview: null,
      // An empty frame URL keeps the iPhone bezel out while still supplying
      // full-screen geometry to the shared composition pipeline.
      frame: {
        url: "",
        geom: {
          width: 2880,
          height: 1800,
          screen: { x: 0, y: 0, width: 2880, height: 1800 },
          screenRadius: 0,
        },
      },
    };
  }
  return {
    key,
    label: key === "iphone-6.9" ? "iPhone 6.9" : key,
    platform: "ios",
    simulatorName: null,
    screenshot: { width: 1320, height: 2868 },
    preview: null,
    frame: null,
  };
}

async function serveAsset(root: string, id: string, asset: string, res: ServerResponse) {
  const file = safeProjectPath(root, id, checkedRelativeAsset(asset));
  const info = await stat(file).catch(() => null);
  if (!info?.isFile()) throw new HttpError(404, "Asset not found.");
  const mime: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
  };
  res.writeHead(200, {
    "Content-Type": mime[extname(file).toLowerCase()] ?? "application/octet-stream",
    "Content-Length": info.size,
    "Cache-Control": "no-store",
  });
  createReadStream(file).pipe(res);
}

function safeProjectPath(root: string, id: string, path: string): string {
  const base = projectDir(root, id);
  const resolved = resolve(base, path);
  if (resolved !== base && !resolved.startsWith(`${base}${sep}`)) throw new HttpError(400, "Path escapes the project.");
  return resolved;
}

function checkedRelativeAsset(path: string): string {
  if (!path || path.startsWith("/") || path.includes("..") || !path.startsWith("screenshots/")) {
    throw new HttpError(422, `Invalid screenshot path: ${path}`);
  }
  return path;
}

function checkedTarget(value: unknown, label: string): string {
  if (typeof value !== "string" || !TARGET_ID.test(value) || value.includes("..")) {
    throw new HttpError(422, `Invalid ${label}.`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isWorkspaceFrameVariant(value: unknown): value is WorkspaceFrameVariant {
  return (
    typeof value === "string" &&
    (WORKSPACE_FRAME_VARIANTS as readonly string[]).includes(value)
  );
}

function imageFormat(bytes: Buffer): { ext: "png" | "jpg" | "webp"; mime: string } | null {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { ext: "png", mime: "image/png" };
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { ext: "jpg", mime: "image/jpeg" };
  if (bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP") {
    return { ext: "webp", mime: "image/webp" };
  }
  return null;
}

function humanize(id: string): string {
  return id.replaceAll(/[-_]+/g, " ").replace(/^./, (letter) => letter.toUpperCase());
}

async function readJson<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.byteLength;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, "Request body is too large.");
    chunks.push(bytes);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
  } catch {
    throw new HttpError(400, "Request body must be valid JSON.");
  }
}

function sendJson(res: ServerResponse, body: unknown, status = 200) {
  const json = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(json) });
  res.end(json);
}

function methodNotAllowed(res: ServerResponse) {
  res.statusCode = 405;
  res.end("Method not allowed");
}

async function atomicJson(path: string, value: unknown): Promise<void> {
  await atomicWrite(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function atomicWrite(path: string, value: string | Uint8Array): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, value);
  await rename(temporary, path);
}

/** Direct service surface used by focused storage tests. HTTP uses the same functions above. */
export const workspaceService = {
  listProjects,
  createProject,
  readProject,
  saveScreenshot,
  deleteScreenshot,
  applyDesign,
  projectDesign,
  projectManifest,
  migrateLegacyProjects,
  resolveProjectId,
};
