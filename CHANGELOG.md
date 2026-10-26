# 更新记录

## v1.3.0 / v8
- 根据实际 CAS 登录表单诊断，发现表单具有可见 `passwordText` 与隐藏 `password` 字段，另有 `lt`、`execution`、`cllt`、`dllt` 和验证码。纯 HTTP 表单提交没有执行认证页 JavaScript，不能可靠完成这一表单。
- 改用本机安装的 Microsoft Edge headless 会话打开官方认证页面，由页面自身执行动态字段处理与登录事件，不弹出可见官网窗口。
- 验证码由官方页显示并由用户输入；不绕过额外验证。
- 认证 Cookie 保留在浏览器上下文中，不导出给 Node 或前端；账号/密码仅在本机进程内存临时使用，不写日志或文件。
- 保留 `#dataList` / `#kbtable` 课表解析逻辑和本机课表 API。
- 仍需在用户电脑上做真实认证验证；官方 SSO callback 使用 HTTP 的安全风险仍然存在。
