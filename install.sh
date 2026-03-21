#!/usr/bin/env bash
# ============================================================
#  DataServer — Interactive Installer
#  Usage: sudo bash install.sh
# ============================================================
set -euo pipefail

REPO_URL="https://github.com/janibert1/DataServer.git"
VERSION="1.0.0"

# ── Colours ─────────────────────────────────────────────────
RED='\033[0;31m'; GRN='\033[0;32m'; YLW='\033[1;33m'
BLU='\033[0;34m'; CYN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

info()    { echo -e "${BLU}[•]${NC} $*"; }
success() { echo -e "${GRN}[✓]${NC} $*"; }
warn()    { echo -e "${YLW}[!]${NC} $*"; }
die()     { echo -e "${RED}[✗]${NC} $*" >&2; exit 1; }

# ── Root check ───────────────────────────────────────────────
[[ $EUID -ne 0 ]] && die "Run as root: sudo bash install.sh"

# ── Terminal size check ──────────────────────────────────────
TERM_ROWS=$(tput lines 2>/dev/null || echo 24)
TERM_COLS=$(tput cols  2>/dev/null || echo 80)
[[ $TERM_ROWS -lt 20 || $TERM_COLS -lt 70 ]] && \
  die "Terminal too small. Please resize to at least 70×20 and retry."

T_HEIGHT=20
T_WIDTH=72

# ── OS detection ─────────────────────────────────────────────
detect_os() {
  [[ -f /etc/os-release ]] || die "Unsupported OS (no /etc/os-release)."
  # shellcheck source=/dev/null
  . /etc/os-release
  OS_ID="${ID}"
  OS_LIKE="${ID_LIKE:-$ID}"
}

is_debian() { echo "$OS_LIKE" | grep -qiE 'debian|ubuntu'; }
is_rhel()   { echo "$OS_LIKE" | grep -qiE 'rhel|centos|fedora'; }
is_arch()   { echo "$OS_LIKE" | grep -qiE 'arch'; }

# ── Dependency bootstrap ─────────────────────────────────────
bootstrap_deps() {
  info "Updating package index and installing base tools…"
  if is_debian; then
    apt-get update -qq
    DEBIAN_FRONTEND=noninteractive apt-get install -yq \
      whiptail curl git openssl ca-certificates gnupg lsb-release 2>/dev/null
  elif is_rhel; then
    yum install -yq newt curl git openssl 2>/dev/null || \
    dnf install -yq newt curl git openssl 2>/dev/null
  elif is_arch; then
    pacman -Sy --noconfirm libnewt curl git openssl 2>/dev/null
  fi
}

install_docker() {
  if command -v docker &>/dev/null && docker compose version &>/dev/null; then
    success "Docker & Compose already installed."
    return
  fi
  info "Installing Docker…"
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
  # Compose v2 plugin
  if ! docker compose version &>/dev/null; then
    if is_debian; then
      apt-get install -yq docker-compose-plugin 2>/dev/null || true
    fi
    if ! docker compose version &>/dev/null; then
      local dc_ver
      dc_ver=$(curl -fsSL https://api.github.com/repos/docker/compose/releases/latest \
               | grep '"tag_name"' | cut -d'"' -f4)
      mkdir -p /usr/local/lib/docker/cli-plugins
      curl -SL "https://github.com/docker/compose/releases/download/${dc_ver}/docker-compose-linux-$(uname -m)" \
           -o /usr/local/lib/docker/cli-plugins/docker-compose
      chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
    fi
  fi
  success "Docker $(docker --version | cut -d' ' -f3) installed."
}

gen_secret() { openssl rand -hex 32; }
gen_pass()   { openssl rand -base64 18 | tr -d '=/+'; }

# ── whiptail helpers ─────────────────────────────────────────
wt() { whiptail --title "DataServer Installer v${VERSION}" "$@" 3>&1 1>&2 2>&3; }

wt_msg()   { wt --msgbox      "$1" $T_HEIGHT $T_WIDTH; }
wt_yesno() { wt --yesno       "$1" $T_HEIGHT $T_WIDTH; }
wt_ok()    { wt --ok-button "Continue" --msgbox "$1" $T_HEIGHT $T_WIDTH; }

wt_input() {
  local prompt=$1 default=${2:-}
  wt --inputbox "$prompt" $T_HEIGHT $T_WIDTH "$default"
}
wt_pass() { wt --passwordbox "$1" $T_HEIGHT $T_WIDTH; }

wt_menu() {
  local prompt=$1; shift
  wt --menu "$prompt" $T_HEIGHT $T_WIDTH 10 "$@"
}

# ── Wizard steps ─────────────────────────────────────────────

step_welcome() {
  wt_ok "\
Welcome to the DataServer setup wizard!

DataServer is a private, invitation-only cloud storage
platform — your own self-hosted Google Drive.

This wizard will:
  • Install Docker and all dependencies
  • Configure storage, users, and access
  • Start all services automatically

Prerequisites:
  • Linux server (Ubuntu/Debian/RHEL/Arch)
  • Internet connection
  • ~4 GB free disk space (for Docker images)

Press Enter to begin."
}

step_install_dir() {
  INSTALL_DIR=$(wt_input \
    "Where should DataServer be installed?\n\n(Will be created if it doesn't exist)" \
    "/opt/dataserver")
  [[ -z "$INSTALL_DIR" ]] && INSTALL_DIR="/opt/dataserver"
  mkdir -p "$INSTALL_DIR"
}

step_admin() {
  wt_ok "── Admin Account ──────────────────────────────\n\nSet up the first administrator account.\nYou can invite other users from the admin panel later."

  while true; do
    ADMIN_EMAIL=$(wt_input "Admin email address:" "admin@example.com")
    [[ "$ADMIN_EMAIL" =~ ^[^@]+@[^@]+\.[^@]+$ ]] && break
    wt_msg "Please enter a valid email address."
  done

  ADMIN_NAME=$(wt_input "Admin display name:" "Platform Admin")
  [[ -z "$ADMIN_NAME" ]] && ADMIN_NAME="Platform Admin"

  while true; do
    ADMIN_PASSWORD=$(wt_pass "Admin password:")
    local ADMIN_PASSWORD2
    ADMIN_PASSWORD2=$(wt_pass "Confirm admin password:")
    [[ "$ADMIN_PASSWORD" != "$ADMIN_PASSWORD2" ]] && { wt_msg "Passwords do not match."; continue; }
    [[ ${#ADMIN_PASSWORD} -lt 8 ]] && { wt_msg "Password must be at least 8 characters."; continue; }
    [[ "$ADMIN_PASSWORD" =~ [A-Z] ]] || { wt_msg "Password must contain at least one uppercase letter."; continue; }
    [[ "$ADMIN_PASSWORD" =~ [0-9] ]] || { wt_msg "Password must contain at least one number."; continue; }
    break
  done
}

step_storage_path() {
  STORAGE_CHOICE=$(wt_menu \
    "── File Storage Location ──────────────────────\n\nWhere should uploaded files be stored?" \
    "volume"  "Docker volume  (easiest, managed by Docker)" \
    "custom"  "Custom path    (external drive, NAS, specific disk)")

  STORAGE_PATH=""
  if [[ "$STORAGE_CHOICE" == "custom" ]]; then
    while true; do
      STORAGE_PATH=$(wt_input \
        "Enter the full path for file storage:\n\nExamples:\n  /mnt/usb/dataserver\n  /mnt/nas/files\n  /data/dataserver" \
        "/mnt/data/dataserver")
      [[ -n "$STORAGE_PATH" ]] && break
      wt_msg "Please enter a valid path."
    done
    if [[ ! -d "$STORAGE_PATH" ]]; then
      wt_yesno "Path '$STORAGE_PATH' does not exist.\n\nCreate it now?" && mkdir -p "$STORAGE_PATH" \
        || die "Storage path does not exist."
    fi
    # Check writability
    touch "$STORAGE_PATH/.ds_write_test" 2>/dev/null \
      || die "Cannot write to '$STORAGE_PATH'. Check permissions."
    rm -f "$STORAGE_PATH/.ds_write_test"
  fi
}

step_storage_limits() {
  wt_ok "── Storage Limits ─────────────────────────────\n\nConfigure how much disk space DataServer may use.\nSet to 0 for unlimited."

  while true; do
    TOTAL_QUOTA_GB=$(wt_input \
      "Total storage limit across ALL users (GB)\n\n0 = unlimited" "100")
    [[ "$TOTAL_QUOTA_GB" =~ ^[0-9]+$ ]] && break
    wt_msg "Please enter a whole number."
  done

  while true; do
    PER_USER_QUOTA_GB=$(wt_input \
      "Default storage allowance per user (GB)\n\n(Admins can adjust per-user later)" "10")
    [[ "$PER_USER_QUOTA_GB" =~ ^[0-9]+$ ]] && break
    wt_msg "Please enter a whole number."
  done

  while true; do
    MAX_FILE_GB=$(wt_input \
      "Maximum size for a single uploaded file (GB)" "2")
    [[ "$MAX_FILE_GB" =~ ^[0-9]+$ ]] && break
    wt_msg "Please enter a whole number."
  done

  PER_USER_QUOTA_BYTES=$(( PER_USER_QUOTA_GB * 1024 * 1024 * 1024 ))
  MAX_FILE_BYTES=$(( MAX_FILE_GB * 1024 * 1024 * 1024 ))
}

step_access_mode() {
  ACCESS_MODE=$(wt_menu \
"── Access Mode ────────────────────────────────\n\nHow will you access DataServer?\n(You can change this later by re-running the installer)" \
    "local"      "Local network only     — access via LAN IP, no internet" \
    "tailscale"  "Tailscale              — private HTTPS, access from anywhere" \
    "cloudflare" "Cloudflare Tunnel      — public HTTPS on your own domain" \
    "both"       "Tailscale + Cloudflare — private & public access")
}

step_local_config() {
  SERVER_IP=$(hostname -I | awk '{print $1}')

  FRONTEND_PORT=$(wt_input \
    "Local port for the web interface:\n\nThe app will be at http://${SERVER_IP}:<port>" "3005")
  [[ -z "$FRONTEND_PORT" ]] && FRONTEND_PORT="3005"

  LOCAL_URL="http://${SERVER_IP}:${FRONTEND_PORT}"

  if [[ "$ACCESS_MODE" == "local" ]]; then
    PUBLIC_URL="$LOCAL_URL"
    S3_PUBLIC_URL="http://${SERVER_IP}:9000"
    COOKIE_SECURE="false"
  fi
}

step_tailscale_config() {
  if [[ "$ACCESS_MODE" != "tailscale" && "$ACCESS_MODE" != "both" ]]; then return; fi

  wt_ok "── Tailscale Setup ────────────────────────────\n\
\n\
Tailscale gives you a private HTTPS URL accessible\n\
from anywhere without opening firewall ports.\n\
\n\
You'll need:\n\
  1. A free Tailscale account (tailscale.com)\n\
  2. An auth key from:\n\
     login.tailscale.com → Settings → Keys\n\
     → Generate auth key → check Reusable\n\
\n\
After install, you must also:\n\
  • Enable HTTPS certs in Tailscale DNS settings\n\
  • Add funnel permission to your ACL policy\n\
  (The installer will show you exactly what to do)"

  while true; do
    TS_AUTHKEY=$(wt_input "Tailscale auth key (tskey-auth-…):" "")
    [[ "$TS_AUTHKEY" =~ ^tskey- ]] && break
    wt_msg "Auth key should start with 'tskey-'. Please check and try again."
  done

  TS_HOSTNAME=$(wt_input \
    "Hostname for this machine in Tailscale:\n\n(This becomes part of your URL)" "dataserver")
  [[ -z "$TS_HOSTNAME" ]] && TS_HOSTNAME="dataserver"

  TS_TAILNET=$(wt_input \
    "Your tailnet name (e.g. tail1234.ts.net)\n\nFind it at login.tailscale.com/admin/machines\nLeave blank if unknown — you can update it later:" "")

  if [[ -n "$TS_TAILNET" ]]; then
    TS_FQDN="${TS_HOSTNAME}.${TS_TAILNET}"
  else
    TS_FQDN="${TS_HOSTNAME}.YOUR-TAILNET.ts.net"
    warn "Tailnet unknown — you'll need to update serve.json and .env after install."
  fi

  if [[ "$ACCESS_MODE" == "tailscale" ]]; then
    PUBLIC_URL="https://${TS_FQDN}"
    S3_PUBLIC_URL="https://${TS_FQDN}"
    COOKIE_SECURE="true"
  fi
}

step_cloudflare_config() {
  if [[ "$ACCESS_MODE" != "cloudflare" && "$ACCESS_MODE" != "both" ]]; then return; fi

  wt_ok "── Cloudflare Tunnel Setup ────────────────────\n\
\n\
Cloudflare Tunnel makes DataServer publicly accessible\n\
on your own domain with HTTPS — no port forwarding needed.\n\
\n\
You'll need:\n\
  1. A domain on Cloudflare (free account works)\n\
  2. A tunnel token from:\n\
     dash.cloudflare.com → Zero Trust → Networks → Tunnels\n\
     → Create a tunnel → Docker → copy the token\n\
\n\
In the Cloudflare dashboard, set the tunnel route to:\n\
     http://frontend:80"

  while true; do
    CF_TOKEN=$(wt_input "Cloudflare tunnel token:" "")
    [[ -n "$CF_TOKEN" ]] && break
    wt_msg "Tunnel token is required."
  done

  while true; do
    CF_DOMAIN=$(wt_input \
      "Your public domain (e.g. files.yourdomain.com):" "")
    [[ -n "$CF_DOMAIN" ]] && break
    wt_msg "Domain is required."
  done

  if [[ "$ACCESS_MODE" == "cloudflare" ]]; then
    PUBLIC_URL="https://${CF_DOMAIN}"
    S3_PUBLIC_URL="https://${CF_DOMAIN}"
    COOKIE_SECURE="true"
  fi

  # both mode: Tailscale is primary, Cloudflare is secondary
  if [[ "$ACCESS_MODE" == "both" ]]; then
    PUBLIC_URL="https://${TS_FQDN}"
    S3_PUBLIC_URL="https://${TS_FQDN}"
    COOKIE_SECURE="true"
  fi
}

step_google_oauth() {
  if ! wt_yesno "── Google OAuth (optional) ────────────────────\n\nAllow users to sign in with their Google account?\n\nYou'll need OAuth credentials from:\nconsole.cloud.google.com → APIs & Services → Credentials"; then
    GOOGLE_CLIENT_ID=""
    GOOGLE_CLIENT_SECRET=""
    return
  fi

  wt_ok "In Google Cloud Console:\n\n\
1. Create or select a project\n\
2. APIs & Services → OAuth consent screen → External\n\
3. APIs & Services → Credentials\n\
   → Create Credentials → OAuth 2.0 Client ID\n\
   → Web application\n\
4. Authorized redirect URI:\n\
   ${PUBLIC_URL}/api/auth/google/callback\n\
5. Copy the Client ID and Secret"

  GOOGLE_CLIENT_ID=$(wt_input "Google Client ID:" "")
  GOOGLE_CLIENT_SECRET=$(wt_input "Google Client Secret:" "")
}

step_smtp() {
  if ! wt_yesno "── Email / SMTP (optional) ────────────────────\n\nSet up email for:\n  • Invitation emails\n  • Password reset\n  • Security alerts\n\nConfigure now?"; then
    SMTP_HOST="localhost"; SMTP_PORT="587"; SMTP_SECURE="false"
    SMTP_USER=""; SMTP_PASS=""
    SMTP_FROM="DataServer <noreply@dataserver.app>"
    return
  fi

  SMTP_HOST=$(wt_input "SMTP host:" "smtp.gmail.com")
  SMTP_PORT=$(wt_input "SMTP port:" "587")
  SMTP_USER=$(wt_input "SMTP username / email:" "")
  SMTP_PASS=$(wt_pass "SMTP password:")
  SMTP_FROM=$(wt_input "From address:" "DataServer <noreply@${ADMIN_EMAIL#*@}>")
  SMTP_SECURE="false"
  [[ "$SMTP_PORT" == "465" ]] && SMTP_SECURE="true"
}

step_confirm() {
  local storage_label="Docker volume (managed)"
  [[ -n "$STORAGE_PATH" ]] && storage_label="$STORAGE_PATH"

  local quota_label="${TOTAL_QUOTA_GB} GB total  |  ${PER_USER_QUOTA_GB} GB/user  |  ${MAX_FILE_GB} GB max file"
  [[ "$TOTAL_QUOTA_GB" == "0" ]] && quota_label="Unlimited total  |  ${PER_USER_QUOTA_GB} GB/user  |  ${MAX_FILE_GB} GB max file"

  wt_yesno "\
── Installation Summary ───────────────────────

Install directory : ${INSTALL_DIR}
Admin email       : ${ADMIN_EMAIL}
Admin name        : ${ADMIN_NAME}

Access mode       : ${ACCESS_MODE}
App URL           : ${PUBLIC_URL}

File storage      : ${storage_label}
Storage limits    : ${quota_label}

Google OAuth      : ${GOOGLE_CLIENT_ID:+enabled}${GOOGLE_CLIENT_ID:-disabled}
Email (SMTP)      : ${SMTP_USER:+${SMTP_HOST}}${SMTP_USER:-disabled}

──────────────────────────────────────────────
Proceed with installation?" || die "Installation cancelled by user."
}

# ── Config generation ────────────────────────────────────────

generate_env() {
  info "Generating .env…"

  SESSION_SECRET=$(gen_secret)
  JWT_SECRET=$(gen_secret)
  DB_PASSWORD=$(gen_pass)
  REDIS_PASSWORD=$(gen_pass)
  MINIO_ROOT_USER="ds_minio"
  MINIO_ROOT_PASSWORD=$(gen_pass)

  cat > "$INSTALL_DIR/.env" <<EOF
# Generated by DataServer Installer $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# ─────────────────────────────────────────────

NODE_ENV=production
PORT=4000
FRONTEND_URL=${PUBLIC_URL}
FRONTEND_API_URL=/api
COOKIE_SECURE=${COOKIE_SECURE}

# ─── Database ────────────────────────────────
POSTGRES_USER=dataserver
POSTGRES_PASSWORD=${DB_PASSWORD}
POSTGRES_DB=dataserver
DATABASE_URL=postgresql://dataserver:${DB_PASSWORD}@postgres:5432/dataserver

# ─── Redis ───────────────────────────────────
REDIS_PASSWORD=${REDIS_PASSWORD}
REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379

# ─── Session & JWT ───────────────────────────
SESSION_SECRET=${SESSION_SECRET}
JWT_SECRET=${JWT_SECRET}
SESSION_MAX_AGE_MS=86400000

# ─── Google OAuth ────────────────────────────
GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID:-}
GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET:-}
GOOGLE_CALLBACK_URL=${PUBLIC_URL}/api/auth/google/callback

# ─── S3 / MinIO ──────────────────────────────
S3_ENDPOINT=http://minio:9000
S3_PUBLIC_URL=${S3_PUBLIC_URL}
S3_ACCESS_KEY=${MINIO_ROOT_USER}
S3_SECRET_KEY=${MINIO_ROOT_PASSWORD}
S3_BUCKET=dataserver-files
S3_REGION=us-east-1
S3_FORCE_PATH_STYLE=true
MINIO_ROOT_USER=${MINIO_ROOT_USER}
MINIO_ROOT_PASSWORD=${MINIO_ROOT_PASSWORD}

# ─── Email ───────────────────────────────────
SMTP_HOST=${SMTP_HOST}
SMTP_PORT=${SMTP_PORT}
SMTP_SECURE=${SMTP_SECURE}
SMTP_USER=${SMTP_USER:-}
SMTP_PASS=${SMTP_PASS:-}
SMTP_FROM=${SMTP_FROM}

# ─── ClamAV ──────────────────────────────────
CLAMAV_HOST=clamav
CLAMAV_PORT=3310

# ─── Storage limits ──────────────────────────
DEFAULT_QUOTA_BYTES=${PER_USER_QUOTA_BYTES}
MAX_FILE_SIZE_BYTES=${MAX_FILE_BYTES}

# ─── Rate limiting ───────────────────────────
RATE_LIMIT_AUTH_MAX=10
RATE_LIMIT_AUTH_WINDOW_MS=900000
RATE_LIMIT_API_MAX=200
RATE_LIMIT_API_WINDOW_MS=60000
RATE_LIMIT_UPLOAD_MAX=20
RATE_LIMIT_UPLOAD_WINDOW_MS=3600000

# ─── Admin bootstrap ─────────────────────────
ADMIN_EMAIL=${ADMIN_EMAIL}
ADMIN_PASSWORD=${ADMIN_PASSWORD}
ADMIN_DISPLAY_NAME=${ADMIN_NAME}
EOF

  [[ "${ACCESS_MODE}" == "tailscale" || "${ACCESS_MODE}" == "both" ]] && \
    echo "TAILSCALE_AUTHKEY=${TS_AUTHKEY}" >> "$INSTALL_DIR/.env"

  [[ "${ACCESS_MODE}" == "cloudflare" || "${ACCESS_MODE}" == "both" ]] && \
    echo "CLOUDFLARE_TOKEN=${CF_TOKEN}" >> "$INSTALL_DIR/.env"

  chmod 600 "$INSTALL_DIR/.env"
  success ".env generated."
}

generate_compose() {
  info "Generating docker-compose.yml…"

  # MinIO volume entry
  local minio_vol
  if [[ -n "$STORAGE_PATH" ]]; then
    minio_vol="      - ${STORAGE_PATH}:/data"
  else
    minio_vol="      - minio_data:/data"
  fi

  cat > "$INSTALL_DIR/docker-compose.yml" <<EOF
services:

  postgres:
    image: postgres:16-alpine
    container_name: dataserver_postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: \${POSTGRES_USER:-dataserver}
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD}
      POSTGRES_DB: \${POSTGRES_DB:-dataserver}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U \${POSTGRES_USER:-dataserver}"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: dataserver_redis
    restart: unless-stopped
    command: redis-server --requirepass \${REDIS_PASSWORD} --appendonly yes
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "--no-auth-warning", "-a", "\${REDIS_PASSWORD}", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  minio:
    image: minio/minio:latest
    container_name: dataserver_minio
    restart: unless-stopped
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: \${MINIO_ROOT_USER}
      MINIO_ROOT_PASSWORD: \${MINIO_ROOT_PASSWORD}
    volumes:
${minio_vol}
    ports:
      - "9000:9000"
      - "9001:9001"
    healthcheck:
      test: ["CMD", "mc", "ready", "local"]
      interval: 30s
      timeout: 20s
      retries: 3

  clamav:
    image: clamav/clamav:latest
    container_name: dataserver_clamav
    restart: unless-stopped
    volumes:
      - clamav_data:/var/lib/clamav
    environment:
      CLAMAV_NO_FRESHCLAMD: "false"
      CLAMAV_NO_MILTERD: "true"

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: dataserver_backend
    restart: unless-stopped
    env_file: .env
    environment:
      NODE_ENV: production
      DATABASE_URL: postgresql://\${POSTGRES_USER:-dataserver}:\${POSTGRES_PASSWORD}@postgres:5432/\${POSTGRES_DB:-dataserver}
      REDIS_URL: redis://:\${REDIS_PASSWORD}@redis:6379
      S3_ENDPOINT: http://minio:9000
      CLAMAV_HOST: clamav
      CLAMAV_PORT: "3310"
      PORT: "4000"
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:4000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
      args:
        VITE_API_URL: /api
    container_name: dataserver_frontend
    restart: unless-stopped
    ports:
      - "${FRONTEND_PORT}:80"
    depends_on:
      - backend
EOF

  # ── Tailscale service ──────────────────────────────────────
  if [[ "$ACCESS_MODE" == "tailscale" || "$ACCESS_MODE" == "both" ]]; then
    mkdir -p "$INSTALL_DIR/tailscale"
    cat > "$INSTALL_DIR/tailscale/serve.json" <<SERVEJSON
{
  "TCP": {
    "443": {
      "HTTPS": true
    }
  },
  "Web": {
    "${TS_FQDN}:443": {
      "Handlers": {
        "/": {
          "Proxy": "http://frontend:80"
        }
      }
    }
  },
  "AllowFunnel": {
    "${TS_FQDN}:443": true
  }
}
SERVEJSON

    cat >> "$INSTALL_DIR/docker-compose.yml" <<EOF

  tailscale:
    image: tailscale/tailscale:latest
    container_name: dataserver_tailscale
    restart: unless-stopped
    hostname: ${TS_HOSTNAME}
    environment:
      TS_AUTHKEY: \${TAILSCALE_AUTHKEY}
      TS_SERVE_CONFIG: /config/serve.json
      TS_STATE_DIR: /var/lib/tailscale
    volumes:
      - tailscale_data:/var/lib/tailscale
      - ./tailscale:/config
      - /dev/net/tun:/dev/net/tun
    cap_add:
      - NET_ADMIN
      - SYS_MODULE
    depends_on:
      - frontend
EOF
  fi

  # ── Cloudflare service ─────────────────────────────────────
  if [[ "$ACCESS_MODE" == "cloudflare" || "$ACCESS_MODE" == "both" ]]; then
    cat >> "$INSTALL_DIR/docker-compose.yml" <<EOF

  cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: dataserver_cloudflared
    restart: unless-stopped
    command: tunnel --no-autoupdate run --token \${CLOUDFLARE_TOKEN}
    depends_on:
      - frontend
EOF
  fi

  # ── Volumes ────────────────────────────────────────────────
  printf '\nvolumes:\n'                           >> "$INSTALL_DIR/docker-compose.yml"
  printf '  postgres_data:\n'                     >> "$INSTALL_DIR/docker-compose.yml"
  printf '  redis_data:\n'                        >> "$INSTALL_DIR/docker-compose.yml"
  printf '  clamav_data:\n'                       >> "$INSTALL_DIR/docker-compose.yml"
  [[ -z "$STORAGE_PATH" ]] && printf '  minio_data:\n' >> "$INSTALL_DIR/docker-compose.yml"
  [[ "$ACCESS_MODE" == "tailscale" || "$ACCESS_MODE" == "both" ]] && \
    printf '  tailscale_data:\n'                  >> "$INSTALL_DIR/docker-compose.yml"

  success "docker-compose.yml generated."
}

# ── Build & start ────────────────────────────────────────────

build_and_start() {
  cd "$INSTALL_DIR"
  info "Pulling Docker images (this may take a few minutes)…"
  docker compose pull --quiet 2>/dev/null || true
  info "Building DataServer images…"
  docker compose build --quiet
  info "Starting all services…"
  docker compose up -d
  success "Services started."
}

wait_for_backend() {
  info "Waiting for backend to become healthy…"
  local i=0
  while ! docker exec dataserver_backend \
        curl -sf http://localhost:4000/api/health &>/dev/null; do
    i=$(( i + 1 ))
    [[ $i -gt 36 ]] && die "Backend did not start after 3 minutes.\nRun: docker compose logs backend"
    sleep 5
  done
  success "Backend is ready."
}

setup_database() {
  info "Initialising database schema…"
  docker exec dataserver_backend npx prisma db push --skip-generate --accept-data-loss 2>/dev/null
  info "Seeding admin account…"
  docker exec dataserver_backend node dist/seed.js 2>/dev/null || \
    warn "Seed may have already run — that's fine."
  success "Database ready."
}

setup_minio_quota() {
  [[ "$TOTAL_QUOTA_GB" -eq 0 ]] && return
  info "Setting MinIO total storage quota (${TOTAL_QUOTA_GB} GB)…"
  # Give MinIO a moment after bucket creation by backend
  sleep 5
  docker exec dataserver_minio \
    mc alias set local http://localhost:9000 \
      "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" --quiet 2>/dev/null || true
  docker exec dataserver_minio \
    mc quota set "local/dataserver-files" --size "${TOTAL_QUOTA_GB}GiB" 2>/dev/null \
    && success "MinIO quota set to ${TOTAL_QUOTA_GB} GB." \
    || warn "Could not set MinIO quota automatically.\n       Set it manually in the MinIO console (port 9001)."
}

# ── Completion screen ────────────────────────────────────────

show_done() {
  local server_ip
  server_ip=$(hostname -I | awk '{print $1}')

  local ts_notes=""
  if [[ "$ACCESS_MODE" == "tailscale" || "$ACCESS_MODE" == "both" ]]; then
    ts_notes="\n\
── Tailscale: remaining steps ─────────────\n\
1. login.tailscale.com/admin/dns\n\
   → Enable HTTPS Certificates\n\
\n\
2. login.tailscale.com/admin/acls  → add:\n\
   \"nodeAttrs\": [{\"target\":[\"autogroup:member\"],\n\
     \"attr\":[\"funnel\"]}]\n"
  fi

  local cf_notes=""
  if [[ "$ACCESS_MODE" == "cloudflare" || "$ACCESS_MODE" == "both" ]]; then
    cf_notes="\n\
── Cloudflare: remaining steps ────────────\n\
In dash.cloudflare.com → Zero Trust → Tunnels\n\
→ your tunnel → Public Hostname:\n\
  Domain: ${CF_DOMAIN}\n\
  Service: http://frontend:80\n"
  fi

  wt_ok "\
✓ DataServer is running!\n\
\n\
── Access ─────────────────────────────────\n\
App URL      : ${PUBLIC_URL}\n\
LAN fallback : http://${server_ip}:${FRONTEND_PORT}\n\
MinIO console: http://${server_ip}:9001\n\
\n\
── Admin login ────────────────────────────\n\
Email    : ${ADMIN_EMAIL}\n\
Password : (as entered during setup)\n\
${ts_notes}${cf_notes}\n\
── Useful commands ────────────────────────\n\
Logs  : cd ${INSTALL_DIR} && docker compose logs -f\n\
Stop  : docker compose down\n\
Update: git pull && docker compose build && docker compose up -d"

  echo ""
  echo -e "${GRN}${BOLD}╔══════════════════════════════════════╗${NC}"
  echo -e "${GRN}${BOLD}║   DataServer installation complete!  ║${NC}"
  echo -e "${GRN}${BOLD}╚══════════════════════════════════════╝${NC}"
  echo ""
  echo -e "  App URL : ${BOLD}${PUBLIC_URL}${NC}"
  echo -e "  Admin   : ${BOLD}${ADMIN_EMAIL}${NC}"
  echo ""
}

# ── Main ─────────────────────────────────────────────────────

main() {
  clear
  detect_os
  bootstrap_deps
  install_docker

  # ── Run wizard ──
  step_welcome
  step_install_dir
  step_admin
  step_storage_path
  step_storage_limits
  step_access_mode

  # Always configure local port (used for LAN fallback and docker port mapping)
  step_local_config

  step_tailscale_config
  step_cloudflare_config
  step_google_oauth
  step_smtp
  step_confirm

  # ── Install ──
  info "Cloning DataServer…"
  if [[ -d "$INSTALL_DIR/.git" ]]; then
    git -C "$INSTALL_DIR" pull --quiet
  else
    git clone --quiet "$REPO_URL" "$INSTALL_DIR"
  fi

  generate_env
  generate_compose
  build_and_start
  wait_for_backend
  setup_database
  setup_minio_quota
  show_done
}

main "$@"
