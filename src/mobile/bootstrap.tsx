import React from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import MobileApp from "./MobileApp";
import "./mobile.css";

/** 移动端启动（vite --mode mobile 时由 src/main.tsx 分流进入） */
export function bootstrapMobile() {
  createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <HashRouter>
        <MobileApp />
      </HashRouter>
    </React.StrictMode>,
  );
}
