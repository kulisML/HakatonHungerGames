import { z } from 'zod'

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

export type OpenRouterConfig = {
  baseUrl: string
  keys: string[]
  defaultModel: string
  reasoningEnabled: boolean
  onTrace?: (rec: Record<string, unknown>) => void
}

export class OpenRouterClient {
  private cfg: OpenRouterConfig

  constructor(cfg: OpenRouterConfig) {
    this.cfg = cfg
  }

  async chatJson<T>(opts: {
    agentIndex: number
    model?: string
    messages: ChatMessage[]
    schema: z.ZodType<T>
    maxTokens?: number
  }): Promise<T | null> {
    const key = this.cfg.keys[opts.agentIndex % this.cfg.keys.length]
    if (!key) return null
    const started = Date.now()

    const res = await fetch(`${this.cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: opts.model ?? this.cfg.defaultModel,
        messages: opts.messages,
        max_tokens: opts.maxTokens ?? 220,
        temperature: 0.7,
        response_format: { type: 'json_object' },
        ...(this.cfg.reasoningEnabled ? { reasoning: { enabled: true } } : {}),
      }),
    }).catch(() => null)

    this.cfg.onTrace?.({
      kind: 'llm',
      agentIndex: opts.agentIndex,
      model: opts.model ?? this.cfg.defaultModel,
      ok: Boolean(res?.ok),
      status: res?.status ?? null,
      ms: Date.now() - started,
    })

    if (!res || !res.ok) return null
    const json = (await res.json().catch(() => null)) as any
    const text = json?.choices?.[0]?.message?.content
    if (typeof text !== 'string') return null
    const obj = safeJson(text)
    if (!obj) return null
    const parsed = opts.schema.safeParse(obj)
    if (!parsed.success) return null
    return parsed.data
  }
}

function safeJson(s: string) {
  try {
    return JSON.parse(s)
  } catch {
    const start = s.indexOf('{')
    const end = s.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(s.slice(start, end + 1))
      } catch {
        return null
      }
    }
    return null
  }
}

