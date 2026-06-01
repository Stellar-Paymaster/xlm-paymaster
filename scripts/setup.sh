#!/usr/bin/env bash
# =============================================================================
# scripts/setup.sh — One-command local dev setup for Fluid
#
# Usage:
#   chmod +x scripts/setup.sh && ./scripts/setup.sh
#
# What it does:
#   1. Checks required tools (Node, npm, Rust, Docker, docker compose)
#   2. Copies .env.example → .env if .env does not exist
#   3. Starts Postgres, Redis, and stellar-quickstart via docker compose
#   4. Installs npm dependencies
#   5. Runs Prisma migrations
#   6. Starts all dev servers in parallel
# =============================================================================

set -euo pipefail

# ── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

info()    { echo -e "${CYAN}[setup]${RESET} $*"; }
success() { echo -e "${GREEN}[setup]${RESET} $*"; }
warn()    { echo -e "${YELLOW}[setup]${RESET} $*"; }
error()   { echo -e "${RED}[setup] ERROR:${RESET} $*" >&2; }
die()     { error "$*"; exit 1; }

# ── 1. Prerequisite checks ────────────────────────────────────────────────────
info "${BOLD}Checking required tools...${RESET}"

check_tool() {
  local cmd="$1" label="$2" hint="$3"
  if ! command -v "$cmd" &>/dev/null; then
    die "'$label' not found. $hint"
  fi
  success "$label found: $(command -v "$cmd")"
}

check_tool node  "Node.js" "Install from https://nodejs.org"
check_tool npm   "npm"     "Comes with Node.js"
check_tool cargo "Rust"    "Install from https://rustup.rs"
check_tool docker "Docker" "Install from https://docs.docker.com/get-docker/"

# docker compose (v2 plugin) or docker-compose (v1 standalone)
if docker compose version &>/dev/null 2>&1; then
  COMPOSE="docker compose"
elif command -v docker-compose &>/dev/null; then
  COMPOSE="docker-compose"
else
  die "docker compose not found. Install Docker Desktop or the Compose plugin."
fi
success "Docker Compose found: $COMPOSE"

# ── 2. Environment file ───────────────────────────────────────────────────────
info "${BOLD}Setting up environment...${RESET}"

if [ ! -f .env ]; then
  cp .env.example .env
  success "Copied .env.example → .env"
  warn "Review .env and fill in any required secrets before continuing."
else
  info ".env already exists — skipping copy."
fi

# ── 3. Start infrastructure services ─────────────────────────────────────────
info "${BOLD}Starting infrastructure (Postgres, Redis, Stellar quickstart)...${RESET}"

$COMPOSE up -d postgres redis stellar-quickstart

info "Waiting for Postgres to be healthy..."
until $COMPOSE exec -T postgres pg_isready -U "${POSTGRES_USER:-fluid}" -d "${POSTGRES_DB:-fluid_db}" &>/dev/null; do
  sleep 2
done
success "Postgres is ready."

info "Waiting for Horizon (stellar-quickstart) to be healthy..."
until curl -sf http://localhost:8000/health &>/dev/null; do
  sleep 3
done
success "Horizon is ready at http://localhost:8000"

# ── 4. Install Node dependencies ──────────────────────────────────────────────
info "${BOLD}Installing Node dependencies...${RESET}"
npm install
success "npm install complete."

# ── 5. Prisma migrations ──────────────────────────────────────────────────────
info "${BOLD}Running Prisma migrations...${RESET}"
if [ -f server/package.json ] && grep -q '"prisma"' server/package.json 2>/dev/null; then
  (cd server && npx prisma migrate deploy)
  success "Prisma migrations applied."
else
  warn "No Prisma config found in server/ — skipping migrations."
fi

# ── 6. Start dev servers in parallel ─────────────────────────────────────────
info "${BOLD}Starting all dev servers in parallel...${RESET}"
echo ""
echo -e "${BOLD}  Servers starting:${RESET}"
echo -e "  • Node API      → http://localhost:3001"
echo -e "  • Rust engine   → http://localhost:3000"
echo -e "  • Admin dashboard → http://localhost:3002"
echo -e "  • Horizon       → http://localhost:8000"
echo ""
warn "Press Ctrl+C to stop all servers."
echo ""

# Run each dev server in the background, tee output with a prefix
run_server() {
  local label="$1"; shift
  "$@" 2>&1 | sed "s/^/[${label}] /" &
}

run_server "rust"      cargo run --manifest-path fluid-server/Cargo.toml
run_server "node-api"  npm run --prefix server dev
run_server "dashboard" npm run --prefix admin-dashboard dev

# Wait for all background jobs; exit cleanly on Ctrl+C
trap 'echo ""; info "Shutting down dev servers..."; kill 0' INT TERM
wait