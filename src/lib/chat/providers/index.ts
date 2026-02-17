import { AnthropicChatProvider } from './anthropic'
import { MockChatProvider } from './mock'
import type { ChatProviderAdapter } from './types'

export function resolveChatProvider(): ChatProviderAdapter {
  const configured = process.env.CHAT_PROVIDER
  const mode = configured || (process.env.NODE_ENV === 'test' ? 'mock' : 'anthropic')

  if (mode === 'mock') return new MockChatProvider()

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured for anthropic chat provider')
  }

  return new AnthropicChatProvider(apiKey, process.env.ANTHROPIC_BASE_URL || undefined)
}
