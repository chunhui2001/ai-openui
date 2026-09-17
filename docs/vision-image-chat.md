# 聊天图片上传与文字／代码识别

## 目标

在 `ai-playground` 的聊天输入框中选择图片、预览后随消息发送。视觉模型识别图片中的文字或代码，并沿用现有 Ollama NDJSON 流式输出显示回答。

首版直接使用 Ollama 的视觉能力；不需要新增上传存储服务或独立 OCR 服务。

## 当前项目的适配点

项目已经具备实现该功能的基础：

- 页面入口：`src/ai-playground/index.html`
- 聊天状态与发送逻辑：`src/ai-playground/ai-playground.ts`
- 消息类型与 Ollama 返回类型：`src/ai-playground/types.ts`
- Ollama 客户端与流式解析：`src/ai-playground/api.ts`
- 同源代理：开发环境在 `vite.config.ts`，容器环境在 `docker/h2o.conf.template`

现有请求已经通过同源 `/ollama/api/chat` 代理给本机 Ollama，因此图片应跟随同一个 JSON 请求发送，不必改动代理路径。

## 模型准备

必须选用视觉模型；项目当前用于调试的 `llama3.2:3b` 和 `tinyllama:latest` 不支持图片输入。

建议优先使用 Qwen VL：

```bash
# 资源较有限时
ollama pull qwen2.5vl:7b

# 资源充足时，获得更好的 OCR 与代码识别效果
ollama pull qwen2.5vl:32b
```

`src/ai-playground/ui.ts` 已将 `qwen2.5vl:32b` 设为优先选择的模型名。也可以使用其他已安装且明确支持 vision 的 Ollama 模型，例如 `gemma3`。

## Ollama 请求格式

Ollama 的 REST Chat API 在每一条消息上支持 `images` 数组。数组元素是**不带 Data URL 前缀**的 Base64 图片数据。

```json
{
  "model": "qwen2.5vl:7b",
  "stream": true,
  "messages": [
    {
      "role": "user",
      "content": "请准确提取图片中的文字和代码。",
      "images": ["iVBORw0KGgoAAAANSUhEUg..."]
    }
  ]
}
```

回复格式与现有 NDJSON 流式处理完全一致，仍由 `chatStream()` 逐段追加 `message.content`。

官方参考：[Ollama Vision](https://docs.ollama.com/capabilities/vision)、[Ollama Chat API](https://docs.ollama.com/api/chat)。

## 前端实现

### 1. 图片选择与预览

在 `src/ai-playground/index.html` 的 `.composer-tools` 添加隐藏文件输入和触发按钮：

```html
<input id="image" type="file" accept="image/png,image/jpeg,image/webp" hidden />
<button id="upload-image" type="button" class="icon-btn" aria-label="上传图片" title="上传图片">
  上传图片
</button>
```

在 `ui.ts` 的 `els` 中登记两个元素。选择文件后：

1. 验证 MIME 类型、单图大小和图片数量；
2. 用 `URL.createObjectURL(file)` 创建本地缩略图；
3. 提供移除按钮；
4. 移除、发送完成或清空会话时调用 `URL.revokeObjectURL()`，避免内存泄漏。

建议首版限制：最多 3 张、每张原文件不超过 5 MB，仅接受 PNG、JPEG 和 WebP。

### 2. 将图片编码为 Base64

浏览器端可用 `FileReader` 编码。结果是 Data URL，需要去掉 MIME 前缀后再发给 Ollama：

```ts
function readImageBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('读取图片失败'))
    reader.onload = () => {
      const result = reader.result
      if (typeof result !== 'string') {
        reject(new Error('图片编码失败'))
        return
      }
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.readAsDataURL(file)
  })
}
```

可在选图时编码，发送时不用等待；也可在发送时并行 `Promise.all()` 编码。

### 3. 扩展消息类型

在 `src/ai-playground/types.ts` 增加本地图片状态。`url` 仅用于浏览器预览，`base64` 才会进入 API 请求。

```ts
export type MessageImage = {
  file: File
  url: string
  base64: string
}

export type Message = {
  role: Role
  content: string
  images?: MessageImage[]
  audio?: MessageAudio
  transcript?: string
  transcribing?: boolean
}
```

发送时允许“仅图片、无文字”的消息，并在 `send()` 内使用默认提示词：

```ts
const prompt = els.input.value.trim() || '请识别图片中的全部文字和代码。'
messages.push({ role: 'user', content: prompt, images: pendingImages })
```

### 4. 发送给 Ollama 的消息转换

不要直接 `JSON.stringify(messages)`，因为 `File`、预览 URL 和 UI 状态不属于 API 协议。在 `src/ai-playground/api.ts` 或调用前转换为 API 消息：

```ts
const apiMessages = messages.map(({ role, content, images }) => ({
  role,
  content,
  ...(images?.length ? { images: images.map((image) => image.base64) } : {}),
}))
```

将 `chatStream()` 的参数类型改为该 API 消息类型，或让它在内部完成该映射。推荐单独定义：

```ts
export type OllamaMessage = {
  role: Role
  content: string
  images?: string[]
}
```

### 5. 聊天气泡展示

在 `renderMessages()` / `createBubble()` 中，先渲染用户消息的图片缩略图，再渲染文字。缩略图应支持：

- 点击在新标签或轻量预览层中查看原图；
- `alt="用户上传的图片"`；
- 最大显示宽度与气泡宽度一致，保持比例；
- 移动端不超出聊天区域。

## 识别提示词

用户可输入自己的问题。无文本输入时使用以下默认提示词：

```text
请识别图片中的全部文字和代码。
- 代码必须放入带语言标记的 Markdown 代码块；
- 尽量保留原始缩进、换行和符号；
- 模糊、遮挡或无法确认的字符标为 [不确定]；
- 若图片中含报错信息，说明可能原因和修复建议。
```

模型输出已有 Shiki 代码块渲染支持，因此只要模型以 Markdown fenced code block 输出，现有 UI 即可高亮。

## 成本、性能与安全边界

- Base64 相比原图体积约增加三分之一；上传前可压缩图片，并将最长边限制为 1600～2000px。
- 当前聊天会把完整 `messages` 历史重发给模型。带图消息会重复携带 Base64，长会话应只保留最近的图片消息，或做历史截断。
- 公开部署时，前端限制不能替代服务端限制。应在反向代理或后端限制请求体大小、请求频率与允许的 MIME 类型。
- 不要把图片 Base64 写进日志、浏览器 localStorage 或分析系统；截图可能含密钥、个人信息或源代码。
- 视觉模型会发生 OCR 误识别。对可执行代码、密钥和生产配置必须由用户复核。

## 后续：独立 OCR 模式

第一版不建议增加 OCR 服务。若需要扫描件、表格、票据或大段小字号代码的稳定逐字提取，可加入 PaddleOCR：

```text
图片 → PaddleOCR 文本与位置 → 视觉模型校对、补全代码结构、回答用户问题
```

该模式适合追求可搜索、可导出和可审计的识别结果；普通图片问答与代码截图识别则优先保持“视觉模型直连”的简洁方案。

## 验收清单

- [ ] 上传 PNG、JPEG、WebP 后能看到缩略图，且可移除。
- [ ] 无文字、仅上传图片时可以发送。
- [ ] `qwen2.5vl` 能识别中英文与截图中的代码，并以流式方式输出。
- [ ] 模型不支持视觉输入时，界面能给出明确提示。
- [ ] 代码块在助手气泡中保持 Shiki 高亮和行号。
- [ ] 大图、超量图片、错误 MIME 类型都被前端拦截。
- [ ] 清空会话和移除图片后，本地 Object URL 被释放。
- [ ] 多轮对话中，图片提问的上下文与请求大小符合预期。
