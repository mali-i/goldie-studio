export type ImageTarget = { sceneId: string; device: string; locale: string; slot: 'primary' | 'secondary' };
export type ImageEditJob = {
  id: string; createdAt: number; target: ImageTarget; source: string; original: string; sourceHash: string;
  prompt: string; status: 'running' | 'ready' | 'failed'; result?: string; error?: string;
};
export function assetUrl(project: string, path: string) {
  return `/api/projects/${encodeURIComponent(project)}/assets/${path.split('/').map(encodeURIComponent).join('/')}`;
}
