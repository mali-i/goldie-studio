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
  test("adds a locale without replacing existing localized content", async () => {
    const root = await mkdtemp(join(tmpdir(), "goldie-studio-test-"));
    roots.push(root);
    const project = await workspaceService.createProject(root, "Two locales");
    const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
    await workspaceService.saveScreenshot(root, project.project.id, {
      device: "iphone-6.9", locale: "en-US", sceneId: "scene-1",
      mimeType: "image/png", base64: png,
    });

    await workspaceService.addLocale(root, project.project.id, "zh-Hans");
    const saved = await workspaceService.readProject(root, project.project.id);
    expect(saved.config.locales).toEqual(["en-US", "zh-Hans"]);
    expect(saved.config.scenes[0]?.sources["iphone-6.9"]?.["en-US"]?.primary)
      .toBe("screenshots/iphone-6.9/en-US/scene-1/primary.png");
    expect(saved.config.scenes[0]?.sources["iphone-6.9"]?.["zh-Hans"]).toBeUndefined();
    const manifest = await workspaceService.projectManifest(root, project.project.id);
    expect(manifest.design.capturesByLocale["iphone-6.9"]?.["en-US"]?.screenshots).toHaveLength(1);
    expect(manifest.design.capturesByLocale["iphone-6.9"]?.["zh-Hans"]?.screenshots).toHaveLength(0);
    expect(workspaceService.addLocale(root, project.project.id, "zh-Hans"))
      .rejects.toThrow("already exists");
  });

  test("renames a locale without hiding its screenshots, copy, or layout settings", async () => {
    const root = await mkdtemp(join(tmpdir(), "goldie-studio-test-"));
    roots.push(root);
    const project = await workspaceService.createProject(root, "Locale rename");
    const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
    await workspaceService.saveScreenshot(root, project.project.id, {
      device: "iphone-6.9", locale: "en-US", sceneId: "scene-1",
      headline: "Welcome", subhead: "Keep going", mimeType: "image/png", base64: png,
    });
    await workspaceService.saveScreenshot(root, project.project.id, {
      device: "mac-2880x1800", locale: "en-US", sceneId: "scene-1",
      mimeType: "image/png", base64: png,
    });
    await workspaceService.applyDesign(root, project.project.id, {
      capturePositions: { "scene-1": { "iphone-6.9": { "en-US": { primary: { x: 0.25, y: 0.75 } } } } },
    });

    await workspaceService.renameLocale(root, project.project.id, "en-US", "zh-Hans");
    const saved = await workspaceService.readProject(root, project.project.id);
    expect(saved.config.locales).toEqual(["zh-Hans"]);
    expect(saved.config.store.subtitle["zh-Hans"]).toBe("A better way to get things done");
    expect(saved.config.scenes[0]?.headline["zh-Hans"]).toBe("Welcome");
    expect(saved.config.scenes[0]?.subhead?.["zh-Hans"]).toBe("Keep going");
    expect(saved.config.scenes[0]?.capturePositions?.["iphone-6.9"]?.["zh-Hans"]?.primary)
      .toEqual({ x: 0.25, y: 0.75 });
    const manifest = await workspaceService.projectManifest(root, project.project.id);
    expect(manifest.design.capturesByLocale["iphone-6.9"]?.["zh-Hans"]?.screenshots)
      .toEqual([expect.objectContaining({ sceneId: "scene-1" })]);
    expect(manifest.design.capturesByLocale["mac-2880x1800"]?.["zh-Hans"]?.screenshots)
      .toEqual([expect.objectContaining({ sceneId: "scene-1" })]);
    const source = saved.config.scenes[0]?.sources["iphone-6.9"]?.["zh-Hans"]?.primary;
    expect(source).toBe("screenshots/iphone-6.9/zh-Hans/scene-1/primary.png");
    expect(await readFile(join(root, project.project.id, source!), "base64")).toBe(png);
    expect(workspaceService.renameLocale(root, project.project.id, "zh-Hans", "../bad"))
      .rejects.toThrow("Invalid locale");
  });

  test("adds device targets without replacing existing screenshots", async () => {
    const root = await mkdtemp(join(tmpdir(), "goldie-studio-test-"));
    roots.push(root);
    const project = await workspaceService.createProject(root, "Device targets");
    const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

    await workspaceService.saveScreenshot(root, project.project.id, {
      device: "iphone-6.9", locale: "en-US", sceneId: "scene-1",
      mimeType: "image/png", base64: png,
    });
    await workspaceService.addDevice(root, project.project.id, "ipad-12.9");
    await workspaceService.addDevice(root, project.project.id, "mac-2880x1800");
    await workspaceService.addDevice(root, project.project.id, "ipad-12.9");

    const saved = await workspaceService.readProject(root, project.project.id);
    expect(saved.config.devices).toEqual(["iphone-6.9", "ipad-12.9", "mac-2880x1800"]);
    const manifest = await workspaceService.projectManifest(root, project.project.id);
    expect(manifest.design.captures["iphone-6.9"]?.screenshots).toHaveLength(1);
    expect(manifest.devices.find((device) => device.key === "ipad-12.9")?.screenshot)
      .toEqual({ width: 2048, height: 2732 });
  });

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
    expect(alpha.config.scenes).toHaveLength(3);

    await workspaceService.saveScreenshot(root, alpha.project.id, {
      device: "iphone-6.9",
      locale: "en-US",
      sceneId: "scene-1",
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
      sceneLayouts: { "scene-1": "hero" },
    });
    expect((await workspaceService.projectDesign(root, alpha.project.id)).sceneLayouts).toEqual({
      "scene-1": "hero",
    });
    await workspaceService.applyDesign(root, alpha.project.id, { sceneLayouts: {} });
    expect((await workspaceService.projectDesign(root, alpha.project.id)).sceneLayouts).toEqual({});

    await workspaceService.deleteScreenshot(
      root,
      alpha.project.id,
      "scene-1",
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
      sceneId: "scene-1",
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

  test("keeps scenes fixed while managing two screenshot slots", async () => {
    const root = await mkdtemp(join(tmpdir(), "goldie-studio-test-"));
    roots.push(root);
    const project = await workspaceService.createProject(root, "Scene Slots");
    const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

    expect(project.config.scenes.map((scene) => scene.id)).toEqual([
      "scene-1",
      "scene-2",
      "scene-3",
    ]);
    await workspaceService.addScene(root, project.project.id);
    await workspaceService.saveScreenshot(root, project.project.id, {
      device: "iphone-6.9",
      locale: "en-US",
      sceneId: "scene-1",
      slot: "secondary",
      mimeType: "image/png",
      base64: png,
    });

    const manifest = (await workspaceService.projectManifest(root, project.project.id)) as {
      design: {
        scenes: Array<{ id: string }>;
        captures: Record<string, { screenshots: Array<{ sceneId: string; slot: string }> }>;
      };
    };
    expect(manifest.design.scenes).toHaveLength(4);
    expect(manifest.design.captures["iphone-6.9"]?.screenshots).toEqual([
      expect.objectContaining({ sceneId: "scene-1", slot: "secondary" }),
    ]);

    await workspaceService.deleteScreenshot(
      root,
      project.project.id,
      "scene-1",
      "iphone-6.9",
      "en-US",
      "secondary",
    );
    const afterDelete = await workspaceService.readProject(root, project.project.id);
    expect(afterDelete.config.scenes).toHaveLength(4);
    expect(afterDelete.config.scenes[0]?.sources).toEqual({});
  });

  test("publishes the Mac canvas specification through the shared manifest flow", async () => {
    const root = await mkdtemp(join(tmpdir(), "goldie-studio-test-"));
    roots.push(root);
    const project = await workspaceService.createProject(root, "Mac App");
    const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

    await workspaceService.saveScreenshot(root, project.project.id, {
      device: "mac-2880x1800",
      locale: "en-US",
      sceneId: "scene-1",
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

  test("persists independent crop positions for both screenshot slots", async () => {
    const root = await mkdtemp(join(tmpdir(), "goldie-studio-test-"));
    roots.push(root);
    const project = await workspaceService.createProject(root, "Crop Positions");
    const capturePositions = {
      "scene-1": {
        "iphone-6.9": {
          "en-US": {
            primary: { x: 0.2, y: 0.5 },
            secondary: { x: 0.8, y: 0.5 },
          },
        },
      },
    };
    await workspaceService.applyDesign(root, project.project.id, { capturePositions });
    expect((await workspaceService.projectDesign(root, project.project.id)).capturePositions)
      .toEqual(capturePositions);
    expect((await workspaceService.readProject(root, project.project.id)).config.scenes[0]?.capturePositions)
      .toEqual(capturePositions["scene-1"]);

    await workspaceService.applyDesign(root, project.project.id, { capturePositions: {} });
    expect((await workspaceService.projectDesign(root, project.project.id)).capturePositions)
      .toEqual({});
  });

  test("persists and resets independent slot geometry overrides", async () => {
    const root = await mkdtemp(join(tmpdir(), "goldie-studio-test-"));
    roots.push(root);
    const project = await workspaceService.createProject(root, "Slot Geometry");
    const slotGeometries = {
      "scene-1": {
        "iphone-6.9": {
          "en-US": {
            "side-by-side": {
              primary: { x: 0.3, y: 0.6, widthRatio: 0.5, heightRatio: 0.68, rotate: -8 },
              secondary: { x: 0.7, y: 0.7, widthRatio: 0.42, rotate: 6 },
            },
            hero: {
              primary: { x: 0.5, y: 0.72, widthRatio: 0.9, rotate: 0 },
            },
          },
        },
      },
    };
    await workspaceService.applyDesign(root, project.project.id, { slotGeometries });
    expect((await workspaceService.projectDesign(root, project.project.id)).slotGeometries)
      .toEqual(slotGeometries);
    expect((await workspaceService.readProject(root, project.project.id)).config.scenes[0]?.slotGeometries)
      .toEqual(slotGeometries["scene-1"]);
    await workspaceService.applyDesign(root, project.project.id, { slotGeometries: {} });
    expect((await workspaceService.projectDesign(root, project.project.id)).slotGeometries)
      .toEqual({});
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

  test("migrates legacy single screenshot sources into the primary slot", async () => {
    const root = await mkdtemp(join(tmpdir(), "goldie-studio-test-"));
    roots.push(root);
    const project = await workspaceService.createProject(root, "Legacy Screenshot");
    const path = join(root, project.project.id, "goldie.config.ts");
    const legacy = {
      ...project.config,
      scenes: [
        {
          ...project.config.scenes[0]!,
          sources: {
            "iphone-6.9": { "en-US": "screenshots/iphone-6.9/en-US/scene-1.png" },
          },
        },
        ...project.config.scenes.slice(1),
      ],
    };
    await writeFile(
      path,
      `const config = /* goldie-config:start */${JSON.stringify(legacy, null, 2)}/* goldie-config:end */;\nexport default config;\n`,
    );

    const migrated = await workspaceService.readProject(root, project.project.id);
    expect(migrated.config.scenes[0]?.sources["iphone-6.9"]?.["en-US"]).toEqual({
      primary: "screenshots/iphone-6.9/en-US/scene-1.png",
    });
    expect(await readFile(path, "utf8")).toContain('"primary"');
  });

  test("migrates slot geometry saved before layouts were separate", async () => {
    const root = await mkdtemp(join(tmpdir(), "goldie-studio-test-"));
    roots.push(root);
    const project = await workspaceService.createProject(root, "Legacy Geometry");
    const path = join(root, project.project.id, "goldie.config.ts");
    const geometry = { x: 0.35, y: 0.7, widthRatio: 0.48, rotate: -9 };
    const legacy = {
      ...project.config,
      theme: { ...project.config.theme, template: "dynamic" },
      scenes: project.config.scenes.map((scene, index) => index === 0
        ? {
          ...scene,
          layout: "side-by-side",
          slotGeometries: { "iphone-6.9": { "en-US": { primary: geometry } } },
        }
        : index === 1
          ? {
            ...scene,
            slotGeometries: { "iphone-6.9": { "en-US": { secondary: geometry } } },
          }
          : scene),
    };
    await writeFile(
      path,
      `const config = /* goldie-config:start */${JSON.stringify(legacy, null, 2)}/* goldie-config:end */;\nexport default config;\n`,
    );

    const design = await workspaceService.projectDesign(root, project.project.id);
    expect(design.slotGeometries["scene-1"]?.["iphone-6.9"]?.["en-US"]?.["side-by-side"]?.primary)
      .toEqual(geometry);
    expect(design.slotGeometries["scene-2"]?.["iphone-6.9"]?.["en-US"]?.["duo-tilt"]?.secondary)
      .toEqual(geometry);
    expect((await readFile(path, "utf8"))).toContain('"duo-tilt"');
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
