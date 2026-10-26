import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { listen } from "@tauri-apps/api/event";
import { useSettings } from "../stores/settings";

/**
 * 应用自更新（不走官方 updater 插件——它无法使用本应用的代理，而本地网络
 * 直连 GitHub 不可靠）。版本检查与下载全部经 yt_fetch 代理通道：
 * 1. checkForUpdate：GitHub Releases API 取最新 release，与当前版本比对
 * 2. downloadAndInstall：Rust 流式下载安装包（进度事件推送）→ 静默安装 → 自动重启
 */

const RELEASES_API =
  "https://api.github.com/repos/WHF293/youtube-desktop/releases/latest";

export interface UpdateInfo {
  /** 当前版本（不带 v） */
  current: string;
  /** 最新版本（不带 v） */
  latest: string;
  /** 更新说明（release notes） */
  notes: string;
  /** 安装包下载地址（NSIS setup.exe） */
  url: string;
  /** 安装包文件名 */
  filename: string;
  /** 安装包大小（字节） */
  size: number;
}

function parseVersion(v: string): number[] {
  return v
    .replace(/^v/, "")
    .split(".")
    .map((n) => parseInt(n, 10) || 0);
}

/** a 是否比 b 新（x.y.z 逐位比较） */
export function isNewer(a: string, b: string): boolean {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return false;
}

/** 当前应用版本（tauri.conf.json 的 version） */
export async function currentVersion(): Promise<string> {
  return (await getVersion()).replace(/^v/, "");
}

/** 检查更新：有新版本返回 UpdateInfo，已是最新返回 null */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  const current = await currentVersion();
  const { proxy } = useSettings.getState();
  const { status, body } = await invoke<{ status: number; body: string }>("yt_fetch", {
    url: RELEASES_API,
    proxy,
  });
  if (status < 200 || status >= 300) {
    throw new Error(`检查更新失败（HTTP ${status}）`);
  }
  const rel = JSON.parse(body) as {
    tag_name: string;
    body?: string;
    assets?: { name: string; size: number; browser_download_url: string }[];
  };
  const latest = rel.tag_name.replace(/^v/, "");
  if (!isNewer(latest, current)) return null;
  const exe = rel.assets?.find((a) => a.name.endsWith("-setup.exe"));
  if (!exe) throw new Error("最新版本未提供安装包（-setup.exe）");
  return {
    current,
    latest,
    notes: rel.body ?? "",
    url: exe.browser_download_url,
    filename: exe.name,
    size: exe.size,
  };
}

/** 下载安装包（流式，进度回调）→ 静默安装 → 自动重启。调用后当前应用将退出。 */
export async function downloadAndInstall(
  info: UpdateInfo,
  onProgress: (downloaded: number, total: number) => void,
): Promise<void> {
  const { proxy } = useSettings.getState();
  const unlisten = await listen<{ downloaded: number; total: number }>(
    "update-download-progress",
    (e) => onProgress(e.payload.downloaded, e.payload.total),
  );
  try {
    const installer = await invoke<string>("download_update", {
      url: info.url,
      proxy,
      filename: info.filename,
    });
    await invoke("finish_update", { installer });
  } finally {
    unlisten();
  }
}
