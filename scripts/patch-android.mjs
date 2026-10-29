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
 *  3. 应用内更新链：REQUEST_INSTALL_PACKAGES 权限 + FileProvider（file_paths.xml 暴露
 *     内部缓存 apk/）+ MainActivity 的 AndroidBridge.installApk JS 桥弹系统安装界面。
 *  4. 视频全屏桥：AndroidBridge.enterVideoFullscreen / exitVideoFullscreen ——
 *     Android WebView 对 iframe 播放器的 Fullscreen API 不生效（自带全屏按钮无效），
 *     前端自绘按钮 + CSS 铺满，经此桥强制横屏 + 沉浸系统栏（src/mobile/views/Watch.tsx 消费）。
 *
 * 用法：node scripts/patch-android.mjs（build:apk 已前置自动执行）；
 *      gen/android 缺失时先 `pnpm tauri android init` 再跑本脚本。
 * 注意：wry 的 Kotlin 模板把 {{package}} 替换为应用包名，Rust/PluginManager 与 MainActivity
 *      同包可直接引用；若 tauri/wry 升级后编译报 unresolved，按实际包名调整 import。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
  // 注意：不能加 android:supportsSizeChanges —— 该属性是 framework 隐藏属性
  // （不在公开 android.jar 的 R$attr 中），AAPT 资源链接阶段必然报
  // "attribute not found"（compileSdk 37 亦然，v0.9.1 CI 实测）。自由窗口与
  // 拖拽 resize 由 resizeableActivity 覆盖，WebView 自身随窗口尺寸回调。
  manifest = `${head} android:resizeableActivity="true"${tail}`;
  actions.push("manifest: MainActivity 增加 resizeableActivity");
}

// 清掉早期补丁误加的 supportsSizeChanges（隐藏属性，AAPT 无法链接）
if (manifest.includes("android:supportsSizeChanges")) {
  manifest = manifest.replace(/\s*android:supportsSizeChanges="true"/g, "");
  actions.push("manifest: 移除 supportsSizeChanges（隐藏属性，AAPT 拒绝）");
}

// 应用内更新：申请安装未知来源应用权限（用户首次安装时系统弹开关授权）
const INSTALL_PERMISSION = '<uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />';
if (!manifest.includes("android.permission.REQUEST_INSTALL_PACKAGES")) {
  const permAnchor = manifest.match(/<application\b[^>]*>/);
  if (!permAnchor) {
    console.error("[patch-android] AndroidManifest.xml 中未找到 <application> 标签");
    process.exit(1);
  }
  manifest = manifest.replace(permAnchor[0], `${INSTALL_PERMISSION}\n    ${permAnchor[0]}`);
  actions.push("manifest: 注入 REQUEST_INSTALL_PACKAGES 权限");
}

// 应用内更新：FileProvider——Android 7+ 安装 APK 必须经 content:// URI 暴露给系统安装器
const PROVIDER_XML = `        <provider
            android:name="androidx.core.content.FileProvider"
            android:authorities="\${applicationId}.fileprovider"
            android:exported="false"
            android:grantUriPermissions="true">
            <meta-data
                android:name="android.support.FILE_PROVIDER_PATHS"
                android:resource="@xml/file_paths" />
        </provider>
`;
if (!manifest.includes("androidx.core.content.FileProvider")) {
  const closeApp = manifest.lastIndexOf("</application>");
  if (closeApp === -1) {
    console.error("[patch-android] AndroidManifest.xml 中未找到 </application> 标签");
    process.exit(1);
  }
  manifest = manifest.slice(0, closeApp) + PROVIDER_XML + manifest.slice(closeApp);
  actions.push("manifest: 注入 FileProvider（content:// 暴露 APK 给系统安装器）");
}

writeFileSync(manifestPath, manifest);

/* ---------- 1.4 res/xml/file_paths.xml：FileProvider 暴露范围 ----------
 * Tauri path().cache_dir() 在 Android 实测解析到外部缓存
 * /storage/emulated/0/Android/data/<pkg>/cache，download_update 的 APK 落在外部缓存 apk/，
 * 因此 external-cache-path 必须暴露（漏配会导致 FileProvider 报
 * "Failed to find configured root that contains /storage/emulated/0/..."，安装直接失败）；
 * cache-path 保留兜底，防未来回切内部缓存 */
const filePathsPath = join(pkgDir, "app", "src", "main", "res", "xml", "file_paths.xml");
const FILE_PATHS = `<?xml version="1.0" encoding="utf-8"?>
<paths>
    <cache-path name="apk" path="apk/" />
    <external-cache-path name="apk_ext" path="apk/" />
</paths>
`;
if (!existsSync(filePathsPath) || readFileSync(filePathsPath, "utf8") !== FILE_PATHS) {
  mkdirSync(dirname(filePathsPath), { recursive: true });
  writeFileSync(filePathsPath, FILE_PATHS);
  actions.push("res/xml/file_paths.xml: 写入 FileProvider 暴露范围（cache/apk）");
}

/* ---------- 1.5 app/build.gradle.kts：compileSdk / targetSdk 提到 37 ---------- */
// 与本地 gen/android 口径拉齐（CI 模板已是 37 时为幂等 no-op）。
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

import android.content.Intent
import android.content.pm.ActivityInfo
import android.os.Bundle
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.widget.Toast
import androidx.activity.enableEdgeToEdge
import androidx.core.content.FileProvider
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import app.tauri.plugin.PluginManager
import java.io.File

class MainActivity : TauriActivity() {
    private var wv: WebView? = null
    /** 系统栏 inset（CSS px）：edge-to-edge 下 WebView 画到状态栏/手势条底下，
     *  而 Android WebView 的 env(safe-area-inset-*) 恒为 0，页面让不出空间，
     *  由原生层量出后经 CSS 变量 --m-inset-top/bottom 注入（mobile.css 消费） */
    private var insetTop = 0
    private var insetBottom = 0
    /** iframe 视频全屏视图（onShowCustomView 回调持有），退出时移除 */
    private var fullscreenView: View? = null
    /** iframe 退出全屏回调（onShowCustomView 的第二参数），onHideCustomView 时必须调用 */
    private var fullscreenCallback: WebChromeClient.CustomViewCallback? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        ViewCompat.setOnApplyWindowInsetsListener(window.decorView) { _, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            // bars.top/bottom 是设备物理像素，CSS px 需除以屏幕密度（dpr），
            // 否则高密度手机上 --m-inset-top 是正确值的 2~3 倍，navbar 上方留白巨大
            val density = resources.displayMetrics.density
            insetTop = Math.round(bars.top / density)
            insetBottom = Math.round(bars.bottom / density)
            applyInsetsToPage()
            insets
        }
    }

    /** 把 inset 写进页面 CSS 变量。WebView 创建早于页面 DOM 就绪，
     *  立即注入大概率落空，故追加延迟重试（幂等，重复 set 无副作用） */
    private fun applyInsetsToPage() {
        val js = "document.documentElement.style.setProperty('--m-inset-top','\${insetTop}px');" +
            "document.documentElement.style.setProperty('--m-inset-bottom','\${insetBottom}px');"
        wv?.evaluateJavascript(js, null)
        wv?.postDelayed({ wv?.evaluateJavascript(js, null) }, 600)
        wv?.postDelayed({ wv?.evaluateJavascript(js, null) }, 2000)
    }

    // WryActivity 的 open 钩子：持有 WebView 引用（wry 的 mWebView 为 private）
    override fun onWebViewCreate(webView: WebView) {
        wv = webView
        applyInsetsToPage()

        // iframe 视频全屏接管：Android WebView 默认忽略 iframe 全屏请求
        // （点播放器全屏按钮无反应），挂 WebChromeClient：
        // onShowCustomView 进入全屏（横屏 + 沉浸系统栏），onHideCustomView 还原
        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowCustomView(view: View, callback: CustomViewCallback) {
                // 已在全屏则忽略重复请求（幂等）
                if (fullscreenView != null) {
                    callback.onCustomViewHidden()
                    return
                }
                fullscreenView = view
                fullscreenCallback = callback
                requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
                WindowInsetsControllerCompat(window, window.decorView).let { c ->
                    c.hide(WindowInsetsCompat.Type.systemBars())
                    c.systemBarsBehavior =
                        WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                }
                (window.decorView as android.view.ViewGroup).addView(
                    view,
                    android.view.ViewGroup.LayoutParams(
                        android.view.ViewGroup.LayoutParams.MATCH_PARENT,
                        android.view.ViewGroup.LayoutParams.MATCH_PARENT
                    )
                )
            }

            override fun onHideCustomView() {
                val v = fullscreenView ?: return
                fullscreenView = null
                (window.decorView as android.view.ViewGroup).removeView(v)
                requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
                WindowInsetsControllerCompat(window, window.decorView)
                    .show(WindowInsetsCompat.Type.systemBars())
                // 必须回调，否则 iframe 内部停在半退出状态、视频黑屏
                fullscreenCallback?.onCustomViewHidden()
                fullscreenCallback = null
            }
        }

        // 应用内更新桥：前端经 download_update 下载完 APK 后调
        // AndroidBridge.installApk(path) 经 FileProvider 弹系统安装界面
        webView.addJavascriptInterface(object {
            @JavascriptInterface
            fun installApk(path: String) {
                runOnUiThread {
                    try {
                        val uri = FileProvider.getUriForFile(
                            this@MainActivity,
                            "$packageName.fileprovider",
                            File(path)
                        )
                        val intent = Intent(Intent.ACTION_VIEW)
                            .setDataAndType(uri, "application/vnd.android.package-archive")
                            .addFlags(
                                Intent.FLAG_GRANT_READ_URI_PERMISSION
                                    or Intent.FLAG_ACTIVITY_NEW_TASK
                            )
                        startActivity(intent)
                    } catch (e: Exception) {
                        Toast.makeText(
                            this@MainActivity,
                            "安装失败：" + e.message,
                            Toast.LENGTH_LONG
                        ).show()
                    }
                }
            }

            // 视频全屏桥：移动端观看页自绘全屏按钮调用。Android WebView 对 iframe
            // 内嵌播放器的 Fullscreen API 不生效（YouTube 播放器自带全屏按钮点了
            // 无反应，onShowCustomView 也不会触发），由前端 CSS 铺满 + 此桥切横竖屏：
            // 进入强制横屏（已横屏为 no-op）+ 沉浸系统栏，退出还原
            @JavascriptInterface
            fun enterVideoFullscreen() {
                runOnUiThread {
                    requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
                    WindowInsetsControllerCompat(window, window.decorView).let { c ->
                        c.hide(WindowInsetsCompat.Type.systemBars())
                        c.systemBarsBehavior =
                            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                    }
                }
            }

            @JavascriptInterface
            fun exitVideoFullscreen() {
                runOnUiThread {
                    requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
                    WindowInsetsControllerCompat(window, window.decorView)
                        .show(WindowInsetsCompat.Type.systemBars())
                }
            }
        }, "AndroidBridge")
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
