# Gost Fleet UI

面向多个 GOST v3 API 的管理入口。它参考 [gost-ui](https://github.com/go-gost/gost-ui) 的连接方式，额外提供本地服务器库、侧边栏快速切换、分组和批量健康检查。

## 已实现的管理能力

- 多服务器档案：URL、Basic Auth、分组与侧边栏快速切换。
- 自动读取当前服务器的 `GET /config?format=json` 配置。
- 对服务、转发链、认证器、分流器、准入控制、解析器、Hosts、限速器和配额进行 JSON 级新建、编辑、删除。
- 配置操作使用 GOST 的资源级 `POST`、`PUT`、`DELETE` API，保存即刻在目标 Gost 生效。
- 可通过“写入配置文件”调用 `POST /config?format=yaml` 或 `POST /config?format=json`，将当前运行配置保存为远端 `gost.yaml` 或 `gost.json`。
- 下载当前服务器完整 JSON 配置，并批量检查服务器连通性。

## 启动

```bash
npm install
npm run dev
```

默认通过 `GET {API_URL}/config` 验证连接，并在已填写用户名或密码时使用 HTTP Basic Auth。

连接地址应填写 API 根地址；如果 GOST 配置了 `pathPrefix`，需将此前缀包含在地址中，例如 `https://example.com/gost`，程序将请求 `https://example.com/gost/config`。

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

JSON 编辑器会对远端运行配置立即执行写操作。修改前请先通过“导出 JSON”备份，并注意资源对象需要保留唯一的 `name` 字段。

如果 Gost 使用 `-C /自定义/路径.yaml` 启动，“写入配置文件”生成的默认 `gost.yaml`/`gost.json` 不会自动替代该自定义路径。请调整启动参数或将保存后的文件同步到实际配置路径。

若浏览器访问不到 GOST API，请检查 GOST API 的跨域配置以及管理页面/API 的协议是否兼容。
