/** ISO8601 时长（PT1H2M3S）→ 1:02:03 / 2:03 */
export function parseDuration(iso: string | undefined): string {
  if (!iso) return "";
  const m = iso.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return "";
  const [, d, h, min, s] = m.map((v) => (v ? parseInt(v, 10) : 0)) as unknown as number[];
  const hours = (d || 0) * 24 + (h || 0);
  const parts: string[] = [];
  if (hours > 0) parts.push(String(hours));
  parts.push(String(min || 0).padStart(hours > 0 ? 2 : 1, "0"));
  parts.push(String(s || 0).padStart(2, "0"));
  return parts.join(":");
}

/** 观看数/订阅数 → 中文习惯（万/亿） */
/** 数值 → 中文习惯（万/亿），去掉无意义的 .0（2000.0万 → 2000万） */
export function formatCount(n: string | number | undefined): string {
  const num = typeof n === "string" ? parseInt(n, 10) : n;
  if (num === undefined || Number.isNaN(num)) return "";
  const trim = (s: string) => s.replace(/\.0$/, "");
  if (num >= 100_000_000) return `${trim((num / 100_000_000).toFixed(1))}亿`;
  if (num >= 10_000) return `${trim((num / 10_000).toFixed(1))}万`;
  return String(num);
}

export function formatViews(n: string | undefined): string {
  const c = formatCount(n);
  return c ? `${c}次观看` : "";
}

/** 发布时间 → 相对时间（中文） */
export function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return "";
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}天前`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}个月前`;
  const years = Math.floor(months / 12);
  return `${years}年前`;
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

/** 字节数 → MB/GB 展示 */
export function formatBytes(n: number | undefined): string {
  if (!n || n <= 0) return "";
  if (n >= 1024 * 1024 * 1024) return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** 视频缩略图：优先高清 */
export function bestThumb(snippet: { thumbnails?: { medium?: { url: string }; high?: { url: string }; default?: { url: string } } }): string {
  const t = snippet.thumbnails;
  return t?.medium?.url ?? t?.high?.url ?? t?.default?.url ?? "";
}

/** 从 VideoItem 取视频 id（id 可能是字符串或 { videoId } 对象；无效返回 null） */
export function videoIdOf(v: { id: string | { videoId?: string | null } | null | undefined }): string | null {
  if (typeof v.id === "string") return v.id;
  return v.id?.videoId ?? null;
}
