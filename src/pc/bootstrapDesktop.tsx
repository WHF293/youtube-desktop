import React from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";

/** 桌面端启动（原 src/main.tsx 主体，目录重构后平移到 pc/） */
export function bootstrapDesktop() {
  createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <HashRouter>
        <App />
      </HashRouter>
    </React.StrictMode>,
  );
}
