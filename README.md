# 暗林 · 幸存夜

俯视角生存游戏，灵感来自 PC 游戏 Darkwood。玩法、美术、音效全部原创，不含原作任何素材，非官方作品。

你在一片会吃人的森林里醒来：白天搜刮、砍柴、把据点围起来，夜里会有人来。
找到 3 个电台零件，修好小屋的电台，撑到救援。

## 下载

[Releases](https://github.com/cedarln/my_darkwood/releases) 里的 `my_darkwood-vX.Y-release.apk`，装上即玩（Android 8.0+，约 2MB，无需联网）。

存档保存在本机。装新版本不会丢进度。

## 怎么玩

- 左半屏拖动 = 移动摇杆，右下三个键 = 攻击 / 互动 / 冲刺，顶部有背包、建造、音效、菜单
- 五维：生命 / 饥饿 / 口渴 / 体力 / 理智。饿了渴了会掉血，黑夜和血腥会啃理智，理智太低会看见不存在的东西
- 匪徒有视锥和听力：开枪、冲刺都会暴露，有人盯上你时屏幕上方出现黄色警报
- 建造：木墙围住小屋，木门要开合，篝火提供光和熟食，木刺能阴人
- 睡觉：对床按互动跳过夜晚；附近有敌人就睡不着
- 死亡即结束，进度自动存档
- 电脑上也能玩：`cd app/src/main/assets/www && python3 -m http.server`，浏览器打开即可（或 WASD + 鼠标）

## 更新

暂停菜单和主菜单都有「检查更新」：应用内下载、校验后直接拉起安装，不会跳去浏览器。
除了你按下这个按钮，游戏不会发出任何网络请求。

## 源码结构

```
app/src/main/assets/www/   游戏本体（Canvas + WebAudio，零依赖）
app/src/main/java/         Android 壳：WebView + 应用内更新
app/src/test/java/         更新与联网边界的单元测试
```

构建：配好 `keystore.properties`（不入库）后 `./scripts/build-release.sh`（跑单测 + 出签名包）。
发布资产名用 ASCII：GitHub 会把中文文件名里的非 ASCII 字符吃掉，所以本地 `暗林-vX.Y-release.apk` 上传时改名 `my_darkwood-vX.Y-release.apk`。
