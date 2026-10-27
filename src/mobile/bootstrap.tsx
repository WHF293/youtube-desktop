import React from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import MobileApp from "./MobileApp";
import "./mobile.css";

/** 移动端启动（vite --mode mobile 时由 src/main.tsx 分流进入） */
export async function bootstrapMobile() {
  // dev-only mock（大屏适配截图比对用）：pnpm dev:mobile 后访问 http://localhost:1420/?mock=1
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).has("mock")) {
    const { installDevMock } = await import("./devMock");
    installDevMock();
  }
  createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <HashRouter>
        <MobileApp />
      </HashRouter>
    </React.StrictMode>,
  );
}
