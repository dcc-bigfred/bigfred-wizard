# bigfred-wizard — Rust (axum) + embedded React SPA
#
# Standalone repo: https://github.com/dcc-bigfred/bigfred-wizard
# Hub integration: bigfred-os Buildroot package `package/bigfred-wizard`

TARGET  ?= aarch64-unknown-linux-musl
WEB_DIR := web
CARGO   ?= cargo
NPM     ?= npm
export RUSTUP_TOOLCHAIN ?= stable
CARGO_TARGET_DIR ?= $(CURDIR)/target
export CARGO_TARGET_DIR

CONFIG ?= $(CURDIR)/dev-config.json

# Cross-link aarch64 musl: prefer Buildroot host gcc (sibling bigfred-os tree),
# else aarch64-linux-musl-gcc on PATH. Host musl-gcc/ld will fail with
# "file in wrong format" on aarch64 objects.
BIGFRED_OS_ROOT ?= $(abspath $(CURDIR)/../bigfred-os)
BR_HOST_GCC := $(BIGFRED_OS_ROOT)/os/output/host/bin/aarch64-buildroot-linux-musl-gcc
ifeq ($(wildcard $(BR_HOST_GCC)),)
  LINKER ?= aarch64-linux-musl-gcc
else
  LINKER ?= $(BR_HOST_GCC)
endif

.PHONY: all build web-build release-musl host test test-release-assertions \
	fmt clippy clean dist dev-backend dev-web

all: build

web-build:
	@command -v $(NPM) >/dev/null 2>&1 || { \
		echo "error: npm not found — needed for the embedded SPA" >&2; \
		exit 127; \
	}
	@echo "==> web (vite)"
	cd "$(WEB_DIR)" && $(NPM) ci && $(NPM) run build

build host: | web-build

# Native (host) release binary at target/release/bigfred-wizard
host:
	$(CARGO) build --release
	@echo "wrote $(CARGO_TARGET_DIR)/release/bigfred-wizard"

# Local aarch64 musl build (optional; CI is the hub source of truth)
build:
	@command -v $(CARGO) >/dev/null 2>&1 || { \
		echo "error: cargo not found" >&2; \
		exit 127; \
	}
	@command -v "$(LINKER)" >/dev/null 2>&1 || { \
		echo "error: aarch64 musl linker not found: $(LINKER)" >&2; \
		echo "       build bigfred-os host tools, or install aarch64-linux-musl-gcc" >&2; \
		exit 127; \
	}
	@echo "==> bigfred-wizard ($(TARGET)) linker=$(LINKER)"
	CARGO_TARGET_AARCH64_UNKNOWN_LINUX_MUSL_LINKER="$(LINKER)" \
	CC_aarch64_unknown_linux_musl="$(LINKER)" \
	RUSTFLAGS='-C target-feature=+crt-static' \
		$(CARGO) build --release --target $(TARGET)
	@mkdir -p dist
	cp -f "$(CARGO_TARGET_DIR)/$(TARGET)/release/bigfred-wizard" dist/bigfred-wizard-linux-arm64
	chmod 755 dist/bigfred-wizard-linux-arm64
	@echo "wrote dist/bigfred-wizard-linux-arm64"

release-musl: build

dist: release-musl

test:
	$(CARGO) test --locked

test-release-assertions:
	$(CARGO) test --locked --profile release-assertions

fmt:
	$(CARGO) fmt --all

clippy:
	$(CARGO) clippy --all-targets -- -D warnings

dev-backend-isolated:
	BIGFRED_DATA_DIR=$(CURDIR)/.dev-data \
		$(CARGO) run -- --config "$(CONFIG)"

dev-backend:
	$(CARGO) run -- --config "$(CONFIG)"

dev-web:
	cd "$(WEB_DIR)" && HOST=0.0.0.0 $(NPM) run dev

clean:
	$(CARGO) clean
	rm -rf "$(WEB_DIR)/node_modules" dist
	find "$(WEB_DIR)/dist" -mindepth 1 ! -name .gitkeep -exec rm -rf {} + 2>/dev/null || true
