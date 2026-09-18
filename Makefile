### 当前 Makefile 文件物理路径
ROOT_DIR:=$(shell dirname $(realpath $(firstword $(MAKEFILE_LIST))))
OLLAMA_BASE_URL ?= http://127.0.0.1:11434
IMAGE ?= chunhui2001/debian13:ai-openui
WHISPER_VENV := $(ROOT_DIR)/whisper/.venv
TTS_VENV := $(ROOT_DIR)/tts/.venv

.DEFAULT_GOAL := help
.PHONY: help install dev run serve build check models whisper tts image docker-run up down clean clean-all diagram

help:
	@echo "make install    安装依赖"
	@echo "make run        开发模式启动"
	@echo "make serve      打包后线上运行"
	@echo "make build      打包到 dist/（ASSETS_HASH=0 去掉文件名哈希）"
	@echo "make check      TypeScript 类型检查"
	@echo "make models     列出本机 Ollama 模型"
	@echo "make whisper    启动本机 mlx-whisper 转写（8173）"
	@echo "make tts        启动本机 mlx-audio / Qwen3-TTS 朗读（8273）"
	@echo "make image      构建 Docker 镜像"
	@echo "make docker-run 运行镜像（4173，对接宿主机 Ollama）"
	@echo "make up         docker compose 后台启动（ASSETS_HASH=1 构建时保留文件名哈希）"
	@echo "make down       docker compose 停止"
	@echo "make diagram    用 XeLaTeX + pdftocairo 导出 Agent 架构图到 public/"
	@echo "make clean      删除 dist/"
	@echo "make clean-all  删除 dist/、node_modules、.npm-cache"

diagram:
	cd $(ROOT_DIR)/docs/architecture && \
	xelatex -interaction=nonstopmode agent-architecture.tex && \
	pdftocairo -svg agent-architecture.pdf agent-architecture.svg && \
	python3 -c "from pathlib import Path; p=Path('agent-architecture.svg'); t=p.read_text(); r='<rect width=\"100%\" height=\"100%\" fill=\"#F7F8FA\"/>'; \
	e=t.find('>', t.find('<svg')); t=t if r in t else t[:e+1]+r+t[e+1:]; p.write_text(t)" && \
	mkdir -p $(ROOT_DIR)/public && \
	cp agent-architecture.svg $(ROOT_DIR)/public/agent-architecture.svg && \
	rm -f agent-architecture.aux agent-architecture.log agent-architecture.xdv

clean:
	rm -rf $(ROOT_DIR)/dist

clean-all: clean
	rm -rf $(ROOT_DIR)/node_modules $(ROOT_DIR)/.npm-cache

install:
	cd $(ROOT_DIR) && npm install

run: install
	cd $(ROOT_DIR) && npm run dev

build: install
	cd $(ROOT_DIR) && $(if $(ASSETS_HASH),ASSETS_HASH=$(ASSETS_HASH) )npm run build

serve: build
	cd $(ROOT_DIR) && npm run preview

check: install
	cd $(ROOT_DIR) && npx tsc --noEmit

models:
	curl -sS $(OLLAMA_BASE_URL)/api/tags

tts:
	cd $(ROOT_DIR)/tts && \
test -d .venv || python3 -m venv .venv && \
$(TTS_VENV)/bin/pip install -r requirements.txt && \
$(TTS_VENV)/bin/python server.py

up:
	cd $(ROOT_DIR) && $(if $(ASSETS_HASH),ASSETS_HASH=$(ASSETS_HASH) )docker compose up -d --build
	# cd $(ROOT_DIR) && \
	# docker compose build --no-cache && \
	# docker compose up -d --force-recreate
	docker logs -f ai-openui

down:
	cd $(ROOT_DIR) && docker compose down


# kill "$(lsof -tiTCP:11434 -sTCP:LISTEN)"
run-ollama-serve:
	@if curl -sf "$(OLLAMA_BASE_URL)/api/tags" >/dev/null; then \
		echo "Ollama already running at $(OLLAMA_BASE_URL)"; \
	else \
		echo "Starting Ollama..."; \
		nohup ollama serve >/tmp/ollama-serve.log 2>&1 & \
		for i in 1 2 3 4 5 6 7 8 9 10; do \
			curl -sf "$(OLLAMA_BASE_URL)/api/tags" >/dev/null && break; \
			sleep 0.5; \
		done; \
		curl -sf "$(OLLAMA_BASE_URL)/api/tags" >/dev/null || { echo "Ollama failed to start; see /tmp/ollama-serve.log"; exit 1; }; \
		echo "Ollama started at $(OLLAMA_BASE_URL)"; \
	fi

whisper:
	@command -v ffmpeg >/dev/null || { echo "先安装 ffmpeg：brew install ffmpeg"; exit 1; }
	cd $(ROOT_DIR)/whisper && \
test -d .venv || python3 -m venv .venv && \
$(WHISPER_VENV)/bin/pip install -r requirements.txt && \
$(WHISPER_VENV)/bin/python server.py
