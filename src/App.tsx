import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'

type ServerStatus = 'online' | 'offline' | 'unknown'

type GostServer = {
  id: string
  name: string
  url: string
  username: string
  password: string
  group: string
  status: ServerStatus
  checkedAt?: string
}

const storageKey = 'gost-fleet-servers'

const demoServers: GostServer[] = [
  { id: 'hk-01', name: '香港 · 核心节点', url: 'https://hk-gost.example.com:18080', username: 'admin', password: '', group: '生产环境', status: 'online', checkedAt: '刚刚' },
  { id: 'sg-01', name: '新加坡 · 边缘节点', url: 'https://sg-gost.example.com:18080', username: 'admin', password: '', group: '生产环境', status: 'unknown' },
  { id: 'test-01', name: '测试服务器', url: 'http://127.0.0.1:18080', username: '', password: '', group: '开发环境', status: 'offline', checkedAt: '12 分钟前' },
]

const emptyServer = (): GostServer => ({
  id: crypto.randomUUID(), name: '', url: 'http://', username: '', password: '', group: '未分组', status: 'unknown',
})

function loadServers(): GostServer[] {
  try {
    const saved = localStorage.getItem(storageKey)
    return saved ? JSON.parse(saved) : demoServers
  } catch {
    return demoServers
  }
}

function App() {
  const [servers, setServers] = useState<GostServer[]>(loadServers)
  const [activeId, setActiveId] = useState<string>(servers[0]?.id ?? '')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [editing, setEditing] = useState<GostServer | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [notice, setNotice] = useState('')
  const [isChecking, setIsChecking] = useState(false)

  useEffect(() => localStorage.setItem(storageKey, JSON.stringify(servers)), [servers])

  const activeServer = servers.find((server) => server.id === activeId) ?? servers[0]
  const groups = useMemo(() => [...new Set(servers.map((server) => server.group))], [servers])
  const onlineCount = servers.filter((server) => server.status === 'online').length

  const updateServers = (updater: (items: GostServer[]) => GostServer[]) => setServers((items) => updater(items))

  const showNotice = (message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 3200)
  }

  const testConnection = async (server: GostServer) => {
    const headers = new Headers()
    if (server.username || server.password) headers.set('Authorization', `Basic ${btoa(`${server.username}:${server.password}`)}`)
    try {
      const response = await fetch(`${server.url.replace(/\/$/, '')}/config`, { headers, signal: AbortSignal.timeout(8000) })
      const status: ServerStatus = response.ok ? 'online' : 'offline'
      updateServers((items) => items.map((item) => item.id === server.id ? { ...item, status, checkedAt: '刚刚' } : item))
      return status
    } catch {
      updateServers((items) => items.map((item) => item.id === server.id ? { ...item, status: 'offline', checkedAt: '刚刚' } : item))
      return 'offline' as ServerStatus
    }
  }

  const checkSelected = async () => {
    const targets = servers.filter((server) => selectedIds.length ? selectedIds.includes(server.id) : true)
    if (!targets.length) return
    setIsChecking(true)
    const result = await Promise.all(targets.map(testConnection))
    setIsChecking(false)
    showNotice(`健康检查完成：${result.filter((status) => status === 'online').length}/${targets.length} 台可连接`)
  }

  const saveServer = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editing || !editing.name.trim() || !editing.url.match(/^https?:\/\//)) {
      showNotice('请填写服务器名称和有效的 API URL')
      return
    }
    updateServers((items) => isNew ? [...items, editing] : items.map((item) => item.id === editing.id ? editing : item))
    setActiveId(editing.id)
    setEditing(null)
    showNotice(isNew ? '服务器已添加到本地服务器库' : '服务器配置已保存')
  }

  const removeServer = (id: string) => {
    updateServers((items) => items.filter((item) => item.id !== id))
    setSelectedIds((items) => items.filter((item) => item !== id))
    if (activeId === id) setActiveId(servers.find((item) => item.id !== id)?.id ?? '')
    showNotice('已移除服务器配置')
  }

  const toggleSelected = (id: string) => setSelectedIds((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id])

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">G</span><span>Gost Fleet</span></div>
        <button className="add-server" onClick={() => { setIsNew(true); setEditing(emptyServer()) }}><span>＋</span> 添加服务器</button>
        <div className="sidebar-label">服务器库 <span>{servers.length}</span></div>
        <nav className="server-nav">
          {groups.map((group) => (
            <section key={group} className="server-group">
              <div className="group-name">{group}</div>
              {servers.filter((server) => server.group === group).map((server) => (
                <button className={`server-link ${activeId === server.id ? 'active' : ''}`} key={server.id} onClick={() => setActiveId(server.id)}>
                  <i className={`status-dot ${server.status}`}></i><span>{server.name}</span><small>•••</small>
                </button>
              ))}
            </section>
          ))}
        </nav>
        <div className="sidebar-foot"><span className="lock">⌁</span><div><strong>本地服务器库</strong><small>连接信息仅保存于此浏览器</small></div></div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div className="crumb">服务器库 <span>/</span> <strong>{activeServer?.name || '未选择服务器'}</strong></div>
          <div className="top-actions"><button className="icon-button" title="通知">♧</button><div className="avatar">A</div></div>
        </header>
        <div className="page">
          <section className="hero-row">
            <div><div className="eyebrow">GOST API 管理</div><h1>{activeServer?.name || '开始管理你的 Gost'}</h1><p>集中保存连接档案，一键切换并批量检查多个 Gost 服务器。</p></div>
            <div className="hero-actions"><button className="secondary" onClick={() => activeServer && testConnection(activeServer).then((status) => showNotice(status === 'online' ? '连接成功' : '无法连接，请检查 API 地址、认证和跨域设置'))}>测试连接</button><button className="primary" onClick={() => { if (activeServer) { setIsNew(false); setEditing({ ...activeServer }) } }}>编辑服务器</button></div>
          </section>

          {activeServer && <section className="connection-card">
            <div className="connection-icon">⌘</div><div className="connection-details"><div className="connection-title"><h2>API 连接</h2><span className={`badge ${activeServer.status}`}>{activeServer.status === 'online' ? '在线' : activeServer.status === 'offline' ? '离线' : '未检测'}</span></div><code>{activeServer.url}</code><p>认证：{activeServer.username ? `Basic Auth · ${activeServer.username}` : '未配置认证'}</p></div>
            <button className="connect-button" onClick={() => activeServer && testConnection(activeServer).then((status) => showNotice(status === 'online' ? '已连通 Gost API' : '连接失败'))}>连接</button>
          </section>}

          <section className="summary-grid">
            <div className="metric"><span>服务器总数</span><strong>{servers.length}</strong><small>已保存的连接档案</small></div>
            <div className="metric"><span>当前在线</span><strong className="green">{onlineCount}</strong><small>基于最近一次检测</small></div>
            <div className="metric"><span>待检测</span><strong>{servers.filter((server) => server.status === 'unknown').length}</strong><small>尚未执行连接检查</small></div>
          </section>

          <section className="fleet-section">
            <div className="section-heading"><div><h2>批量管理</h2><p>勾选服务器后执行相同操作，也可直接从左侧快速切换。</p></div><button className="secondary" disabled={isChecking} onClick={checkSelected}>{isChecking ? '检测中…' : `检查${selectedIds.length ? `已选 ${selectedIds.length} 台` : '全部服务器'}`}</button></div>
            <div className="table-wrap"><table><thead><tr><th><input aria-label="选择所有服务器" type="checkbox" checked={servers.length > 0 && selectedIds.length === servers.length} onChange={() => setSelectedIds(selectedIds.length === servers.length ? [] : servers.map((server) => server.id))} /></th><th>服务器</th><th>API 地址</th><th>状态</th><th>最近检测</th><th></th></tr></thead><tbody>
              {servers.map((server) => <tr key={server.id}><td><input aria-label={`选择 ${server.name}`} type="checkbox" checked={selectedIds.includes(server.id)} onChange={() => toggleSelected(server.id)} /></td><td><button className="name-button" onClick={() => setActiveId(server.id)}><i className={`status-dot ${server.status}`}></i>{server.name}<small>{server.group}</small></button></td><td><code>{server.url}</code></td><td><span className={`table-status ${server.status}`}>{server.status === 'online' ? '在线' : server.status === 'offline' ? '离线' : '未检测'}</span></td><td>{server.checkedAt || '—'}</td><td><div className="row-actions"><button onClick={() => testConnection(server)} title="测试连接">↻</button><button onClick={() => { setIsNew(false); setEditing({ ...server }) }} title="编辑">✎</button><button className="danger" onClick={() => removeServer(server.id)} title="删除">×</button></div></td></tr>)}
            </tbody></table></div>
          </section>
        </div>
      </section>

      {editing && <div className="modal-backdrop" role="presentation" onMouseDown={() => setEditing(null)}><form className="modal" onSubmit={saveServer} onMouseDown={(event) => event.stopPropagation()}><div className="modal-title"><div><span className="eyebrow">连接档案</span><h2>{isNew ? '添加 Gost 服务器' : '编辑服务器'}</h2></div><button type="button" className="close" onClick={() => setEditing(null)}>×</button></div><label>服务器名称<input autoFocus value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} placeholder="例如：香港 · 核心节点" /></label><label>Gost API URL<input value={editing.url} onChange={(event) => setEditing({ ...editing, url: event.target.value })} placeholder="https://host:18080" /></label><div className="form-grid"><label>用户名<input value={editing.username} onChange={(event) => setEditing({ ...editing, username: event.target.value })} placeholder="可留空" /></label><label>分组<input value={editing.group} onChange={(event) => setEditing({ ...editing, group: event.target.value })} placeholder="生产环境" /></label></div><label>密码<input type="password" value={editing.password} onChange={(event) => setEditing({ ...editing, password: event.target.value })} placeholder="可留空" /></label><p className="form-help">账号密码会随连接档案保存于当前浏览器。生产使用建议改为后端加密存储。</p><div className="modal-actions"><button type="button" className="secondary" onClick={() => setEditing(null)}>取消</button><button className="primary" type="submit">保存服务器</button></div></form></div>}
      {notice && <div className="toast">{notice}</div>}
    </main>
  )
}

export default App
