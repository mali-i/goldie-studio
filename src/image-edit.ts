export type ImageTarget = { sceneId: string; device: string; locale: string; slot: 'primary' | 'secondary' };
export type ImageEditJob = {
  id: string; createdAt: number; target: ImageTarget; source: string; original: string; sourceHash: string;
  prompt: string; status: 'running' | 'ready' | 'failed'; result?: string; error?: string;
};
export const REMOVE_BACKGROUND = '去除这张 App 截图的白色点状背景，将该区域设为透明。保留所有文字、图标、按钮、卡片及其内部颜色，保持原有位置、尺寸和内容不变。不要把前景元素中的白色区域一起删除。';
export function assetUrl(project: string, path: string) {
  return `/api/projects/${encodeURIComponent(project)}/assets/${path.split('/').map(encodeURIComponent).join('/')}`;
}
