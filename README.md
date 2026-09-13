# Gost Fleet UI

面向多个 GOST v3 API 的管理入口。它参考 [gost-ui](https://github.com/go-gost/gost-ui) 的连接方式，额外提供本地服务器库、侧边栏快速切换、分组和批量健康检查。

## 已实现的管理能力

- 多服务器档案：URL、Basic Auth、分组与侧边栏快速切换。
- 自动读取当前服务器的 `GET /config?format=json` 配置。
- 对服务、转发链、认证器、分流器、准入控制、解析器、Hosts、限速器和配额进行 JSON 级新建、编辑、删除。
- 配置操作使用 GOST 的资源级 `POST`、`PUT`、`DELETE` API，保存即刻在目标 Gost 生效。
- 可通过“写入配置文件”调用 `POST /config?format=yaml&path=/目标路径` 或 JSON 等价接口，将当前运行配置保存到远端指定路径；路径留空则由 Gost 按默认规则决定。
- 下载当前服务器完整 JSON 配置，并批量检查服务器连通性。

## 启动

```bash
npm install
npm run dev
```

默认通过 `GET {API_URL}/config` 验证连接，并在已填写用户名或密码时使用 HTTP Basic Auth。

## 自动构建 Release

推送到 `main` 后，GitHub Actions 会自动构建 `dist`，并更新预发布标签 `latest` 中的 `gost-fleet-ui-dist.zip` 附件。也可以从仓库的 **Actions** 页面手动运行“构建并发布最新版本”。

## Linux 一键安装 Gost

脚本会下载并校验官方最新 GOST Linux 发布包，安装到 `/usr/local/bin/gost`，创建 systemd 服务，并固定从 `/etc/gost/gost.yaml` 启动。已有配置不会覆盖；需要重建初始配置时添加 `--force`。

```bash
git clone https://github.com/maomomo-eth/gost-fleet-ui.git
cd gost-fleet-ui
sudo bash scripts/install-gost.sh --api-port 18080 --api-user admin
```

脚本会安全地交互输入 API 密码。也可以自动化调用：

```bash
sudo bash scripts/install-gost.sh --api-port 18080 --api-user admin --api-password '请替换为强密码'
```

安装后在管理 UI 的“写入配置文件”中，默认目标就是 `/etc/gost/gost.yaml`，与 systemd 的 `ExecStart` 一致。路径属于远端服务器或容器文件系统，确保 Gost 进程有写入权限。

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

如果 Gost 使用 `-C /自定义/路径.yaml` 启动，请在“远端保存路径”填写同一绝对路径。该路径属于远端 Gost 所在主机或容器，且必须允许 Gost 进程写入；不要填写浏览器或本机 Windows 的路径。

若浏览器访问不到 GOST API，请检查 GOST API 的跨域配置以及管理页面/API 的协议是否兼容。
