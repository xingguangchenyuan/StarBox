# 星匣 StarBox

Windows 桌面游戏启动器 —— 把散落在硬盘各处的游戏收进一堵封面墙，一键启动，盯住进程。
产品定义见 [需求确认书-v0.1.md](需求确认书-v0.1.md)，视觉原型见 [prototype/app.html](prototype/app.html)，
界面美化方向见 [前端美化执行方案.md](前端美化执行方案.md)。

本仓库是 **第一版（M1 MVP）** 的实现：Tauri 2 + React 19 + TypeScript + SQLite。

> 仓库只包含源码、设计文档与原型，不含本机数据、游戏库、构建产物或个人配置。
> 许可证尚未选定，默认保留所有权利。

---

## 第一版做了什么

| 能力 | 状态 | 说明 |
|---|---|---|
| 手动添加游戏（选 exe / 拖入文件或文件夹） | ✅ | 自动推断游戏名、尝试按 `steamapps` 结构匹配 AppID；`.lnk` 会解析到真实目标（含快捷方式参数），`.bat` / `.cmd` 通过 `cmd /C call` 启动 |
| 选文件夹 → 扫描启动程序 → 勾选添加 | ✅ | 递归扫描（最多 4 层）并按文件名/层级/体积排序，列出候选 exe、大小、是否已在库，用户自己勾选要加哪几个；拖入文件夹也走同一流程 |
| Steam 库自动扫描 | ✅ | 解析 `libraryfolders.vdf` + 各库 `steamapps/*.acf`，并从 `localconfig.vdf` 带入真实时长 |
| Epic 库自动扫描 | ✅ | 解析 `%ProgramData%\Epic\...\Manifests\*.item` |
| 封面墙 / 列表双视图 + 网格密度 | ✅ | 工具条右侧切换；密度在设置里 |
| 搜索（名称 / 开发商 / 拼音全拼 / 首字母） | ✅ | `pinyin-pro` 本地离线索引 |
| 侧边栏显示「原名 + 中文名」 | ✅ | 侧栏每行原名后跟商店中文名；每行右侧有「⋯」按钮（悬停高亮），左键点开操作菜单，右键同样可开 |
| 本地游戏匹配 Steam（不需要 SteamID） | ✅ | 不拿 exe 文件名硬猜：按「安装目录名 → 上级目录 → exe 版本信息 `FileDescription`/`ProductName` → 去掉 `Win64`/`Shipping`/`Client` 等后缀的名字」生成一组线索，中英双语搜商店并打分，名字几乎一致才自动绑定；续作 / 试玩 / 原声 / 组合包会被降权。匹配不准可在详情页「匹配 Steam 资料」里手选（带相似度），挑错随时换 |
| 旧库自动补匹配 | ✅ | 启动 3 秒后，对库里没有 AppID 的本地游戏逐条补匹配（间隔 1.2 秒），只做高置信度绑定，成功后自动拉简介 / 封面 / 截图 / 成就定义；已有条目不用删了重加 |
| 从游戏库移除 | ✅ | 侧栏「⋯」菜单、右键菜单、详情页「启动选项」底部都能移除；只删星匣记录，不动硬盘文件；运行中的游戏会先结束进程 |
| 截图查看大图 | ✅ | 详情页截图取自 Steam，点击打开查看器：左右翻页、缩略图条、Esc 关闭，1920×1080 原图 |
| 分类标签 + 收藏 + 隐藏 | ✅ | 标签可在「设置 → 分类标签」新建 / 改名 / 换色 / 删除，侧栏与详情页实时同步；游戏详情右侧可点选 |
| 封面自动抓取 + 手动替换 | ✅ | Steam `library_600x900` → 失败回退头图；可换本地图片、可恢复自动封面 |
| 排序（最近游玩 / 时长 / 名称 / 添加时间） | ✅ | 点书架右上的排序文字循环切换，记忆到设置 |
| 一键启动（工作目录 = exe 目录，支持启动参数） | ✅ | 路径与参数可在「启动选项」里改；从文件夹扫描加入的游戏，工作目录取游戏根目录而不是 `bin\Win64` |
| 进程树监控 + 运行中角标 | ✅ | Job Object 盯住整棵进程树，游戏调子进程也不漏 |
| 运行中再点「开始游戏」= 切回窗口 | ✅ | 按作业对象里的进程 PID 找窗口，恢复最小化并置前；找不到窗口时如实提示「游戏正在运行」 |
| 启动计时 / 退出结算 | ✅（提前做了） | 进程退出即把本次时长累加进库、写 `launch_logs` |
| Steam 资料抓取（简介/开发商/发行日/类型/截图） | ✅ | Rust 侧 reqwest + 本地缓存，断网可看；中文简介与英文原文分别抓取并分行显示 |
| Steam 资料一键刷新 | ✅ | 顶栏「刷新资料」串行刷新全部带 AppID 的 Steam 游戏（中文名、简介、发行商、分类、评测数、Metacritic、封面），带进度与失败计数 |
| 成就定义抓取（需自填 Key） | ✅ | `GetSchemaForGame`，缓存到 SQLite，离线可看 |
| 成就页（筛选 / 完成度环 / 手动标记） | ✅ | 支持 Steam 账号同步与本地文件读取；游戏退出后自动同步，成就页和设置里都能手动同步；手动标记保留 |
| 成就同步（Steam / 本地） | ✅ | Steam 账号用 `SteamID64 + Key` 调 `GetPlayerAchievements`（可自动读取本机 SteamID）；本地读 GSE 的 `%APPDATA%\GSE Saves\<appid>\remote\achievements.json`（base64 行）和 RUNE/CODEX 的 `%PUBLIC%\Documents\Steam\...\achievements.ini`；库里没有定义时会尝试从本地 schema 补 |
| MOD 扫描 + 启用/禁用 | ✅（提前做了） | 目录内 `_disabled/` 移入移出，不删文件 |
| 设置（API Key、扫描、外观、数据目录） | ✅ | Key 存 Windows 凭据管理器 |

第二版及以后（时长图表、启动配置档、残留清理白名单、自动更新、托盘）**尚未实现**，
界面里对应位置都明确标注了「第二版」，不做假按钮。成就的 Steam 同步与本地文件读取已在首版落地。

---

## 技术栈

- 外壳 **Tauri 2**（Rust）
- 前端 **React 19 + TypeScript + Vite**，**Tailwind CSS 4** + 设计令牌，**Framer Motion** 做动效，**Zustand** 管状态
- 本地库 **SQLite**（rusqlite，Rust 侧统一读写）
- 网络 **Rust 侧 reqwest**（前端不直连，绕开 CORS，统一缓存）
- 打包 NSIS 安装包（`npm run app:build`）

> 与需求书的两处差异，都是实现层面的选择：
> 1. 需求书写的是 `tauri-plugin-sql`，实现改为 **rusqlite + Rust 命令层**。扫描、成就、时长结算全在 Rust 侧发生，
>    把 SQL 放前端反而要两套口径；前端只拿类型化结果。
> 2. 需求书的「成就定义缓存表」`achievement_defs_cache` 保留，但成就定义直接落 `achievements` 表，
>    离线读取不需要二次解析。

---

## 目录

```
├─ src/                    前端
│  ├─ components/          Rail / TopBar / LibraryHero / GameWall / GameView / 四个页签 / 弹层 / Toast
│  │   └─ dialogs/         AddGame / Scan / Settings / TagManager（标签增删改）
│  ├─ stores/              Zustand：app（库与筛选）、ui（弹层）、toasts、clock（运行中计时）
│  ├─ lib/                 api（Tauri 调用 + 浏览器演示后端）、demo（演示数据）、format、search、route
│  ├─ i18n/zh-CN.ts        全部界面文案（加语言只需再写一份字典）
│  └─ styles/app.css       色板与组件样式（需求书第九章的唯一实现处）
├─ src-tauri/              Rust
│  ├─ src/commands/        library / scan / steam / achievements / launch / mods / settings
│  ├─ src/steam/           vdf 解析 + appdetails / GetSchemaForGame
│  ├─ src/watcher/         进程启动与 Job Object 监视
│  └─ src/db.rs            SQLite 建表与查询
└─ prototype/              视觉原型（只作参考，不参与构建）
```

数据都在 `%APPDATA%\StarBox\`：`starbox.db`（SQLite）与 `covers/`（抓下来的封面）。
Steam Web API Key 不进数据库，走 Windows 凭据管理器（DPAPI 保护）。

---

## 开发

```powershell
npm install
npm run dev        # 纯浏览器预览：自带演示数据，用来走查视觉与交互
npm run app:dev    # 桌面版（Tauri），读写真实库
```

浏览器预览的演示数据存在 localStorage；桌面版永远不会读到它。

## 构建

```powershell
npm run app:build  # 产出 NSIS 安装包与 exe
```

构建环境要求：

- Node 20+ / npm
- Rust `stable-x86_64-pc-windows-gnu`（`%USERPROFILE%\.cargo\bin`）
- MinGW-w64 gcc（用于链接）

**为什么要指定纯 ASCII 的 target 目录**：工程路径含非 ASCII 字符（例如中文目录）时，
MinGW 的 windres 读不到 `src-tauri\icons\icon.ico`，链接阶段也会读错临时对象路径。
因此 `build.ps1` 会把图标复制到纯 ASCII 目录、用 `--config` 覆盖 `bundle.icon`，
并把 `CARGO_TARGET_DIR` 指到纯 ASCII 路径。

```powershell
# 默认 target 目录：%USERPROFILE%\starbox-build；MinGW 会自动探测
powershell -ExecutionPolicy Bypass -File .\build.ps1

# 或者显式指定（两者都必须是纯 ASCII 路径）
.\build.ps1 -MingwDir "C:\mingw64\bin" -TargetDir "C:\starbox-build"

# 也可以用环境变量 STARBOX_MINGW / STARBOX_TARGET_DIR
```

产物：`<TargetDir>\release\starbox.exe`（前端已内嵌）与
`<TargetDir>\release\bundle\nsis\StarBox_0.1.0_x64-setup.exe`。

> 只跑前端调试可以 `npm run dev`；桌面调试用 `npm run app:dev`。

---

## 设计对照

- 色板、字体、布局、侧栏两段式、封面墙顶光：见需求书第九章，实现于 `src/styles/app.css`
- 三屏对照：`prototype/shot-01-library.png`、`shot-02-detail.png`、`shot-03-achievements.png`
- 交互原型：`prototype/app.html`（单文件，直接浏览器打开即可走查）
- 界面美化方向与执行细则见 [前端美化执行方案.md](前端美化执行方案.md)

## 已知边界

- 只做 Windows x64（`stable-x86_64-pc-windows-gnu` 构建）。
- 网络出口走 `net.rs`：先读系统代理（环境变量 → HKCU 的 WinINET 设置），走不通再直连。
  若你的网络无法直连 `api.steampowered.com` / `steamcommunity.com`（部分地区常见），
  需要在系统里配置可用代理；否则成就定义与账号同步会失败，界面会如实报错。
- 成就定义只认 `GetSchemaForGame`（需要自填的 Web API Key，**不需要 Steam ID、不需要登录**）；
  没配代理又直连不通时，界面会如实报「连不上 Steam 成就接口」，不会显示假成就。
- 成就同步分两路：
  1. **Steam 账号**：需要 SteamID64 + Key，且 Steam 隐私里的「游戏详情」公开；调 `GetPlayerAchievements`，只读、不改 Steam。家庭共享的游戏也可以同步。
  2. **本地文件**：GSE 读 `%APPDATA%\GSE Saves\<appid>\remote\achievements.json`（每行 base64 的 `"API": "dd/mm/yyyy HH:MM:SS"`）和经典 Goldberg 目录；RUNE/CODEX 读 `%PUBLIC%\Documents\Steam\{RUNE,CODEX}\<appid>\achievements.ini`。
- 游戏退出后星匣会自动同步一次；从 Steam 直接启动、星匣没盯到的游戏，用「同步全部成就」或进入该游戏成就页点「同步成就」。
- 本地模拟器的成就文件格式不完全统一：部分定制版 DLL 既不含 GSE 也不含 RUNE 标记（例如某些 repack 自带私有的密钥文件），
  即使按标准 GSE 布局写了 `steam_settings` 也可能读不到；没有本地文件也没有 Steam 授权的游戏，只能手动标记。
- 本地游戏匹配不只看 exe 文件名：优先用安装目录名（跳过 `bin`/`Win64` 这类通用目录）和 exe 的
  版本信息（`FileDescription`/`ProductName`），再退回去掉 `-Win64-Shipping`、`x64`、`Client` 等后缀的名字；
  搜索时中英各搜一次（中文名用于显示、英文名用于比对），`Northwind2`、`OxygenRequired` 这类连写名
  会补空格 / 拆驼峰再搜。
- 自动绑定阈值是「去掉空格标点后几乎就是同一个名字」（相似度 ≥ 88），续作（`Zephyr` vs `Zephyr II`）、
  Demo、原声带、组合包会额外扣分，宁可留给你手选也不绑错。匹配不准时可在详情页「匹配 Steam 资料」里手动挑。
- 如果文件夹和 exe 都只有 `SB`、`TOT` 这种缩写，且 exe 没有版本信息，单靠公开接口无法可靠判断是哪款游戏，
  这种就落到手动匹配；手动弹层会用同样的线索先搜一轮，并按相似度排序。
- 商店资料分别向 `store.steampowered.com/api/appdetails` 请求 `schinese` 与 `english` 两遍：
  中文简介在前、英文原文在后；两段相同（没有中文版）时只显示一遍。
- 好评率（`appreviews` 接口在部分网络下会被重定向）与新闻在第二版实现；
  首版只缓存 `appdetails` 里的 `recommendations.total` 作为评测数。
- 预告片地址已经抓下来存进 `games.movies`，但首版界面没有播放器（HLS 在 WebView2 里要额外接 hls.js），
  先不作为能力对外宣称。
- `.lnk` 的解析借 Windows 自带的 WScript.Shell 读目标/参数/工作目录，只读属性、不执行快捷方式本身；
  目标不是 `.exe` / `.bat` / `.cmd` 时会拒绝入库，并说明原因。
- `.bat` / `.cmd` 统一经 `cmd /C call` 拉起；进程树与时长监控对它同样有效。
- 一些 Steam 游戏必须由 Steam 客户端拉起才能初始化（`steam_api` 依赖），
  首版按需求书「一键启动 exe + 进程监控」实现；用 `steam://rungameid/` 启动会丢失进程树监控，留到第二版权衡。
- 成就判定：Steam 账号同步（A）与本地 GSE / RUNE 文件（B）已实现；没有 Key/SteamID 且没有本地文件时，仍可手动标记已拉取到的定义。
- 没填 Steam Key 时，首版**不**解析 `steamcommunity.com` 的公开成就页（需求书里的降级路径）；
  成就页会直接引导去设置里填 Key，不做假数据。
- 游戏崩溃识别目前只用于提示文案，未写入独立状态字段。
- 关闭星匣时**不会**结束正在运行的游戏：Job 不再带 `KILL_ON_JOB_CLOSE`，会话每 30 秒写检查点，
  下次启动按最后检查点结算。代价是关掉星匣后不再监控该进程。
- 结束游戏优先用 Job 结束整棵进程树；失败会保留运行状态并提示原因，不会谎报“已结束”。

---

## 变更记录

### 0.1.0（首版）

功能见上表。相对初版实现，按内部审查修掉了这些影响正确性的问题：

- 退出星匣不再连带终止游戏；补会话检查点与启动恢复，避免时长丢失。
- 网络错误统一去掉 URL 并脱敏 `key` / `token` 参数，错误文本不再带出 Steam Web API Key。
- 换绑 Steam AppID 时清理旧成就；资料获取失败回滚绑定，不再留下半完成状态。
- 停止游戏改用 Job 终止整棵进程树；前端检查返回值，失败不谎报成功。
- 扫描、目录统计、成就定义遍历不再长时间占用数据库锁；重活命令改为异步执行。
- 删除游戏、更新标签、重建 MOD 列表改走事务；老库迁移补齐外键与 `ON DELETE CASCADE`。
- 成就计数变化会让对应游戏列表缓存失效并重新拉取。
- `platform` 只表示安装来源；匹配 Steam 资料不再把本地 / Epic 游戏改标为 Steam。
- 用户自选封面不再被「刷新资料」覆盖。
- 设置里可以显式清除 SteamID 与 API Key。
- 打开网页走 `openUrl`，打开数据目录走受限的后端命令，不再需要放开任意文件路径权限。
- Windows 启动参数改用 `CommandLineToArgvW` 解析，空参数与转义引号不再丢失。
- Job 监控路径补读根进程退出码，闪退不再被当作正常退出。
- 本地成就图标复制到数据目录缓存后再展示，满足 asset 协议范围。
