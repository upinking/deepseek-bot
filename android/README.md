# Android 安装版

Android 8.0 及以上可用。应用使用系统 WebView 显示工作台，聊天、Bot、任务、记忆和云浏览器继续由同一台服务器保存；不是离线模型。

## 使用

安装 APK 后打开 DeepSeek Bot。个人构建可预置服务器地址；通用构建首次打开时填写自己的 HTTPS 工作台地址，例如 `https://example.com/deepseek/`。仍使用工作台原有登录密码，不需要重新配置已保存在服务器的 DeepSeek 密钥。

顶部提供返回、刷新和服务器设置。网页中的文件上传使用系统文件选择器；下载文件时选择保存位置。只申请联网权限，不申请相册、通讯录或整个文件存储空间的权限。

当前安装版未接入 Android 锁屏推送。服务器提醒和后台任务仍照常执行，结果保存在工作台中。WebView 的网页通知能力与 Chrome 不相同，不能把网页推送订阅视为 APK 的通知支持。[Chromium 说明](https://issues.chromium.org/issues/40388442)

## 构建

需要 JDK 17 或以上、Android SDK 36、Build Tools 35.0.0。Gradle Wrapper 固定为8.14.3，Android Gradle Plugin 为8.13.0，并校验 Gradle 分发包 SHA-256。[AGP 兼容性](https://developer.android.com/build/releases/agp-8-13-0-release-notes)

在项目根目录运行：

```sh
python3 scripts/build_android.py
```

产物为 `dist/android/DeepSeekBot-1.0.1.apk`，旁边有 SHA-256 校验文件。脚本也会运行68项纯 Java URL 边界与文件名检查。首次构建自动生成私有签名密钥，之后重复使用同一密钥，方便后续升级。

1.0.1 使用用户提供的原始图片作为安卓启动图标，提供圆形与其他启动器遮罩适配，沿用1.0.0签名，可直接覆盖安装。

- `--generic`：不预置服务器，首次打开手动配置。
- `--debug`：构建带 `.debug` 包名后缀的调试版本，用于模拟器与 WebView 调试。交付使用正式版本。
- `--offline`：仅使用本机已有的构建依赖。

个人地址从 `data/workspace-url.txt` 读取；签名材料在 `data/android-signing/`；SDK 路径在 `android/local.properties`。这些文件及 APK 产物均不提交 Git。请保留签名材料的私人备份，后续覆盖安装需要同一签名。

直接用 Android Studio 打开此目录也可开发。未准备私人签名时，标准 `assembleRelease` 生成未签名版本；上述脚本负责生成并使用个人签名。

## 实现与边界

- 工作台只在配置地址的同源及路径范围内打开；外部普通网页交给系统浏览器，登录 Cookie 不附加给外链。
- HTTPS 验证失败直接终止，没有忽略证书继续的选项；不启用文件 URL、混合内容或 JavaScript 原生桥接。
- 登录 Cookie 在页面完成及应用暂停时写入磁盘；应用数据不参与系统备份或设备迁移。
- 文件下载逐跳检查地址，携带同范围 Cookie；拒绝鉴权失败、HTML 响应和超过30MB的文件，不把登录页面误存成成果。
- 适配 Android 16 的返回回调、系统栏与软键盘 Insets。下载位置、文件上传和返回行为需要通过实际 Android 环境验收，桌面手机尺寸模拟不能代替安装测试。

实际验收记录见项目 `docs/Android安装版验收记录.md`。
