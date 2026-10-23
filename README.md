# 无名杀 · 双人云端联机

完整复用 [libnoname/noname](https://github.com/libnoname/noname) 的网页、武将、卡牌、规则和联机大厅。这里仅提供免费的云端部署配置、同域服务入口和默认大厅地址，不重新实现游戏引擎。

固定上游版本：`1.11.7`，提交 `90b58bb9934edb1712fd187a80c8323b7aeabaf3`。采用原版支持的玩法，不承诺复刻最初讨论的老版 KOF 规则。

已部署网址：[打开游戏](https://noname-duel-cloud.onrender.com/)。

## 一起玩

1. 两个人在各自设备打开部署后的同一个 HTTPS 网址，首次启动阅读并确认原版许可说明。
2. 选择「联机」，进入本站大厅。可以在选项中修改昵称。
3. 一人创建房间，选择「对决 → 1v1」，将替补人数设为 2；另一人加入同一房间并准备，然后房主开始。
4. 如只想使用标准和风包，在创建房间时选择相应武将包及标准卡牌包。具体选将和结算遵循原版。

联机地址就是本站地址：网页是 `https://名字.onrender.com`，大厅是 `wss://名字.onrender.com`。这是自己使用的原版大厅；请勿把房间当成具有独立密码权限的私密空间。游戏期间保持双方网页打开。

## 免费云端部署

仓库中的 `render.yaml` 明确选择 **Free Web Service**，无数据库、付费磁盘或其他付费服务。可在 Render 登录后通过 Blueprint 导入此仓库，也可手动新建 Web Service：

- Runtime：Node
- Build Command：`npm run setup`
- Start Command：`npm start`
- Instance Type：**Free**
- Environment：`HOST=0.0.0.0`、`ELECTRON_SKIP_BINARY_DOWNLOAD=1`
- Health Check Path：`/healthz`

Render 提供 HTTPS，网页与 WebSocket 共用一个端口。无需购买域名；电脑可以关机。

[Render 免费方案](https://render.com/docs/free)有使用额度：空闲约 15 分钟后休眠，再次打开可能等待约一分钟；服务可能重启，内存中的房间随之丢失。活跃对局不能保证永久保存。无需添加付款方式，超过免费额度时应停止使用或等待额度重置，不升级付费实例。

完整资源构建产物约 1.6 GB，部署会下载完整上游仓库并编译。首次打开只加载游戏当前需要的资源。原版完整产物超过 GitHub Pages 的 1 GB 限制，因此此版本直接使用云端 Web Service。

## 本地运行

需要 Node.js 22 和 Git。首次准备需要联网下载完整游戏：

```sh
npm run setup
npm test
npm start
```

已部署服务可在后台检查，不会打开浏览器或产生页面弹窗：

```sh
node scripts/smoke-cloud.mjs https://noname-duel-cloud.onrender.com
```

检查包括资源与版本、两位客户端创建/加入房间、双向通信和退出清理。完整实战流程仍需人工体验，不把协议测试当成整局游戏验证。

打开 `http://127.0.0.1:8080`。本机地址只能在本机使用；邀请远程玩家请使用云端 HTTPS 网址。

服务由原版文件服务和原版 WebSocket 大厅组成；外部入口仅开放游戏资源读取，拒绝文件修改和越界读取。浏览器内正常游戏和偏好保存在浏览器；云端不支持通过游戏扩展管理器上传、删除或更新服务器文件。更新版本应重新部署。

## 来源、许可与修改

完整游戏来源和核对记录见 [docs/UPSTREAM.md](docs/UPSTREAM.md)。原版许可证、README、首次启动说明及源码保留在构建产物中；上游源码可从固定提交获取，部署层源代码就在此仓库。部署层以 GPL-3.0-only 发布，详见 [LICENSE](LICENSE)。

2026-10-22 的修改范围：增加只读服务入口、默认同域大厅的预加载配置、固定版本构建脚本、Render 免费部署配置及托管集成测试。无名杀游戏源文件未修改。
