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

/**
 * 代理图片组件：i.ytimg.com / yt3.ggpht.com 等图片域名在国内同样被墙，
 * WebView 里的 <img> 无法走应用代理，桌面端改为经 Rust `yt_image`
 * 命令拉取（带白名单校验 + 两级内存缓存）后以 data URL 渲染；
 * 网页端（dev:web）保持浏览器直连。
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
        /* 加载失败保持空白底色 */
      });
    return () => {
      alive = false;
    };
  }, [src]);

  return <img src={dataSrc} alt={alt} className={className} loading={loading} draggable={false} />;
}
