// 构建期分流（vite --mode，范式同 whf-stock-board）：
// - mobile（pnpm dev:mobile / build:mobile / tauri android dev|build）→ 只打包 src/mobile/ 移动壳，
//   桌面启动链（pc/App → pages/TitleBar/Sidebar）整体不进包；
// - 其余（pnpm dev / build / tauri dev|build）→ 桌面原流程，行为与目录重构前一致。
// import.meta.env.MODE 是构建期常量，vite 会把不可达分支整树剔除，桌面产物不含移动代码、反之亦然。
import "./common/styles/global.css";

if (import.meta.env.MODE === "mobile") {
  void import("./mobile/bootstrap").then(({ bootstrapMobile }) => bootstrapMobile());
} else {
  void import("./pc/bootstrapDesktop").then(({ bootstrapDesktop }) => bootstrapDesktop());
}
