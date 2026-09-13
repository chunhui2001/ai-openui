# ai-openui

自己实现的本地 Ollama 网页对话 UI，用来学习模型列表、多轮上下文和 NDJSON 流式输出。不是 [Open WebUI](https://github.com/open-webui/open-webui) 的封装。

当前本机已验证：Ollama 在 `http://127.0.0.1:11434`，模型为 `llama3.2:3b`、`tinyllama:latest`。

## 启动

开发：

```bash
make install
make run
```

浏览器打开 `http://127.0.0.1:5173`。

本机预览打包结果（仍用 Vite preview）：

```bash
make serve
```

浏览器打开 `http://127.0.0.1:4173`。

前端只请求同源 `/ollama/*`，开发服务、本机 preview 和镜像里的 h2o 都会代理到 Ollama，避免浏览器直连的 CORS 问题。

常用命令：`make` 看帮助，`make package` 只打包不启动，`make models` 列出本机模型。

端口不对时改 `.env`：

```bash
OLLAMA_BASE_URL=http://127.0.0.1:11434
```

改完后重新 `make run` 或 `make serve`。底层对照：`npm install` / `npm run dev` / `npm run build` / `npm run preview`。

## 镜像

```bash
make up
```

或 `make image` 后 `make docker-run`。浏览器打开 `http://127.0.0.1:4173`。停止：`make down`。

容器运行时是 **h2o**（托管 `dist/`，反代 `/ollama`）。本机 `make serve` 仍是 `vite preview`。详见下一节。

容器内不要写 `localhost:11434`，默认走 `host.docker.internal:11434` 打到宿主机 Ollama。Linux 上 compose 已加 `host.docker.internal:host-gateway`。

镜像标签：`chunhui2001/debian13:ai-openui`。

## 线上：h2o

`vite preview` 适合本机验收 `dist/`，和开发服务同一套 connect 中间件，不是生产网关。浏览器只打同源 `/ollama/*`，线上网关必须同时做到：

1. 托管打包后的静态文件（`/`、`/assets/*`、`/favicon.ico`）
2. 把 `/ollama/api/tags`、`/ollama/api/chat` 去掉 `/ollama` 前缀，转到 Ollama 的 `/api/tags`、`/api/chat`
3. 流式 NDJSON **不要整段缓冲**，否则看不到打字效果，长回答还可能超时

本机 `make serve` 继续用 preview。只有 `make up` / 镜像走 h2o。

Debian 13 仓库没有可装的 `h2o` 包。`akorn/h2o` 极简、没有 `/bin/sh`，没法跑入口脚本。因此运行时用 `chunhui2001/debian_13.5:zh-CN`，只从 `akorn/h2o` 拷二进制，并安装 `libbrotli1`、`libssl3t64` 等动态库。Node 阶段只负责 `npm run build`。

配置在 [docker/h2o.conf.template](docker/h2o.conf.template)，启动脚本 [docker/entrypoint.sh](docker/entrypoint.sh) 用 `OLLAMA_BASE_URL` 渲染后再 `exec h2o`。h2o 本身不读环境变量，改地址后要重启容器。

注意事项：

- 容器里不要写 `localhost:11434`。`localhost` 是容器自己，不是宿主机。默认 `http://host.docker.internal:11434`。
- `proxy.preserve-host: OFF`，转给 Ollama 的 Host 必须是后端地址。开着的话会变成 `127.0.0.1:4173`，对话失败。
- h2o 2.3 超时单位是**毫秒**。写成 `120s` 会被当成约 120ms，模型还没吐出第一个 token 就 502 `first byte timeout`。当前 `first_byte` 180000、`io` 300000。非流式要等整段生成完才有首字节。
- 改超时或反代路径后，用更快的 `tinyllama:latest` 测一轮流式，确认不是整段一次性返回。
- 镜像已从 `akorn/h2o` 拷入 `/usr/local/share/h2o`（含 `ca-bundle.crt`）。若仍看到缺文件警告，说明该层没拷上；缺 bundle 只影响反代 HTTPS，对接本机 HTTP Ollama 可忽略。

## 功能

- 启动时拉取 `/api/tags`，默认选中 `llama3.2:3b`
- 流式对话（`POST /api/chat`，`stream: true`）
- 停止生成、清空会话
- Enter 发送，Shift+Enter 换行

调试可用 `tinyllama:latest`，它比 `llama3.2:3b` 更快。

## 和 Open WebUI 的关系

仓库里的 `debian13.open-webui-0.11.3` 是现成对照产品。本项目只覆盖聊天主循环，不做登录、知识库、工具调用。`tinyllama` 没有 tools 模板，这里只走纯 chat。
