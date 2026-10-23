# 无名杀复用记录

本项目采用完整的无名杀网页应用，保留其界面、结算引擎、武将技能、原有模式规则与联机协议，不另行改写成最初讨论的经典 KOF 规则。早期编写的 `prototype/src/engine.js`、`prototype/src/app.js`、`prototype/src/network.js` 是已停止推进的原型，不作为发布版本，也不在无名杀加载失败时作为后备游戏启动。`prototype/src/data.js`、`prototype/tests/data.test.js` 和 `docs/RULES.md` 保留为早期牌堆核对资料，不表示发布应用调用了这套原型引擎。

部署只额外提供同域 HTTP/WebSocket 入口，并通过原生 `/preload.js` 设置默认大厅、将发布配置默认模式设为联机。上游游戏源文件未修改。

## 核对的上游版本

- 仓库：[libnoname/noname](https://github.com/libnoname/noname)。
- 本次核对提交：[`90b58bb9934edb1712fd187a80c8323b7aeabaf3`](https://github.com/libnoname/noname/commit/90b58bb9934edb1712fd187a80c8323b7aeabaf3)。
- `apps/core/package.json` 标记版本为 `1.11.7`，许可证标识为 `GPL-3.0-only`。
- 该提交的 `.gitmodules` 为空；图片、声音及字体已经包含在 `apps/core`，不需要另行初始化 `noname-assets` 子模块。
- 实际发布版本如更换提交，应更新此记录并重新核对配置和资源完整性。

## 保留的来源与许可说明

上游 [LICENSE](https://github.com/libnoname/noname/blob/90b58bb9934edb1712fd187a80c8323b7aeabaf3/LICENSE) 是 GNU GPL 第 3 版。上游 [README](https://github.com/libnoname/noname/blob/90b58bb9934edb1712fd187a80c8323b7aeabaf3/README.md) 另外写明再分发时保留仓库出处，并提出不要用于商业用途。

打包时保留上游 `LICENSE`、`README.md`、原有源码版权说明，以及应用内的「关于无名杀」和首次启动许可说明。在本项目的修改记录中标注修改内容、日期和上游提交。发布编译结果时，同时提供对应源代码及构建脚本的获取位置；不把无名杀及其内置资源宣称为本项目原创。

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
