# CampusTimetable · 南京理工大学个人课表网页（v8 浏览器脚本认证版）

CampusTimetable 是本机运行的 React + Vite 前端与 Node.js 服务。目标流程是：在页面输入校园账号和密码，由本机服务尝试访问南理工官方 HTTPS 认证页面，取得师生端会话并读取 `xskb_list.do` 课表 HTML，解析后显示在自己的课表页面。

## 本次推进（v8）

- 根据网上办事服务大厅 `CUS_CARD_NEW_ALLSERVICE` 的真实配置，确认教务系统（师生端）的 `pcAccessUrl` 为 `http://bkjw.njust.edu.cn/njlgdx/indexsso.jsp`。登录不再直接从 `framework/main.jsp` 或课表 URL 开始。
- 网页内登录从 `https://bkjw.njust.edu.cn/njlgdx/indexsso.jsp` 开始，使用本机已安装的 Microsoft Edge 以 headless 模式打开学校官方 CAS 页面。学校页面的 JavaScript、动态隐藏字段、`passwordText` 到 `password` 的处理、表单事件、CSRF/`execution` 字段和跳转都由官方页面自身执行。
- 对学校明确配置的 HTTP SSO callback 做严格限制：只允许 GET/HEAD 访问 `bkjw.njust.edu.cn` 的 `/njlgdx/` 路径；绝不通过 HTTP POST 用户名或密码。跳转日志会隐藏所有查询参数，避免显示 CAS ticket。
- 如果官方页面要求验证码，CampusTimetable 会尝试截取验证码图并让用户在自己的页面输入，然后由同一后台 Edge 页面提交。认证成功后，在同一个 Edge 会话中请求 `https://bkjw.njust.edu.cn/njlgdx/xskb/xskb_list.do?...` 并解析课表。
- “检查学校登录链路”现在按相同入口顺序、使用同一个临时 CookieJar 逐步请求四个入口，逐步记录 HTTP 状态、最终路径、页面标题、登录表单及课表标记。它仍然是匿名探测，不会使用浏览器当前登录状态，也不会提交账号密码。
- 网络诊断保留每个 HTTPS 请求的状态码、内容类型和跳转路径；所有查询参数都会被剔除，避免显示 CAS ticket、session 相关 URL 参数或其他敏感值。
- 失败时提供表单字段名与隐藏字段**名称**（不显示隐藏字段的值），帮助判断学校返回的认证表单是否包含 execution、验证码字段等。
- 增加 `#dataList` 与 `#kbtable` 解析器和离线冒烟测试；只有识别到有效课程才会覆盖本地数据。
- 本地 Node 服务监听 `127.0.0.1:3001`；课表保存在 `data/timetable.json`，浏览器认证 Cookie 只保存在 headless Edge 上下文内存。账号与密码仅在认证期间临时保存在 Node 进程内存，成功或清除会话后清除，不写入文件或日志。

## 真实登录路径

用户确认的人工操作路径为：

1. `https://jwc.njust.edu.cn/`
2. `https://ehall2.njust.edu.cn/default/index.html#/`
3. `https://bkjw.njust.edu.cn/njlgdx/framework/main.jsp`
4. `https://bkjw.njust.edu.cn/njlgdx/xskb/xskb_list.do?Ves632DSdyV=NEW_XSD_PYGL`

本次从你提供的 `CUS_CARD_NEW_ALLSERVICE` 响应中确认了关键配置：`serviceName` 为“教务系统（师生端）”，`pcAccessUrl` 为 `http://bkjw.njust.edu.cn/njlgdx/indexsso.jsp`。公开访问这个启动入口会跳转到 HTTPS CAS 登录页，其 `service` 参数指向 HTTP 的 `indexsso.jsp`。因此 v7 选择从 SSO 启动入口触发认证，而不再机械地 GET 四个网址。

**安全限制：**CAS 用户名/密码 POST 只允许发送至 HTTPS 认证端；但服务端配置的 callback 是 HTTP，成功认证后的一次性 ticket 可能经 HTTP 到达 `bkjw`。该 ticket 属于敏感认证凭据，虽非用户密码，仍可能被网络中间人窃取。v7 为了忠实支持学校当前入口，限定只允许 GET/HEAD 到 `bkjw.njust.edu.cn/njlgdx/` 路径，且不记录任何 query 参数；仍建议只在可信网络环境下测试。若学校能提供 HTTPS 版的官方 SSO 应用入口，应优先使用。若认证页面要求 JavaScript 密码加密、扫码或短信验证，普通表单提交仍可能无法完成，程序会返回诊断而不是声称成功。

## 安装与运行

环境：Windows 10/11，Node.js 22.x，npm，已安装 Microsoft Edge，IDEA 或 VS Code。`playwright-core` 通过 Edge 的 `msedge` channel 启动系统已安装浏览器，不需要下载另一份 Chromium；Edge 必须能在本机正常启动。

第一个终端：

```powershell
npm install
npm run dev
```

第二个终端：

```powershell
node server/index.mjs
```

网页一般打开 `http://127.0.0.1:5173/`。检查服务：

```powershell
Invoke-RestMethod http://127.0.0.1:3001/api/health
```

## 调查当前登录链路

1. 打开 CampusTimetable，点“检查学校登录链路”。该探测是匿名的，只检查公共入口的响应和跳转，不会读取你 Edge 中的登录 Cookie，也不会修改现有登录会话。
2. 若继续尝试网页内登录，请在 CampusTimetable 页面输入账号密码，并查看“脱敏诊断结果”。
3. 如提交后仍返回登录表单，重点看 `redirectTrace` 中的跳转顺序，以及 `diagnostics.loginForm` 中的表单 action 路径和字段名称。

不要分享学号、密码、Cookie、Authorization、CAS ticket、Token、完整请求正文或真实课程 HTML。日志不会打印请求正文、密码、Cookie 或认证响应 HTML。

## API

- `GET /api/health`：本机服务健康检查。
- `GET /api/timetable`：最近一次成功保存的课表。
- `GET /api/auth/status`：当前进程内认证状态及脱敏诊断。
- `POST /api/auth/diagnose`：按入口顺序探测教务处、网上办事服务大厅、`indexsso.jsp`、本科教务主页和课表；共用一个临时 CookieJar，不使用当前浏览器会话，不提交凭据，也不执行 EHALL SPA JavaScript。
- `POST /api/auth/start`：启动本机 headless Edge，打开官方 CAS 页面并预填账号密码；若需要验证码，在页面显示验证码。
- `POST /api/auth/submit`：在后台 Edge 当前官方页面填写验证码并点击官方登录控件，执行页面脚本，然后尝试读取课表。
- `POST /api/auth/scan`：用当前 Node 进程内的会话刷新课表。
- `POST /api/auth/close`：清空本机进程内存中的会话；不向学校退出账号。

## v8 与此前版本的关键区别

从你提供的登录诊断可以看到，CAS 表单同时有可见字段 `passwordText` 和隐藏字段 `password`，并包含 `lt`、`execution`、`cllt`、`dllt` 等动态字段及验证码。v7 的普通 HTTP 表单解析器没有执行学校原页面的 JavaScript，所以它把输入填到 `passwordText`、却保留隐藏 `password` 初值；即使字段名看似正确，也不能还原官方提交行为。v8 改为由本机 headless Edge 执行官方页面脚本，避免继续猜测密码处理逻辑。

## 测试

```powershell
npm run test:parser
npm run build
```

解析器测试不依赖学校网络或真实账号，也不等于通过真实登录测试。请注意：本次没有在真实用户教务会话中端到端验证认证与自动取数，完整 Vite/TypeScript 构建也应在完成 `npm install` 后由本机确认。

## 安全边界

- 本机 Edge 在学校官方页面中执行认证，账号密码不会由 Node 手工拼接成 HTTP POST 字段，也不会写入日志或文件。账号密码在认证期间短暂保存在 Node 进程内存，并在登录成功或清除会话后清除。
- 密码不落盘、不写日志；认证 Cookie 不写入文件，在服务停止时随进程结束。
- 本地接口只绑定 `127.0.0.1`，写接口会检查网页 Origin。
- 不绕过验证码、短信、扫码或其他身份验证，不会尝试访问无权限数据。
- 当前服务卡片给出的 `indexsso.jsp` 回调是 HTTP，一次性 CAS ticket 可能通过 HTTP 传输，这仍是学校现有入口的安全限制。请只在可信网络下测试。如果学校更改登录页面的控件或验证码策略，可能需要调整选择器。
