import { invoke } from "@tauri-apps/api/core";
import { Innertube, Platform } from "youtubei.js";
import { useSettings } from "../stores/settings";

/**
 * 视频下载的流地址提取层（下载专用，独立于 innertube.ts 数据层）：
 * youtubei.js（FreeTube 同款引擎）+ ANDROID_VR InnerTube client。
 *
 * 2026-10-26 实测（.ai/probe-clients.mjs 可复验）：
 * - WEB client 的 adaptive 流已全部转 SABR（无经典 URL，仅 itag 18 可下载）；
 * - ANDROID_VR client 返回 itag 18 单文件 + 全分辨率 mp4 分离流（≤2160p），
 *   全部带明文 url，无需签名解密、无需 PO Token，分块下载实测 HTTP 206；
 * - IOS client 同样可用（备查）。
 *
 * 所有请求经 Rust yt_fetch 代理通道（注入自定义 fetch，绕开 WebView CORS）。
 * 无降级方案：任何环节失败直接抛错，由 UI 原样展示（方案见 .ai/开发方案/…视频下载与离线视频….md）。
 */

export class ExtractError extends Error {}

/* youtubei.js v18 要求宿主提供 JS evaluator（个别流的签名解密用；WebView/Node 均可 new Function） */
Platform.shim.eval = (data, env) =>
  new Function(
    `${data.output}\nreturn process(${JSON.stringify(String(env?.n ?? ""))},${JSON.stringify(String(env?.sp ?? ""))},${JSON.stringify(String(env?.sig ?? ""))});`,
  )() as never;

/* ---------- 自定义 fetch：youtubei.js 的所有请求都走这里 ---------- */

async function extractFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url =
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  let body: string | undefined;
  const raw = init?.body;
  if (typeof raw === "string") body = raw;
  else if (raw instanceof URLSearchParams) body = raw.toString();
  else if (raw instanceof ArrayBuffer) body = new TextDecoder().decode(raw);
  else if (raw) throw new ExtractError(`不支持的请求体类型：${typeof raw}`);
  if (!body && input instanceof Request && method !== "GET" && method !== "HEAD") {
    try {
      body = await input.clone().text();
    } catch {
      /* 无请求体 */
    }
  }
  const headers: Record<string, string> = {};
  if (init?.headers) {
    new Headers(init.headers).forEach((v, k) => {
      headers[k] = v;
    });
  }
  const { proxy } = useSettings.getState();
  const { status, body: text } = await invoke<{ status: number; body: string }>("yt_fetch", {
    url,
    proxy,
    method,
    body,
    contentType: headers["content-type"],
    headers: Object.keys(headers).length > 0 ? headers : undefined,
  });
  return new Response(text, { status, headers: { "content-type": "application/json" } });
}

/* ---------- Session（进程内复用，失败允许重建） ---------- */

let sessionPromise: Promise<Innertube> | null = null;

function getSession(): Promise<Innertube> {
  if (!sessionPromise) {
    sessionPromise = Innertube.create({
      fetch: extractFetch,
      generate_session_locally: true,
      enable_session_cache: false,
    });
    sessionPromise.catch(() => {
      sessionPromise = null;
    });
  }
  return sessionPromise;
}

/* ---------- 格式提取与归一化 ---------- */

export interface QualityOption {
  /** 展示名（1080p / 1080p60 / 360p…） */
  label: string;
  fps?: number;
  /** true = 音视频分离流，需 ffmpeg 合流；false = 单文件 mp4 */
  needsMerge: boolean;
  mimeType: string;
  /** vp9 / av01 等编码提示（合流兼容性略差，卡片标注） */
  codecNote?: string;
  videoItag: number;
  audioItag?: number;
  /** 视频轨（合流时含音频轨）估算字节数 */
  sizeBytes: number;
  videoUrl: string;
  audioUrl?: string;
}

export interface FormatResult {
  videoId: string;
  title: string;
  channelTitle: string;
  durationSec: number;
  thumb: string;
  options: QualityOption[];
}

type AnyRec = Record<string, unknown>;
const asRec = (v: unknown): AnyRec => (v ?? {}) as AnyRec;

function fmtSize(f: AnyRec, durationSec: number): number {
  const cl = f.content_length;
  if (typeof cl === "number" && cl > 0) return cl;
  const bitrate = typeof f.bitrate === "number" ? f.bitrate : 0;
  return Math.round((bitrate * Math.max(durationSec, 1)) / 8);
}

function codecOf(mime: string): string {
  const m = mime.match(/codecs="?([^"]+)"?/);
  return m?.[1] ?? "";
}

/** 从一组候选里挑最优：mp4 容器优先，同容器选码率最高 */
function pickBest(candidates: AnyRec[]): AnyRec | undefined {
  const mp4 = candidates.filter((f) => String(f.mime_type ?? "").includes("mp4"));
  const pool = mp4.length > 0 ? mp4 : candidates;
  return pool
    .slice()
    .sort((a, b) => (Number(b.bitrate) || 0) - (Number(a.bitrate) || 0))
    .at(0);
}

/** 拉取某视频的全部可选清晰度（流地址约 6 小时有效，只存在内存中，重试时重新提取） */
export async function getVideoFormats(videoId: string): Promise<FormatResult> {
  const yt = await getSession();
  const info = await yt.getBasicInfo(videoId, { client: "ANDROID_VR" } as never);

  const play = asRec(info.playability_status);
  if (play.status && play.status !== "OK") {
    throw new ExtractError(`视频不可播放（${String(play.status)}）：${String(play.reason ?? "未知原因")}`);
  }
  const sd = asRec(info.streaming_data);
  const formats = (sd.formats as AnyRec[] | undefined) ?? [];
  const adaptive = (sd.adaptive_formats as AnyRec[] | undefined) ?? [];
  if (formats.length === 0 && adaptive.length === 0) {
    const keys = Object.keys(sd).join(",") || "（空）";
    throw new ExtractError(`暂无法解析该视频的清晰度（streaming_data 为空：${keys}，可能受年龄/地区限制）`);
  }

  const basic = asRec(info.basic_info);
  const durationSec = typeof basic.duration === "number" ? basic.duration : 0;

  // 分离流的音频轨：mp4/m4a 优先（合流出 mp4 兼容性最好）
  const audios = adaptive.filter((f) => f.has_audio && !f.has_video);
  const audio = pickBest(audios);
  const audioUrl = audio && typeof audio.url === "string" ? audio.url : "";
  const audioItag = audio ? Number(audio.itag) : undefined;

  const options: QualityOption[] = [];
  const seen = new Set<string>();

  const pushVideo = (f: AnyRec, needsMerge: boolean) => {
    const itag = Number(f.itag);
    const url = typeof f.url === "string" ? f.url : "";
    if (!itag || !url) return;
    const height = Number(f.height) || 0;
    const fps = typeof f.fps === "number" ? f.fps : undefined;
    const ql = String(f.quality_label ?? (height ? `${height}p` : ""));
    if (!ql) return;
    const label = fps && fps > 30 ? `${ql}${fps}` : ql;
    if (seen.has(label)) return;
    const mime = String(f.mime_type ?? "");
    const codec = codecOf(mime);
    seen.add(label);
    options.push({
      label,
      fps,
      needsMerge,
      mimeType: mime,
      codecNote: codec && !codec.startsWith("avc1") ? codec.split(".")[0] : undefined,
      videoItag: itag,
      audioItag: needsMerge ? audioItag : undefined,
      sizeBytes: fmtSize(f, durationSec) + (needsMerge && audio ? fmtSize(audio, durationSec) : 0),
      videoUrl: url,
      audioUrl: needsMerge ? audioUrl || undefined : undefined,
    });
  };

  // 单文件（音视频合一，一般 360p）
  for (const f of formats) {
    if (f.has_audio && f.has_video) pushVideo(f, false);
  }
  // 分离流（720p 及以上）
  for (const f of adaptive) {
    if (f.has_video && !f.has_audio) pushVideo(f, true);
  }

  if (options.length === 0) throw new ExtractError("暂无法解析该视频的清晰度（未找到可下载的 mp4 流）");

  options.sort((a, b) => {
    const ha = parseInt(a.label, 10) || 0;
    const hb = parseInt(b.label, 10) || 0;
    if (ha !== hb) return hb - ha;
    return (b.fps ?? 0) - (a.fps ?? 0);
  });

  return {
    videoId,
    title: String(basic.title ?? ""),
    channelTitle: String(basic.author ?? ""),
    durationSec,
    thumb: typeof basic.thumbnail === "string" ? basic.thumbnail : "",
    options,
  };
}

/** 按默认清晰度偏好挑选选项（auto = 最高；指定档位取 ≤ 该档的最大值） */
export function pickOptionByDefault(options: QualityOption[], prefer: string): QualityOption {
  if (prefer === "auto") return options[0];
  const target = parseInt(prefer, 10) || 0;
  const hit = options.find((o) => (parseInt(o.label, 10) || 0) <= target);
  return hit ?? options.at(-1)!;
}
