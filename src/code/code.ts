import { createHighlighterCore } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import python from '@shikijs/langs/python'
import './code.css'

const theme = {
  name: 'tailwind-home',
  type: 'dark' as const,
  colors: {
    'editor.foreground': '#e2e8f0',
    'editor.background': '#0f172a',
  },
  tokenColors: [
    { scope: ['comment', 'punctuation.definition.comment'], settings: { foreground: '#64748b' } },
    {
      scope: ['keyword', 'storage', 'storage.type', 'storage.modifier'],
      settings: { foreground: '#c4b5fd' },
    },
    { scope: ['entity.name.function', 'support.function'], settings: { foreground: '#7dd3fc' } },
    { scope: ['string', 'entity.name.type'], settings: { foreground: '#bef264' } },
    { scope: ['constant.numeric', 'constant.language'], settings: { foreground: '#f9a8d4' } },
    { scope: ['punctuation', 'meta.brace'], settings: { foreground: '#94a3b8' } },
  ],
}

const source = `class TextEncoder(nn.Module):
    def __init__(self):
        super().__init__()
        self.bert = BertModel.from_pretrained('bert-base-uncased')

        for param in self.bert.parameters():
            param.requires_grad = False

        self.projection = nn.Linear(768, 128)

    def forward(self, input_ids, attention_mask):
        # Extract BERT embeddings
        outputs = self.bert(input_ids=input_ids, attention_mask=attention_mask)

        # Use [CLS] token representation
        pooler_output = outputs.pooler_output

        return self.projection(pooler_output)`

void createHighlighterCore({
  themes: [theme],
  langs: [python],
  engine: createJavaScriptRegexEngine(),
}).then((highlighter) => {
  const wrapper = document.createElement('div')
  wrapper.innerHTML = highlighter.codeToHtml(source, {
    lang: 'python',
    theme: 'tailwind-home',
    transformers: [
      {
        name: 'line-numbers',
        line(node, line) {
          node.properties['data-line-number'] = String(line)
        },
      },
    ],
  })

  const pre = wrapper.firstElementChild
  if (!(pre instanceof HTMLElement)) {
    throw new Error('无法生成代码块')
  }

  for (const line of pre.querySelectorAll<HTMLElement>('.line')) {
    const content = document.createElement('span')
    content.className = 'line-content'
    content.append(...line.childNodes)
    line.append(content)
  }

  document.querySelector('#code-block')?.append(pre)
})
