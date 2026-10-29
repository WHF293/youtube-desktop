import { create } from "zustand";

/** 移动端播放器全屏态（仅移动端观看页使用）：
 *  Android WebView 对 iframe 内嵌播放器的 Fullscreen API 不生效（YouTube 播放器
 *  自带全屏按钮点了无反应），由前端自绘按钮接管 —— 播放器容器 CSS 铺满 +
 *  经 AndroidBridge 强制横屏/沉浸系统栏（scripts/patch-android.mjs 注入）。
 *  状态放 store 是因为 Android 返回键处理在 MobileApp，要和 Watch 页共享。 */
interface VideoFullscreenState {
  active: boolean;
  setActive: (active: boolean) => void;
}

export const useVideoFullscreen = create<VideoFullscreenState>()((set) => ({
  active: false,
  setActive: (active) => set({ active }),
}));
