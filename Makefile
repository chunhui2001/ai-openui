### 当前 Makefile 文件物理路径
ROOT_DIR:=$(shell dirname $(realpath $(firstword $(MAKEFILE_LIST))))
OLLAMA_BASE_URL ?= http://127.0.0.1:11434
IMAGE ?= chunhui2001/debian13:ai-openui

.DEFAULT_GOAL := help
.PHONY: help install dev run serve build check models image docker-run up down clean clean-all

help:
	@echo "make install    安装依赖"
	@echo "make run        开发模式启动"
	@echo "make serve      打包后线上运行"
	@echo "make build      打包到 dist/"
	@echo "make check      TypeScript 类型检查"
	@echo "make models     列出本机 Ollama 模型"
	@echo "make image      构建 Docker 镜像"
	@echo "make docker-run 运行镜像（4173，对接宿主机 Ollama）"
	@echo "make up         docker compose 后台启动"
	@echo "make down       docker compose 停止"
	@echo "make clean      删除 dist/"
	@echo "make clean-all  删除 dist/、node_modules、.npm-cache"

install:
	cd $(ROOT_DIR) && npm install

run: install
	cd $(ROOT_DIR) && npm run dev

build: install
	cd $(ROOT_DIR) && npm run build

serve: build
	cd $(ROOT_DIR) && npm run preview

check: install
	cd $(ROOT_DIR) && npx tsc --noEmit

models:
	curl -sS $(OLLAMA_BASE_URL)/api/tags

up:
	cd $(ROOT_DIR) && docker compose up -d --build

down:
	cd $(ROOT_DIR) && docker compose down

clean:
	rm -rf $(ROOT_DIR)/dist

clean-all: clean
	rm -rf $(ROOT_DIR)/node_modules $(ROOT_DIR)/.npm-cache
