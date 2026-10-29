# 接入多人鱼塘服务器

页面只有多人玩法。点击计数、玩家贡献、最后一摸的归属、做法、下一轮和档案都由服务器提供；没有单人回退或浏览器内模拟进度。

## 连接地址

页面按 `config.js` → `api.js` → `app.js` 加载。修改 `config.js`：

```js
window.MOYU_CONFIG = Object.freeze({
  apiBaseUrl: "/api",
  pollIntervalMs: 1300,
  requestTimeoutMs: 6500,
});
```

最简单的部署是页面和 API 使用同一个域名；默认 `/api` 已连接仓库自带的 Python 服务端，无需改前端。也可以在网关把 `/api/*` 代理到另一台服务器。

前后端分别部署到同一站点的子域名时，例如 `https://fish.example.com` 和 `https://api.example.com`：

1. `apiBaseUrl` 改为 `https://api.example.com/api`。
2. API 服务器设 `MOYU_ALLOWED_ORIGINS=https://fish.example.com` 和 `MOYU_SECURE_COOKIE=1`。
3. 同时使用 HTTPS。前端会携带 Cookie，服务端仅对明确允许的来源返回带凭证的 CORS 响应。

本参考服务使用 `SameSite=Strict` Cookie。同站点子域名可用；完全不同的顶级域名可能被浏览器阻止 Cookie，请改用同域反向代理，而不是仅设置 CORS。不要在 `config.js` 放密码或密钥。

## 四个业务接口

| 请求 | 请求体 | 行为 |
| --- | --- | --- |
| `GET /api/state` | 无 | 建立匿名会话，读取当前鱼、公共计数、自己的贡献和历史记录 |
| `POST /api/touch` | `{"round":1,"event":"32位随机十六进制ID","name":"打工人"}` | 原子累加一次；同一事件重试不重复计数 |
| `POST /api/cook` | `{"round":1,"dish":"放生","name":"打工人"}` | 只有最后一摸的会话能选择；有效做法为红烧、清蒸、剁椒、放生 |
| `POST /api/next` | `{"round":1,"name":"打工人"}` | 当前鱼已决定去向后开始新轮次；并发请求仅开启一次 |

所有 POST 使用 `Content-Type: application/json`。`event` 必须是 8–80 位英文字母、数字、下划线或连字符。前端同一个点击的网络重试会复用同一个事件编号。

响应都返回完整状态：

```json
{
  "round": 1,
  "count": 36,
  "target": 10000,
  "mine": 12,
  "participants": 5,
  "canChoose": false,
  "winnerName": null,
  "dish": null,
  "autoReleased": false,
  "choiceRemaining": null,
  "history": []
}
```

- `round`：从 1 开始的整数；界面以 `(round - 1) % 5` 轮换鱼种。
- `count` / `target`：当前累计次数与目标；`0 ≤ count ≤ target`。
- `mine` / `participants`：当前会话贡献与本轮已贡献人数。参与人数不是实时在线人数。
- `canChoose`：只对最后一摸的会话为 `true`。不要将身份 Cookie、内部玩家 ID 或权限令牌放进响应。
- `winnerName` / `dish`：未产生时为 `null`。
- `choiceRemaining`：最后一摸后剩余选择秒数，之前为 `null`。
- `autoReleased`：是否因超过选择期限而自动放生。
- `history`：最近完成的轮次，元素形如 `{"round":1,"dish":"放生","winnerName":"打工人","target":10000,"participants":5,"autoReleased":false}`。
- 写接口额外返回 `accepted` 布尔值；`touch` 成功接受或确认同一事件已处理时为 `true`。页面只在确认后显示 `+1`。

过期轮次的请求返回当前状态且 `accepted:false`，不能把旧点击算进新鱼。

## 会话、异常和断线

首次 `GET /api/state` 设置随机匿名身份 Cookie。写接口依据 Cookie 校验身份，不信任请求体中的玩家 ID。服务重启后 Cookie 对应身份仍需能恢复。

失败响应：`{"error":"面向玩家的说明"}`，并使用对应状态码：400 无效请求、401 会话无效、403 无权限、404 未找到、409 当前轮次未结束、413 请求过大、415 内容类型不符、429 点击过快、503 暂不可用。

连接失败或响应无效时，页面保留最后确认的进度，暂停摸鱼，显示“暂时连不上大家”，并自动重连。离线点击不累积；重连后继续读取共享进度。老板模式只隐藏页面，继续同步服务器状态。

## 更换后端

当前服务端为 `server.py`，状态保存在 SQLite。换成其他语言、数据库或实时推送时，保留上面的接口契约，或修改 `api.js` 中的四个方法即可；界面不直接访问数据库。

至少保留：原子计数、事件去重、唯一最后一摸、会话鉴权、下一轮幂等、选择超时处理。测试用小目标通过服务端环境变量 `MOYU_TARGET` 设置，不向玩家提供另一套玩法。
