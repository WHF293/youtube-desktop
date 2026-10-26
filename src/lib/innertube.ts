import { invoke, isTauri } from "@tauri-apps/api/core";
import { useSettings } from "../stores/settings";
import type {
  ChannelItem,
  CommentThreadItem,
  PlaylistItem,
  VideoItem,
} from "../types/youtube";

/**
 * FreeTube 模式数据层（参考 FreeTube 的实现方式，不走官方 Data API、无配额）：
 * - 列表/搜索/详情/评论走 YouTube 网页端内部接口 InnerTube（youtubei/v1/*）；
 * - 订阅与首页热门走频道 RSS（youtube.com/feeds/videos.xml，无需任何登录态）。
 * 实测结论与端点结构见 .ai/开发方案/2026-10-26-客户端-FreeTube模式替代官方API可行性分析.md
 *
 * 仅桌面端可用：InnerTube/RSS 域名不带 CORS 头，浏览器直连会被拦，统一走 Rust yt_fetch。
 */

const BASE = "https://www.youtube.com/youtubei/v1";
/** 网页端硬编码的 InnerTube key（多年未变，2026-10 实测确认） */
const API_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";
/** 钉死一个实测可用的 WEB clientVersion（2026-10-23 版本，实测 200） */
const CLIENT_VERSION = "2.20261023.01.00";
/** 频道 videos tab 的 browse params（protobuf，YouTube 官网同款，不可删减） */
const VIDEOS_TAB_PARAMS = "EgZ2aWRlb3PyBgQKAjoA";
/** 频道 playlists tab 的 browse params */
const PLAYLISTS_TAB_PARAMS = "EgvwbGF5bGlzdHPyBgQKAjIA";

export class InnertubeError extends Error {}

function ftContext(hlOverride?: string) {
  const { languages, regionCode } = useSettings.getState();
  return {
    client: {
      clientName: "WEB",
      clientVersion: CLIENT_VERSION,
      hl: hlOverride ?? languages[0] ?? "zh-CN",
      gl: regionCode || "US",
    },
  };
}

/** InnerTube POST 请求（桌面端经 Rust reqwest 走代理；网页端 CORS 不放行，直接报错） */
async function innertubePost<T>(
  endpoint: string,
  body: Record<string, unknown>,
  hlOverride?: string,
): Promise<T> {
  if (!isTauri()) {
    throw new InnertubeError("FreeTube 模式仅桌面端可用（InnerTube 接口无 CORS 头，浏览器无法直连）");
  }
  const { proxy } = useSettings.getState();
  const { status, body: raw } = await invoke<{ status: number; body: string }>("yt_fetch", {
    url: `${BASE}/${endpoint}?prettyPrint=false&key=${API_KEY}`,
    proxy,
    method: "POST",
    body: JSON.stringify({ context: ftContext(hlOverride), ...body }),
    contentType: "application/json",
  });
  if (status < 200 || status >= 300) {
    throw new InnertubeError(`InnerTube ${endpoint} 请求失败（HTTP ${status}）`);
  }
  return JSON.parse(raw) as T;
}

/** 经 Rust 代理 GET 任意页面（RSS / 频道主页 HTML） */
async function proxiedGet(url: string): Promise<string> {
  if (!isTauri()) {
    throw new InnertubeError("FreeTube 模式仅桌面端可用（浏览器 CORS 限制）");
  }
  const { proxy } = useSettings.getState();
  const { status, body } = await invoke<{ status: number; body: string }>("yt_fetch", { url, proxy });
  if (status < 200 || status >= 300) {
    throw new InnertubeError(`请求失败（HTTP ${status}）：${url}`);
  }
  return body;
}

/* ---------- 文本工具：InnerTube 的人类可读文本 → 结构化值 ---------- */

/** "1,046,400次观看" / "104万次观看" / "1.2M views" → "1046400"（解析失败返回 undefined） */
export function parseCountLoose(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const m = text.replace(/,/g, "").match(/([\d.]+)\s*(亿|万|[KkMB]?)?/);
  if (!m) return undefined;
  const num = parseFloat(m[1]);
  if (Number.isNaN(num)) return undefined;
  const mult = m[2] === "亿" ? 1e8 : m[2] === "万" ? 1e4 : m[2] === "B" ? 1e9 : m[2] === "M" ? 1e6 : m[2] === "K" || m[2] === "k" ? 1e3 : 1;
  return String(Math.round(num * mult));
}

/** "15:51" / "1:02:03" → ISO8601（PT15M51S），VideoCard 的 parseDuration 直接可用 */
function clockToIso(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const parts = text.split(":").map((p) => parseInt(p, 10));
  if (parts.some(Number.isNaN) || parts.length < 2) return undefined;
  const [h, min, s] = parts.length === 3 ? parts : [0, ...parts];
  return `PT${h ? `${h}H` : ""}${min}M${s}S`;
}

/** "1天前" / "2 hours ago" → 近似 ISO 时间（now 往前推），仅用于相对时间展示 */
function relativeToIso(text: string | undefined): string {
  if (!text) return new Date().toISOString();
  const m = text.match(/(\d+)\s*(分钟|小时|天|周|个月|个月|月|年|minute|hour|day|week|month|year)/i);
  if (!m) return new Date().toISOString();
  const n = parseInt(m[1], 10);
  const unit = m[2].toLowerCase();
  const ms =
    unit.startsWith("分") || unit === "minute" ? 60e3 :
    unit.startsWith("小") || unit === "hour" ? 3600e3 :
    unit.startsWith("天") || unit === "day" ? 86400e3 :
    unit.startsWith("周") || unit === "week" ? 7 * 86400e3 :
    unit.startsWith("月") || unit === "month" ? 30 * 86400e3 :
    365 * 86400e3;
  return new Date(Date.now() - n * ms).toISOString();
}

function runsText(node: { runs?: { text?: string }[]; simpleText?: string } | undefined): string | undefined {
  if (!node) return undefined;
  return node.simpleText ?? node.runs?.map((r) => r.text ?? "").join("") ?? undefined;
}

/** 缩略图分片域名归一化（i1~i9.ytimg.com → i.ytimg.com）：分片内容等价，
 *  统一后前端/缓存的去重键一致，也避免个别分片域名直连失败 */
function normalizeThumb(url: string | undefined): string | undefined {
  return url?.replace(/^https?:\/\/i\d+\.ytimg\.com\//, "https://i.ytimg.com/");
}

/** 递归收集整棵响应树里某种 key 的节点 */
function collect<T>(root: unknown, key: string): T[] {
  const out: T[] = [];
  const walk = (o: unknown) => {
    if (Array.isArray(o)) {
      o.forEach(walk);
    } else if (o && typeof o === "object") {
      for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
        if (k === key) out.push(v as T);
        else walk(v);
      }
    }
  };
  walk(root);
  return out;
}

/* ---------- InnerTube 结构 → 本项目 VideoItem 等类型的适配 ---------- */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRec = Record<string, any>;

function videoFromVideoRenderer(r: AnyRec): VideoItem | undefined {
  const id = r.videoId as string | undefined;
  if (!id) return undefined;
  const ownerRun = r.ownerText?.runs?.[0] ?? r.longBylineText?.runs?.[0] ?? r.shortBylineText?.runs?.[0];
  const thumb = normalizeThumb(r.thumbnail?.thumbnails?.at(-1)?.url as string | undefined);
  return {
    kind: "youtube#searchResult",
    etag: (r.trackingParams as string) ?? "",
    id,
    snippet: {
      publishedAt: relativeToIso(r.publishedTimeText?.simpleText),
      channelId: ownerRun?.navigationEndpoint?.browseEndpoint?.browseId ?? "",
      channelTitle: ownerRun?.text ?? "",
      title: runsText(r.title) ?? "",
      description: runsText(r.detailedMetadataSnippets?.[0]?.snippetText) ?? "",
      thumbnails: thumb ? { medium: { url: thumb }, high: { url: thumb } } : {},
    },
    statistics: { viewCount: parseCountLoose(r.viewCountText?.simpleText) },
    contentDetails: { duration: clockToIso(r.lengthText?.simpleText) ?? "" },
  };
}

/** browse 系新版卡片（2026 起替代 videoRenderer）：lockupViewModel */
function videoFromLockup(vm: AnyRec): VideoItem | undefined {
  if (vm.contentType !== "LOCKUP_CONTENT_TYPE_VIDEO") return undefined;
  const id = vm.contentId as string | undefined;
  if (!id) return undefined;
  const meta = vm.metadata?.lockupMetadataViewModel;
  const parts: AnyRec[] = meta?.metadata?.contentMetadataViewModel?.metadataRows?.flatMap(
    (row: AnyRec) => row.metadataParts ?? [],
  ) ?? [];
  const viewText = parts.map((p) => p.text?.content as string | undefined).find((t) => t && /观看|views/i.test(t));
  const dateText = parts.map((p) => p.text?.content as string | undefined).find((t) => t && /前|ago/i.test(t));
  const durationBadge = collect<AnyRec>(vm.contentImage, "thumbnailBadgeViewModel")[0]?.text as string | undefined;
  const thumb = normalizeThumb(collect<AnyRec>(vm.contentImage, "sources").at(-1)?.url as string | undefined);
  return {
    kind: "youtube#searchResult",
    etag: id,
    id,
    snippet: {
      publishedAt: relativeToIso(dateText),
      channelId: "",
      channelTitle: "",
      title: meta?.title?.content ?? "",
      description: "",
      thumbnails: thumb ? { medium: { url: thumb }, high: { url: thumb } } : {},
    },
    statistics: { viewCount: parseCountLoose(viewText) },
    contentDetails: { duration: clockToIso(durationBadge) ?? "" },
  };
}

/* ---------- 搜索 ---------- */

/** 翻页 token：以 continuationItemRenderer 为宿主定位（响应里其他 "token" 多是菜单/反馈项的干扰），
 *  按 request 类型匹配优先。search=SEARCH，browse 系=WATCH_NEXT */
function pageTokenOf(data: AnyRec, requestType: string): string | null {
  const cmds = collect<AnyRec>(data, "continuationItemRenderer")
    .map((c) => c.continuationEndpoint?.continuationCommand)
    .filter((c) => c?.token);
  return (cmds.find((c) => c.request === requestType) ?? cmds[0])?.token ?? null;
}

export async function ftSearchPage(
  q: string,
  pageToken?: string,
  hl?: string,
): Promise<{ items: VideoItem[]; nextPageToken: string | null }> {
  // 语言偏好经 context.hl 生效（hl 覆盖用于多语言交错搜索）；翻页时只带 continuation
  const data = await innertubePost<AnyRec>(
    "search",
    pageToken ? { continuation: pageToken } : { query: q },
    hl,
  );
  // 语言偏好：请求级 hl 覆盖（videos store 多语言交错搜索时传入）
  const items: VideoItem[] = [];
  for (const vr of collect<AnyRec>(data, "videoRenderer")) {
    const v = videoFromVideoRenderer(vr);
    if (v) items.push(v);
  }
  if (items.length === 0) {
    for (const vm of collect<AnyRec>(data, "lockupViewModel")) {
      const v = videoFromLockup(vm);
      if (v) items.push(v);
    }
  }
  return { items, nextPageToken: pageTokenOf(data, "CONTINUATION_REQUEST_TYPE_SEARCH") };
}

/* ---------- 视频详情（/next：标题/统计/作者/描述） ---------- */

export async function ftVideoDetail(videoId: string): Promise<VideoItem | undefined> {
  const data = await innertubePost<AnyRec>("next", { videoId });
  const primary = collect<AnyRec>(data, "videoPrimaryInfoRenderer")[0];
  const secondary = collect<AnyRec>(data, "videoSecondaryInfoRenderer")[0];
  if (!primary) return undefined;
  const owner = secondary?.owner?.videoOwnerRenderer;
  const dateText = runsText(primary.dateText) ?? runsText(primary.relativeDateText);
  return {
    kind: "youtube#video",
    etag: videoId,
    id: videoId,
    snippet: {
      publishedAt: relativeToIso(dateText),
      channelId: owner?.navigationEndpoint?.browseEndpoint?.browseId ?? "",
      channelTitle: runsText(owner?.title) ?? "",
      title: runsText(primary.title) ?? "",
      description: secondary?.attributedDescription?.content ?? "",
      thumbnails: {},
    },
    statistics: { viewCount: parseCountLoose(runsText(primary.viewCount?.videoViewCountRenderer?.viewCount)) },
  };
}

/* ---------- 评论（/next 二段式：入口 continuation → commentEntityPayload） ---------- */

export async function ftComments(videoId: string): Promise<CommentThreadItem[]> {
  const first = await innertubePost<AnyRec>("next", { videoId });
  // 评论区入口：itemSectionRenderer(sectionIdentifier=comment-item-section) 里的 continuation
  let token: string | undefined;
  for (const isr of collect<AnyRec>(first, "itemSectionRenderer")) {
    if (isr.sectionIdentifier !== "comment-item-section") continue;
    token = collect<AnyRec>(isr, "continuationCommand")[0]?.token;
    if (token) break;
  }
  if (!token) return [];
  const second = await innertubePost<AnyRec>("next", { continuation: token });
  const payloads = collect<AnyRec>(second, "commentEntityPayload");
  return payloads.map((c) => {
    const text = c.properties?.content?.content ?? "";
    const likes = parseCountLoose(c.toolbar?.likeCountNotliked);
    return {
      id: c.properties?.commentId ?? "",
      snippet: {
        channelId: "",
        videoId,
        topLevelComment: {
          id: c.properties?.commentId ?? "",
          snippet: {
            textDisplay: text,
            textOriginal: text,
            authorDisplayName: c.author?.displayName ?? "",
            authorProfileImageUrl: c.author?.avatarThumbnailUrl ?? "",
            likeCount: likes ? parseInt(likes, 10) : 0,
            publishedAt: "",
            updatedAt: "",
          },
        },
        totalReplyCount: parseInt(c.toolbar?.replyCount ?? "0", 10) || 0,
      },
    } satisfies CommentThreadItem;
  });
}

/* ---------- 频道（/browse：header + videos/playlists tab） ---------- */

function channelHeader(data: AnyRec): { title: string; thumb: string; subscribers?: string; description?: string } {
  const micro = collect<AnyRec>(data, "microformatDataRenderer")[0];
  // 订阅数：递归找含"位订阅者/subscribers"的文本（header 在 pageHeaderRenderer.content.pageHeaderViewModel，
  // 但不同响应里 metadataParts 的 text 结构不稳定，按文本匹配最稳）
  let subscribers: string | undefined;
  const walk = (o: unknown): void => {
    if (subscribers) return;
    if (typeof o === "string") {
      if (/位订阅者|subscribers/i.test(o)) subscribers = parseCountLoose(o);
    } else if (Array.isArray(o)) o.forEach(walk);
    else if (o && typeof o === "object") Object.values(o).forEach(walk);
  };
  walk(data);
  return {
    title: micro?.title ?? "",
    thumb: micro?.thumbnail?.thumbnails?.at(-1)?.url ?? "",
    subscribers,
    description: micro?.description?.simpleText ?? "",
  };
}

/** 频道详情缓存（头像/标题拉取一次即可，订阅页右栏会用到） */
const channelCache = new Map<string, ChannelItem>();

export async function ftChannel(channelId: string): Promise<ChannelItem | undefined> {
  const hit = channelCache.get(channelId);
  if (hit) return hit;
  const data = await innertubePost<AnyRec>("browse", { browseId: channelId });
  const h = channelHeader(data);
  const item: ChannelItem = {
    id: channelId,
    snippet: {
      title: h.title,
      description: h.description ?? "",
      publishedAt: "",
      thumbnails: h.thumb ? { medium: { url: h.thumb }, high: { url: h.thumb } } : {},
    },
    statistics: { subscriberCount: h.subscribers },
  };
  channelCache.set(channelId, item);
  return item;
}

/** 频道视频 tab 翻页 token（richGrid 内容末尾的 continuation） */
function gridPageToken(data: AnyRec): string | null {
  return pageTokenOf(data, "CONTINUATION_REQUEST_TYPE_WATCH_NEXT");
}

export async function ftChannelVideos(
  channelId: string,
  pageToken?: string,
): Promise<{ items: VideoItem[]; nextPageToken: string | null }> {
  const body: AnyRec = pageToken ? { continuation: pageToken } : { browseId: channelId, params: VIDEOS_TAB_PARAMS };
  const data = await innertubePost<AnyRec>("browse", body);
  const items: VideoItem[] = [];
  for (const vm of collect<AnyRec>(data, "lockupViewModel")) {
    const v = videoFromLockup(vm);
    if (v) items.push(v);
  }
  return { items, nextPageToken: gridPageToken(data) };
}

export async function ftChannelPlaylists(channelId: string): Promise<PlaylistItem[]> {
  const data = await innertubePost<AnyRec>("browse", { browseId: channelId, params: PLAYLISTS_TAB_PARAMS });
  const out: PlaylistItem[] = [];
  for (const vm of collect<AnyRec>(data, "lockupViewModel")) {
    if (vm.contentType !== "LOCKUP_CONTENT_TYPE_PLAYLIST") continue;
    const playlistId: string | undefined =
      vm.rendererContext?.commandContext?.onTap?.innertubeCommand?.watchEndpoint?.playlistId ?? vm.contentId;
    if (!playlistId) continue;
    out.push({
      id: playlistId,
      snippet: {
        title: vm.metadata?.lockupMetadataViewModel?.title?.content ?? "",
        description: "",
        publishedAt: "",
        channelId,
        channelTitle: "",
        thumbnails: {},
      },
      contentDetails: { itemCount: 0 },
    });
  }
  return out;
}

/* ---------- RSS（订阅 / 首页热门聚合） ---------- */

export interface RssResult {
  channelId: string;
  channelTitle: string;
  videos: VideoItem[];
}

/** XML 实体解码（缩略图 URL / 标题里的 &amp; 等） */
function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** 单频道 RSS：youtube.com/feeds/videos.xml（无需登录，最近约 15 条）。
 *  正则解析而非 DOMParser：结构固定（YouTube 生成），少一个 DOM 依赖 */
export async function ftChannelRSS(channelId: string): Promise<RssResult> {
  const xml = await proxiedGet(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
  const channelTitle = decodeXmlEntities(xml.match(/<title>([^<]*)<\/title>/)?.[1] ?? "");
  if (!channelTitle && !xml.includes("<entry>")) throw new InnertubeError("RSS 解析失败");
  const out: VideoItem[] = [];
  const entryRe = /<entry>([\s\S]*?)<\/entry>/g;
  for (const m of xml.matchAll(entryRe)) {
    const block = m[1];
    const pick = (re: RegExp) => block.match(re)?.[1];
    const videoId = pick(/<yt:videoId>([^<]+)<\/yt:videoId>/);
    if (!videoId) continue;
    const thumb = normalizeThumb(decodeXmlEntities(pick(/<media:thumbnail[^>]*url="([^"]+)"/) ?? ""));
    out.push({
      kind: "youtube#searchResult",
      etag: videoId,
      id: videoId,
      snippet: {
        publishedAt: pick(/<published>([^<]+)<\/published>/) ?? new Date().toISOString(),
        channelId,
        channelTitle,
        title: decodeXmlEntities(pick(/<title>([^<]*)<\/title>/) ?? ""),
        description: decodeXmlEntities(pick(/<media:description>([^<]*)<\/media:description>/) ?? ""),
        thumbnails: thumb ? { medium: { url: thumb }, high: { url: thumb } } : {},
      },
      statistics: { viewCount: pick(/<media:statistics[^>]*views="(\d+)"/) },
    });
  }
  return { channelId, channelTitle, videos: out };
}

/* ---------- 内置热门频道组（首页/热门页数据源：官方 mostPopular 匿名不可用，
    2026-10 实测 FEwhat_to_watch 与首页 HTML 匿名均为空壳，故用 RSS 聚合替代）。
    分类 key 直接复用官方 videoCategoryId，Home 页 tab 文案无需改动；
    全部频道 ID 已于 2026-10-26 经 RSS 逐一实测验证，失效频道会被静默跳过。 ---------- */

export const FT_HOME_GROUPS: Record<string, string[]> = {
  "10": ["UCqECaJ8Gagnn7YCbPEzWH6g", "UC0C-w0YjGpqDXGB8IHb662A", "UCuAXFkgsw1L7xaCfnd5JJOw", "UCiGm_E4ZwYSHV3bcW1pnSeQ"], // Taylor Swift / Ed Sheeran / Rick Astley / Billie Eilish
  "20": ["UC7_YxT-KID8kRbqZo7MyscQ", "UCYzPXprvl5Y-Sf0g4vX-m6g", "UCKy1dAqELo0zrOtPkf0eTMw"], // Markiplier / jacksepticeye / IGN
  "17": ["UCNAf1k0yIjyGu3k9BwAg3lg", "UCiWLfSweyRNmLpgEHekhoAg"], // Sky Sports Premier League / ESPN
  "25": ["UC16niRr50-MSBwiO3YDb3RA", "UCupvZG-5ko_eiXAupbDfxWw"], // BBC News / CNN
  "24": ["UC8-Th83bH_thdKZDJCrn88g", "UCqFzWxSCi39LnW1JKFR3efg"], // The Tonight Show / Saturday Night Live
  "28": ["UCXuqSBlHAE6Xw-yeJA0Tunw", "UCBJycsmduvYEL83R_U4JriQ", "UCHnyfMqiRRG1u-2MsSQLbXA"], // Linus Tech Tips / Marques Brownlee / Veritasium
  "27": ["UCsXVk37bltHxD1rDPwtNM8Q", "UC6nSFpj9HTCZ5t-N3Rm3-HA", "UCAuUUnT6oDeKwE6v1NGQxug"], // Kurzgesagt / Vsauce / TED
  "19": ["UC0Ize0RLIbGdH5x4wI45G-A", "UCyEd6QBSgat5kkC6svyjudA"], // Drew Binsky / Mark Wiens
};

/** 地区频道组：首页「全部」与热门页按地区展示当地头部频道（RSS 聚合）。
 *  全部频道 ID 已于 2026-10-26 经搜索反查 + RSS 逐一验证 */
export const FT_REGION_GROUPS: Record<string, string[]> = {
  US: ["UCX6OQ3DkcsbYNE6H8uQQuVA", "UCBJycsmduvYEL83R_U4JriQ", "UC6c1z7bA__85CIWZ_jpCK-Q"], // MrBeast / Marques Brownlee / ESPN FC
  GB: ["UCoMdktPbSTixAyNGwb-UYkQ", "UC16niRr50-MSBwiO3YDb3RA", "UC4oVjJptcsvtgIMrdIUQYlQ"], // Sky News / BBC News / LADbible
  JP: ["UCZf__ehlCEBPop-_sldpBUQ", "UCibEhpu5HP45-w7Bq1ZIulw", "UCF5cWRzPwFuYz43qzEytAzw"], // HikakinTV / Fischer's / 日経ビジネス
  KR: ["UCOmHUn--16B90oW2L6FRR3A", "UCLkAepWjdylmXSltofFvsYQ", "UCEf_Bc-KVd7onSeifS3py9g"], // BLACKPINK / BANGTANTV / SMTOWN
  IN: ["UCq-Fj5jknLsUf-MWSy4_brA", "UCpEhnqL0y41EpW2TvWAHD7Q", "UCj22tfcQrWG7EMEKS0qLeEg"], // T-Series / SET India / CarryMinati
  DE: ["UCOzqhzAIw4JTJIMkDTfLnkg", "UCsXVk37bltHxD1rDPwtNM8Q"], // Paluten / Kurzgesagt
  FR: ["UCWeg2Pkate69NFdBeuRFTAw", "UCyWqModMQlbIo8274Wh_ZsQ", "UCww2zZWg4Cf5xcRKG-ThmXQ"], // SQUEEZIE / Cyprien / Norman
  RU: ["UCMCgOm8GZkHp8zJ6l7_hIuA", "UC2tsySbe9TNrI-xh2lximHA", "UCU_yU4xGT9hrVFo6euH8LLw"], // вДудь / A4 / SlivkiShow
  BR: ["UCV306eHqgo0LvBf3Mh36AHg", "UC3KQ5GWANYF8lChqjZpXsQw", "UCffDXn7ycAzwL2LDlbyWOTw"], // Felipe Neto / whinderssonnunes / KondZilla
  CA: ["UCIwFjwMjI0y7PDBVEO9-bkQ", "UCByOQJjav0CUDwxCk-jVNRQ", "UC0WP5P-ufpRfjbNrmOWwLBQ"], // Justin Bieber / Drake / The Weeknd
  AU: ["UCR4s1DE9J4DHzZYXMltSMAg", "UCw1SQ6QRRtfAhrN_cjkrOgA", "UC5vVe2R4ucoMzJP53o38Yaw"], // HowToBasic / LazarBeam / The Wiggles
  MX: ["UCECJDeK0MNapZbpaOzxrUPA", "UCYWOjHweP2V-8kGKmmAmQJQ", "UCpuSRwCaWi-VqTlYviNW3hQ"], // Luisito Comunica / Badabun / Juanpa Zurita
  ES: ["UCcjIvuxmWlS5IEQ0JdPV4Ng", "UCam8T03EOFBsNdR0thrFHdQ"], // Rubius Z / VEGETTA777
  IT: ["UCSFC5Cio8zaLQDFPxA7y_HQ", "UCD-aXv7CMezGSTfxmKAD6Ag"], // FavijTV / iPantellas
  ID: ["UCk429PEIeAPw4lCHp5Om_XA", "UCvh1at6xpV1ytYOAzxmqUsA", "UC4tS4Q_Cno5JVcIUXxQOOpA"], // Atta Halilintar / Jess No Limit / Ricis Official
  TH: ["UC5zGJZpxeZPFcds5gFcDE7Q", "UCdLGCJcIGu5ExzYN6CXtkIw", "UCjVb9mJZTeuPLN4hOjmvQnw"], // zbing z. / Kaykai Salaider / Bie The Ska
  VN: ["UCA_23dkEYToAc37hjSsCnXA", "UC9Pj0EUibBF295jWHRSDJqg"], // MixiGaming / Schannel
  NL: ["UCh8bTHe4T8o7RIU7R5EPX-w", "UCu2nNU_B4qO99M1jwcmoVeA", "UCNPlSBggCmH8FJiMC2FYYpQ"], // EnzoKnol / Dylanhaegens / Milan Knol
  SE: ["UC-lHJZR3Gqxm24_Vd_AJ5Yw", "UCKBW7WWWKIrewD13oRkaDag"], // PewDiePie / Therese Lindgren
  HK: ["UCD2SNRlEjxJODlwaKx-BoRw", "UCiJnCs2K5gP-DXnMxlstC9A", "UCTxyBu9VWUq5LXezXwy_SGg"], // TVB / 毛記電視 / 香港01
  TW: ["UC5nwNW4KdC0SzrhF9BXEYOQ", "UCR3asjvr_WAaxwJYEDV_Bfw", "UCIU8ha-NHmLjtUwU7dFiXUA"], // TVBS NEWS / 東森新聞 / 三立新聞網
  SG: ["UC83jt4dlz1Gjl58fzQrrKZg", "UCdfhBqMbNjuMNkMNxLrehWA", "UCUqUtr0w-K8W4AfpbHiYSaQ"], // CNA / TheSmartLocal / 8world
};

/** 组聚合 RSS：内存缓存 5 分钟，避免无限滚动翻页反复拉取 */
const rssCache = new Map<string, { at: number; videos: VideoItem[] }>();
const RSS_TTL = 5 * 60 * 1000;

async function fetchChannelsRSS(channelIds: string[]): Promise<VideoItem[]> {
  const now = Date.now();
  const videos: VideoItem[] = [];
  const pending: string[] = [];
  for (const id of channelIds) {
    const hit = rssCache.get(id);
    if (hit && now - hit.at < RSS_TTL) videos.push(...hit.videos);
    else pending.push(id);
  }
  // 并发 6 拉取，单频道失败静默跳过（错 ID / 网络抖动不影响整体）
  const queue = [...pending];
  const workers = Array.from({ length: Math.min(6, queue.length) }, async () => {
    for (;;) {
      const id = queue.shift();
      if (!id) return;
      try {
        const r = await ftChannelRSS(id);
        rssCache.set(id, { at: now, videos: r.videos });
        videos.push(...r.videos);
      } catch {
        /* 跳过失败频道 */
      }
    }
  });
  await Promise.all(workers);
  videos.sort((a, b) => Date.parse(b.snippet.publishedAt) - Date.parse(a.snippet.publishedAt));
  // 跨频道去重
  const seen = new Set<string>();
  return videos.filter((v) => {
    const id = typeof v.id === "string" ? v.id : "";
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/** 首页/热门页（RSS 聚合分页）：pageToken 直接复用为页码。
 *  无分类时先展示地区频道组（切换地区后内容跟随变化），
 *  地区组拉完后自动续接全球分类组内容，保证触底始终有下一页 */
export async function ftPopularPage(
  categoryId?: string,
  pageToken?: string,
): Promise<{ items: VideoItem[]; nextPageToken: string | null }> {
  const page = pageToken ? parseInt(pageToken, 10) || 0 : 0;
  const perPage = 24;
  const { regionCode } = useSettings.getState();

  if (categoryId) {
    // 分类模式：内容有限，拉完即止
    const all = await fetchChannelsRSS(FT_HOME_GROUPS[categoryId] ?? []);
    const start = page * perPage;
    const items = all.slice(start, start + perPage);
    return { items, nextPageToken: start + perPage < all.length ? String(page + 1) : null };
  }

  // 全部模式：地区组在前（本地区内容优先），全球分类组在后兜底，两段各自按时间排序后拼接
  const regionChannels = FT_REGION_GROUPS[regionCode] ?? [];
  const [regionVideos, globalVideos] = await Promise.all([
    regionChannels.length ? fetchChannelsRSS(regionChannels) : Promise.resolve([] as VideoItem[]),
    fetchChannelsRSS(Object.values(FT_HOME_GROUPS).flat()),
  ]);
  const all = [...regionVideos, ...globalVideos];
  const start = page * perPage;
  const items = all.slice(start, start + perPage);
  return { items, nextPageToken: start + perPage < all.length ? String(page + 1) : null };
}

/** 订阅流：本地频道列表逐个拉 RSS 合并（按时间倒序、去重），失败的频道单独报告 */
export async function ftSubscriptionsFeed(
  channelIds: string[],
): Promise<{ videos: VideoItem[]; failedIds: string[] }> {
  const videos: VideoItem[] = [];
  const failedIds: string[] = [];
  const queue = [...channelIds];
  const workers = Array.from({ length: Math.min(6, queue.length) }, async () => {
    for (;;) {
      const id = queue.shift();
      if (!id) return;
      try {
        videos.push(...(await ftChannelRSS(id)).videos);
      } catch {
        failedIds.push(id);
      }
    }
  });
  await Promise.all(workers);
  videos.sort((a, b) => Date.parse(b.snippet.publishedAt) - Date.parse(a.snippet.publishedAt));
  const seen = new Set<string>();
  return {
    videos: videos.filter((v) => {
      const id = typeof v.id === "string" ? v.id : "";
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    }),
    failedIds,
  };
}

/* ---------- 频道输入解析（设置页添加订阅频道用） ---------- */

/** 接受：UC 开头的频道 ID / youtube.com/channel/UC.. / youtube.com/@handle（handle 经主页 HTML 解析） */
export async function resolveChannelInput(input: string): Promise<{ id: string; title: string }> {
  const raw = input.trim();
  let id = "";
  const channelUrl = raw.match(/channel\/(UC[\w-]{22})/);
  if (channelUrl) id = channelUrl[1];
  else if (/^UC[\w-]{22}$/.test(raw)) id = raw;
  if (id) {
    const ch = await ftChannel(id);
    return { id, title: ch?.snippet.title ?? id };
  }
  // @handle 或任意 youtube 链接 → 抓频道主页 HTML 提取 channelId
  const handle = raw.match(/@([\w.-]+)/)?.[1];
  const url = handle ? `https://www.youtube.com/@${handle}` : raw;
  const html = await proxiedGet(url.startsWith("http") ? url : `https://www.youtube.com/${raw}`);
  const channelId = html.match(/"externalId":"(UC[\w-]{22})"/)?.[1] ?? html.match(/"channelId":"(UC[\w-]{22})"/)?.[1];
  if (!channelId) throw new InnertubeError("无法从输入中解析出频道 ID，请粘贴频道链接或 UC 开头的 ID");
  const title = html.match(/<meta property="og:title" content="([^"]*)"/)?.[1] ?? channelId;
  return { id: channelId, title };
}
