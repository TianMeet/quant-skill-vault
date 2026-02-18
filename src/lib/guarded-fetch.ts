type GuardedFetchOptions = {
  key?: string
  throttleMs?: number
  dedupeInFlight?: boolean
}

const inFlightRequests = new Map<string, Promise<Response>>()
const lastRequestAt = new Map<string, number>()

function delay(ms: number) {
  if (ms <= 0) return Promise.resolve()
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
}

function isAbortError(err: unknown): boolean {
  return (
    (typeof DOMException !== 'undefined' && err instanceof DOMException && err.name === 'AbortError') ||
    (err instanceof Error && err.name === 'AbortError')
  )
}

function getRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.toString()
  if (typeof Request !== 'undefined' && input instanceof Request) return input.url
  return String(input)
}

function getBodySignature(body: BodyInit | null | undefined): string {
  if (!body) return ''
  if (typeof body === 'string') return body.slice(0, 2000)
  if (body instanceof URLSearchParams) return body.toString()
  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    const entries: string[] = []
    body.forEach((value, key) => {
      entries.push(`${key}:${typeof value === 'string' ? value : '[file]'}`)
    })
    return entries.join('&')
  }
  return ''
}

function buildRequestKey(input: RequestInfo | URL, init?: RequestInit, method = 'GET'): string {
  const url = getRequestUrl(input)
  const bodySig = getBodySignature(init?.body)
  return `${method.toUpperCase()}::${url}::${bodySig}`
}

export async function guardedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
  options?: GuardedFetchOptions
): Promise<Response> {
  // 服务端不做全局节流，避免跨请求共享状态
  if (typeof window === 'undefined') {
    return fetch(input, init)
  }

  const method = String(init?.method || 'GET').toUpperCase()
  const key = options?.key || buildRequestKey(input, init, method)
  const hasAbortSignal = !!init?.signal
  // 带 signal 的请求不做全局 in-flight 复用，避免把后续请求绑定到一个即将被 abort 的 Promise 上
  const dedupeInFlight = options?.dedupeInFlight ?? !hasAbortSignal
  const throttleMs = options?.throttleMs ?? (method === 'GET' || method === 'HEAD' ? 0 : 650)

  if (dedupeInFlight) {
    const inFlight = inFlightRequests.get(key)
    if (inFlight) {
      try {
        const response = await inFlight
        return response.clone()
      } catch (err) {
        if (!isAbortError(err)) throw err
        if (inFlightRequests.get(key) === inFlight) {
          inFlightRequests.delete(key)
        }
      }
    }
  }

  const elapsed = Date.now() - (lastRequestAt.get(key) || 0)
  if (throttleMs > 0 && elapsed < throttleMs) {
    await delay(throttleMs - elapsed)
  }

  lastRequestAt.set(key, Date.now())

  const requestPromise = fetch(input, init)
  if (dedupeInFlight) {
    inFlightRequests.set(key, requestPromise)
  }

  try {
    const response = await requestPromise
    return dedupeInFlight ? response.clone() : response
  } catch (err) {
    if (isAbortError(err)) {
      lastRequestAt.delete(key)
    }
    throw err
  } finally {
    if (dedupeInFlight && inFlightRequests.get(key) === requestPromise) {
      inFlightRequests.delete(key)
    }
  }
}
