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
  /** 安装包下载地址（桌面 -setup.exe / 移动 .apk） */
  url: string;
  /** 安装包文件名 */
  filename: string;
  /** 安装包大小（字节） */
  size: number;
  /** Release 页面地址（移动端跳浏览器手动下载用） */
  pageUrl: string;
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

/** 检查更新：有新版本返回 UpdateInfo，已是最新返回 null。
 *  kind 选择安装包资产——桌面 exe / 移动 apk（安装与安装器能力不同端不同）。 */
export async function checkForUpdate(kind: "exe" | "apk" = "exe"): Promise<UpdateInfo | null> {
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
    html_url?: string;
    assets?: { name: string; size: number; browser_download_url: string }[];
  };
  const latest = rel.tag_name.replace(/^v/, "");
  if (!isNewer(latest, current)) return null;
  const suffix = kind === "apk" ? ".apk" : "-setup.exe";
  const asset = rel.assets?.find((a) => a.name.endsWith(suffix));
  if (!asset && kind !== "apk") throw new Error("最新版本未提供安装包");
  // 移动端资产缺失（CI 尚未传完 APK）不报错：移动流程本就跳浏览器到 Release 页手动下载，
  // 给出页面地址即可；size=0 时 UI 隐藏体积展示
  return {
    current,
    latest,
    notes: rel.body ?? "",
    url: asset?.browser_download_url ?? rel.html_url ?? "https://github.com/WHF293/youtube-desktop/releases/latest",
    filename: asset?.name ?? "apk",
    size: asset?.size ?? 0,
    pageUrl: rel.html_url ?? "https://github.com/WHF293/youtube-desktop/releases/latest",
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

/** 移动端：下载 APK 到应用缓存，返回落盘路径（进度事件同桌面通道）。
 *  下载完成后再经 installApk() 调原生桥弹系统安装界面。 */
export async function downloadApk(
  info: UpdateInfo,
  onProgress: (downloaded: number, total: number) => void,
): Promise<string> {
  const { proxy } = useSettings.getState();
  const unlisten = await listen<{ downloaded: number; total: number }>(
    "update-download-progress",
    (e) => onProgress(e.payload.downloaded, e.payload.total),
  );
  try {
    return await invoke<string>("download_update", {
      url: info.url,
      proxy,
      filename: info.filename,
    });
  } finally {
    unlisten();
  }
}

/** 经原生桥（AndroidBridge.installApk，patch-android.mjs 注入）弹系统安装界面。
 *  桥不存在（旧包/网页端）返回 false，调用方兜底跳 Release 页。 */
export function installApk(path: string): boolean {
  const bridge = (window as unknown as { AndroidBridge?: { installApk?: (p: string) => void } })
    .AndroidBridge;
  if (typeof bridge?.installApk !== "function") return false;
  bridge.installApk(path);
  return true;
}
