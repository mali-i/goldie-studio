import type {
  GoldieProjectConfig,
  ProjectDetail,
  ProjectSummary,
  UploadScreenshotInput,
} from "./project";

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error((await res.text()) || `${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export const projectApi = {
  list: () => json<ProjectSummary[]>("/api/projects"),
  create: (name: string) =>
    json<ProjectDetail>("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }),
  get: (id: string) => json<ProjectDetail>(`/api/projects/${encodeURIComponent(id)}`),
  addDevice: (id: string, device: string) =>
    json<ProjectDetail>(`/api/projects/${encodeURIComponent(id)}/devices`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device }),
    }),
  renameLocale: (id: string, from: string, to: string) =>
    json<ProjectDetail>(`/api/projects/${encodeURIComponent(id)}/locale`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from, to }),
    }),
  addScene: (id: string) =>
    json<ProjectDetail>(`/api/projects/${encodeURIComponent(id)}/scenes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }),
  saveConfig: (id: string, config: GoldieProjectConfig) =>
    json<ProjectDetail>(`/api/projects/${encodeURIComponent(id)}/config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    }),
  upload: (id: string, input: UploadScreenshotInput) =>
    json<ProjectDetail>(`/api/projects/${encodeURIComponent(id)}/screenshots`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  removeScreenshot: (
    id: string,
    sceneId: string,
    device: string,
    locale: string,
    slot: "primary" | "secondary",
  ) =>
    json<ProjectDetail>(
      `/api/projects/${encodeURIComponent(id)}/screenshots/${encodeURIComponent(sceneId)}?device=${encodeURIComponent(device)}&locale=${encodeURIComponent(locale)}&slot=${slot}`,
      { method: "DELETE" },
    ),
};
