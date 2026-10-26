import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { invoke, isTauri } from "@tauri-apps/api/core";
import TitleBar from "./components/TitleBar";
import Sidebar from "./components/Sidebar";
import Home from "./pages/Home";
import Trending from "./pages/Trending";
import Search from "./pages/Search";
import Watch from "./pages/Watch";
import Channel from "./pages/Channel";
import Subscriptions from "./pages/Subscriptions";
import Settings from "./pages/Settings";
import { useTheme } from "./stores/theme";
import { useVideos } from "./stores/videos";
import { useSettings } from "./stores/settings";

export default function App() {
  const theme = useTheme((s) => s.theme);
  const videosStatus = useVideos((s) => s.status);
  const loadPopular = useVideos((s) => s.loadPopular);

  // 明暗模式：class 挂在 <html> 上
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  // 把当前 proxy 同步到 Rust 侧落盘（下次启动 WebView 按 --proxy-server 挂代理，
  // 视频 iframe 播放依赖它）；API/图片请求的代理是即时生效的，无需重启。
  useEffect(() => {
    if (!isTauri()) return;
    invoke("save_webview_proxy", { proxy: useSettings.getState().proxy }).catch(() => {});
  }, []);

  // 首次进入预热热门数据（Home / Trending 共用）
  useEffect(() => {
    if (videosStatus === "idle") void loadPopular();
  }, [videosStatus, loadPopular]);

  return (
    <div className="flex h-full flex-col bg-app text-ink">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-y-auto">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/home" element={<Navigate to="/" replace />} />
            <Route path="/trending" element={<Trending />} />
            <Route path="/search" element={<Search />} />
            <Route path="/watch/:videoId" element={<Watch />} />
            <Route path="/channel/:channelId" element={<Channel />} />
            <Route path="/subscriptions" element={<Subscriptions />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
