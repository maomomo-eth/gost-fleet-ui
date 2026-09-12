# Gost Fleet UI

面向多个 GOST v3 API 的轻量级管理入口。它参考 [gost-ui](https://github.com/go-gost/gost-ui) 的连接方式，额外提供本地服务器库、侧边栏快速切换、分组和批量健康检查。

## 启动

```bash
npm install
npm run dev
```

默认通过 `GET {API_URL}/config` 验证连接，并在已填写用户名或密码时使用 HTTP Basic Auth。

## 部署到 Nginx 二级目录

构建产物使用相对资源路径，可直接复制到例如 `/var/www/html/gost/`。Nginx 配置示例：

```nginx
location /gost/ {
    alias /var/www/html/gost/;
    try_files $uri $uri/ /gost/index.html;
}
```

修改后重新执行 `npm run build`，并将新的 `dist/` 目录内容上传到该目录。访问地址为 `https://你的域名/gost/`（结尾保留 `/`）。

## 数据与安全

服务器档案保存在当前浏览器的 `localStorage` 中，适合个人或本地管理场景；其中包含的密码不是生产级安全存储。正式部署时，应将档案迁移到受认证保护的后端，并使用密钥管理服务或数据库加密保存凭据。

若浏览器访问不到 GOST API，请检查 GOST API 的跨域配置以及管理页面/API 的协议是否兼容。
