# 无名杀复用记录

本项目采用完整的无名杀网页应用，保留其界面、结算引擎、原有模式与联机协议。2026-10-23 增加「单挑 → 标风 1v1」：独立模块接入原生选将、事件和换将流程，使用 [RULES.md](RULES.md) 的约定规则。早期编写的 `prototype/src/engine.js`、`prototype/src/app.js`、`prototype/src/network.js` 是已停止推进的原型，不作为发布版本，也不在无名杀加载失败时作为后备游戏启动。

部署提供同域 HTTP/WebSocket 入口，通过原生 `/preload.js` 设置默认大厅、注册新增菜单，将发布配置默认模式设为联机。上游检出源码保持不变；构建补丁移除启动许可弹窗，并在编译后的单挑模块中安装 `additions/biaofeng-single.js`。其他单挑选项继续调用原版实现。

首页及 `/index.html` 现在由网关提供轻量选择页 `additions/duel-home.html`，不启动游戏或读取旧的模式偏好。`/?play=ai` 在配置载入后明确选择本地标风单挑，使用原生电脑对手和事件流程；`/?play=hall` 明确进入原版大厅。启动配置由 `duel-entry.js` 在当前页面应用，独立的人机入口不会加入旧联机房间。快捷邀请仍保持原有处理。构建安装器只修改产物，上游源码不变。

快捷入口 `/?quick=host` 自动创建标风房间，邀请参数 `?quick=<roomId>` 自动加入。`additions/quick-duel.js` 对该链接会话接入原生连接、房间初始化和加载完成消息；构建脚本在已保存配置载入后加入可选启动钩子，确保旧的模式偏好不会把邀请带到其他模式。两名真实玩家加载完成后再恢复原生等待事件，选将与战斗继续走原有标风实现。视图与样式位于 `quick-duel-view.js`、`quick-duel.css`；没有新增服务或付费依赖。

`additions/biaofeng-data.js` 记录精确将池与牌堆；旧风包技能从上游已有实现取得。`additions/biaofeng-skills.js` 处理约定旧版与上游的少量技能差异，仅在标风选项中生效。新增模块以 GPL-3.0-only 发布，源码随部署仓库提供。

标风选中时，`biaofeng-roster-menu.js` 在原生武将页展示与选将逻辑共用的 29/33 将名单；切换其他模式即恢复原版武将包控件。构建补丁在武将页建立和模式切换时刷新此视图。快捷房间的临时菜单配置与固定房间配置同步，避免旧的点将偏好误标或覆盖标风规则。

## 核对的上游版本

- 仓库：[libnoname/noname](https://github.com/libnoname/noname)。
- 本次核对提交：[`90b58bb9934edb1712fd187a80c8323b7aeabaf3`](https://github.com/libnoname/noname/commit/90b58bb9934edb1712fd187a80c8323b7aeabaf3)。
- `apps/core/package.json` 标记版本为 `1.11.7`，许可证标识为 `GPL-3.0-only`。
- 该提交的 `.gitmodules` 为空；图片、声音及字体已经包含在 `apps/core`，不需要另行初始化 `noname-assets` 子模块。
- 实际发布版本如更换提交，应更新此记录并重新核对配置和资源完整性。

## 保留的来源与许可说明

上游 [LICENSE](https://github.com/libnoname/noname/blob/90b58bb9934edb1712fd187a80c8323b7aeabaf3/LICENSE) 是 GNU GPL 第 3 版。上游 [README](https://github.com/libnoname/noname/blob/90b58bb9934edb1712fd187a80c8323b7aeabaf3/README.md) 另外写明再分发时保留仓库出处，并提出不要用于商业用途。

打包时保留上游 `LICENSE`、`README.md`、原有源码版权说明，以及应用内的「关于无名杀」。按用户明确要求，部署产物移除首次启动许可确认弹窗；补丁和修改日期保存在部署源码中，不伪造用户点击记录。在本项目的修改记录中标注修改内容、日期和上游提交。发布编译结果时，同时提供对应源代码及构建脚本的获取位置；不把无名杀及其内置资源宣称为本项目原创。

上游源码中可核对这些位置：

- `apps/core/noname/entry.ts`：首次启动的 GPL 说明。
- `apps/core/noname/library/help/about-game.ts`：「关于无名杀」的仓库和许可证链接。
- `scripts/build.ts`：向最终目录复制上游 `LICENSE` 和 `README.md`。
- `apps/core/scripts/build.ts`：构建并复制引擎、武将、卡牌、模式及对应源文件。

本次检查未在 `apps/core/image`、`apps/core/audio` 或 `apps/core/font` 中发现独立的 `LICENSE`、`NOTICE`、`COPYRIGHT`、`README` 或逐素材署名文件；因此此记录仅说明仓库实际提供的许可和出处，不另外为各素材创设许可或断言其作者。

## 资源体积

以下是上游目录中文件的字节数之和，不是压缩下载量或浏览器首次加载量：

| 目录 | 文件数 | 字节数 |
| --- | ---: | ---: |
| `image` | 4,166 | 557,067,082 |
| `audio` | 9,652 | 651,011,056 |
| `font` | 8 | 24,555,140 |
| `theme` | 104 | 3,447,006 |
| `layout` | 21 | 308,911 |
| `character` 源码 | 366 | 15,615,806 |
| `mode` 源码 | 93 | 3,232,543 |
| `card` 源码 | 10 | 471,702 |
| `noname` 引擎源码 | 98 | 3,158,147 |

仅图片和声音就超过 12 亿字节。GitHub Pages 的[官方限制](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)规定已发布网站不得超过 1 GB，因此不能假定将无名杀完整资源直接全部复制进 Pages 就能发布成功。部署前应测量最终产物；完整复用应用与按玩法配置加载资源是两个不同层面，不需要因为包体问题重新编写引擎或界面。

## 其他核对来源

[Mogara/QSanguosha-v2](https://github.com/Mogara/QSanguosha-v2) 可用于交叉核对历史技能及 KOF 规则，其本体是 Qt 应用，不作为本网页的运行时依赖。它自己的 [LICENSE](https://github.com/Mogara/QSanguosha-v2/blob/master/LICENSE) 表述为 GPL 第 3 版或后续版本，并附 [MCFR](https://github.com/Mogara/QSanguosha-v2/blob/master/MCFR) 非商业用途条款。本项目没有复制该仓库代码或资源。
