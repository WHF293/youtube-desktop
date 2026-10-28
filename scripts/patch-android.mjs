/**
 * Android 原生层幂等补丁（gen/android 被 .gitignore 排除，原生改动经本脚本固化重放）。
 *
 * 应用内容（配套 .ai/开发方案/2026-10-28-客户端-小米自由窗口与平行视界适配开发方案.md §四.A）：
 *  1. AndroidManifest.xml：
 *     - <application> 注入 multi-resume meta-data（多窗口内可见即 Resumed，失焦不触发 onPause）
 *     - MainActivity 声明 resizeableActivity / supportsSizeChanges（自由窗口 + 拖拽 resize 及时回调）
 *  2. MainActivity.kt：生命周期重排（小米 Stop Playback 适配，窗口文档 §6/§7）——
 *     多窗口内失焦跳过 WebView.onPause（wry 默认在 onPause 暂停 WebView 导致断播），
 *     真不可见在 onStop 暂停、onStart 成对恢复。
 *
 * 用法：node scripts/patch-android.mjs（build:apk 已前置自动执行）；
 *      gen/android 缺失时先 `pnpm tauri android init` 再跑本脚本。
 * 注意：wry 的 Kotlin 模板把 {{package}} 替换为应用包名，Rust/PluginManager 与 MainActivity
 *      同包可直接引用；若 tauri/wry 升级后编译报 unresolved，按实际包名调整 import。
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkgDir = join(root, "src-tauri", "gen", "android");
const manifestPath = join(pkgDir, "app", "src", "main", "AndroidManifest.xml");
const mainActivityPath = join(
  pkgDir,
  "app",
  "src",
  "main",
  "java",
  "com",
  "whf",
  "youtube_desktop",
  "MainActivity.kt",
);

if (!existsSync(pkgDir)) {
  console.error(
    "[patch-android] 未找到 src-tauri/gen/android —— 先执行 `pnpm tauri android init` 生成工程后再跑本补丁。",
  );
  process.exit(1);
}

const actions = [];

/* ---------- 1. AndroidManifest.xml ---------- */
let manifest = readFileSync(manifestPath, "utf8");

const MULTIPLE_RESUMED = '<meta-data android:name="android.allow_multiple_resumed_activities" android:value="true" />';
if (!manifest.includes("android.allow_multiple_resumed_activities")) {
  const appOpen = manifest.match(/<application\b[^>]*>/);
  if (!appOpen) {
    console.error("[patch-android] AndroidManifest.xml 中未找到 <application> 标签");
    process.exit(1);
  }
  manifest = manifest.replace(
    appOpen[0],
    `${appOpen[0]}\n        ${MULTIPLE_RESUMED}`,
  );
  actions.push("manifest: 注入 multi-resume meta-data");
}

if (!manifest.includes("android:resizeableActivity")) {
  const mainIdx = manifest.indexOf('android:name=".MainActivity"');
  if (mainIdx === -1) {
    console.error("[patch-android] AndroidManifest.xml 中未找到 .MainActivity");
    process.exit(1);
  }
  const actStart = manifest.lastIndexOf("<activity", mainIdx);
  const head = manifest.slice(0, actStart + "<activity".length);
  const tail = manifest.slice(actStart + "<activity".length);
  manifest = `${head} android:resizeableActivity="true"\n            android:supportsSizeChanges="true"${tail}`;
  actions.push("manifest: MainActivity 增加 resizeableActivity / supportsSizeChanges");
}

writeFileSync(manifestPath, manifest);

/* ---------- 1.5 app/build.gradle.kts：compileSdk / targetSdk 提到 37 ---------- */
// 模板默认 compileSdk 较低，AndroidManifest 里的 android:supportsSizeChanges
// （API 34 才进 android.jar）在 AAPT 资源链接阶段报 "attribute not found"；
// 本地已实测 37 可通过，CI 重新 init 后由本补丁拉齐。
const appGradlePath = join(pkgDir, "app", "build.gradle.kts");
let appGradle = readFileSync(appGradlePath, "utf8");
const SDK_LEVEL = "37";
if (
  !appGradle.includes(`compileSdk = ${SDK_LEVEL}`) ||
  !appGradle.includes(`targetSdk = ${SDK_LEVEL}`)
) {
  appGradle = appGradle
    .replace(/compileSdk\s*=\s*\d+/, `compileSdk = ${SDK_LEVEL}`)
    .replace(/targetSdk\s*=\s*\d+/, `targetSdk = ${SDK_LEVEL}`);
  writeFileSync(appGradlePath, appGradle);
  actions.push(`build.gradle.kts: compileSdk/targetSdk 提到 ${SDK_LEVEL}`);
}

/* ---------- 2. MainActivity.kt（整文件覆写，该文件本就由用户所有） ---------- */
const MAIN_ACTIVITY = `package com.whf.youtube_desktop

import android.os.Bundle
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import app.tauri.plugin.PluginManager

class MainActivity : TauriActivity() {
    private var wv: WebView? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
    }

    // WryActivity 的 open 钩子：持有 WebView 引用（wry 的 mWebView 为 private）
    override fun onWebViewCreate(webView: WebView) {
        wv = webView
    }

    // 小米 Stop Playback 适配（窗口文档 pId=1593 §6/§7）：
    // 多窗口内失焦（Activity paused 但仍可见）不暂停 WebView —— wry 默认在 onPause 里
    // WebView.onPause() 会掐断 iframe 播放；真不可见（onStop）才暂停，onStart 成对恢复。
    override fun onPause() {
        if (isInMultiWindowMode) {
            // 跳过 super 链中的 WebView.onPause，手动分发 wry / 插件生命周期钩子
            Rust.onPause(this)
            PluginManager.onPause(this)
            return
        }
        super.onPause()
    }

    override fun onStop() {
        super.onStop()
        wv?.onPause() // 多窗口内被整体后台化/划走 → 此处真不可见，暂停（后台省电）
    }

    override fun onStart() {
        super.onStart()
        wv?.onResume() // 与 onStop 成对恢复
    }
}
`;

const currentActivity = existsSync(mainActivityPath)
  ? readFileSync(mainActivityPath, "utf8")
  : null;
if (currentActivity !== MAIN_ACTIVITY) {
  writeFileSync(mainActivityPath, MAIN_ACTIVITY);
  actions.push("MainActivity.kt: 写入生命周期重排版本（失焦不断播）");
}

if (actions.length === 0) {
  console.log("[patch-android] 原生层已是目标状态，无需改动。");
} else {
  for (const a of actions) console.log(`[patch-android] ${a}`);
}
