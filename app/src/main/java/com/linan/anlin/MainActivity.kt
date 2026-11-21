package com.linan.anlin

import android.annotation.SuppressLint
import android.app.AlertDialog
import android.app.DownloadManager
import android.content.Context
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.ContextThemeWrapper
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast

/**
 * 暗林 · 幸存夜 —— 游戏壳。
 *
 * 玩法内核全部在 assets/www/（Canvas + WebAudio，零第三方库、零网络请求）：
 * 白天搜刮砍柴围据点，夜里守家，找 3 个电台零件修好电台撑到救援。
 *
 * 原生只干三件事：
 * 1. 全屏无栏地把 WebView 摆好（存档靠 localStorage，必须开 DOM Storage）；
 * 2. 给页面一个「检查更新」入口（见 UpdateChecker，本工程唯一联网代码）；
 * 3. 处理返回键——先让页面收面板/开暂停，页面说没得退了才退到后台。
 */
class MainActivity : android.app.Activity() {

    private lateinit var webView: WebView
    private val mainHandler = Handler(Looper.getMainLooper())

    /** 从「安装未知应用」设置页回来后要重试安装的包名 */
    private var pendingInstall: String? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        // 仅调试包开 DevTools（adb forward + CDP 验证用）；release 包里 FLAG_DEBUGGABLE 为 0，不开放
        if ((applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            WebView.setWebContentsDebuggingEnabled(true)
        }

        webView = WebView(this).apply {
            setBackgroundColor(0xFF0B0D0A.toInt()) // 与页面夜色一致，开局不闪白
            overScrollMode = android.view.View.OVER_SCROLL_NEVER
            isHorizontalScrollBarEnabled = false
            isVerticalScrollBarEnabled = false
            settings.apply {
                javaScriptEnabled = true
                // 存档在 localStorage：不开 DOM Storage 就等于「死亡即结束 + 进度全丢」
                domStorageEnabled = true // 存档就靠它
                // 游戏自己按 CSS 像素排 HUD 和摇杆，绝不允许 WebView 缩放页面或文字
                setSupportZoom(false)
                builtInZoomControls = false
                displayZoomControls = false
                useWideViewPort = true
                loadWithOverviewMode = true
                textZoom = 100
                mediaPlaybackRequiresUserGesture = false
                allowFileAccess = true
                allowContentAccess = false
                javaScriptCanOpenWindowsAutomatically = false
            }
            // 游戏只用本地文件：任何其它域名一律拦掉，顺手把"偷偷联网"这条路堵死
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(
                    view: WebView?,
                    request: WebResourceRequest?
                ): Boolean = true

                override fun onReceivedError(
                    view: WebView?,
                    request: WebResourceRequest?,
                    error: android.webkit.WebResourceError?
                ) {
                    if (request?.isForMainFrame == true) {
                        toast("本地资源加载失败，请重装 APK")
                    }
                }
            }
            addJavascriptInterface(AnlinBridge(this@MainActivity), "Anlin")
        }
        setContentView(webView)
        goImmersive()
        webView.loadUrl("file:///android_asset/www/index.html")
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        // 系统栏被划出来过就重新藏回去，别让 HUD 顶到状态栏底下
        if (hasFocus) goImmersive()
    }

    /** 全屏沉浸：状态栏/导航栏划出来也会自动收回 */
    @Suppress("DEPRECATION")
    private fun goImmersive() {
        if (android.os.Build.VERSION.SDK_INT >= 30) {
            val controller = window.insetsController ?: return
            controller.hide(android.view.WindowInsets.Type.systemBars())
            controller.systemBarsBehavior =
                android.view.WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        } else {
            window.decorView.systemUiVisibility = (
                android.view.View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    or android.view.View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    or android.view.View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    or android.view.View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    or android.view.View.SYSTEM_UI_FLAG_FULLSCREEN
                    or android.view.View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                )
        }
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
        // 去开「安装未知应用」权限回来后，自动重试安装
        val name = pendingInstall
        if (name != null && UpdateChecker.canInstallApk(this)) {
            pendingInstall = null
            UpdateChecker.promptInstall(this, UpdateChecker.downloadedFile(this, name))
        }
    }

    override fun onPause() {
        super.onPause()
        // 后台继续跑 update 循环 = 玩家回来发现自己已经死在夜里，这不是游戏是坑
        webView.onPause()
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        // 交给页面自己判断：有面板就关面板，在玩就开暂停，都没有才退出
        webView.evaluateJavascript("window.__anlinBack ? window.__anlinBack() : false") { raw ->
            if (raw != "true") {
                // 主菜单/结算页按返回 -> 退到后台（不杀进程，存档不受影响）
                moveTaskToBack(true)
            }
        }
    }

    override fun onDestroy() {
        if (::webView.isInitialized) {
            webView.destroy()
        }
        super.onDestroy()
    }

    fun toast(msg: String) {
        mainHandler.post { Toast.makeText(this, msg, Toast.LENGTH_LONG).show() }
    }

    // ---------- 应用内更新（只在玩家按下按钮时联网） ----------

    fun checkUpdate() {
        toast("正在检查更新…")
        Thread {
            try {
                val latest = UpdateChecker.fetchLatest()
                val current = UpdateChecker.currentVersion(this)
                mainHandler.post {
                    if (!UpdateChecker.hasNewer(latest.tag, current)) {
                        toast("已是最新版本 v$current")
                    } else {
                        onNewVersion(latest)
                    }
                }
            } catch (e: Exception) {
                toast("检查更新失败：${e.message}")
            }
        }.start()
    }

    private fun onNewVersion(latest: UpdateChecker.ReleaseInfo) {
        if (latest.sha256.isEmpty()) {
            AlertDialog.Builder(this)
                .setTitle("发现新版本 ${latest.version}")
                .setMessage("发布资产缺少 sha256 digest，无法校验安装包完整性，已停止更新。请到发布页检查。")
                .setPositiveButton("知道了", null)
                .show()
            return
        }
        val local = UpdateChecker.downloadedFile(this, latest.apkName)
        if (local.exists() && UpdateChecker.verify(local, latest.sha256)) {
            // 本地已有校验通过的同一版，不重复下载
            confirmInstall(latest, local)
            return
        }
        AlertDialog.Builder(this)
            .setTitle("发现新版本 ${latest.version}")
            .setMessage(
                "当前 v${UpdateChecker.currentVersion(this)}，是否下载更新？" +
                    "（${sizeText(latest.apkSize)}，存档会保留）"
            )
            .setPositiveButton("下载") { _, _ -> startUpdateDownload(latest) }
            .setNegativeButton("取消", null)
            .show()
    }

    private fun confirmInstall(latest: UpdateChecker.ReleaseInfo, apk: java.io.File) {
        AlertDialog.Builder(this)
            .setTitle("新版本 ${latest.version} 已就绪")
            .setMessage("安装包已下载并通过 sha256 校验，立即安装？")
            .setPositiveButton("安装") { _, _ ->
                pendingInstall = latest.apkName
                if (UpdateChecker.promptInstall(this, apk)) pendingInstall = null
            }
            .setNegativeButton("稍后", null)
            .show()
    }

    private fun startUpdateDownload(latest: UpdateChecker.ReleaseInfo) {
        val id = UpdateChecker.download(this, latest.apkUrl, latest.apkName)
        if (id == -1L) {
            toast("无法启动系统下载服务")
            return
        }
        val dlgCtx = ContextThemeWrapper(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
        val label = TextView(dlgCtx).apply {
            setPadding(0, 0, 0, 16)
            textSize = 15f
            text = "等待网络…"
        }
        val bar = ProgressBar(dlgCtx, null, android.R.attr.progressBarStyleHorizontal).apply {
            max = 100
            progress = 0
        }
        val box = android.widget.LinearLayout(dlgCtx).apply {
            orientation = android.widget.LinearLayout.VERTICAL
            setPadding(8, 8, 8, 8)
            addView(label)
            addView(bar)
        }
        val dialog = AlertDialog.Builder(dlgCtx)
            .setTitle("正在下载 ${latest.version}")
            .setView(box)
            .setCancelable(false)
            .setNegativeButton("取消") { _, _ ->
                (getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager).remove(id)
            }
            .show()

        val poll = object : Runnable {
            override fun run() {
                if (!dialog.isShowing) return
                val (soFar, total) = UpdateChecker.downloadProgress(this@MainActivity, id)
                when (val p = UpdateChecker.progressOf(
                    UpdateChecker.downloadStatus(this@MainActivity, id), soFar, total
                )) {
                    UpdateChecker.Progress.Success -> {
                        dialog.dismiss()
                        val apk = UpdateChecker.downloadedFile(this@MainActivity, latest.apkName)
                        if (UpdateChecker.verify(apk, latest.sha256)) {
                            confirmInstall(latest, apk)
                        } else {
                            apk.delete()
                            AlertDialog.Builder(this@MainActivity)
                                .setTitle("更新失败")
                                .setMessage("安装包 sha256 校验未通过，已删除。请重试或到发布页反馈。")
                                .setPositiveButton("知道了", null)
                                .show()
                        }
                    }
                    UpdateChecker.Progress.Failed -> {
                        dialog.dismiss()
                        toast("下载失败，请检查网络后重试")
                    }
                    is UpdateChecker.Progress.Running -> {
                        bar.isIndeterminate = false
                        if (p.percent >= 0) {
                            bar.progress = p.percent
                            label.text =
                                "下载中 ${p.percent}%（${sizeText(p.soFar)} / ${sizeText(p.total)}）"
                        } else {
                            label.text = "下载中 ${p.soFar / 1024}KB"
                        }
                        mainHandler.postDelayed(this, 500)
                    }
                    UpdateChecker.Progress.Waiting -> {
                        // DownloadManager 只肯在过了系统校验的网络上传字节，
                        // 排队时显示 0% 会让玩家以为卡死——挂起态必须说清楚任务没丢
                        bar.isIndeterminate = true
                        label.text = "等待网络…（系统下载服务排队中，连上可用网络会自动继续）"
                        mainHandler.postDelayed(this, 800)
                    }
                }
            }
        }
        mainHandler.postDelayed(poll, 400)
    }

    private fun sizeText(bytes: Long): String =
        if (bytes >= 1024 * 1024) {
            val mb = bytes * 10 / 1024 / 1024
            "${mb / 10}.${mb % 10}MB"
        } else "${bytes / 1024}KB"

    /** 给 JS 桥用：当前安装版本号 */
    fun version(): String = UpdateChecker.currentVersion(this)
}

/**
 * JS 桥：assets/www/js/android.js 通过 window.Anlin 调原生。
 * 注意 @JavascriptInterface 方法跑在 JavaBridge 线程，碰 UI 必须回主线程。
 */
class AnlinBridge(private val activity: MainActivity) {

    /** 当前版本号，暂停页/主菜单显示用 */
    @JavascriptInterface
    fun version(): String = activity.version()

    /** 应用内更新：查 GitHub Release -> 应用内下载 -> 校验 -> 拉起安装 */
    @JavascriptInterface
    fun checkUpdate() {
        activity.runOnUiThread { activity.checkUpdate() }
    }
}
