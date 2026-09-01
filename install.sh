#!/usr/bin/env bash
#
# A-Coder IDE install script (macOS + Linux)
#
# Installs the latest release of A-Coder IDE from the GitHub releases of
# hamishfromatech/A-Coder, verifying checksums against the .sha256 sidecars
# published alongside every asset.
#
# One-liner:
#   curl -fsSL https://raw.githubusercontent.com/hamishfromatech/A-Coder/main/install.sh | bash
#
# Install methods per platform:
#   macOS  unzip A-Coder.app into /Applications (or ~/Applications with --user)
#   Linux  .deb/.rpm via the native package manager when available, otherwise
#          the tarball into /opt/a-coder (or ~/.local/share/a-coder with
#          --user), plus a .desktop entry
#
# Options:
#   --version <tag>  Install a specific release tag (default: latest)
#   --user           Install without sudo (~/Applications / ~/.local/share/a-coder)
#   --tarball        Force the tarball install method on Linux
#   --no-verify      Skip SHA-256 checksum verification (not recommended)
#   --dry-run        Show what would be installed without installing
#   --force          Kill a currently running A-Coder instance instead of failing
#   --quiet          Suppress non-essential output
#   --help           Show this help
#
# Design notes (mirrors the a-coder-builder release workflows):
#   - Assets live at https://github.com/hamishfromatech/A-Coder/releases/download/<tag>/<asset>
#   - Asset names come from a-coder-builder/prepare_assets.sh:
#       A-Coder-darwin-<arch>-<tag>.zip                      (macOS)
#       A-Coder-linux-<arch>-<tag>.tar.gz                    (Linux tarball)
#       a-coder_<tag>_<deb-arch>.deb                         (Linux deb)
#   - Every asset has a .sha256 sidecar in "<hash>  <filename>" format
#   - The GitHub API (releases/latest) is the primary version source; the
#     hamishfromatech/versions repo (stable/<platform>/<arch>/latest.json,
#     the same file the IDE auto-updater reads) is the fallback

set -u

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
REPO="hamishfromatech/A-Coder"            # releases live here
VERSIONS_REPO="hamishfromatech/versions"  # fallback version metadata
APP_NAME="A-Coder"
APP_NAME_LC="a-coder"

API_BASE="https://api.github.com/repos/${REPO}"
RELEASES_URL="https://github.com/${REPO}/releases"
RAW_VERSIONS_URL="https://raw.githubusercontent.com/${VERSIONS_REPO}/refs/heads/main/stable"

# ---------------------------------------------------------------------------
# Globals
# ---------------------------------------------------------------------------
WANT_VERSION=""    # requested tag; empty = latest
INSTALL_MODE="system"
FORCE_TARBALL=0
VERIFY_CHECKSUM=1
DRY_RUN=0
FORCE=0
QUIET=0

SUDO=""
HAVE_CURL=0
HAVE_WGET=0

PLATFORM=""   # darwin | linux
ARCH=""       # x64 | arm64 | armhf
VERSION=""
ASSET_URL=""
ASSET_SHA=""  # embedded sha256 from the versions-repo fallback (if used)

TMP_DIR=""
cleanup() {
	[[ -n "${TMP_DIR}" && -d "${TMP_DIR}" ]] && rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
log() {
	[[ "${QUIET:-0}" -eq 1 ]] || printf '%s\n' "$*"
}

info() {
	[[ "${QUIET:-0}" -eq 1 ]] || printf '==> %s\n' "$*"
}

warn() {
	printf 'WARNING: %s\n' "$*" >&2
}

die() {
	printf 'ERROR: %s\n' "$*" >&2
	exit 1
}

usage() {
	sed -n '2,45p' "$0" | sed 's/^# \{0,1\}//'
	exit 0
}

fetch() {
	# fetch <url> <output-file>  (curl preferred, wget fallback)
	local url="$1" out="$2"
	if [[ "${HAVE_CURL}" -eq 1 ]]; then
		if [[ "${FETCH_QUIET:-0}" -eq 1 ]]; then
			curl -fsSL --retry 4 --retry-delay 2 --connect-timeout 15 -sS -o "${out}" "${url}"
		else
			curl -fSL --retry 4 --retry-delay 2 --connect-timeout 15 -o "${out}" "${url}"
		fi
	elif [[ "${HAVE_WGET}" -eq 1 ]]; then
		wget -q --tries=4 --timeout=15 -O "${out}" "${url}"
	else
		die "Neither curl nor wget is available. Please install one and re-run."
	fi
}

map_arch() {
	# map_arch <uname-m> <uname-s> -> echoes "<platform> <arch>"
	local m="$1" s="$2"
	if [[ "${s}" == "Darwin" ]]; then
		case "${m}" in
			arm64)  echo "darwin arm64" ;;
			x86_64) echo "darwin x64" ;;
			*)      die "Unsupported macOS architecture: ${m}" ;;
		esac
	else
		case "${m}" in
			x86_64 | amd64)  echo "linux x64" ;;
			arm64 | aarch64) echo "linux arm64" ;;
			armv7l | armv6l) echo "linux armhf" ;;
			*)               die "Unsupported Linux architecture: ${m}" ;;
		esac
	fi
}

json_field() {
	# json_field <json-file> <key> -> first string value for the key (no jq needed)
	sed -n 's/.*"'"$2"'"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$1" | head -n 1
}

sha256_of() {
	# sha256_of <file> -> hex digest (sha256sum on Linux, shasum on macOS)
	if command -v sha256sum >/dev/null 2>&1; then
		sha256sum "$1" | awk '{ print $1 }'
	elif command -v shasum >/dev/null 2>&1; then
		shasum -a 256 "$1" | awk '{ print $1 }'
	else
		echo ""
	fi
}

pick_asset() {
	# pick_asset <assets-file> <asset-name> -> echoes the download URL
	# The trailing "$" anchor keeps asset.tar.gz from matching asset.tar.gz.sha256
	local assets_file="$1" asset="$2" match
	match="$(grep -E "/${asset}\$" "${assets_file}" | head -n 1)"
	[[ -n "${match}" ]] && { echo "${match}"; return 0; }
	return 1
}

pick_asset_regex() {
	# pick_asset_regex <assets-file> <regex> -> echoes the download URL
	local assets_file="$1" regex="$2" match
	match="$(grep -E "${regex}" "${assets_file}" | head -n 1)"
	[[ -n "${match}" ]] && { echo "${match}"; return 0; }
	return 1
}

verify_checksum() {
	# verify_checksum <file> — compares against .sha256 sidecar or ASSET_SHA
	local file="$1" expected actual
	expected="${ASSET_SHA:-}"
	if [[ -z "${expected}" ]]; then
		local sidecar="${TMP_DIR}/$(basename "${ASSET_URL}").sha256"
		info "Verifying SHA-256 checksum"
		FETCH_QUIET=1 fetch "${ASSET_URL}.sha256" "${sidecar}"
		expected="$(awk '{ print $1 }' "${sidecar}")"
	fi
	actual="$(sha256_of "${file}")"
	if [[ -z "${actual}" ]]; then
		[[ "${VERIFY_CHECKSUM}" -eq 1 ]] && die "No sha256sum/shasum found; cannot verify. Use --no-verify to skip."
		return 0
	fi
	if [[ "${actual}" != "${expected}" ]]; then
		die "Checksum mismatch for $(basename "${file}")
  expected: ${expected}
  actual:   ${actual}"
	fi
	log "Checksum OK"
}

find_cli_binary() {
	# find_cli_binary <app-root> -> path of the a-coder CLI launcher, if present
	local root="$1"
	if [[ -x "${root}/bin/${APP_NAME_LC}" ]]; then
		echo "${root}/bin/${APP_NAME_LC}"
	elif [[ -x "${root}/Contents/Resources/app/bin/${APP_NAME_LC}" ]]; then
		echo "${root}/Contents/Resources/app/bin/${APP_NAME_LC}"
	fi
}

link_cli() {
	# link_cli <cli-binary-path> — symlink the CLI onto PATH
	local cli="$1" d
	local dirs=()
	[[ "${INSTALL_MODE}" != "user" ]] && dirs+=("/usr/local/bin")
	dirs+=("${HOME}/.local/bin")

	for d in "${dirs[@]}"; do
		if mkdir -p "${d}" 2>/dev/null && ln -sf "${cli}" "${d}/${APP_NAME_LC}" 2>/dev/null; then
			info "CLI installed: ${d}/${APP_NAME_LC}"
			return 0
		fi
	done
	if [[ "${INSTALL_MODE}" != "user" && -n "${SUDO}" ]]; then
		${SUDO} ln -sf "${cli}" "/usr/local/bin/${APP_NAME_LC}" && {
			info "CLI installed: /usr/local/bin/${APP_NAME_LC}"
			return 0
		}
	fi
	warn "Could not create the '${APP_NAME_LC}' CLI symlink. Create one pointing to: ${cli}"
}

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
	case "$1" in
		--version)
			[[ $# -ge 2 ]] || die "--version requires a tag argument"
			WANT_VERSION="$2"
			shift 2
			;;
		--user)
			INSTALL_MODE="user"
			shift
			;;
		--tarball)
			FORCE_TARBALL=1
			shift
			;;
		--no-verify)
			VERIFY_CHECKSUM=0
			shift
			;;
		--dry-run)
			DRY_RUN=1
			shift
			;;
		--force)
			FORCE=1
			shift
			;;
		--quiet | -q)
			QUIET=1
			shift
			;;
		--help | -h)
			usage
			;;
		*)
			die "Unknown option: $1 (see --help)"
			;;
	esac
done

# ---------------------------------------------------------------------------
# Preflight
# ---------------------------------------------------------------------------
command -v curl >/dev/null 2>&1 && HAVE_CURL=1
command -v wget >/dev/null 2>&1 && HAVE_WGET=1
[[ "${HAVE_CURL}" -eq 1 || "${HAVE_WGET}" -eq 1 ]] || die "curl or wget is required to download A-Coder"

[[ "$(uname -s)" == "Darwin" || "$(uname -s)" == "Linux" ]] || die "This script supports macOS and Linux only. On Windows use install.ps1."

read -r PLATFORM ARCH < <(map_arch "$(uname -m)" "$(uname -s)")
[[ "${QUIET:-0}" -eq 1 ]] || info "Platform: ${PLATFORM} / ${ARCH}"

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/a-coder-install.XXXXXX")"

if [[ "$(id -u)" -ne 0 ]] && command -v sudo >/dev/null 2>&1; then
	SUDO="sudo"
fi
[[ "${INSTALL_MODE}" == "user" ]] && SUDO=""

# ---------------------------------------------------------------------------
# Resolve release + asset
# ---------------------------------------------------------------------------
RELEASE_JSON="${TMP_DIR}/release.json"
ASSETS_FILE="${TMP_DIR}/assets.txt"
VERSIONS_JSON="${TMP_DIR}/latest.json"

[[ "${QUIET:-0}" -eq 1 ]] || info "Resolving ${WANT_VERSION:-latest} release"

if [[ -n "${WANT_VERSION}" ]]; then
	fetch "${API_BASE}/releases/tags/${WANT_VERSION}" "${RELEASE_JSON}" || die "Release tag not found: ${WANT_VERSION}"
else
	fetch "${API_BASE}/releases/latest" "${RELEASE_JSON}" 2>/dev/null || true
fi

if [[ -s "${RELEASE_JSON}" ]] && grep -q '"browser_download_url"' "${RELEASE_JSON}"; then
	VERSION="$(json_field "${RELEASE_JSON}" tag_name)"
	[[ -n "${VERSION}" ]] || die "Could not parse the release tag from the GitHub API"
	grep -o '"browser_download_url":[[:space:]]*"[^"]*"' "${RELEASE_JSON}" | cut -d'"' -f4 >"${ASSETS_FILE}"
	[[ -s "${ASSETS_FILE}" ]] || die "Release ${VERSION} contains no downloadable assets"
else
	# Fallback: the versions repo, same latest.json the IDE auto-updater reads
	warn "GitHub API unavailable; falling back to the versions repo"
	fetch "${RAW_VERSIONS_URL}/${PLATFORM}/${ARCH}/latest.json" "${VERSIONS_JSON}" \
		|| die "Could not determine the latest version. Check ${RELEASES_URL}"
	VERSION="$(json_field "${VERSIONS_JSON}" name)"
	ASSET_URL="$(json_field "${VERSIONS_JSON}" url)"
	ASSET_SHA="$(json_field "${VERSIONS_JSON}" sha256hash)"
	[[ -n "${VERSION}" && -n "${ASSET_URL}" ]] || die "Could not parse ${RAW_VERSIONS_URL}/${PLATFORM}/${ARCH}/latest.json"
fi

[[ "${QUIET:-0}" -eq 1 ]] || info "Version: ${VERSION}"

# Select the asset for this platform
if [[ -z "${ASSET_URL}" ]]; then
	if [[ "${PLATFORM}" == "darwin" ]]; then
		ASSET_URL="$(pick_asset "${ASSETS_FILE}" "${APP_NAME}-darwin-${ARCH}-${VERSION}.zip")"
		[[ -n "${ASSET_URL}" ]] || die "No macOS asset (${APP_NAME}-darwin-${ARCH}-*.zip) found in release ${VERSION}.
It may not include macOS builds yet — see ${RELEASES_URL}"
	else
		# Prefer the native package when available and running as system install
		if [[ "${FORCE_TARBALL}" -eq 0 && "${INSTALL_MODE}" == "system" ]]; then
			if command -v apt-get >/dev/null 2>&1 || command -v dpkg >/dev/null 2>&1; then
				case "${ARCH}" in
					x64)   DEB_ARCH="amd64" ;;
					arm64) DEB_ARCH="arm64" ;;
					armhf) DEB_ARCH="armhf" ;;
				esac
				ASSET_URL="$(pick_asset "${ASSETS_FILE}" "${APP_NAME_LC}_${VERSION}_${DEB_ARCH}.deb" || true)"
				[[ -n "${ASSET_URL}" ]] && ASSET_KIND="deb"
			elif command -v dnf >/dev/null 2>&1 || command -v zypper >/dev/null 2>&1 || command -v yum >/dev/null 2>&1; then
				case "${ARCH}" in
					x64)   RPM_ARCH="x86_64" ;;
					arm64) RPM_ARCH="aarch64" ;;
					armhf) RPM_ARCH="armhfp" ;;
				esac
				ASSET_URL="$(pick_asset_regex "${ASSETS_FILE}" "/${APP_NAME_LC}-${VERSION}\\.${RPM_ARCH}\\.rpm\$" || true)"
				[[ -n "${ASSET_URL}" ]] && ASSET_KIND="rpm"
			fi
		fi
		if [[ -z "${ASSET_URL}" ]]; then
			ASSET_URL="$(pick_asset "${ASSETS_FILE}" "${APP_NAME}-linux-${ARCH}-${VERSION}.tar.gz")"
			[[ -n "${ASSET_URL}" ]] || die "No Linux asset (${APP_NAME}-linux-${ARCH}-*.tar.gz, .deb or .rpm) found in release ${VERSION}.
See ${RELEASES_URL} for the assets this release contains"
		fi
	fi
	ASSET_KIND="${ASSET_KIND:-tarball}"
fi

ASSET_FILE="${TMP_DIR}/$(basename "${ASSET_URL}")"
ASSET_KIND="${ASSET_KIND:-tarball}"

if [[ "${DRY_RUN}" -eq 1 ]]; then
	log "dry-run: would download $(basename "${ASSET_URL}")"
	log "dry-run: install method: ${ASSET_KIND}"
	case "${PLATFORM}" in
		darwin)
			[[ "${INSTALL_MODE}" == "user" ]] && log "dry-run: destination: ${HOME}/Applications/A-Coder.app" \
				|| log "dry-run: destination: /Applications/A-Coder.app"
			;;
		linux)
			[[ "${ASSET_KIND}" == "tarball" ]] && {
				[[ "${INSTALL_MODE}" == "user" ]] && log "dry-run: destination: ${HOME}/.local/share/${APP_NAME_LC}" \
					|| log "dry-run: destination: /opt/${APP_NAME_LC}"
			}
			;;
	esac
	log "dry-run: no changes made"
	exit 0
fi

# ---------------------------------------------------------------------------
# Download + verify
# ---------------------------------------------------------------------------
[[ "${QUIET:-0}" -eq 1 ]] || info "Downloading $(basename "${ASSET_URL}")"
fetch "${ASSET_URL}" "${ASSET_FILE}"

if [[ "${VERIFY_CHECKSUM}" -eq 1 ]]; then
	verify_checksum "${ASSET_FILE}"
fi

# ---------------------------------------------------------------------------
# Install: macOS
# ---------------------------------------------------------------------------
if [[ "${PLATFORM}" == "darwin" ]]; then
	if pgrep -xq "${APP_NAME}" 2>/dev/null || pgrep -xq "${APP_NAME_LC}" 2>/dev/null; then
		if [[ "${FORCE}" -eq 1 ]]; then
			warn "A-Coder is running; killing it (--force)"
			pkill -x "${APP_NAME}" 2>/dev/null || pkill -x "${APP_NAME_LC}" 2>/dev/null || true
			sleep 1
		else
			die "A-Coder is currently running. Quit it and re-run, or pass --force."
		fi
	fi

	DEST_DIR="/Applications"
	[[ "${INSTALL_MODE}" == "user" ]] && DEST_DIR="${HOME}/Applications"

	info "Extracting A-Coder.app -> ${DEST_DIR}"
	unzip -qo "${ASSET_FILE}" -d "${TMP_DIR}/extract"
	APP_SRC="$(find "${TMP_DIR}/extract" -maxdepth 2 -name "*.app" -type d | head -n 1)"
	[[ -n "${APP_SRC}" ]] || die "No .app bundle found inside $(basename "${ASSET_URL}")"

	mkdir -p "${DEST_DIR}" 2>/dev/null || true
	if [[ -d "${DEST_DIR}/A-Coder.app" ]]; then
		rm -rf "${DEST_DIR}/A-Coder.app" 2>/dev/null || ${SUDO} rm -rf "${DEST_DIR}/A-Coder.app"
	fi
	if mv "${APP_SRC}" "${DEST_DIR}/A-Coder.app" 2>/dev/null; then
		:
	elif [[ -n "${SUDO}" ]]; then
		${SUDO} mv "${APP_SRC}" "${DEST_DIR}/A-Coder.app"
	else
		die "Could not write to ${DEST_DIR}. Re-run with --user, or with sudo."
	fi

	# Remove the quarantine flag so the ad-hoc-signed build (see
	# a-coder-builder/prepare_assets.sh) does not trigger the
	# "A-Coder is damaged" Gatekeeper prompt on recent macOS.
	xattr -dr com.apple.quarantine "${DEST_DIR}/A-Coder.app" 2>/dev/null || true

	CLI_BIN="$(find_cli_binary "${DEST_DIR}/A-Coder.app")"
	[[ -n "${CLI_BIN}" ]] && link_cli "${CLI_BIN}"

	log ""
	info "A-Coder IDE ${VERSION} installed: ${DEST_DIR}/A-Coder.app"
	log "Open it from Spotlight/Launchpad, or run: open \"${DEST_DIR}/A-Coder.app\""
	exit 0
fi

# ---------------------------------------------------------------------------
# Install: Linux
# ---------------------------------------------------------------------------
install_deb() {
	local deb="$1"
	info "Installing via apt/dpkg (requires root)"
	if command -v apt-get >/dev/null 2>&1 && ${SUDO} apt-get install -y "${deb}" 2>/dev/null; then
		return 0
	fi
	${SUDO} dpkg -i "${deb}" || {
		${SUDO} apt-get install -f -y
	}
}

install_rpm() {
	local rpm="$1"
	if command -v dnf >/dev/null 2>&1; then
		info "Installing via dnf (requires root)"
		${SUDO} dnf install -y "${rpm}"
	elif command -v zypper >/dev/null 2>&1; then
		info "Installing via zypper (requires root)"
		${SUDO} zypper --non-interactive install "${rpm}"
	elif command -v yum >/dev/null 2>&1; then
		info "Installing via yum (requires root)"
		${SUDO} yum localinstall -y "${rpm}"
	else
		info "Installing via rpm (requires root)"
		${SUDO} rpm -U --replacepkgs "${rpm}"
	fi
}

install_tarball() {
	# The tarball is built with `tar czf ... .` from inside the app folder
	# (see a-coder-builder/prepare_assets.sh), so it has no top-level
	# directory — extract directly into the destination.
	local dest="$1" icon desktop_file content
	info "Extracting to ${dest}"
	if [[ "${INSTALL_MODE}" == "user" ]]; then
		mkdir -p "${dest}"
		tar xzf "${ASSET_FILE}" -C "${dest}"
	else
		${SUDO} mkdir -p "${dest}"
		${SUDO} tar xzf "${ASSET_FILE}" -C "${dest}"
	fi

	# .desktop entry so A-Coder shows up in the app menu
	icon="$(find "${dest}/resources" -path '*resources/linux/*.png' 2>/dev/null | head -n 1)"
	if [[ -n "${icon}" ]]; then
		desktop_file="/usr/share/applications/${APP_NAME_LC}.desktop"
		[[ "${INSTALL_MODE}" == "user" ]] && desktop_file="${HOME}/.local/share/applications/${APP_NAME_LC}.desktop"
		content="[Desktop Entry]
Name=A-Coder IDE
Comment=AI-native Code Editor
Exec=${dest}/${APP_NAME_LC} %F
Icon=${icon}
Type=Application
StartupNotify=false
StartupWMClass=${APP_NAME}
Categories=TextEditor;Development;IDE;
MimeType=text/plain;inode/directory;
Keywords=${APP_NAME_LC};ide;editor;"
		if [[ "${INSTALL_MODE}" == "user" ]]; then
			mkdir -p "$(dirname "${desktop_file}")"
			echo "${content}" >"${desktop_file}"
		else
			${SUDO} mkdir -p "$(dirname "${desktop_file}")"
			echo "${content}" | ${SUDO} tee "${desktop_file}" >/dev/null
		fi
		[[ "${QUIET:-0}" -eq 1 ]] || info "Desktop entry: ${desktop_file}"
	fi

	CLI_BIN="$(find_cli_binary "${dest}")"
	[[ -n "${CLI_BIN}" ]] && link_cli "${CLI_BIN}"
}

case "${ASSET_KIND}" in
	deb)
		install_deb "${ASSET_FILE}"
		log ""
		info "A-Coder IDE ${VERSION} installed (deb)"
		log "Open: run '${APP_NAME_LC}' in a terminal, or launch A-Coder IDE from the app menu"
		;;
	rpm)
		install_rpm "${ASSET_FILE}"
		log ""
		info "A-Coder IDE ${VERSION} installed (rpm)"
		log "Open: run '${APP_NAME_LC}' in a terminal, or launch A-Coder IDE from the app menu"
		;;
	*)
		if [[ "${INSTALL_MODE}" == "user" ]]; then
			DEST="${HOME}/.local/share/${APP_NAME_LC}"
		else
			DEST="/opt/${APP_NAME_LC}"
		fi
		install_tarball "${DEST}"
		log ""
		info "A-Coder IDE ${VERSION} installed: ${DEST}"
		if [[ "${INSTALL_MODE}" == "user" ]]; then
			case ":${PATH}:" in
				*":${HOME}/.local/bin:"*) ;;
				*) warn "Add ${HOME}/.local/bin to your PATH to use the '${APP_NAME_LC}' CLI" ;;
			esac
		fi
		log "Open: run '${APP_NAME_LC}' in a terminal, or launch A-Coder IDE from the app menu"
		;;
esac

log ""
log "To update later, re-run this script (it installs over the previous version)."