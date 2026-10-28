import { useEffect, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { useSettings } from "../stores/settings";

/** 前端侧 data URL 缓存（Rust 侧还有一层，双重去重） */
const cache = new Map<string, string>();

interface ImgProps {
  src: string;
  alt?: string;
  className?: string;
  loading?: "lazy" | "eager";
}

/** 兜底占位图（资源未加载/加载失败时渲染）：中性灰底 + 山形图片符号，明暗模式都不突兀 */
const PLACEHOLDER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 9'%3E%3Crect width='16' height='9' fill='%23d9d9de'/%3E%3Ccircle cx='5.5' cy='3.2' r='1.1' fill='%23f2f2f4'/%3E%3Cpath d='M1 8 L6 4.2 L9 6.4 L11.4 4.8 L15 8 Z' fill='%23f2f2f4'/%3E%3C/svg%3E";

/**
 * 代理图片组件：i.ytimg.com / yt3.ggpht.com 等图片域名在国内同样被墙，
 * WebView 里的 <img> 无法走应用代理，桌面端改为经 Rust `yt_image`
 * 命令拉取（带白名单校验 + 两级内存缓存）后以 data URL 渲染；
 * 网页端（dev:web）保持浏览器直连。
 * 加载前/失败渲染兜底占位图，加载成功后无缝替换（列表不出现空白块）。
 */
export default function Img({ src, alt = "", className, loading }: ImgProps) {
  const [dataSrc, setDataSrc] = useState<string | undefined>(() =>
    isTauri() ? cache.get(src) : src,
  );

  useEffect(() => {
    if (!isTauri()) {
      setDataSrc(src);
      return;
    }
    const hit = cache.get(src);
    if (hit) {
      setDataSrc(hit);
      return;
    }
    let alive = true;
    setDataSrc(undefined);
    invoke<string>("yt_image", { url: src, proxy: useSettings.getState().proxy })
      .then((dataUrl) => {
        if (!alive) return;
        if (cache.size > 300) cache.clear();
        cache.set(src, dataUrl);
        setDataSrc(dataUrl);
      })
      .catch(() => {
        /* 加载失败保持兜底占位图 */
      });
    return () => {
      alive = false;
    };
  }, [src]);

  return <img src={dataSrc ?? PLACEHOLDER} alt={alt} className={className} loading={loading} draggable={false} />;
}
