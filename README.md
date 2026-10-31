# DeepSeek Bot 第一版

个人使用的云端多 Bot 工作台：在电脑和安卓浏览器中聊天、管理长期记忆，让 Bot 使用服务器浏览器完成任务，并建立提醒与周期任务。

## 使用入口

本地运行后打开 **http://127.0.0.1:8765**；部署到服务器后，使用自己的 HTTPS 地址。`deploy/nginx-ip-https.conf` 中的 `203.0.113.10` 是文档示例 IP，部署前必须替换。

也可以双击本文件夹内的 `打开工作台.command`。默认打开本地地址；访问自己的服务器时，可在被 Git 忽略的 `data/workspace-url.txt` 中保存地址，或设置 `BOT_WORKSPACE_URL`。

1. 使用服务首次启动时生成的 `bootstrap-password.txt` 登录。本地文件位于 `data/`，服务器文件位于其应用数据目录。这是工作台独立密码，与 SSH、DeepSeek 密钥无关。
2. 点左下角“设置”，填写 DeepSeek API 密钥，选择模型，点“保存并测试连接”。密钥只保存在服务器私有配置文件，不返回前端。
3. 回到 Echo 开始对话；Scout 适合查资料，Momo 适合安排和提醒。可以自行修改名字、职责、头像或创建新 Bot。
4. 安卓上用支持 PWA 的浏览器打开同一地址，在浏览器菜单选择安装或添加到主屏幕。聊天记录、记忆和任务都由同一台服务器保存。

也提供 Android APK 客户端，支持原生返回、服务器设置及系统文件上传/保存。安装与构建说明见 [Android 安装版](android/README.md)。

若修改过登录密码，首次密码文件会失效。请使用你自己设置的新密码。初始密码不写入源码或本说明。

## 可以试的任务

- “记住：我是物理专业学生，解释代码时请用具体例子。”
- “打开 https://www.deepseek.com ，告诉我它现在有哪些主要入口，并给来源。”
- “明天晚上八点提醒我交作业。”
- “把刚才的资料整理成 Markdown 文件，保存到工作区。”
- 创建包含 Echo、Scout 的群聊：“@Echo 请让 Scout 查资料，再由你整理结论。”
- “将这个流程保存成一个技能，名字叫每日通知检查。”之后可以在“例行”中选择技能、所属 Bot 和时间。

没有配置密钥时，模型任务会显示“等待连接模型”；不会产生假回答。手动创建的普通提醒不依赖模型。

## 浏览器、停止和接管

在聊天上方打开“云浏览器”，选择任务即可查看服务器实际页面、页面文字和元素。接管后可以打开地址、点击截图、选元素填写内容、按键、上传任务文件和切换标签。

密码类输入需要人工接管，输入值不返回模型。完成后交回并继续，Bot 会重新观察页面。涉及提交、外发、付款或上传的动作可能显示具体审批步骤；普通浏览和阅读直接执行。

“停止”终止后续执行，但不会撤销已经发生的网页动作。服务重启时，正在执行的任务会暂停，避免自动重复提交；检查最后一步后可以继续。关闭网页不等于停止任务，后台仍可运行。

目前浏览器主要使用页面结构与文字驱动。复杂画布、反自动化验证和网站自身的限制可能需要人工接管。所有 Bot 共用本应用专用的浏览器登录，但各 Bot 私有记忆分别保存。

## 记忆、技能、例行和文件

- **记忆**：查看、修改或删除 Bot 私有记忆和共享资料。清空聊天与删除记忆是两个操作；纠正或删除记忆会切断旧记忆上下文，防止旧记录自动带回。
- **技能**：保存可编辑的步骤和验证方法，有版本号。例行任务保存其选定版本的快照。
- **例行**：支持一次、每日和按间隔运行；可暂停、手动运行、查看历史。到期提醒会直接保存消息，执行类任务则唤醒模型。主动关心有安静时段、每日上限和未回复限制。
- **文件**：用户上传和 Bot 生成的成果均可下载。单文件限制30MB；Bot 无权通过工具读取服务器任意文件或运行 shell。

网页通知需要在设备上授权并启用。系统区分“消息已保存”和“推送已提交”；后者仍需确认手机实际显示。安卓后台/锁屏送达受浏览器、系统和网络影响，需在你的手机验证。

## 本地开发

需要 Python 3.10 或以上和可用的 Chrome。已准备的 `.venv` 使用 Python 3.11。

```sh
uv venv --python 3.11 .venv
uv pip install --python .venv/bin/python -r requirements.lock.txt
.venv/bin/python run.py
```

打开 http://127.0.0.1:8765 。本地初始密码在 `data/bootstrap-password.txt`；本地与云端数据彼此独立。本地默认使用专用 Chrome 配置目录，云端通过仅监听本机的 CDP 接口连接专用 Chrome。

配置项：`BOT_DATA_DIR`、`BOT_PORT`、`BOT_CDP_URL`、`BOT_BASE_PATH`、`BOT_CHROME_EXECUTABLE`。`DEEPSEEK_API_KEY` 可作为后台环境变量；用户也可在设置页写入。`BOT_INITIAL_PASSWORD` 仅在空数据库首次初始化时生效。启用 Web Push 时，应通过 `BOT_VAPID_SUBJECT` 配置自己的联系地址（例如 `mailto:admin@example.com`）。生产环境不要设置浏览器测试使用的 `BOT_BROWSER_ALLOW_HOSTS`。

## 验证

```sh
.venv/bin/python -m pytest -q
RUN_BROWSER_TESTS=1 .venv/bin/python -m pytest tests/test_browser_integration.py -q
node --check web/app.js
```

普通测试包含测试注入的模型响应，用于覆盖失败、取消、审批、交接和重启等边界，不能当作真实 DeepSeek 验证。真实浏览器测试会启动 Chrome 操作本地测试页面；云端实际模型/浏览器验证记录见 `docs/第一版验收记录.md`。

## 服务器运行与维护

- 应用源码：`/opt/deepseek-bot/app`
- 应用数据：`/var/lib/deepseek-bot/app`
- 专用 Chrome 配置：`/var/lib/deepseek-bot/browser-profile`
- 应用服务：`deepseek-bot.service`，Docker 镜像 `deepseek-bot:runtime`
- 浏览器服务：`deepseek-bot-browser.service`，仅监听 `127.0.0.1:9223`
- HTTPS：Nginx 的 IP 虚拟主机；IP 证书独立放在 `/etc/deepseek-bot-tls`，`deepseek-bot-tls.timer` 定期自动续期，不使用现有域名的证书管理目录。

诊断命令：

```sh
ssh your-server 'sudo systemctl status deepseek-bot deepseek-bot-browser --no-pager'
ssh your-server 'sudo docker logs --tail 80 deepseek-bot'
ssh your-server 'sudo systemctl list-timers deepseek-bot-tls.timer --no-pager'
```

把 `your-server` 替换为自己的 SSH 别名。代码更新可执行 `.venv/bin/python scripts/update_server.py your-server`。它保留数据和浏览器配置，先备份源码再更新，健康检查失败会恢复旧源码。更新会短暂中断应用，执行中的任务需检查后恢复。依赖变更需要先重建运行镜像，更新脚本不会自动更改系统软件或依赖镜像。

备份时先停止本应用与专用浏览器，再保存应用数据和浏览器配置两份目录；不要把它们提交到 Git。数据库、登录 Cookie、密钥和浏览器配置均属于私人数据。恢复到同样路径及运行用户后再启动服务。

## 文件结构

`botapp/main.py` 管登录与服务入口；`store.py` 保存状态；`domain.py` 提供资源接口；`runtime.py` 是模型工具循环；`browser.py` 执行页面动作；`scheduler.py` 负责定时。`web/` 是跨设备界面，`tests/` 是验证用例，`deploy/` 是服务器服务配置。

开源依赖与来源见 `THIRD_PARTY_NOTICES.md` 和 `docs/` 中的调研记录。当前为个人单用户版本，不包含语音通话、本机电脑控制或任意终端执行。
