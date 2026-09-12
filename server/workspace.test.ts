import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { workspaceService } from "./workspace";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("workspace projects", () => {
  test("keeps uploaded screenshots and config changes isolated", async () => {
    const root = await mkdtemp(join(tmpdir(), "goldie-studio-test-"));
    roots.push(root);
    const alpha = await workspaceService.createProject(root, "Alpha");
    const beta = await workspaceService.createProject(root, "Beta");
    const duplicate = await workspaceService.createProject(root, "Alpha");
    const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

    expect(alpha.project.id).toBe("Alpha");
    expect(beta.project.id).toBe("Beta");
    expect(duplicate.project.id).toBe("Alpha-2");

    await workspaceService.saveScreenshot(root, alpha.project.id, {
      device: "iphone-6.9",
      locale: "en-US",
      sceneId: "home",
      headline: "Welcome home",
      mimeType: "image/png",
      base64: png,
    });
    await workspaceService.applyDesign(root, beta.project.id, { background: "#123456" });

    const alphaManifest = (await workspaceService.projectManifest(root, alpha.project.id)) as {
      design: { captures: Record<string, { screenshots: unknown[] }> };
    };
    const betaManifest = (await workspaceService.projectManifest(root, beta.project.id)) as {
      design: { captures: Record<string, { screenshots: unknown[] }> };
    };
    expect(alphaManifest.design.captures["iphone-6.9"]?.screenshots).toHaveLength(1);
    expect(
      (alphaManifest as typeof alphaManifest & {
        design: { frameVariants: string[]; frameAssets: Record<string, string> };
      }).design.frameAssets["17-pro-blue"],
    ).toBe("frames/17-pro-blue.png");
    expect(betaManifest.design.captures["iphone-6.9"]?.screenshots).toHaveLength(0);

    const betaConfig = await readFile(
      join(root, beta.project.id, "goldie.config.ts"),
      "utf8",
    );
    expect(betaConfig).toContain("#123456");
    expect(await workspaceService.listProjects(root)).toHaveLength(3);

    await workspaceService.applyDesign(root, alpha.project.id, {
      sceneLayouts: { home: "hero" },
    });
    expect((await workspaceService.projectDesign(root, alpha.project.id)).sceneLayouts).toEqual({
      home: "hero",
    });
    await workspaceService.applyDesign(root, alpha.project.id, { sceneLayouts: {} });
    expect((await workspaceService.projectDesign(root, alpha.project.id)).sceneLayouts).toEqual({});

    await workspaceService.deleteScreenshot(
      root,
      alpha.project.id,
      "home",
      "iphone-6.9",
      "en-US",
    );
    expect(
      ((await workspaceService.projectManifest(root, alpha.project.id)) as typeof alphaManifest)
        .design.captures["iphone-6.9"]?.screenshots,
    ).toHaveLength(0);
  });

  test("rejects invalid upload metadata and file signatures", async () => {
    const root = await mkdtemp(join(tmpdir(), "goldie-studio-test-"));
    roots.push(root);
    const project = await workspaceService.createProject(root, "Validation");
    const invalid = {
      device: "../outside",
      locale: "en-US",
      sceneId: "home",
      mimeType: "image/png",
      base64: Buffer.from("not an image").toString("base64"),
    };
    expect(workspaceService.saveScreenshot(root, project.project.id, invalid)).rejects.toThrow(
      "Invalid device",
    );
    expect(
      workspaceService.saveScreenshot(root, project.project.id, {
        ...invalid,
        device: "iphone-6.9",
      }),
    ).rejects.toThrow("Only valid PNG, JPEG and WebP");
  });

  test("publishes the Mac canvas specification through the shared manifest flow", async () => {
    const root = await mkdtemp(join(tmpdir(), "goldie-studio-test-"));
    roots.push(root);
    const project = await workspaceService.createProject(root, "Mac App");
    const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

    await workspaceService.saveScreenshot(root, project.project.id, {
      device: "mac-2880x1800",
      locale: "en-US",
      sceneId: "desktop",
      mimeType: "image/png",
      base64: png,
    });

    const manifest = (await workspaceService.projectManifest(root, project.project.id)) as {
      devices: Array<{
        key: string;
        platform: string;
        screenshot: { width: number; height: number };
        frame: { url: string; geom: { screen: { width: number; height: number } } } | null;
      }>;
      design: { captures: Record<string, { screenshots: unknown[] }> };
    };
    const mac = manifest.devices.find((device) => device.key === "mac-2880x1800");

    expect(mac?.platform).toBe("macos");
    expect(mac?.screenshot).toEqual({ width: 2880, height: 1800 });
    expect(mac?.frame?.url).toBe("frames/macbook-air.png");
    expect(mac?.frame?.geom.screen).toEqual({ x: 453, y: 433, width: 2720, height: 1766 });
    expect(manifest.design.captures["mac-2880x1800"]?.screenshots).toHaveLength(1);
  });

  test("migrates the removed classic SVG frame to a real PNG variant", async () => {
    const root = await mkdtemp(join(tmpdir(), "goldie-studio-test-"));
    roots.push(root);
    const project = await workspaceService.createProject(root, "Legacy Frame");
    const path = join(root, project.project.id, "goldie.config.ts");
    const legacy = (await readFile(path, "utf8")).replace(
      '"variant": "17-pro-blue"',
      '"variant": "17-pro-classic"',
    );
    await writeFile(path, legacy);

    expect((await workspaceService.readProject(root, project.project.id)).config.frame.variant).toBe(
      "17-pro-blue",
    );
    expect(await readFile(path, "utf8")).not.toContain("17-pro-classic");
  });

  test("migrates projects from workspace/projects into the flat layout", async () => {
    const root = await mkdtemp(join(tmpdir(), "goldie-studio-test-"));
    roots.push(root);
    const project = await workspaceService.createProject(root, "Legacy Path");
    const legacyRoot = join(root, "projects");
    await mkdir(legacyRoot);
    await rename(join(root, project.project.id), join(legacyRoot, project.project.id));

    await workspaceService.migrateLegacyProjects(root);

    expect((await workspaceService.readProject(root, project.project.id)).project.name).toBe(
      "Legacy Path",
    );
    expect(await readFile(join(root, project.project.id, "goldie.config.ts"), "utf8")).toContain(
      "Legacy Path",
    );
  });

  test("replaces generated project folders with the user's project name", async () => {
    const root = await mkdtemp(join(tmpdir(), "goldie-studio-test-"));
    roots.push(root);
    const project = await workspaceService.createProject(root, "我的 App");
    const oldId = "prj_123456789abc";
    const oldDir = join(root, oldId);
    await rename(join(root, project.project.id), oldDir);
    await writeFile(
      join(oldDir, "project.json"),
      `${JSON.stringify({ ...project.project, id: oldId }, null, 2)}\n`,
    );

    await workspaceService.migrateLegacyProjects(root);

    const migrated = await workspaceService.readProject(root, "我的 App");
    expect(migrated.project.id).toBe("我的 App");
    expect(migrated.project.legacyIds).toContain(oldId);
    expect(await workspaceService.resolveProjectId(root, oldId)).toBe("我的 App");
    expect(await workspaceService.listProjects(root)).toHaveLength(1);
  });

  test("makes unsafe and reserved project names portable", async () => {
    const root = await mkdtemp(join(tmpdir(), "goldie-studio-test-"));
    roots.push(root);
    expect((await workspaceService.createProject(root, "Client/App:*")).project.id).toBe(
      "Client-App-",
    );
    expect((await workspaceService.createProject(root, "CON")).project.id).toBe("CON-project");
  });
});
