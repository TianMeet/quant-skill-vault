'use client'

import { useState, useCallback, useRef } from 'react'
import type { ChatMessage, ToolCallData, SkillDraft, SSEEvent } from './types'

let msgCounter = 0
const genId = () => `msg_${Date.now()}_${++msgCounter}`

interface UseChatOptions {
  onDraftUpdate?: (draft: SkillDraft) => void
}

export function useChat(options?: UseChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [pendingToolCall, setPendingToolCall] = useState<ToolCallData | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const onDraftUpdateRef = useRef(options?.onDraftUpdate)
  onDraftUpdateRef.current = options?.onDraftUpdate

  const sendMessage = useCallback(
    async (content: string) => {
      if (isStreaming) return

      const userMsg: ChatMessage = { id: genId(), role: 'user', content }
      setMessages((prev) => [...prev, userMsg])
      setIsStreaming(true)
      setStreamingText('')
      setPendingToolCall(null)

      // 构建 Anthropic 消息格式
      const apiMessages = buildApiMessages([...messages, userMsg])

      const controller = new AbortController()
      abortRef.current = controller

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: apiMessages }),
          signal: controller.signal,
        })

        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error || 'Request failed')
        }

        const reader = res.body!.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let accText = ''
        let toolCall: ToolCallData | null = null
        // 收集所有 draft tool calls 以便存入消息
        const draftToolCalls: ToolCallData[] = []

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          let eventType = ''
          for (const line of lines) {
            if (line.startsWith('event: ')) {
              eventType = line.slice(7)
            } else if (line.startsWith('data: ') && eventType) {
              try {
                const data = JSON.parse(line.slice(6)) as SSEEvent
                if (eventType === 'text_delta' && 'text' in data) {
                  accText += data.text
                  setStreamingText(accText)
                } else if (eventType === 'tool_use' && 'id' in data && 'input' in data) {
                  if (data.name === 'update_skill_draft') {
                    // 自动执行，不需要用户确认
                    onDraftUpdateRef.current?.(data.input as unknown as SkillDraft)
                    draftToolCalls.push({ id: data.id, name: data.name, input: data.input })
                  } else {
                    toolCall = { id: data.id, name: data.name, input: data.input }
                    setPendingToolCall(toolCall)
                  }
                } else if (eventType === 'error' && 'message' in data) {
                  accText += `\n\n⚠️ ${data.message}`
                  setStreamingText(accText)
                }
              } catch {
                // ignore parse errors
              }
              eventType = ''
            }
          }
        }

        // 流结束，将累积文本和工具调用写入消息
        const assistantMsg: ChatMessage = {
          id: genId(),
          role: 'assistant',
          content: accText,
          toolCall,
          draftToolCalls: draftToolCalls.length > 0 ? draftToolCalls : undefined,
        }
        setMessages((prev) => [...prev, assistantMsg])
        setStreamingText('')
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          const errorMsg: ChatMessage = {
            id: genId(),
            role: 'assistant',
            content: `⚠️ ${(err as Error).message || '请求失败，请重试'}`,
          }
          setMessages((prev) => [...prev, errorMsg])
        }
      } finally {
        setIsStreaming(false)
        abortRef.current = null
      }
    },
    [messages, isStreaming],
  )

  /** 确认创建 Skill，POST /api/skills */
  const createSkill = useCallback(async () => {
    if (!pendingToolCall) return null

    const input = pendingToolCall.input
    const body = {
      title: input.title,
      summary: input.summary,
      inputs: input.inputs || '',
      outputs: input.outputs || '',
      steps: input.steps,
      risks: input.risks || '',
      triggers: input.triggers,
      guardrails: {
        allowed_tools: input.guardrails.allowed_tools || [],
        disable_model_invocation: input.guardrails.disable_model_invocation ?? false,
        user_invocable: input.guardrails.user_invocable ?? true,
        stop_conditions: input.guardrails.stop_conditions,
        escalation: input.guardrails.escalation,
      },
      tests: input.tests,
      tags: input.tags || [],
    }

    const res = await fetch('/api/skills', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.error || 'Failed to create skill')
    }

    const skill = await res.json()

    // 更新最后一条消息的 toolResult
    setMessages((prev) => {
      const updated = [...prev]
      const last = updated[updated.length - 1]
      if (last?.toolCall) {
        updated[updated.length - 1] = {
          ...last,
          toolResult: { success: true, skillId: skill.id },
        }
      }
      return updated
    })
    setPendingToolCall(null)

    return skill
  }, [pendingToolCall])

  /** 用户在预览后要求修改，继续对话 */
  const sendRevision = useCallback(
    async (feedback: string) => {
      if (!pendingToolCall) return

      // 构造 tool_result 消息，然后继续对话
      const toolResultMsg: ChatMessage = {
        id: genId(),
        role: 'user',
        content: feedback,
        toolResult: { success: false },
      }

      setPendingToolCall(null)
      setMessages((prev) => [...prev, toolResultMsg])
      setIsStreaming(true)
      setStreamingText('')

      const apiMessages = buildApiMessages([...messages, toolResultMsg])

      // 插入 tool_result block
      const lastToolCall = messages[messages.length - 1]?.toolCall
      if (lastToolCall) {
        apiMessages.push({
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: lastToolCall.id,
              content: `用户要求修改: ${feedback}`,
            },
          ],
        })
      }

      const controller = new AbortController()
      abortRef.current = controller

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: apiMessages }),
          signal: controller.signal,
        })

        if (!res.ok) throw new Error('Request failed')

        const reader = res.body!.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let accText = ''
        let toolCall: ToolCallData | null = null
        const draftToolCalls: ToolCallData[] = []

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          let eventType = ''
          for (const line of lines) {
            if (line.startsWith('event: ')) {
              eventType = line.slice(7)
            } else if (line.startsWith('data: ') && eventType) {
              try {
                const data = JSON.parse(line.slice(6))
                if (eventType === 'text_delta') {
                  accText += data.text
                  setStreamingText(accText)
                } else if (eventType === 'tool_use') {
                  if (data.name === 'update_skill_draft') {
                    onDraftUpdateRef.current?.(data.input as unknown as SkillDraft)
                    draftToolCalls.push({ id: data.id, name: data.name, input: data.input })
                  } else {
                    toolCall = { id: data.id, name: data.name, input: data.input }
                    setPendingToolCall(toolCall)
                  }
                }
              } catch {
                // ignore
              }
              eventType = ''
            }
          }
        }

        const assistantMsg: ChatMessage = {
          id: genId(),
          role: 'assistant',
          content: accText,
          toolCall,
          draftToolCalls: draftToolCalls.length > 0 ? draftToolCalls : undefined,
        }
        setMessages((prev) => [...prev, assistantMsg])
        setStreamingText('')
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setMessages((prev) => [
            ...prev,
            { id: genId(), role: 'assistant', content: '⚠️ 请求失败，请重试' },
          ])
        }
      } finally {
        setIsStreaming(false)
        abortRef.current = null
      }
    },
    [messages, pendingToolCall],
  )

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const reset = useCallback(() => {
    abortRef.current?.abort()
    setMessages([])
    setStreamingText('')
    setPendingToolCall(null)
    setIsStreaming(false)
  }, [])

  return {
    messages,
    isStreaming,
    streamingText,
    pendingToolCall,
    sendMessage,
    createSkill,
    sendRevision,
    stopStreaming,
    reset,
  }
}

/** 将 ChatMessage[] 转为 Anthropic API 消息格式 */
function buildApiMessages(msgs: ChatMessage[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any[] = []
  for (const msg of msgs) {
    if (msg.role === 'user' && !msg.toolResult) {
      result.push({ role: 'user', content: msg.content })
    } else if (msg.role === 'assistant') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const content: any[] = []
      if (msg.content) {
        content.push({ type: 'text', text: msg.content })
      }
      // 先添加 draft tool calls
      if (msg.draftToolCalls) {
        for (const dtc of msg.draftToolCalls) {
          content.push({
            type: 'tool_use',
            id: dtc.id,
            name: dtc.name,
            input: dtc.input,
          })
        }
      }
      if (msg.toolCall) {
        content.push({
          type: 'tool_use',
          id: msg.toolCall.id,
          name: msg.toolCall.name,
          input: msg.toolCall.input,
        })
      }
      if (content.length > 0) {
        result.push({ role: 'assistant', content })
      }

      // 为 draft tool calls 自动生成 tool_result（Anthropic API 要求 tool_use 后必须跟 tool_result）
      if (msg.draftToolCalls && msg.draftToolCalls.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const toolResults: any[] = msg.draftToolCalls.map((dtc) => ({
          type: 'tool_result',
          tool_use_id: dtc.id,
          content: '已更新表单',
        }))
        result.push({ role: 'user', content: toolResults })
      }
    }
  }
  return result
}
