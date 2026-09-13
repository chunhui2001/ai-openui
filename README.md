# ai-openui

自己实现的本地 Ollama 网页对话 UI，用来学习模型列表、多轮上下文和 NDJSON 流式输出。不是 [Open WebUI](https://github.com/open-webui/open-webui) 的封装。

当前本机已验证：Ollama 在 `http://127.0.0.1:11434`，模型为 `llama3.2:3b`、`tinyllama:latest`。

## 启动

开发：

```bash
make install
make run
```

浏览器打开 `http://127.0.0.1:5173`。首页是 Agent 架构图；对话在 `http://127.0.0.1:5173/ai-playground/`；关于页：`http://127.0.0.1:5173/about/`；组件演示：`http://127.0.0.1:5173/developer/`。HTML 和各页 TS/CSS 在 `src/`，Vite `root` 指向该目录，线上路径没有 `/src/` 前缀（入口见 `vite.config.ts` 的 `build.rollupOptions.input`）。架构图源文件在 `docs/architecture/agent-architecture.tex`，改完后 `make diagram` 导出 SVG（需 XeLaTeX 与 `pdftocairo`，后者来自 poppler）。

本机预览打包结果（仍用 Vite preview）：

```bash
make serve
```

浏览器打开 `http://127.0.0.1:4173`。

前端只请求同源 `/ollama/*`、`/whisper/*` 和 `/tts/*`。开发服务、本机 preview 和镜像里的 h2o 会分别代理到 Ollama、本机 mlx-whisper 和 mlx-audio，避免浏览器直连的 CORS 问题。

常用命令：`make` 看帮助，`make package` 只打包不启动，`make models` 列出本机模型。

端口不对时改 `.env`：

```bash
OLLAMA_BASE_URL=http://127.0.0.1:11434
```

打包产物默认带内容哈希（`RichMedias/index-a01yDRQz.css`）。不要哈希时设 `ASSETS_HASH=0`，例如 `make build ASSETS_HASH=0` 或写进 `.env`。关掉后浏览器可能缓存旧 JS/CSS。

打镜像时必须在构建期传入，运行时环境变量改不了已经打进镜像的 `dist/`：

```bash
docker build --build-arg ASSETS_HASH=0 -t chunhui2001/debian13:ai-openui .
ASSETS_HASH=0 docker compose up -d --build
make up ASSETS_HASH=0
```

`docker compose` 默认 `ASSETS_HASH=0`；`docker build` 不传则默认 `1`。

改完后重新 `make run` 或 `make serve`。底层对照：`npm install` / `npm run dev` / `npm run build` / `npm run preview`。

## 镜像

```bash
make up
```

或 `make image` 后 `make docker-run`。浏览器打开 `http://127.0.0.1:4173`。停止：`make down`。

容器运行时是 **h2o**（托管 `dist/`，反代 `/ollama`）。本机 `make serve` 仍是 `vite preview`。详见下一节。

容器内不要写 `localhost:11434`，默认走 `host.docker.internal:11434` 打到宿主机 Ollama。Linux 上 compose 已加 `host.docker.internal:host-gateway`。

compose 使用外部网络 `br0`（`172.16.197.0/24`），固定地址 `172.16.197.94`。Ollama 是 `.92`，Open WebUI 是 `.93`。宿主机必须先有 `br0`，否则 `make up` 会失败。也可直接打开 `http://172.16.197.94:4173`。

镜像标签：`chunhui2001/debian13:ai-openui`。

## 线上：h2o

`vite preview` 适合本机验收 `dist/`，和开发服务同一套 connect 中间件，不是生产网关。浏览器只打同源 `/ollama/*`，线上网关必须同时做到：

1. 托管打包后的静态文件（`/`、`/RichMedias/*`、`/favicon.ico`）
2. 把 `/ollama/api/tags`、`/ollama/api/chat` 去掉 `/ollama` 前缀，转到 Ollama 的 `/api/tags`、`/api/chat`
3. 流式 NDJSON **不要整段缓冲**，否则看不到打字效果，长回答还可能超时

本机 `make serve` 继续用 preview。只有 `make up` / 镜像走 h2o。

Debian 13 仓库没有可装的 `h2o` 包。`akorn/h2o` 极简、没有 `/bin/sh`，没法跑入口脚本。因此运行时用 `chunhui2001/debian_13.5:zh-CN`，只从 `akorn/h2o` 拷二进制，并安装 `libbrotli1`、`libssl3t64` 等动态库。Node 阶段只负责 `npm run build`。

配置在 [docker/h2o.conf.template](docker/h2o.conf.template)，启动脚本 [docker/entrypoint.sh](docker/entrypoint.sh) 用 `OLLAMA_BASE_URL` 渲染后再 `exec h2o`。h2o 本身不读环境变量，改地址后要重启容器。

注意事项：

- 容器里不要写 `localhost:11434`。`localhost` 是容器自己，不是宿主机。默认 `http://host.docker.internal:11434`。
- `proxy.preserve-host: OFF`，转给 Ollama 的 Host 必须是后端地址。开着的话会变成 `127.0.0.1:4173`，对话失败。
- 经 Cloudflare / 域名访问时，浏览器 POST 会带 `Origin: https://你的域名`。Ollama 的 `OLLAMA_ORIGINS` 默认只放行 localhost，于是 **拉模型列表 200、对话 403**。h2o 已对 `/ollama` 去掉 `Origin` 和 `Referer`。也可在 Ollama 上设 `OLLAMA_ORIGINS=https://ai.snnmo.com,*`。
- h2o 2.3 超时单位是**毫秒**。写成 `120s` 会被当成约 120ms，模型还没吐出第一个 token 就 502 `first byte timeout`。当前 `first_byte` 180000、`io` 300000。非流式要等整段生成完才有首字节。
- 改超时或反代路径后，用更快的 `tinyllama:latest` 测一轮流式，确认不是整段一次性返回。
- 镜像已从 `akorn/h2o` 拷入 `/usr/local/share/h2o`（含 `ca-bundle.crt`）。若仍看到缺文件警告，说明该层没拷上；缺 bundle 只影响反代 HTTPS，对接本机 HTTP Ollama 可忽略。
- `GET /get` 回 JSON：全部请求头、`remote-ip`（`CF-Connecting-IP` / `X-Real-IP` / `X-Forwarded-For` 首段）、`peer-ip`（连到 h2o 的 TCP 对端）。这份 `akorn/h2o` 没有 mruby，由容器内 Perl 回显、h2o 反代。会带出 Cookie，只当调试。本机 `make run` / `make serve` 没有这条路径。
- access-log 第一列按同样顺序回退（无 CF 头时用 X-Real-IP / XFF / TCP 对端），不是 Envoy 的 peer IP。

## 功能

- 启动时拉取 `/api/tags`，默认选中 `llama3.2:3b`
- 流式对话（`POST /api/chat`，`stream: true`）
- 输入框下显示本轮 / 会话 token（Ollama 最后一条 `prompt_eval_count` / `eval_count`）；清空会话一并清零
- 停止生成、清空会话
- Enter 发送，Shift+Enter 换行
- 输入区「转写」：上传音频/视频，本机 Whisper large-v3 出文字并写入输入框（不自动发送）
- 助手回复旁「朗读」：本机 mlx-audio / Qwen3-TTS 合成后再播放（不自动朗读）

音频转写（Apple Silicon）：先 `brew install ffmpeg`，再另开终端 `make whisper`（`127.0.0.1:8173`）。`make run` / `make up` 都会把 `/whisper` 转到这个服务。模型可用 `WHISPER_MODEL=mlx-community/whisper-large-v3-turbo` 换成更快的 turbo。容器里不跑 Whisper，和 Ollama 一样打到宿主机。

文字转语音：另开终端 `make tts`（`127.0.0.1:8273`）。默认 `Qwen3-TTS-12Hz-1.7B-CustomVoice-8bit`，中文声线 `Vivian`。首次会重新下载模型。要退回 Kokoro：`TTS_MODEL=mlx-community/Kokoro-82M-bf16 TTS_VOICE=zf_xiaobei make tts`。容器里不跑 TTS，走 `host.docker.internal:8273`。

调试可用 `tinyllama:latest`，它比 `llama3.2:3b` 更快。

## 和 Open WebUI 的关系

仓库里的 `debian13.open-webui-0.11.3` 是现成对照产品。本项目只覆盖聊天主循环，不做登录、知识库、工具调用。`tinyllama` 没有 tools 模板，这里只走纯 chat。
