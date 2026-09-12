import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
    const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

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
      join(root, "projects", beta.project.id, "goldie.config.ts"),
      "utf8",
    );
    expect(betaConfig).toContain("#123456");
    expect(await workspaceService.listProjects(root)).toHaveLength(2);

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

  test("migrates the removed classic SVG frame to a real PNG variant", async () => {
    const root = await mkdtemp(join(tmpdir(), "goldie-studio-test-"));
    roots.push(root);
    const project = await workspaceService.createProject(root, "Legacy Frame");
    const path = join(root, "projects", project.project.id, "goldie.config.ts");
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
});
