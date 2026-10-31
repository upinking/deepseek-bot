# 第三方依赖与参考资料

本项目实际通过包管理器使用以下依赖；各包随发行物提供的完整许可证为准，版本锁定见 requirements.lock.txt。

| 依赖 | 许可 | 用途 |
|---|---|---|
| FastAPI | MIT | HTTP API |
| Uvicorn | BSD-3-Clause | ASGI 服务 |
| HTTPX | BSD-3-Clause | DeepSeek 请求 |
| Playwright | Apache-2.0 | 浏览器动作执行 |
| pywebpush | MPL-2.0 | 标准 Web Push 投递 |
| Gradle Wrapper 8.14.3 | Apache-2.0 | Android 构建辅助，不打包进 APK；源码与许可见 [Gradle](https://github.com/gradle/gradle/tree/v8.14.3) |

未复制 Grok Bot 的闭源实现、品牌头像或客户端素材。角色、任务、记忆、群聊与调度逻辑由本项目实现；设计调研来源与具体代码参考见 docs/ 中的两份调研文档。未直接打包 SillyTavern、RisuAI、AstrBot、Shikigami、OpenClaw 或 Mem0 的源码。

部署时独立使用 Certbot（Apache-2.0）申请并自动续期 IP 地址证书；不改动服务器原有域名证书的管理目录。
