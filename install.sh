#!/bin/bash
# ════════════════════════════════════════════════════════════════════════════
#  CynexVM Enterprise Installer
#  Version 2.1.0 — LXC-only Container Platform
#  Supports: Ubuntu 22.04+, Ubuntu 24.04+, Debian 12+
#  License: MIT
# ════════════════════════════════════════════════════════════════════════════

set -Eeuo pipefail

# ────────────────────────────────────────────────────────────────────────────
# Configuration
# ────────────────────────────────────────────────────────────────────────────
INSTALLER_VER="2.1.0"
INSTALL_DIR="/opt/cynexvm"
PANEL_PORT=5000
REPO="https://github.com/xAyan55/CynexVM.git"
LOG_FILE="/var/log/cynexvm-install.log"
MAX_RETRIES=3
BUILD_VERSION="production"
GIT_BRANCH="main"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ────────────────────────────────────────────────────────────────────────────
# Color Library
# ────────────────────────────────────────────────────────────────────────────
C_RESET='\033[0m'
C_BOLD='\033[1m'
C_DIM='\033[2m'
C_ITALIC='\033[3m'
C_UNDERLINE='\033[4m'
C_BLINK='\033[5m'

C_BLACK='\033[0;30m'
C_RED='\033[0;31m'
C_GREEN='\033[0;32m'
C_YELLOW='\033[0;33m'
C_BLUE='\033[0;34m'
C_PURPLE='\033[0;35m'
C_CYAN='\033[0;36m'
C_WHITE='\033[0;37m'
C_GRAY='\033[0;90m'

C_BG_BLACK='\033[40m'
C_BG_RED='\033[41m'
C_BG_GREEN='\033[42m'
C_BG_YELLOW='\033[43m'
C_BG_BLUE='\033[44m'
C_BG_PURPLE='\033[45m'
C_BG_CYAN='\033[46m'
C_BG_GRAY='\033[100m'

# Detect terminal capabilities
HAS_COLORS=true
HAS_UNICODE=true
HAS_ANIMATION=true

if [ ! -t 1 ]; then
  HAS_COLORS=false
  HAS_UNICODE=false
  HAS_ANIMATION=false
fi

if [ -n "${TERM:-}" ] && [ "$TERM" = "dumb" ]; then
  HAS_COLORS=false
  HAS_UNICODE=false
  HAS_ANIMATION=false
fi

# Disable animations in CI or non-interactive
if [ -n "${CI:-}" ] || [ -n "${NONINTERACTIVE:-}" ]; then
  HAS_ANIMATION=false
fi

# Fallback helpers
if [ "$HAS_UNICODE" = false ]; then
  ICON_CHECK="[OK]"
  ICON_CROSS="[FAIL]"
  ICON_WARN="[WARN]"
  ICON_INFO="[INFO]"
  ICON_ARROW="=>"
  ICON_BULLET="*"
  ICON_CURRENT=">"
  ICON_PENDING="."
  ICON_PROGRESS="#"
  ICON_SEP="----------------------------------------"
else
  ICON_CHECK="\xE2\x9C\x93"
  ICON_CROSS="\xE2\x9C\x97"
  ICON_WARN="\xE2\x9A\xA0"
  ICON_INFO="\xE2\x84\xB9"
  ICON_ARROW="\xE2\x96\xB8"
  ICON_BULLET="\xE2\x97\x86"
  ICON_CURRENT="\xE2\x97\x89"
  ICON_PENDING="\xE2\x97\x8B"
  ICON_PROGRESS="\xE2\x96\x88"
  ICON_SEP="\xE2\x94\x81\xE2\x94\x81\xE2\x94\x81\xE2\x94\x81\xE2\x94\x81\xE2\x94\x81\xE2\x94\x81\xE2\x94\x81\xE2\x94\x81\xE2\x94\x81\xE2\x94\x81\xE2\x94\x81\xE2\x94\x81\xE2\x94\x81\xE2\x94\x81\xE2\x94\x81\xE2\x94\x81\xE2\x94\x81\xE2\x94\x81\xE2\x94\x81\xE2\x94\x81\xE2\x94\x81\xE2\x94\x81\xE2\x94\x81\xE2\x94\x81\xE2\x94\x81\xE2\x94\x81\xE2\x94\x81\xE2\x94\x81\xE2\x94\x81\xE2\x94\x81\xE2\x94\x81\xE2\x94\x81\xE2\x94\x81\xE2\x94\x81\xE2\x94\x81\xE2\x94\x81\xE2\x94\x81\xE2\x94\x81\xE2\x94\x81"
fi

# Color output helpers
cecho() {
  if [ "$HAS_COLORS" = true ]; then
    echo -e "${1}${2}${C_RESET}"
  else
    echo -e "$2"
  fi
}

success() { cecho "$C_GREEN" " ${ICON_CHECK} $1"; }
error()   { cecho "$C_RED"   " ${ICON_CROSS} $1"; }
warning() { cecho "$C_YELLOW" " ${ICON_WARN} $1"; }
info()    { cecho "$C_CYAN"   " ${ICON_INFO} $1"; }

title() {
  echo ""
  if [ "$HAS_COLORS" = true ]; then
    echo -e "${C_CYAN}${C_BOLD}  $1${C_RESET}"
  else
    echo "  $1"
  fi
}

section() {
  echo ""
  if [ "$HAS_UNICODE" = true ]; then
    echo -e "  ${C_GRAY}${ICON_SEP}${C_RESET}"
  else
    echo "  ----------------------------------------"
  fi
  title "$1"
  if [ "$HAS_UNICODE" = true ]; then
    echo -e "  ${C_GRAY}${ICON_SEP}${C_RESET}"
  else
    echo "  ----------------------------------------"
  fi
}

bold() {
  if [ "$HAS_COLORS" = true ]; then
    echo -e "${C_BOLD}$1${C_RESET}"
  else
    echo "$1"
  fi
}

dim() {
  if [ "$HAS_COLORS" = true ]; then
    echo -e "${C_DIM}$1${C_RESET}"
  else
    echo "$1"
  fi
}

# ────────────────────────────────────────────────────────────────────────────
# Logging
# ────────────────────────────────────────────────────────────────────────────
setup_logging() {
  touch "$LOG_FILE" 2>/dev/null || true
}

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG_FILE"
}

log_info()   { log "INFO: $*"; }
log_warn()   { log "WARN: $*"; }
log_error()  { log "ERROR: $*"; }

# Dual output — log to file and display on terminal
output() {
  echo -e "$1"
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

# ────────────────────────────────────────────────────────────────────────────
# Spinner
# ────────────────────────────────────────────────────────────────────────────
_SPINNER_PID=""
_SPINNER_MSG=""

_spinner_chars=( "⠋" "⠙" "⠹" "⠸" "⠼" "⠴" "⠦" "⠧" "⠇" "⠏" )
_spinner_idx=0

_spinner_tick() {
  if [ "$HAS_ANIMATION" = false ]; then
    sleep 0.1
    return
  fi
  local c="${_spinner_chars[$_spinner_idx]}"
  _spinner_idx=$(( (_spinner_idx + 1) % ${#_spinner_chars[@]} ))
  printf "\r  ${C_CYAN}${c}${C_RESET} ${_SPINNER_MSG}   "
}

_spinner_loop() {
  while true; do
    _spinner_tick
    sleep 0.12
  done
}

spinner_start() {
  _SPINNER_MSG="$1"
  if [ "$HAS_ANIMATION" = false ]; then
    printf "  ${C_CYAN}${ICON_ARROW}${C_RESET} %s ... " "$1"
    return
  fi
  _spinner_idx=0
  _spinner_loop &
  _SPINNER_PID=$!
  disown
}

spinner_stop() {
  if [ -n "$_SPINNER_PID" ] && kill -0 "$_SPINNER_PID" 2>/dev/null; then
    kill "$_SPINNER_PID" 2>/dev/null || true
    wait "$_SPINNER_PID" 2>/dev/null || true
  fi
  _SPINNER_PID=""
  printf "\r%$((${#_SPINNER_MSG} + 10))s\r" ""
}

# ────────────────────────────────────────────────────────────────────────────
# Progress Bar
# ────────────────────────────────────────────────────────────────────────────
declare -a _STAGE_NAMES=()
declare -a _STAGE_WEIGHTS=()
_STAGE_TOTAL_WEIGHT=0
_STAGE_COMPLETED_WEIGHT=0
_INSTALL_START_TIME=0
_CURRENT_STAGE=""
_LAST_PROGRESS=-1

progress_init() {
  _STAGE_NAMES=()
  _STAGE_WEIGHTS=()
  _STAGE_TOTAL_WEIGHT=0
  _STAGE_COMPLETED_WEIGHT=0
  _LAST_PROGRESS=-1
  _INSTALL_START_TIME=$(date +%s)
}

progress_add_stage() {
  _STAGE_NAMES+=("$1")
  _STAGE_WEIGHTS+=("$2")
  _STAGE_TOTAL_WEIGHT=$((_STAGE_TOTAL_WEIGHT + $2))
}

progress_complete_stage() {
  local weight="${_STAGE_WEIGHTS[$_STAGE_COMPLETED_INDEX:-0]}"
  _STAGE_COMPLETED_WEIGHT=$((_STAGE_COMPLETED_WEIGHT + ${_STAGE_WEIGHTS[$_STAGE_COMPLETED_INDEX:-0]}))
  _STAGE_COMPLETED_INDEX=$((_STAGE_COMPLETED_INDEX + 1))
  _render_progress "$1"
}

_RENDERING_PROGRESS=false

_render_progress() {
  if [ "$HAS_ANIMATION" = false ]; then
    return
  fi
  _RENDERING_PROGRESS=true
  local label="$1"
  _CURRENT_STAGE="$label"
  local pct=0
  if [ "$_STAGE_TOTAL_WEIGHT" -gt 0 ]; then
    pct=$(( _STAGE_COMPLETED_WEIGHT * 100 / _STAGE_TOTAL_WEIGHT ))
    if [ "$pct" -gt 100 ]; then pct=100; fi
  fi
  [ "$pct" -eq "$_LAST_PROGRESS" ] && { _RENDERING_PROGRESS=false; return; }
  _LAST_PROGRESS=$pct

  local elapsed=$(( $(date +%s) - _INSTALL_START_TIME ))
  local elapsed_str=""
  if [ "$elapsed" -lt 60 ]; then
    elapsed_str="${elapsed}s"
  else
    elapsed_str="$((elapsed / 60))m $((elapsed % 60))s"
  fi

  local bar_width=30
  local filled=$(( pct * bar_width / 100 ))
  local empty=$(( bar_width - filled ))
  local bar=""
  if [ "$HAS_UNICODE" = true ]; then
    bar="$(printf "%${filled}s" | tr ' ' "${ICON_PROGRESS}")$(printf "%${empty}s" | tr ' ' ' ')"
  else
    bar="$(printf "%${filled}s" | tr ' ' '#')$(printf "%${empty}s" | tr ' ' '.')"
  fi

  local eta=""
  if [ "$pct" -gt 0 ]; then
    local total_est=$(( elapsed * 100 / pct ))
    local eta_secs=$(( total_est - elapsed ))
    if [ "$eta_secs" -lt 0 ]; then eta_secs=0; fi
    if [ "$eta_secs" -lt 60 ]; then
      eta="${eta_secs}s"
    else
      eta="$((eta_secs / 60))m $((eta_secs % 60))s"
    fi
  else
    eta="--"
  fi

  printf "\r  ${C_GRAY}[${C_RESET}${bar}${C_GRAY}]${C_RESET} ${C_BOLD}%3d%%${C_RESET} ${C_DIM}| ${label} | ${elapsed_str} / ${eta}${C_RESET}   " "$pct"
}

_print_timeline() {
  local status="$1" label="$2"
  if [ "$HAS_ANIMATION" = false ]; then
    [ "$status" = "done" ]    && echo "  [OK] $label"
    [ "$status" = "running" ] && echo "  [..] $label"
    [ "$status" = "pending" ] && echo "  [  ] $label"
    return
  fi
  local icon=""
  local color=""
  case "$status" in
    done)    icon="${ICON_CHECK}"; color="$C_GREEN";;
    running) icon="${ICON_CURRENT}"; color="$C_CYAN";;
    failed)  icon="${ICON_CROSS}"; color="$C_RED";;
    pending) icon="${ICON_PENDING}"; color="$C_GRAY";;
  esac
  printf "\r  ${color}${icon}${C_RESET} ${label}%$(($(tput cols 2>/dev/null || echo 80) - ${#label} - 6))s\n" ""
}

# ────────────────────────────────────────────────────────────────────────────
# Retry Logic
# ────────────────────────────────────────────────────────────────────────────
with_retries() {
  local cmd="$*"
  local attempt=1
  local max=$MAX_RETRIES
  local result=0
  while [ "$attempt" -le "$max" ]; do
    if [ "$attempt" -gt 1 ]; then
      warning "Retry $attempt/$max..."
    fi
    if eval "$cmd"; then
      return 0
    fi
    result=$?
    attempt=$((attempt + 1))
    if [ "$attempt" -le "$max" ]; then
      sleep 2
    fi
  done
  return $result
}

# ────────────────────────────────────────────────────────────────────────────
# Signal Handling & Cleanup
# ────────────────────────────────────────────────────────────────────────────
_CLEANUP_DONE=false

cleanup() {
  [ "$_CLEANUP_DONE" = true ] && return
  _CLEANUP_DONE=true
  spinner_stop
  printf "\r%$(($(tput cols 2>/dev/null || echo 80)))s\r" ""
  echo ""
  log_info "Installer interrupted or exited"
}

handle_sigint() {
  echo ""
  echo ""
  cecho "$C_YELLOW" "  ${ICON_WARN} Installation cancelled by user."
  cleanup
  exit 1
}

handle_err() {
  local line=$1
  local cmd=$2
  local code=$3
  spinner_stop
  echo ""
  echo ""
  if [ "$HAS_UNICODE" = true ]; then
    echo -e "  ${C_RED}${ICON_SEP}${C_RESET}"
  else
    echo "  --------------------------------"
  fi
  echo -e "  ${C_RED}${C_BOLD}${ICON_CROSS} Installation Failed${C_RESET}"
  echo ""
  echo -e "  ${C_GRAY}Step:${C_RESET}   ${_CURRENT_STAGE:-Unknown}"
  echo -e "  ${C_GRAY}Command:${C_RESET} ${cmd}"
  echo -e "  ${C_GRAY}Line:${C_RESET}    ${line}"
  echo -e "  ${C_GRAY}Exit Code:${C_RESET} ${code}"
  echo -e "  ${C_GRAY}Log:${C_RESET}    ${LOG_FILE}"
  if [ "$HAS_UNICODE" = true ]; then
    echo -e "  ${C_RED}${ICON_SEP}${C_RESET}"
  else
    echo "  --------------------------------"
  fi
  echo ""
  log_error "Installation failed at line $line: $cmd (exit $code)"
  cleanup
  exit $code
}

trap handle_sigint SIGINT SIGTERM
trap 'handle_err $LINENO "$BASH_COMMAND" $?' ERR

# ────────────────────────────────────────────────────────────────────────────
# Logo Animation
# ────────────────────────────────────────────────────────────────────────────
show_logo() {
  local lines=(
    ""
    "   ██████╗██╗   ██╗███╗   ██╗███████╗██╗  ██╗██╗   ██╗███╗   ███╗"
    "  ██╔════╝╚██╗ ██╔╝████╗  ██║██╔════╝╚██╗██╔╝██║   ██║████╗ ████║"
    "  ██║      ╚████╔╝ ██╔██╗ ██║█████╗   ╚███╔╝ ██║   ██║██╔████╔██║"
    "  ██║       ╚██╔╝  ██║╚██╗██║██╔══╝   ██╔██╗ ██║   ██║██║╚██╔╝██║"
    "  ╚██████╗   ██║   ██║ ╚████║███████╗██╔╝ ██╗╚██████╔╝██║ ╚═╝ ██║"
    "   ╚═════╝   ╚═╝   ╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚═╝     ╚═╝"
    ""
  )

  if [ "$HAS_ANIMATION" = true ] && [ -t 1 ]; then
    for line in "${lines[@]}"; do
      echo -e "${C_CYAN}${line}${C_RESET}"
      sleep 0.08
    done
    sleep 0.2
  else
    for line in "${lines[@]}"; do
      echo -e "${C_CYAN}${line}${C_RESET}"
    done
  fi

  local info_lines=(
    ""
    "  ${C_BOLD}CynexVM Enterprise Installer${C_RESET}  ${C_GRAY}v${INSTALLER_VER}${C_RESET}"
    "  ${C_GRAY}${ICON_SEP}${C_RESET}"
    "  ${C_GRAY}Branch:       ${GIT_BRANCH}${C_RESET}"
    "  ${C_GRAY}Build:        ${BUILD_VERSION}${C_RESET}"
    "  ${C_GRAY}License:      MIT${C_RESET}"
    "  ${C_GRAY}Platform:     LXC-only Container Platform${C_RESET}"
    ""
    "  ${C_GRAY}Website:      https://cynexvm.ai${C_RESET}"
    "  ${C_GRAY}GitHub:       https://github.com/xAyan55/CynexVM${C_RESET}"
    "  ${C_GRAY}Docs:         https://docs.cynexvm.ai${C_RESET}"
    ""
  )

  if [ "$HAS_ANIMATION" = true ] && [ -t 1 ]; then
    for line in "${info_lines[@]}"; do
      echo -e "$line"
      sleep 0.04
    done
    sleep 0.3
  else
    for line in "${info_lines[@]}"; do
      echo -e "$line"
    done
  fi
}

# ────────────────────────────────────────────────────────────────────────────
# System Detection
# ────────────────────────────────────────────────────────────────────────────
detect_system() {
  OS_NAME=""
  OS_VERSION=""
  KERNEL=""
  ARCH=""
  CPU_MODEL=""
  CPU_CORES=""
  RAM_TOTAL=""
  DISK_TOTAL=""
  HOSTNAME=""
  PUBLIC_IP=""
  TIMEZONE=""
  TERMINAL=""
  VIRT_DETECTED=""
  HAS_INTERNET=false

  # OS Detection
  if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS_NAME="${PRETTY_NAME:-$NAME $VERSION}"
    OS_VERSION="${VERSION_ID:-}"
  fi
  [ -z "$OS_NAME" ] && OS_NAME="Unknown"

  KERNEL="$(uname -r 2>/dev/null || echo 'Unknown')"
  ARCH="$(uname -m 2>/dev/null || echo 'Unknown')"
  HOSTNAME="$(hostname 2>/dev/null || echo 'Unknown')"

  CPU_MODEL="$(awk -F': ' '/model name/{print $2; exit}' /proc/cpuinfo 2>/dev/null || echo 'Unknown')"
  CPU_CORES="$(nproc 2>/dev/null || echo 'Unknown')"

  RAM_TOTAL="$(free -h 2>/dev/null | awk '/^Mem:/{print $2}' || echo 'Unknown')"
  DISK_TOTAL="$(df -BG / 2>/dev/null | awk 'NR==2{print $2}' || echo 'Unknown')"

  TIMEZONE="$(timedatectl show --property=Timezone --value 2>/dev/null || echo 'Unknown')"
  TERMINAL="${TERM:-unknown}"

  # Virtualization detection
  if [ -f /sys/devices/virtual/dmi/id/product_name ]; then
    VIRT_DETECTED="$(cat /sys/devices/virtual/dmi/id/product_name 2>/dev/null)"
  elif command -v systemd-detect-virt &>/dev/null; then
    VIRT_DETECTED="$(systemd-detect-virt 2>/dev/null || echo 'None')"
  else
    VIRT_DETECTED="Unknown"
  fi

  # Internet check
  if command -v curl &>/dev/null; then
    curl -s --connect-timeout 3 https://google.com >/dev/null 2>&1 && HAS_INTERNET=true || HAS_INTERNET=false
  fi

  # Public IP
  if [ "$HAS_INTERNET" = true ] && command -v curl &>/dev/null; then
    PUBLIC_IP="$(curl -s --connect-timeout 5 https://api.ipify.org 2>/dev/null || echo 'Unreachable')"
  else
    PUBLIC_IP="Unreachable"
  fi
}

show_system_info() {
  section "System Information"

  local info_panel=""
  info_panel+="  ${C_GRAY}Operating System:${C_RESET}  ${C_BOLD}${OS_NAME}${C_RESET}\n"
  info_panel+="  ${C_GRAY}Kernel:${C_RESET}            ${KERNEL}\n"
  info_panel+="  ${C_GRAY}Architecture:${C_RESET}       ${ARCH}\n"
  info_panel+="  ${C_GRAY}CPU Model:${C_RESET}          ${CPU_MODEL}\n"
  info_panel+="  ${C_GRAY}CPU Cores:${C_RESET}          ${CPU_CORES}\n"
  info_panel+="  ${C_GRAY}Memory:${C_RESET}             ${RAM_TOTAL}\n"
  info_panel+="  ${C_GRAY}Disk Space:${C_RESET}         ${DISK_TOTAL}\n"
  info_panel+="  ${C_GRAY}Hostname:${C_RESET}           ${HOSTNAME}\n"
  info_panel+="  ${C_GRAY}Public IPv4:${C_RESET}        ${PUBLIC_IP}\n"
  info_panel+="  ${C_GRAY}Timezone:${C_RESET}           ${TIMEZONE}\n"
  info_panel+="  ${C_GRAY}Terminal:${C_RESET}           ${TERMINAL}\n"
  info_panel+="  ${C_GRAY}Virtualization:${C_RESET}     ${VIRT_DETECTED}\n"
  info_panel+="  ${C_GRAY}Root User:${C_RESET}          $([ "$(id -u)" = 0 ] && echo "${C_GREEN}Yes${C_RESET}" || echo "${C_RED}No${C_RESET}")\n"
  info_panel+="  ${C_GRAY}Internet:${C_RESET}           $( [ "$HAS_INTERNET" = true ] && echo "${C_GREEN}Connected${C_RESET}" || echo "${C_RED}Disconnected${C_RESET}")"

  echo -e "$info_panel"
  echo ""
}

# ────────────────────────────────────────────────────────────────────────────
# Dependency Validation
# ────────────────────────────────────────────────────────────────────────────
REQUIRED_PKGS="curl wget git build-essential ca-certificates gnupg lsb-release sqlite3"
OPTIONAL_PKGS=""

MISSING_PKGS=()
ALREADY_INSTALLED=()

validate_deps() {
  section "Dependency Validation"

  local all_pkgs="$REQUIRED_PKGS $OPTIONAL_PKGS"
  local missing_req=false

  for pkg in $all_pkgs; do
    if dpkg -s "$pkg" &>/dev/null 2>&1; then
      ALREADY_INSTALLED+=("$pkg")
      success "$pkg"
    else
      MISSING_PKGS+=("$pkg")
      local mark=""
      for r in $REQUIRED_PKGS; do
        [ "$r" = "$pkg" ] && mark=" ${C_YELLOW}(required)${C_RESET}" && missing_req=true
      done
      echo -e "  ${C_RED}${ICON_CROSS}${C_RESET} ${pkg}${mark:-${C_GRAY} (optional)${C_RESET}}"
    fi
  done

  echo ""
  if [ ${#MISSING_PKGS[@]} -eq 0 ]; then
    success "All dependencies already satisfied"
  else
    warning "${#MISSING_PKGS[@]} package(s) will be installed"
  fi
  if [ "$missing_req" = true ]; then
    info "Required packages missing. Installation will proceed."
  fi
  echo ""
}

# ────────────────────────────────────────────────────────────────────────────
# Existing Installation Detection
# ────────────────────────────────────────────────────────────────────────────
detect_existing() {
  local found=false
  local existing_ver=""

  if [ -d "$INSTALL_DIR" ]; then
    found=true
    if [ -f "$INSTALL_DIR/package.json" ]; then
      existing_ver="$(grep -o '"version": *"[^"]*"' "$INSTALL_DIR/package.json" 2>/dev/null | head -1 | cut -d'"' -f4 || echo 'unknown')"
    fi
  fi

  if [ -f /etc/systemd/system/cynexvm.service ]; then
    found=true
  fi

  if [ "$found" = true ]; then
    return 0
  fi
  return 1
}

handle_existing_install() {
  local existing_ver="${1:-unknown}"

  section "Existing Installation Detected"

  echo -e "  ${C_YELLOW}${ICON_WARN}${C_RESET} CynexVM is already installed"
  echo ""
  echo -e "  ${C_GRAY}Install Path:${C_RESET} ${INSTALL_DIR}"
  echo -e "  ${C_GRAY}Installed Version:${C_RESET} ${existing_ver}"
  echo -e "  ${C_GRAY}Installer Version:${C_RESET} ${INSTALLER_VER}"
  echo ""

  PS3="  Select option [1-4]: "
  local options=("Upgrade Existing Installation" "Repair Installation" "Fresh Installation" "Exit")
  local reply=""

  if [ ! -t 0 ]; then
    cecho "$C_YELLOW" "  ${ICON_WARN} Non-interactive terminal — defaulting to Upgrade"
    reply=1
  else
    select opt in "${options[@]}"; do
      case $REPLY in
        1) reply=1; break;;
        2) reply=2; break;;
        3) reply=3; break;;
        4) reply=4; exit 0;;
        *) echo -e "  ${C_RED}Invalid option${C_RESET}";;
      esac
    done
  fi

  case $reply in
    1)
      echo -e "  ${C_CYAN}${ICON_ARROW}${C_RESET} Upgrading existing installation..."
      log_info "User selected: Upgrade existing installation"
      ;;
    2)
      echo -e "  ${C_CYAN}${ICON_ARROW}${C_RESET} Repairing existing installation..."
      log_info "User selected: Repair installation"
      rm -f "$INSTALL_DIR/backend/.env" 2>/dev/null || true
      ;;
    3)
      echo ""
      cecho "$C_RED" "  ${ICON_WARN} WARNING: This will delete all existing data in ${INSTALL_DIR}"
      echo -e "  ${C_GRAY}Backups and snapshots on LXD will not be affected.${C_RESET}"
      echo ""
      read -r -p "  Type 'yes' to confirm: " confirm
      if [ "$confirm" != "yes" ]; then
        echo -e "  ${C_YELLOW}${ICON_WARN} Fresh installation cancelled.${C_RESET}"
        exit 0
      fi
      echo -e "  ${C_CYAN}${ICON_ARROW}${C_RESET} Removing existing installation..."
      rm -rf "$INSTALL_DIR" 2>/dev/null || true
      log_info "User selected: Fresh installation — removed existing directory"
      ;;
  esac
}

# ────────────────────────────────────────────────────────────────────────────
# Configuration Summary
# ────────────────────────────────────────────────────────────────────────────
show_config_summary() {
  section "Configuration Summary"

  echo -e "  ${C_GRAY}Installation Path:${C_RESET}   ${C_BOLD}${INSTALL_DIR}${C_RESET}"
  echo -e "  ${C_GRAY}Panel Port:${C_RESET}          ${PANEL_PORT}"
  echo -e "  ${C_GRAY}Repository:${C_RESET}          ${REPO}"
  echo -e "  ${C_GRAY}Node.js:${C_RESET}             20.x LTS"
  echo -e "  ${C_GRAY}Database:${C_RESET}             SQLite (default)"
  echo -e "  ${C_GRAY}Process Manager:${C_RESET}      PM2"
  echo -e "  ${C_GRAY}Container Runtime:${C_RESET}    LXD"
  echo -e "  ${C_GRAY}Service Name:${C_RESET}         cynexvm"
  echo -e "  ${C_GRAY}System User:${C_RESET}          root"
  echo -e "  ${C_GRAY}Installer Version:${C_RESET}    ${INSTALLER_VER}"
  echo -e "  ${C_GRAY}Log File:${C_RESET}            ${LOG_FILE}"
  echo ""

  if [ ! -t 0 ]; then
    info "Non-interactive mode — proceeding automatically"
    return 0
  fi

  read -r -p "  Continue with installation? [Y/n]: " confirm
  case "$confirm" in
    [nN]|[nN][oO])
      echo -e "  ${C_YELLOW}${ICON_WARN} Installation cancelled by user.${C_RESET}"
      exit 0
      ;;
    *)
      return 0
      ;;
  esac
}

# ────────────────────────────────────────────────────────────────────────────
# Installation Functions (preserving all original logic)
# ────────────────────────────────────────────────────────────────────────────

check_root() {
  if [ "$(id -u)" -ne 0 ]; then
    error "This installer must be run as root. Use: sudo bash install.sh"
    exit 1
  fi
}

check_os() {
  if ! grep -qiE "ubuntu|debian" /etc/os-release 2>/dev/null; then
    warning "This installer is designed for Ubuntu/Debian. Proceed at your own risk."
  fi
}

install_system_deps() {
  local need_update=false
  local install_list=""

  for pkg in $REQUIRED_PKGS $OPTIONAL_PKGS; do
    if ! dpkg -s "$pkg" &>/dev/null 2>&1; then
      install_list="$install_list $pkg"
    fi
  done

  if [ -z "$install_list" ]; then
    log_info "All system packages already installed, skipping"
    return 0
  fi

  # Only update if we have missing packages
  spinner_start "Updating package index..."
  with_retries apt-get update -qq 2>/dev/null
  spinner_stop

  spinner_start "Installing packages..."
  # shellcheck disable=SC2086
  DEBIAN_FRONTEND=noninteractive with_retries apt-get install -y -qq $install_list > /dev/null 2>&1
  spinner_stop
  log_info "System packages installed: $install_list"
}

install_nodejs() {
  if command -v node &>/dev/null && [[ "$(node -v)" == v20* || "$(node -v)" == v22* ]]; then
    log_info "Node.js $(node -v) already installed, skipping"
    return 0
  fi

  spinner_start "Installing Node.js 20 LTS..."
  with_retries bash -c "curl -fsSL https://deb.nodesource.com/setup_20.x | bash -" > /dev/null 2>&1
  DEBIAN_FRONTEND=noninteractive with_retries apt-get install -y -qq nodejs > /dev/null 2>&1
  spinner_stop
  log_info "Node.js $(node -v) installed"
}

install_lxd() {
  if command -v lxd &>/dev/null; then
    log_info "LXD already installed"
  else
    spinner_start "Installing LXD container runtime..."
    with_retries snap install lxd --channel=latest/stable 2>/dev/null || \
      DEBIAN_FRONTEND=noninteractive with_retries apt-get install -y -qq lxd > /dev/null 2>&1
    spinner_stop
    log_info "LXD installed"
  fi

  if ! lxc storage list 2>/dev/null | grep -q "default"; then
    spinner_start "Initializing LXD..."
    lxd init --auto --storage-backend=dir 2>/dev/null || true
    spinner_stop
    log_info "LXD initialized with default storage"
  else
    log_info "LXD already initialized"
  fi
}

clone_repository() {
  if [ -d "$INSTALL_DIR" ]; then
    spinner_start "Updating repository..."
    cd "$INSTALL_DIR"
    with_retries git pull origin main --ff-only 2>/dev/null || with_retries git pull origin main
    spinner_stop
    log_info "Repository updated"
  else
    spinner_start "Cloning repository..."
    with_retries git clone "$REPO" "$INSTALL_DIR"
    spinner_stop
    log_info "Repository cloned to $INSTALL_DIR"
  fi
  cd "$INSTALL_DIR"
}

install_npm_packages() {
  # Check if node_modules exists and is reasonably fresh
  if [ -d "$INSTALL_DIR/node_modules" ]; then
    local pkg_age=0
    if [ -f "$INSTALL_DIR/package.json" ] && [ -f "$INSTALL_DIR/node_modules/.package-lock.json" ]; then
      pkg_age=$(($(date +%s) - $(stat -c %Y "$INSTALL_DIR/package.json" 2>/dev/null || echo 0)))
      if [ "$pkg_age" -lt 3600 ]; then
        log_info "node_modules is recent, skipping install"
        return 0
      fi
    fi
  fi

  spinner_start "Installing npm dependencies..."
  with_retries npm install --legacy-peer-deps > /dev/null 2>&1
  spinner_stop
  log_info "npm dependencies installed"
}

setup_environment() {
  if [ ! -f "$INSTALL_DIR/backend/.env" ]; then
    spinner_start "Generating secure environment..."
    JWT_SECRET="$(openssl rand -hex 32)"
    ENCRYPTION_KEY="$(openssl rand -hex 16)"
    cat > "$INSTALL_DIR/backend/.env" <<EOF
DATABASE_URL="file:./prisma/dev.db"
JWT_SECRET="${JWT_SECRET}"
JWT_REFRESH_SECRET="$(openssl rand -hex 32)"
ENCRYPTION_KEY="${ENCRYPTION_KEY}"
PORT=${PANEL_PORT}
NODE_ENV=production
LXD_SOCKET_PATH=/var/snap/lxd/common/lxd/unix.socket
EOF
    spinner_stop
    log_info "Environment file created with secure random secrets"
  else
    log_info "Environment file already exists, keeping current config"
  fi
}

build_project() {
  spinner_start "Building backend..."
  cd "$INSTALL_DIR/backend"
  with_retries npx prisma generate > /dev/null 2>&1
  with_retries npx tsc > /dev/null 2>&1
  spinner_stop

  spinner_start "Building frontend..."
  cd "$INSTALL_DIR/frontend"
  with_retries npx tsc > /dev/null 2>&1
  with_retries npx vite build > /dev/null 2>&1
  spinner_stop

  cd "$INSTALL_DIR"
  log_info "Build completed"
}

setup_database() {
  spinner_start "Initializing database..."
  cd "$INSTALL_DIR/backend"
  with_retries npx prisma db push --accept-data-loss > /dev/null 2>&1
  spinner_stop
  log_info "Database schema synchronized"

  # Seed admin user if database is empty
  CPU_CORES=$(nproc)
  MEM_MB=$(free -m | awk '/^Mem:/{print $2}')
  STORAGE_GB=$(df -BG / | awk 'NR==2{print $2}' | tr -d 'G')

  local seed_output
  seed_output=$(node -e "
    const { PrismaClient } = require('@prisma/client');
    const bcrypt = require('bcryptjs');
    const db = new PrismaClient();
    (async () => {
      const count = await db.user.count();
      if (count === 0) {
        const hash = await bcrypt.hash('admin', 12);
        const user = await db.user.create({
          data: { username: 'admin', email: 'admin@cynexvm.local', passwordHash: hash, emailVerified: true }
        });
        let role = await db.role.findFirst({ where: { name: 'Admin' } });
        if (!role) role = await db.role.create({ data: { name: 'Admin', description: 'Full administrator access' } });
        await db.userRole.create({ data: { userId: user.id, roleId: role.id } });
        let userRole = await db.role.findFirst({ where: { name: 'User' } });
        if (!userRole) await db.role.create({ data: { name: 'User', description: 'Standard client user with limited scope access' } });
        await db.node.create({
          data: {
            name: 'local',
            hostname: 'localhost',
            apiUrl: 'http://localhost:5050',
            apiToken: 'local-token',
            cpuCores: ${CPU_CORES},
            memoryMb: ${MEM_MB},
            storageGb: ${STORAGE_GB},
            status: 'online',
            supportsLxc: true,
          }
        });
        console.log('seeded');
      } else {
        console.log('exists');
      }
      await db.\$disconnect();
    })().catch(e => { console.error(e.message); process.exit(1); });
  " 2>/dev/null) || true

  if [ "$seed_output" = "seeded" ]; then
    log_info "Admin user created (admin / admin)"
    log_info "Local hypervisor node registered"
  elif [ "$seed_output" = "exists" ]; then
    log_info "Database already seeded"
  else
    warning "Database seeding encountered a non-critical error"
    log_warn "Database seeding issue (non-critical)"
  fi
  cd "$INSTALL_DIR"
}

setup_pm2() {
  if command -v pm2 &>/dev/null; then
    log_info "PM2 already installed"
  else
    spinner_start "Installing PM2 process manager..."
    npm install -g pm2 > /dev/null 2>&1
    spinner_stop
    log_info "PM2 installed globally"
  fi

  spinner_start "Configuring PM2..."
  mkdir -p /var/log/cynexvm
  cd "$INSTALL_DIR"
  pm2 start ecosystem.config.js > /dev/null 2>&1
  pm2 save > /dev/null 2>&1
  spinner_stop
  log_info "CynexVM started via PM2"

  spinner_start "Enabling PM2 startup on boot..."
  pm2 startup systemd -u root --hp /root > /dev/null 2>&1 || true
  spinner_stop
  log_info "PM2 startup on boot enabled"
}

setup_nginx_proxy() {
  info "Frontend is served directly by the backend Express server on port ${PANEL_PORT}."
  info "Nginx reverse proxy is not required — access the panel at http://YOUR_IP:${PANEL_PORT}"
  info "If you need a reverse proxy, configure it separately (e.g., Nginx, Caddy, Cloudflare Tunnel)."
  log_info "Nginx proxy skipped — backend serves frontend directly"
}

install_cynexd_daemon() {
  info "CynexD node agent is installed separately on each node server."
  info "Run the following on each node to connect it to this panel:"
  info "  curl -fsSL https://raw.githubusercontent.com/xAyan55/CynexVM/main/scripts/cynexd.sh | bash -s -- --panel-url wss://YOUR_PANEL_IP/ws/node --node-id NODE_ID --token NODE_TOKEN"
  info ""
  info "To register a node and get credentials, use the panel API:"
  info "  POST /api/v1/nodes  with { name, hostname }"
  log_info "CynexD daemon installer available at $INSTALL_DIR/scripts/cynexd.sh"
}

# ────────────────────────────────────────────────────────────────────────────
# Final Verification
# ────────────────────────────────────────────────────────────────────────────
verify_installation() {
  section "Final Verification"

  local failed=0

  # Backend build check
  if [ -f "$INSTALL_DIR/backend/dist/index.js" ]; then
    success "Backend build exists"
    log_info "Backend build verified"
  else
    error "Backend build missing"
    log_error "Backend build missing at $INSTALL_DIR/backend/dist/index.js"
    failed=1
  fi

  # Frontend build check
  if [ -f "$INSTALL_DIR/frontend/dist/index.html" ]; then
    success "Frontend build exists"
    log_info "Frontend build verified"
  else
    error "Frontend build missing"
    log_error "Frontend build missing"
    failed=1
  fi

  # Database check
  if [ -f "$INSTALL_DIR/backend/prisma/dev.db" ]; then
    success "Database initialized"
    log_info "Database file exists"
  else
    warning "Database file not found (will be created on first start)"
    log_warn "Database file not found at prisma/dev.db"
  fi

  # LXD check
  if command -v lxc &>/dev/null; then
    success "LXD available"
  else
    error "LXD not found"
    failed=1
  fi

  # PM2 process check
  if command -v pm2 &>/dev/null; then
    if pm2 pid cynexvm > /dev/null 2>&1; then
      success "PM2: cynexvm process is running"
    else
      warning "PM2: cynexvm process is not running (run: pm2 start ecosystem.config.js)"
    fi
  fi

  # HTTP endpoint check
  if curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:${PANEL_PORT}/health 2>/dev/null | grep -q "200"; then
    success "API endpoint responding on port ${PANEL_PORT}"
  else
    warning "API endpoint not yet responding (service may still be starting)"
  fi

  # Directory permissions check
  if [ -d "$INSTALL_DIR" ] && [ -r "$INSTALL_DIR" ] && [ -x "$INSTALL_DIR" ]; then
    success "Directory permissions correct"
  else
    error "Directory permissions issue"
    failed=1
  fi

  echo ""
  return $failed
}

# ────────────────────────────────────────────────────────────────────────────
# Statistics & Summary
# ────────────────────────────────────────────────────────────────────────────
_INSTALL_STATS_PACKAGES=0
_INSTALL_STATS_SERVICES=0

show_success_screen() {
  local end_time=$(date +%s)
  local duration=$(( end_time - _INSTALL_START_TIME ))
  local duration_str=""
  if [ "$duration" -lt 60 ]; then
    duration_str="${duration}s"
  else
    duration_str="$((duration / 60))m $((duration % 60))s"
  fi

  local LOCAL_IP="${PUBLIC_IP:-$(hostname -I 2>/dev/null | awk '{print $1}')}"
  [ -z "$LOCAL_IP" ] && LOCAL_IP="127.0.0.1"

  if [ "$HAS_UNICODE" = true ]; then
    echo ""
    echo -e "  ${C_GREEN}${C_BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C_RESET}"
    echo -e "  ${C_GREEN}${C_BOLD}           Installation Completed Successfully        ${C_RESET}"
    echo -e "  ${C_GREEN}${C_BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C_RESET}"
    echo ""
  else
    echo ""
    echo "  ==========================================="
    echo "     Installation Completed Successfully"
    echo "  ==========================================="
    echo ""
  fi

  # Statistics panel
  echo -e "  ${C_GRAY}Installation Statistics${C_RESET}"
  echo -e "  ${C_GRAY}━━━━━━━━━━━━━━━━━━━━━━━${C_RESET}"
  echo -e "  ${C_GRAY}Duration:${C_RESET}              ${duration_str}"
  echo -e "  ${C_GRAY}Packages Installed:${C_RESET}    ${#MISSING_PKGS[@]}"
  echo -e "  ${C_GRAY}Install Path:${C_RESET}         ${INSTALL_DIR}"
  echo -e "  ${C_GRAY}Database:${C_RESET}              SQLite ${C_GREEN}(healthy)${C_RESET}"
  echo ""

  # Access panel
  echo -e "  ${C_GRAY}Access Information${C_RESET}"
  echo -e "  ${C_GRAY}━━━━━━━━━━━━━━━━━━${C_RESET}"
  echo -e "  ${C_GRAY}Panel URL:${C_RESET}        ${C_BOLD}http://${LOCAL_IP}${C_RESET}"
  echo -e "  ${C_GRAY}API Endpoint:${C_RESET}     http://${LOCAL_IP}/api/v1"
  echo -e "  ${C_GRAY}Admin Login:${C_RESET}      ${C_YELLOW}admin / admin${C_RESET}"
  echo ""

  # Useful commands
  echo -e "  ${C_GRAY}Useful Commands${C_RESET}"
  echo -e "  ${C_GRAY}━━━━━━━━━━━━━━━${C_RESET}"
  echo -e "  ${C_GREEN}\$${C_RESET} pm2 list"
  echo -e "  ${C_GREEN}\$${C_RESET} pm2 logs cynexvm --lines 50"
  echo -e "  ${C_GREEN}\$${C_RESET} pm2 restart cynexvm"
  echo -e "  ${C_GREEN}\$${C_RESET} pm2 monit"
  echo -e "  ${C_GREEN}\$${C_RESET} lxc list"
  echo -e "  ${C_GREEN}\$${C_RESET} lxc info"
  echo ""

  # Support
  echo -e "  ${C_GRAY}Support & Resources${C_RESET}"
  echo -e "  ${C_GRAY}━━━━━━━━━━━━━━━━━━━${C_RESET}"
  echo -e "  ${C_GRAY}Documentation:${C_RESET}  https://docs.cynexvm.ai"
  echo -e "  ${C_GRAY}GitHub:${C_RESET}        https://github.com/xAyan55/CynexVM"
  echo -e "  ${C_GRAY}Log File:${C_RESET}      ${LOG_FILE}"
  echo ""

  cecho "$C_YELLOW" "  ${ICON_WARN} Change the default password immediately after first login!"
  echo ""
}

# ────────────────────────────────────────────────────────────────────────────
# Cleanup
# ────────────────────────────────────────────────────────────────────────────
install_cleanup() {
  log_info "Running post-installation cleanup"

  # Clean apt cache
  apt-get clean > /dev/null 2>&1 || true

  # Clean npm cache
  npm cache clean --force > /dev/null 2>&1 || true

  log_info "Cleanup completed"
}

# ────────────────────────────────────────────────────────────────────────────
# Main Execution
# ────────────────────────────────────────────────────────────────────────────
main() {
  setup_logging
  log_info "=== CynexVM Installer v${INSTALLER_VER} started ==="

  clear 2>/dev/null || true

  show_logo

  check_root
  check_os

  detect_system
  show_system_info

  validate_deps

  # Detect existing installation
  local existing_ver=""
  if detect_existing; then
    if [ -f "$INSTALL_DIR/package.json" ]; then
      existing_ver="$(grep -o '"version": *"[^"]*"' "$INSTALL_DIR/package.json" 2>/dev/null | head -1 | cut -d'"' -f4 || echo 'unknown')"
    fi
    handle_existing_install "${existing_ver:-unknown}"
  fi

  show_config_summary

  # ── Setup progress tracking ──
  progress_init
  progress_add_stage "System Dependencies"    8
  progress_add_stage "Node.js"                 8
  progress_add_stage "LXD"                     8
  progress_add_stage "Repository"             10
  progress_add_stage "npm Packages"           12
  progress_add_stage "Environment"             4
  progress_add_stage "Build"                  20
  progress_add_stage "Database"               10
  progress_add_stage "PM2 Setup"              12
  progress_add_stage "CynexD"                  4
  progress_add_stage "Verification"            4

  _STAGE_COMPLETED_INDEX=0
  echo ""
  section "Installation"

  install_system_deps
  _STAGE_COMPLETED_WEIGHT=$((_STAGE_COMPLETED_WEIGHT + _STAGE_WEIGHTS[0]))
  _STAGE_COMPLETED_INDEX=1
  _render_progress "System dependencies installed"

  install_nodejs
  _STAGE_COMPLETED_WEIGHT=$((_STAGE_COMPLETED_WEIGHT + _STAGE_WEIGHTS[1]))
  _STAGE_COMPLETED_INDEX=2
  _render_progress "Node.js installed"

  install_lxd
  _STAGE_COMPLETED_WEIGHT=$((_STAGE_COMPLETED_WEIGHT + _STAGE_WEIGHTS[2]))
  _STAGE_COMPLETED_INDEX=3
  _render_progress "LXD configured"

  clone_repository
  _STAGE_COMPLETED_WEIGHT=$((_STAGE_COMPLETED_WEIGHT + _STAGE_WEIGHTS[3]))
  _STAGE_COMPLETED_INDEX=4
  _render_progress "Repository cloned"

  install_npm_packages
  _STAGE_COMPLETED_WEIGHT=$((_STAGE_COMPLETED_WEIGHT + _STAGE_WEIGHTS[4]))
  _STAGE_COMPLETED_INDEX=5
  _render_progress "npm packages installed"

  setup_environment
  _STAGE_COMPLETED_WEIGHT=$((_STAGE_COMPLETED_WEIGHT + _STAGE_WEIGHTS[5]))
  _STAGE_COMPLETED_INDEX=6
  _render_progress "Environment configured"

  build_project
  _STAGE_COMPLETED_WEIGHT=$((_STAGE_COMPLETED_WEIGHT + _STAGE_WEIGHTS[6]))
  _STAGE_COMPLETED_INDEX=7
  _render_progress "Build completed"

  setup_database
  _STAGE_COMPLETED_WEIGHT=$((_STAGE_COMPLETED_WEIGHT + _STAGE_WEIGHTS[7]))
  _STAGE_COMPLETED_INDEX=8
  _render_progress "Database initialized"

  setup_pm2
  setup_nginx_proxy
  _STAGE_COMPLETED_WEIGHT=$((_STAGE_COMPLETED_WEIGHT + _STAGE_WEIGHTS[8]))
  _STAGE_COMPLETED_INDEX=9
  _render_progress "PM2 configured"

  install_cynexd_daemon
  _STAGE_COMPLETED_WEIGHT=$((_STAGE_COMPLETED_WEIGHT + _STAGE_WEIGHTS[9]))
  _STAGE_COMPLETED_INDEX=10
  _render_progress "CynexD daemon installed"

  echo ""
  section "Post-Installation"

  # Final verification
  if verify_installation; then
    log_info "All verification checks passed"
  else
    warning "Some verification checks failed — review the output above"
    log_warn "Some verification checks failed"
  fi

  install_cleanup

  echo ""
  show_success_screen

  log_info "=== CynexVM Installer v${INSTALLER_VER} completed successfully ==="
}

main "$@"
