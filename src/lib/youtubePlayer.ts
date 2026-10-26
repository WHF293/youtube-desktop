/**
 * YouTube IFrame Player API 加载器 + 中文字幕自动翻译。
 * 播放页用 IFrame API 而非静态 iframe 的原因：需要 player.setOption
 * 控制「字幕自动翻译」——静态 iframe 只能默认开 CC，无法指定翻译目标语言。
 */

export interface YtPlayer {
  loadModule?: (name: string) => void;
  setOption?: (module: string, option: string, value: unknown) => void;
  getIframe?: () => HTMLIFrameElement | undefined;
  destroy?: () => void;
}

interface YtNamespace {
  Player: new (
    el: HTMLElement | string,
    config: {
      width?: string | number;
      height?: string | number;
      videoId?: string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (e: { target: YtPlayer }) => void;
        onStateChange?: (e: { target: YtPlayer; data: number }) => void;
      };
    },
  ) => YtPlayer;
  PlayerState: { PLAYING: number };
}

declare global {
  interface Window {
    YT?: YtNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YtNamespace> | null = null;

/** 加载 IFrame Player API（单例；脚本与播放器 iframe 都走 WebView 启动时注入的代理） */
export function loadYouTubeApi(): Promise<YtNamespace> {
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<YtNamespace>((resolve, reject) => {
    if (window.YT?.Player) {
      resolve(window.YT);
      return;
    }
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      if (window.YT) resolve(window.YT);
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => reject(new Error("YouTube 播放器脚本加载失败"));
    document.head.appendChild(script);
    window.setTimeout(() => reject(new Error("YouTube 播放器脚本加载超时")), 15_000);
  });
  apiPromise.catch(() => {
    apiPromise = null; // 失败允许重试
  });
  return apiPromise;
}

/** 开启简体中文字幕：有原生中文字幕直接用，否则播放器自动翻译为简体。
 *  字幕模块在视频开始播放后才就绪，onReady / PLAYING 各调一次，失败静默 */
export function enableChineseCaptions(player: YtPlayer): void {
  try {
    player.loadModule?.("captions");
    player.setOption?.("captions", "track", {});
    // 两种参数形态都设，兼容播放器版本差异
    player.setOption?.("captions", "translationLanguage", { languageCode: "zh-Hans" });
    player.setOption?.("captions", "translationLanguage", "zh-Hans");
  } catch {
    /* 字幕能力不可用时静默（不影响播放） */
  }
}
