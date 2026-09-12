import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import "./App.css";

type ServerStatus = "online" | "offline" | "unknown";
type JsonObject = Record<string, unknown>;
type GostServer = {
  id: string;
  name: string;
  url: string;
  username: string;
  password: string;
  group: string;
  status: ServerStatus;
  checkedAt?: string;
};
type Resource = {
  key: string;
  label: string;
  singular: string;
  description: string;
  readOnly?: boolean;
};
type JsonEditor = { resource: Resource; originalName?: string; value: string };
type JsonTemplate = { name: string; description: string; value: JsonObject };

const storageKey = "gost-fleet-servers";
const resources: Resource[] = [
  {
    key: "services",
    label: "服务",
    singular: "服务",
    description: "监听入口、处理器与端口转发",
  },
  {
    key: "chains",
    label: "转发链",
    singular: "转发链",
    description: "代理节点与跳点编排",
  },
  {
    key: "hops",
    label: "跳点",
    singular: "跳点",
    description: "供转发链引用的独立跳点",
    readOnly: true,
  },
  {
    key: "authers",
    label: "认证器",
    singular: "认证器",
    description: "用户名密码认证策略",
  },
  {
    key: "bypasses",
    label: "分流器",
    singular: "分流器",
    description: "指定地址绕过代理",
  },
  {
    key: "admissions",
    label: "准入控制",
    singular: "准入控制",
    description: "允许或拒绝访问来源",
  },
  {
    key: "resolvers",
    label: "解析器",
    singular: "解析器",
    description: "DNS 解析配置",
  },
  {
    key: "hosts",
    label: "Hosts",
    singular: "Hosts",
    description: "静态域名 IP 映射",
  },
  {
    key: "limiters",
    label: "限速器",
    singular: "限速器",
    description: "流量速率限制",
  },
  {
    key: "quotas",
    label: "配额",
    singular: "配额",
    description: "累计流量配额与用量",
  },
];
const demoServers: GostServer[] = [
  {
    id: "hk-01",
    name: "香港 · 核心节点",
    url: "https://hk-gost.example.com:18080",
    username: "admin",
    password: "",
    group: "生产环境",
    status: "online",
    checkedAt: "刚刚",
  },
  {
    id: "sg-01",
    name: "新加坡 · 边缘节点",
    url: "https://sg-gost.example.com:18080",
    username: "admin",
    password: "",
    group: "生产环境",
    status: "unknown",
  },
];
const emptyServer = (): GostServer => ({
  id: crypto.randomUUID(),
  name: "",
  url: "http://",
  username: "",
  password: "",
  group: "未分组",
  status: "unknown",
});
const initialResource = (key: string): JsonObject =>
  key === "services"
    ? {
        name: "service-0",
        addr: ":8080",
        handler: { type: "http" },
        listener: { type: "tcp" },
      }
    : key === "chains"
      ? { name: "chain-0", hops: [{ name: "hop-0", nodes: [] }] }
      : { name: "" };
const jsonTemplates: Record<string, JsonTemplate[]> = {
  services: [
    {
      name: "HTTP 代理",
      description: "监听 8080 的 HTTP CONNECT 代理",
      value: {
        name: "http-proxy",
        addr: ":8080",
        handler: { type: "http" },
        listener: { type: "tcp" },
      },
    },
    {
      name: "SOCKS5 代理",
      description: "监听 1080 的 SOCKS5 代理",
      value: {
        name: "socks5-proxy",
        addr: ":1080",
        handler: { type: "socks5" },
        listener: { type: "tcp" },
      },
    },
    {
      name: "HTTP + 转发链",
      description: "HTTP 入口转发至已存在的 chain-0",
      value: {
        name: "http-entry",
        addr: ":8080",
        handler: { type: "http", chain: "chain-0" },
        listener: { type: "tcp" },
      },
    },
  ],
  chains: [
    {
      name: "SOCKS5 上游",
      description: "经 SOCKS5 节点转发",
      value: {
        name: "chain-0",
        hops: [
          {
            name: "hop-0",
            nodes: [
              {
                name: "socks5-upstream",
                addr: "127.0.0.1:1080",
                connector: { type: "socks5" },
                dialer: { type: "tcp" },
              },
            ],
          },
        ],
      },
    },
    {
      name: "HTTP 上游",
      description: "经 HTTP CONNECT 节点转发",
      value: {
        name: "chain-0",
        hops: [
          {
            name: "hop-0",
            nodes: [
              {
                name: "http-upstream",
                addr: "127.0.0.1:8080",
                connector: { type: "http" },
                dialer: { type: "tcp" },
              },
            ],
          },
        ],
      },
    },
  ],
  authers: [
    {
      name: "单用户认证",
      description: "用户名与密码认证",
      value: {
        name: "auther-0",
        auths: [{ username: "user", password: "change-me" }],
      },
    },
  ],
  bypasses: [
    {
      name: "内网直连",
      description: "内网和本机地址不走代理",
      value: {
        name: "bypass-lan",
        matchers: ["localhost", "127.0.0.0/8", "10.0.0.0/8", "192.168.0.0/16"],
      },
    },
  ],
  admissions: [
    {
      name: "允许指定网段",
      description: "仅允许私网来源连接",
      value: {
        name: "admission-lan",
        whitelist: ["10.0.0.0/8", "192.168.0.0/16"],
      },
    },
  ],
  resolvers: [
    {
      name: "IPv4 DNS",
      description: "Cloudflare 与 Google IPv4 DNS",
      value: {
        name: "resolver-v4",
        nameservers: [
          { addr: "udp://1.1.1.1:53", only: "ipv4" },
          { addr: "udp://8.8.8.8:53", only: "ipv4" },
        ],
      },
    },
  ],
  hosts: [
    {
      name: "静态 Hosts",
      description: "将 example.com 固定解析到 IP",
      value: {
        name: "hosts-0",
        mappings: [{ hostname: "example.com", ip: "203.0.113.10" }],
      },
    },
  ],
  limiters: [
    {
      name: "速率限制",
      description: "限制为每秒 10MB",
      value: { name: "limiter-10m", limits: ["10MB"] },
    },
  ],
  quotas: [
    {
      name: "月度 10GB 配额",
      description: "累计总流量 10GB",
      value: {
        name: "quota-10g",
        limit: "10GB",
        direction: "total",
        flush: "30s",
      },
    },
  ],
};

function loadServers(): GostServer[] {
  try {
    const saved = localStorage.getItem(storageKey);
    return saved ? JSON.parse(saved) : demoServers;
  } catch {
    return demoServers;
  }
}
function asObject(value: unknown): JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}
function getName(value: JsonObject, index: number) {
  return typeof value.name === "string" && value.name
    ? value.name
    : `未命名 #${index + 1}`;
}

function App() {
  const [servers, setServers] = useState<GostServer[]>(loadServers);
  const [activeId, setActiveId] = useState(() => servers[0]?.id ?? "");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [serverEditor, setServerEditor] = useState<GostServer | null>(null);
  const [isNewServer, setIsNewServer] = useState(false);
  const [resourceEditor, setResourceEditor] = useState<JsonEditor | null>(null);
  const [activeResource, setActiveResource] = useState(resources[0]);
  const [config, setConfig] = useState<JsonObject>({});
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [configError, setConfigError] = useState("");
  const [notice, setNotice] = useState("");
  const [editorDiagnostic, setEditorDiagnostic] = useState("");
  useEffect(
    () => localStorage.setItem(storageKey, JSON.stringify(servers)),
    [servers],
  );
  const activeServer =
    servers.find((server) => server.id === activeId) ?? servers[0];
  const groups = useMemo(
    () => [...new Set(servers.map((server) => server.group))],
    [servers],
  );
  const activeItems = Array.isArray(config[activeResource.key])
    ? (config[activeResource.key] as JsonObject[])
    : [];
  const updateServers = (updater: (items: GostServer[]) => GostServer[]) =>
    setServers((items) => updater(items));
  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3500);
  };
  const api = async (
    server: GostServer,
    suffix: string,
    options: RequestInit = {},
  ) => {
    const headers = new Headers(options.headers);
    headers.set("Accept", "application/json");
    if (options.body) headers.set("Content-Type", "application/json");
    if (server.username || server.password)
      headers.set(
        "Authorization",
        `Basic ${btoa(`${server.username}:${server.password}`)}`,
      );
    const response = await fetch(`${server.url.replace(/\/$/, "")}${suffix}`, {
      ...options,
      headers,
      signal: AbortSignal.timeout(12000),
    });
    const text = await response.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    if (!response.ok) {
      const message =
        asObject(body).msg ||
        asObject(body).message ||
        text ||
        `HTTP ${response.status}`;
      throw new Error(String(message));
    }
    return body;
  };
  const setServerStatus = (server: GostServer, status: ServerStatus) =>
    updateServers((items) =>
      items.map((item) =>
        item.id === server.id ? { ...item, status, checkedAt: "刚刚" } : item,
      ),
    );
  const loadConfig = async (server = activeServer, silent = false) => {
    if (!server) return;
    if (!silent) setIsLoadingConfig(true);
    setConfigError("");
    try {
      const response = asObject(await api(server, "/config?format=json"));
      // GOST 不同版本会返回原始配置，或返回 { code, data } 包装结构；两者都兼容。
      setConfig(
        Object.prototype.hasOwnProperty.call(response, "data")
          ? asObject(response.data)
          : response,
      );
      setServerStatus(server, "online");
      if (!silent) showNotice(`已加载 ${server.name} 的配置`);
    } catch (error) {
      setServerStatus(server, "offline");
      setConfig({});
      setConfigError(
        error instanceof Error ? error.message : "无法读取 Gost 配置",
      );
    } finally {
      setIsLoadingConfig(false);
    }
  };
  useEffect(() => {
    void loadConfig(activeServer, true);
  }, [activeId]);
  const testConnection = async (server: GostServer) => {
    try {
      await api(server, "/config");
      setServerStatus(server, "online");
      return "online" as ServerStatus;
    } catch {
      setServerStatus(server, "offline");
      return "offline" as ServerStatus;
    }
  };
  const checkSelected = async () => {
    const targets = servers.filter((server) =>
      selectedIds.length ? selectedIds.includes(server.id) : true,
    );
    const result = await Promise.all(targets.map(testConnection));
    showNotice(
      `健康检查完成：${result.filter((status) => status === "online").length}/${targets.length} 台可连接`,
    );
  };
  const saveServer = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      !serverEditor ||
      !serverEditor.name.trim() ||
      !serverEditor.url.match(/^https?:\/\//)
    )
      return showNotice("请填写服务器名称和有效的 API URL");
    updateServers((items) =>
      isNewServer
        ? [...items, serverEditor]
        : items.map((item) =>
            item.id === serverEditor.id ? serverEditor : item,
          ),
    );
    setActiveId(serverEditor.id);
    setServerEditor(null);
    showNotice(isNewServer ? "服务器已添加" : "服务器配置已保存");
  };
  const removeServer = (id: string) => {
    updateServers((items) => items.filter((item) => item.id !== id));
    setSelectedIds((items) => items.filter((item) => item !== id));
    if (activeId === id)
      setActiveId(servers.find((item) => item.id !== id)?.id ?? "");
  };
  const openCreate = () => {
    if (activeResource.readOnly)
      return showNotice(
        "跳点仅展示：当前 GOST Web API 未提供独立跳点的动态写接口",
      );
    setResourceEditor({
      resource: activeResource,
      value: JSON.stringify(initialResource(activeResource.key), null, 2),
    });
    setEditorDiagnostic("");
  };
  const openEdit = (item: JsonObject, index: number) => {
    if (activeResource.readOnly)
      return showNotice("跳点仅展示：请在链配置或原始配置文件中维护");
    setResourceEditor({
      resource: activeResource,
      originalName: getName(item, index),
      value: JSON.stringify(item, null, 2),
    });
    setEditorDiagnostic("");
  };
  const applyTemplate = (template: JsonTemplate) => {
    if (!resourceEditor) return;
    setResourceEditor({
      ...resourceEditor,
      value: JSON.stringify(template.value, null, 2),
    });
    setEditorDiagnostic(`已应用模板：${template.name}`);
  };
  const formatEditorJson = () => {
    if (!resourceEditor) return;
    try {
      setResourceEditor({
        ...resourceEditor,
        value: JSON.stringify(JSON.parse(resourceEditor.value), null, 2),
      });
      setEditorDiagnostic("JSON 格式正确，已格式化");
    } catch (error) {
      setEditorDiagnostic(
        `JSON 格式错误：${error instanceof Error ? error.message : "无法解析"}`,
      );
    }
  };
  const copyEditorJson = async () => {
    if (!resourceEditor) return;
    try {
      await navigator.clipboard.writeText(resourceEditor.value);
      setEditorDiagnostic("JSON 已复制到剪贴板");
    } catch {
      setEditorDiagnostic("浏览器不允许复制，请手动选择内容");
    }
  };
  const saveResource = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!resourceEditor || !activeServer) return;
    let item: JsonObject;
    try {
      item = asObject(JSON.parse(resourceEditor.value));
    } catch {
      return showNotice("JSON 格式无效，请修正后再保存");
    }
    const name = typeof item.name === "string" ? item.name.trim() : "";
    if (!name) return showNotice("每个 Gost 配置对象必须包含 name 字段");
    setIsSaving(true);
    try {
      const path = `/config/${resourceEditor.resource.key}${resourceEditor.originalName ? `/${encodeURIComponent(resourceEditor.originalName)}` : ""}`;
      await api(activeServer, path, {
        method: resourceEditor.originalName ? "PUT" : "POST",
        body: JSON.stringify(item),
      });
      setResourceEditor(null);
      await loadConfig(activeServer, true);
      showNotice(
        `${resourceEditor.resource.singular}已${resourceEditor.originalName ? "更新" : "创建"}，配置即时生效`,
      );
    } catch (error) {
      showNotice(
        `保存失败：${error instanceof Error ? error.message : "未知错误"}`,
      );
    } finally {
      setIsSaving(false);
    }
  };
  const deleteResource = async (item: JsonObject, index: number) => {
    if (activeResource.readOnly)
      return showNotice(
        "跳点仅展示：当前 GOST Web API 未提供独立跳点的动态写接口",
      );
    if (!activeServer) return;
    const name = getName(item, index);
    if (
      !window.confirm(
        `确定删除${activeResource.singular}「${name}」？此操作会立即应用到 Gost。`,
      )
    )
      return;
    try {
      await api(
        activeServer,
        `/config/${activeResource.key}/${encodeURIComponent(name)}`,
        { method: "DELETE" },
      );
      await loadConfig(activeServer, true);
      showNotice(`已删除${activeResource.singular}「${name}」`);
    } catch (error) {
      showNotice(
        `删除失败：${error instanceof Error ? error.message : "未知错误"}`,
      );
    }
  };
  const downloadConfig = () => {
    const blob = new Blob([JSON.stringify(config, null, 2)], {
      type: "application/json",
    });
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `${activeServer?.name || "gost"}-config.json`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  };
  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">G</span>
          <span>Gost Fleet</span>
        </div>
        <button
          className="add-server"
          onClick={() => {
            setIsNewServer(true);
            setServerEditor(emptyServer());
          }}
        >
          <span>＋</span> 添加服务器
        </button>
        <div className="sidebar-label">
          服务器库 <span>{servers.length}</span>
        </div>
        <nav className="server-nav">
          {groups.map((group) => (
            <section key={group} className="server-group">
              <div className="group-name">{group}</div>
              {servers
                .filter((server) => server.group === group)
                .map((server) => (
                  <button
                    className={`server-link ${activeId === server.id ? "active" : ""}`}
                    key={server.id}
                    onClick={() => setActiveId(server.id)}
                  >
                    <i className={`status-dot ${server.status}`}></i>
                    <span>{server.name}</span>
                    <small>•••</small>
                  </button>
                ))}
            </section>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span className="lock">⌁</span>
          <div>
            <strong>本地服务器库</strong>
            <small>连接信息仅保存于此浏览器</small>
          </div>
        </div>
      </aside>
      <section className="content">
        <header className="topbar">
          <div className="crumb">
            服务器库 <span>/</span>{" "}
            <strong>{activeServer?.name || "未选择服务器"}</strong>
          </div>
          <div className="top-actions">
            <button
              className="icon-button"
              title="导出当前配置"
              onClick={downloadConfig}
            >
              ⇩
            </button>
            <div className="avatar">A</div>
          </div>
        </header>
        <div className="page manager-page">
          <section className="manager-hero">
            <div>
              <div className="eyebrow">GOST API 管理</div>
              <h1>{activeServer?.name || "开始管理你的 Gost"}</h1>
              <p>
                <i
                  className={`status-dot ${activeServer?.status || "unknown"}`}
                ></i>
                {activeServer?.url || "请选择服务器"} ·{" "}
                {activeServer?.status === "online"
                  ? "已连接，可直接修改运行配置"
                  : "正在连接或不可用"}
              </p>
            </div>
            <div className="hero-actions">
              <button
                className="secondary"
                disabled={isLoadingConfig}
                onClick={() => void loadConfig()}
              >
                {isLoadingConfig ? "加载中…" : "刷新配置"}
              </button>
              <button
                className="primary"
                onClick={() =>
                  activeServer &&
                  (setIsNewServer(false), setServerEditor({ ...activeServer }))
                }
              >
                编辑服务器
              </button>
            </div>
          </section>
          <section className="manager-layout">
            <nav className="resource-nav">
              <div className="resource-title">
                运行配置 <span>即时生效</span>
              </div>
              {resources.map((resource) => (
                <button
                  key={resource.key}
                  className={
                    activeResource.key === resource.key ? "selected" : ""
                  }
                  onClick={() => setActiveResource(resource)}
                >
                  <span>{resource.label}</span>
                  <small>
                    {Array.isArray(config[resource.key])
                      ? (config[resource.key] as unknown[]).length
                      : 0}
                  </small>
                </button>
              ))}
              <div className="resource-nav-divider" />
              <button onClick={downloadConfig}>
                <span>导出 JSON</span>
                <small>⇩</small>
              </button>
            </nav>
            <section className="resource-panel">
              <div className="panel-heading">
                <div>
                  <h2>{activeResource.label}</h2>
                  <p>{activeResource.description}</p>
                </div>
                <button
                  className="primary"
                  disabled={activeServer?.status !== "online"}
                  onClick={openCreate}
                >
                  ＋ 新建{activeResource.singular}
                </button>
              </div>
              {configError ? (
                <div className="api-error">
                  <strong>无法读取 Gost 配置</strong>
                  <p>{configError}</p>
                  <button
                    className="secondary"
                    onClick={() => void loadConfig()}
                  >
                    重新连接
                  </button>
                </div>
              ) : isLoadingConfig ? (
                <div className="empty-state">正在从 Gost API 读取配置…</div>
              ) : activeItems.length === 0 ? (
                <div className="empty-state">
                  <span>◇</span>
                  <h3>尚无{activeResource.label}</h3>
                  <p>
                    在此服务器上创建第一个{activeResource.singular}
                    ，配置将立即应用。
                  </p>
                  <button
                    className="secondary"
                    disabled={activeServer?.status !== "online"}
                    onClick={openCreate}
                  >
                    新建{activeResource.singular}
                  </button>
                </div>
              ) : (
                <div className="object-list">
                  {activeItems.map((item, index) => (
                    <article
                      className="object-card"
                      key={`${getName(item, index)}-${index}`}
                    >
                      <div className="object-main">
                        <div className="object-icon">
                          {activeResource.label.slice(0, 1)}
                        </div>
                        <div>
                          <h3>{getName(item, index)}</h3>
                          <p>
                            {item.addr
                              ? String(item.addr)
                              : item.type
                                ? `类型：${String(item.type)}`
                                : activeResource.description}
                          </p>
                        </div>
                      </div>
                      <code>{JSON.stringify(item)}</code>
                      <div className="object-actions">
                        <button onClick={() => openEdit(item, index)}>
                          编辑 JSON
                        </button>
                        <button
                          className="danger-text"
                          onClick={() => void deleteResource(item, index)}
                        >
                          删除
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </section>
          <section className="fleet-section compact-fleet">
            <div className="section-heading">
              <div>
                <h2>服务器健康检查</h2>
                <p>勾选服务器后批量确认 API 是否可用。</p>
              </div>
              <button
                className="secondary"
                onClick={() => void checkSelected()}
              >
                检查
                {selectedIds.length
                  ? `已选 ${selectedIds.length} 台`
                  : "全部服务器"}
              </button>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>
                      <input
                        aria-label="选择全部"
                        type="checkbox"
                        checked={
                          servers.length > 0 &&
                          selectedIds.length === servers.length
                        }
                        onChange={() =>
                          setSelectedIds(
                            selectedIds.length === servers.length
                              ? []
                              : servers.map((server) => server.id),
                          )
                        }
                      />
                    </th>
                    <th>服务器</th>
                    <th>API 地址</th>
                    <th>状态</th>
                    <th>最近检测</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {servers.map((server) => (
                    <tr key={server.id}>
                      <td>
                        <input
                          aria-label={`选择 ${server.name}`}
                          type="checkbox"
                          checked={selectedIds.includes(server.id)}
                          onChange={() =>
                            setSelectedIds((items) =>
                              items.includes(server.id)
                                ? items.filter((id) => id !== server.id)
                                : [...items, server.id],
                            )
                          }
                        />
                      </td>
                      <td>
                        <button
                          className="name-button"
                          onClick={() => setActiveId(server.id)}
                        >
                          <i className={`status-dot ${server.status}`} />
                          {server.name}
                        </button>
                      </td>
                      <td>
                        <code>{server.url}</code>
                      </td>
                      <td>
                        <span className={`table-status ${server.status}`}>
                          {server.status === "online"
                            ? "在线"
                            : server.status === "offline"
                              ? "离线"
                              : "未检测"}
                        </span>
                      </td>
                      <td>{server.checkedAt || "—"}</td>
                      <td>
                        <div className="row-actions">
                          <button
                            onClick={() => void testConnection(server)}
                            title="测试连接"
                          >
                            ↻
                          </button>
                          <button
                            onClick={() => {
                              setIsNewServer(false);
                              setServerEditor({ ...server });
                            }}
                            title="编辑"
                          >
                            ✎
                          </button>
                          <button
                            className="danger"
                            onClick={() => removeServer(server.id)}
                            title="删除"
                          >
                            ×
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </section>
      {serverEditor && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setServerEditor(null)}
        >
          <form
            className="modal"
            onSubmit={saveServer}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-title">
              <div>
                <span className="eyebrow">连接档案</span>
                <h2>{isNewServer ? "添加 Gost 服务器" : "编辑服务器"}</h2>
              </div>
              <button
                type="button"
                className="close"
                onClick={() => setServerEditor(null)}
              >
                ×
              </button>
            </div>
            <label>
              服务器名称
              <input
                autoFocus
                value={serverEditor.name}
                onChange={(event) =>
                  setServerEditor({ ...serverEditor, name: event.target.value })
                }
              />
            </label>
            <label>
              Gost API URL
              <input
                value={serverEditor.url}
                onChange={(event) =>
                  setServerEditor({ ...serverEditor, url: event.target.value })
                }
                placeholder="https://host:18080/api"
              />
            </label>
            <div className="form-grid">
              <label>
                用户名
                <input
                  value={serverEditor.username}
                  onChange={(event) =>
                    setServerEditor({
                      ...serverEditor,
                      username: event.target.value,
                    })
                  }
                />
              </label>
              <label>
                分组
                <input
                  value={serverEditor.group}
                  onChange={(event) =>
                    setServerEditor({
                      ...serverEditor,
                      group: event.target.value,
                    })
                  }
                />
              </label>
            </div>
            <label>
              密码
              <input
                type="password"
                value={serverEditor.password}
                onChange={(event) =>
                  setServerEditor({
                    ...serverEditor,
                    password: event.target.value,
                  })
                }
              />
            </label>
            <p className="form-help">
              URL 可包含 Gost 的 pathPrefix，例如 <code>https://host/gost</code>
              。凭据保存在当前浏览器。
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setServerEditor(null)}
              >
                取消
              </button>
              <button className="primary" type="submit">
                保存服务器
              </button>
            </div>
          </form>
        </div>
      )}
      {resourceEditor && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => !isSaving && setResourceEditor(null)}
        >
          <form
            className="modal json-modal"
            onSubmit={saveResource}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-title">
              <div>
                <span className="eyebrow">
                  {activeServer?.name} · {resourceEditor.resource.label}
                </span>
                <h2>
                  {resourceEditor.originalName
                    ? `编辑 ${resourceEditor.originalName}`
                    : `新建${resourceEditor.resource.singular}`}
                </h2>
              </div>
              <button
                type="button"
                className="close"
                disabled={isSaving}
                onClick={() => setResourceEditor(null)}
              >
                ×
              </button>
            </div>
            {!resourceEditor.originalName &&
              (jsonTemplates[resourceEditor.resource.key]?.length ?? 0) > 0 && (
                <div className="template-picker">
                  <div className="template-picker-title">快速添加模板</div>
                  <div className="template-list">
                    {jsonTemplates[resourceEditor.resource.key].map(
                      (template) => (
                        <button
                          type="button"
                          key={template.name}
                          className="template-button"
                          onClick={() => applyTemplate(template)}
                        >
                          <strong>{template.name}</strong>
                          <small>{template.description}</small>
                        </button>
                      ),
                    )}
                  </div>
                </div>
              )}
            <div className="json-toolbar">
              <span>JSON 编辑器</span>
              <div>
                <button type="button" onClick={formatEditorJson}>
                  格式化 / 校验
                </button>
                <button type="button" onClick={() => void copyEditorJson()}>
                  复制
                </button>
              </div>
            </div>
            <label>
              <textarea
                spellCheck="false"
                value={resourceEditor.value}
                onChange={(event) => {
                  setResourceEditor({
                    ...resourceEditor,
                    value: event.target.value,
                  });
                  setEditorDiagnostic("");
                }}
              />
            </label>
            {editorDiagnostic && (
              <p className="editor-diagnostic">{editorDiagnostic}</p>
            )}
            <p className="form-help">
              保存后将通过 Gost API 立即
              {resourceEditor.originalName ? "替换" : "创建"}
              该对象；请确保包含唯一的 <code>name</code> 字段。
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                disabled={isSaving}
                onClick={() => setResourceEditor(null)}
              >
                取消
              </button>
              <button className="primary" disabled={isSaving} type="submit">
                {isSaving ? "保存中…" : "保存并立即生效"}
              </button>
            </div>
          </form>
        </div>
      )}
      {notice && <div className="toast">{notice}</div>}
    </main>
  );
}
export default App;
