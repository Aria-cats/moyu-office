# 摸鱼办事处 🐟

**大家一起摸一条鱼，最后一下的人，决定它的命运。**

一款用浏览器玩的多人摸鱼小游戏。摸够 10,000 下，最后一摸的人选择红烧、清蒸、剁椒或放生。五位「鱼员工」轮流上班，各有表情、班味和专属吐槽。

- 六种点击反应：弹成鱼饼、左右躲、摇摆、翻肚皮、气鼓鼓、装死。不同鱼有不同偏好；十连摸触发翻身。
- 公共计数、个人贡献、最后一摸的决定权、出锅纪念卡与鱼生档案。
- 三分钟无人决定，自动放生，鱼塘继续营业。
- 「先试摸（20 下）」：自己摸满 20 下即可体验选做法；Esc「老板来了」；音效默认关闭；尊重系统减少动画设置。
- 按一次 Esc 进入工作视图，再按一次返回，也可点击工作视图右上角「返回上一页」。弹窗和昵称输入中同样有效；返回时恢复未保存内容。工作视图期间不显示结算和提示，后台共享进度继续更新。快捷键需要网页拥有键盘焦点。
- 原生 HTML / CSS / JavaScript，Python 标准库服务端与 SQLite，无需前端构建。

## 本地运行

需要 Python 3.9 或以上版本：

```sh
git clone https://github.com/Aria-cats/moyu-office.git
cd moyu-office
python3 server.py
```

打开 <http://localhost:8765>。同一局域网可用 `http://服务器IP:8765` 访问。

**所有玩家必须访问同一台运行服务端的实例，才能共摸同一条鱼。** GitHub 仓库只托管源代码。直接打开 `index.html` 或放到静态网站，只能玩明确标注的自己试玩模式。

## 最省事的多人托管：Render

仓库包含 `render.yaml`，配置一个 Python Web Service 和 1GB 持久化磁盘。付费部署，具体价格以 Render 下单页面为准。

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Aria-cats/moyu-office)

1. 登录 Render，点击上面的部署按钮，授权读取此仓库。
2. 检查套餐、区域与账单；模板默认 Starter、新加坡、单实例、1GB 磁盘。
3. 确认创建。平台会提供带 HTTPS 的 `onrender.com` 地址。
4. 把同一个地址分享给朋友。首次连接即分配匿名身份，无需注册游戏账号。

SQLite 数据位于 `/var/data/moyu.sqlite3`，必须保留持久化磁盘。不要将此实例改成免费临时磁盘服务，也不要横向扩容多个独立实例，否则数据可能丢失或出现多个鱼塘。

## 自己的服务器：Docker

开发或局域网运行：

```sh
docker compose up -d --build
```

正式部署到有公网 IP 的 Linux 服务器，并让域名 DNS 指向它：

```sh
cp .env.example .env
# 编辑 .env，将 DOMAIN 改为你的实际域名
docker compose -f compose.production.yaml up -d --build
```

放行 80/443 端口。Caddy 自动申请 HTTPS 证书并反向代理到鱼塘；数据库位于独立 Docker volume。不要使用 `docker compose down -v` 删除数据卷。通过 SQLite 备份 API 制作一致性备份，恢复前先停服务；不要仅复制正在写入的主数据库文件而遗漏 WAL。

## 配置

| 环境变量 | 默认 | 含义 |
| --- | --- | --- |
| `PORT` | `8765` | 监听端口 |
| `MOYU_DB` | 项目目录 `moyu.sqlite3` | 数据库路径 |
| `MOYU_TARGET` | `10000` | 新建轮次的目标次数 |
| `MOYU_CHOICE_SECONDS` | `180` | 最后一摸的选择期限 |
| `MOYU_RATE` | `8` | 每个匿名会话每秒恢复的点击额度，最大瞬时额度 12 |
| `MOYU_SECURE_COOKIE` | 未启用 | HTTPS 部署设为 `1` |

## 玩法与实现边界

匿名身份保存在 HttpOnly、SameSite Cookie 中。清除 Cookie 或换浏览器会变成新玩家；领取最终决定权请使用原浏览器。断线后保留 Cookie 即可回来继续决定。

SQLite 事务确保计数不超标和最终决定权唯一。同一次点击的网络重试通过事件编号去重。服务端不会向其他玩家暴露最终玩家的身份凭证。基本会话限流用于控制手误或普通连点；这是轻量休闲应用，并未实现账号体系、机器人识别或分布式防刷。推荐先以小范围朋友试玩验证实际容量；公开流量扩大后再迁移数据库和增加网关限流。

页面每 1.3 秒同步一次共享状态；最后一摸、超时放生和下一轮都由服务端判定。点击「下一条鱼」会开启公共新一轮，旧轮记录保留在档案中。

## 验证

```sh
python3 -m unittest discover -s tests -v
node --check app.js
```

自动检查覆盖：32 个独立客户端争抢最后一摸、网络重试不重复计数、权限隔离、选择超时自动放生、同时开启下一轮、过期点击、持久化、旧数据库迁移、异常请求、数据文件隔离及限流。GitHub Actions 在推送和 PR 时运行。

浏览器验证覆盖随机动作、连击、完整出锅流程与桌面/手机布局。安装 Browser Use 后，可在服务启动时运行 `browser-use < tests/check_boss.browser.py`，验证 Esc 双向切换、输入草稿恢复、后台结算隔离、焦点、手机返回按钮等 19 项检查；该脚本只提交自己试玩模式的点击。部署模板已提供；生产环境上线后仍需验证目标平台网络、磁盘和 HTTPS。

## 参与共建

欢迎补充离谱文案、鱼种和新的摸鱼姿势。鱼角色数据在 `app.js` 的 `fishes`，动作在 `reactions`，界面在 `index.html` / `style.css`。

图形为项目内的 SVG 插画，无远程字体或图片运行依赖。视觉参考 Kimi 灵感库的留白与卡片布局，未复制其素材。

MIT License。
