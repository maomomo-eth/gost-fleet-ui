#!/usr/bin/env bash
# 在 systemd Linux 主机上一键安装 GOST，并固定从 /etc/gost/gost.yaml 启动。
set -euo pipefail
umask 077

CONFIG_PATH="/etc/gost/gost.yaml"
API_PORT="18080"
API_USER="admin"
API_PASSWORD=""
FORCE="false"

usage() {
  cat <<'EOF'
用法：sudo bash install-gost.sh [选项]

选项：
  --api-port PORT      Gost API 端口，默认 18080
  --api-user USER      Gost API Basic Auth 用户名，默认 admin
  --api-password PASS  Gost API Basic Auth 密码；未提供时交互输入
  --force              覆盖已有 /etc/gost/gost.yaml
  -h, --help           显示帮助

示例：
  sudo bash install-gost.sh --api-port 18080 --api-user admin
EOF
}

die() { printf '错误：%s\n' "$*" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --api-port) API_PORT="${2:-}"; shift 2 ;;
    --api-user) API_USER="${2:-}"; shift 2 ;;
    --api-password) API_PASSWORD="${2:-}"; shift 2 ;;
    --force) FORCE="true"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "未知参数：$1" ;;
  esac
done

[[ "${EUID}" -eq 0 ]] || die "请使用 root 或 sudo 运行"
command -v curl >/dev/null || die "未找到 curl，请先安装 curl"
command -v tar >/dev/null || die "未找到 tar，请先安装 tar"
command -v sha256sum >/dev/null || die "未找到 sha256sum，请先安装 coreutils"
command -v systemctl >/dev/null || die "未检测到 systemd"
[[ "$API_PORT" =~ ^[0-9]+$ ]] && ((10#$API_PORT >= 1 && 10#$API_PORT <= 65535)) || die "API 端口必须在 1 到 65535 之间"
[[ -n "$API_USER" ]] || die "API 用户名不能为空"

if [[ -z "$API_PASSWORD" ]]; then
  read -r -s -p "请输入 Gost API 密码：" API_PASSWORD
  printf '\n'
fi
[[ -n "$API_PASSWORD" ]] || die "API 密码不能为空"
YAML_API_USER="$(printf '%s' "$API_USER" | sed "s/'/''/g")"
YAML_API_PASSWORD="$(printf '%s' "$API_PASSWORD" | sed "s/'/''/g")"

case "$(uname -m)" in
  x86_64|amd64) GOST_ARCH="amd64" ;;
  aarch64|arm64) GOST_ARCH="arm64" ;;
  armv7l|armv7) GOST_ARCH="armv7" ;;
  armv6l|armv6) GOST_ARCH="armv6" ;;
  i386|i686) GOST_ARCH="386" ;;
  riscv64) GOST_ARCH="riscv64" ;;
  s390x) GOST_ARCH="s390x" ;;
  loongarch64) GOST_ARCH="loong64" ;;
  *) die "不支持的 CPU 架构：$(uname -m)" ;;
esac

VERSION="$(curl -fsSL --retry 3 https://api.github.com/repos/go-gost/gost/releases/latest | sed -nE 's/^[[:space:]]*"tag_name"[[:space:]]*:[[:space:]]*"v?([^"]+)".*/\1/p' | head -n 1)"
[[ -n "$VERSION" ]] || die "无法获取 GOST 最新版本号"
ARCHIVE="gost_${VERSION}_linux_${GOST_ARCH}.tar.gz"
BASE_URL="https://github.com/go-gost/gost/releases/download/v${VERSION}"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

printf '下载 GOST v%s（linux/%s）…\n' "$VERSION" "$GOST_ARCH"
curl -fL --retry 3 -o "$WORK_DIR/$ARCHIVE" "$BASE_URL/$ARCHIVE"
curl -fL --retry 3 -o "$WORK_DIR/checksums.txt" "$BASE_URL/checksums.txt"
EXPECTED_SUM="$(grep -F "  $ARCHIVE" "$WORK_DIR/checksums.txt" | awk '{print $1}')"
[[ -n "$EXPECTED_SUM" ]] || die "未在官方 checksums.txt 中找到 $ARCHIVE"
ACTUAL_SUM="$(sha256sum "$WORK_DIR/$ARCHIVE" | awk '{print $1}')"
[[ "$EXPECTED_SUM" == "$ACTUAL_SUM" ]] || die "下载文件的 SHA-256 校验失败"

tar -xzf "$WORK_DIR/$ARCHIVE" -C "$WORK_DIR"
[[ -f "$WORK_DIR/gost" ]] || die "发布包中未找到 gost 可执行文件"
install -m 0755 "$WORK_DIR/gost" /usr/local/bin/gost

install -d -m 0750 /etc/gost
if [[ ! -f "$CONFIG_PATH" || "$FORCE" == "true" ]]; then
  cat > "$CONFIG_PATH" <<EOF
# 由 Gost Fleet 安装脚本创建。
# 在管理 UI 中选择“写入配置文件”后，保存路径请使用：$CONFIG_PATH
api:
  addr: ":$API_PORT"
  accesslog: true
  auth:
    username: '$YAML_API_USER'
    password: '$YAML_API_PASSWORD'
EOF
  chmod 600 "$CONFIG_PATH"
else
  printf '保留已有配置：%s（如需覆盖，请加 --force）\n' "$CONFIG_PATH"
fi

cat > /etc/systemd/system/gost.service <<'EOF'
[Unit]
Description=GOST Proxy Service
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/local/bin/gost -C /etc/gost/gost.yaml
Restart=always
RestartSec=5
LimitNOFILE=1048576

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now gost
systemctl --no-pager --full status gost
printf '\n安装完成：GOST v%s\n配置文件：%s\nAPI 端口：%s\n' "$VERSION" "$CONFIG_PATH" "$API_PORT"
printf '请在防火墙或安全组中按需放行 TCP %s，并使用 HTTPS / 反向代理保护公网管理页面。\n' "$API_PORT"
