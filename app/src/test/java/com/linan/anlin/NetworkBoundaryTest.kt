package com.linan.anlin

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * 联网边界：一款「只活在本地」的生存游戏，悄悄联网会把沉浸感当场戳破。
 *
 * 规则：全工程只允许 update 层的 UpdateChecker.kt 出现网络 API，
 * 且只有原生壳的 JS 桥（MainActivity 里的 AnlinBridge）能引用它——
 * 游戏内核（assets/www）一个网络请求都不许发。
 *
 * 这条约束靠测试钉住，不靠注释。
 */
class NetworkBoundaryTest {

    private val srcRoot = File("src/main").let { if (it.isDirectory) it else File("app/src/main") }

    /** 网络 API 的指纹：出现这些就意味着会出网 */
    private val networkFingerprints = listOf(
        "HttpURLConnection",
        "java.net.URL",
        "java.net.Socket",
        "okhttp3",
        "Retrofit",
        "Volley"
    )

    /** 唯一允许出网的文件 */
    private val allowed = setOf("UpdateChecker.kt")

    /** 内核不许出网：assets/www 下任何 js/html 都不许出现 fetch/XHR/协议地址 */
    private val webFingerprints = listOf(
        "fetch(", "XMLHttpRequest", "\$.get", "\$.post", "WebSocket",
        "https://", "http://"
    )

    private fun kotlinSources(): List<File> =
        File(srcRoot, "java").walkTopDown().filter { it.isFile && it.extension == "kt" }.toList()

    @Test
    fun networkApiOnlyInUpdateChecker() {
        val files = kotlinSources()
        assertTrue("找不到源码目录：$srcRoot 的绝对路径=${srcRoot.absolutePath}", files.isNotEmpty())
        val offenders = files.map { f ->
            val text = f.readText()
            f.name to networkFingerprints.filter { text.contains(it) }
        }.filter { (_, hits) -> hits.isNotEmpty() }

        for ((name, hits) in offenders) {
            assertTrue("$name 里出现了网络 API（$hits），但它不在联网白名单 $allowed 里", name in allowed)
        }
        // 白名单里的东西必须真的在，否则是路径写错而不是真的没联网
        assertTrue("UpdateChecker.kt 不见了", files.any { it.name in allowed })
    }

    @Test
    fun onlyTheBridgeTouchesModule() {
        val users = kotlinSources()
            .filter { it.name != "UpdateChecker.kt" }
            .filter { it.readText().contains("UpdateChecker") }
            .map { it.name }
            .toSet()
        assertTrue("只有原生壳能引用 UpdateChecker，现在还有：$users", users == setOf("MainActivity.kt"))
    }

    @Test
    fun gameKernelHasNoNetworkCalls() {
        val www = File(srcRoot, "assets/www")
        assertTrue("找不到游戏内核目录 ${www.absolutePath}", www.isDirectory)
        val offenders = www.walkTopDown()
            .filter { it.isFile && (it.extension == "js" || it.extension == "html") }
            .map { f -> f.name to webFingerprints.filter { f.readText().contains(it) } }
            .filter { (_, hits) -> hits.isNotEmpty() }
        for ((name, hits) in offenders) {
            assertTrue("内核文件 $name 里出现联网指纹：$hits", false)
        }
    }

    @Test
    fun webBridgeHasNoOtherNativeSurface() {
        // 桥面越小越难被误用：JS 只能问版本号、点「检查更新」，
        // 不许有 readFile / sendHttpRequest 之类把网络漏回内核的口子
        val bridge = kotlinSources().first { it.name == "MainActivity.kt" }.readText()
        val jsMethods = Regex("@JavascriptInterface\\s+fun (\\w+)").findAll(bridge).map { it.value }.toList()
        assertTrue("桥上一个方法都没有", jsMethods.isNotEmpty())
        val forbidden = listOf("http", "fetch", "request", "url", "download", "upload", "openFile")
        for (m in jsMethods) {
            val lower = m.lowercase()
            assertFalse("$m 听着像网络/文件入口，内核不该能碰", forbidden.any { lower.contains(it) })
        }
    }
}
