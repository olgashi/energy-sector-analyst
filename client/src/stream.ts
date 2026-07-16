import type { WorkflowEvent } from './types'

export async function readEventStream(
  stream: ReadableStream<Uint8Array>,
  onEvent: (event: WorkflowEvent) => void,
) {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { value, done } = await reader.read()

    if (done) {
      break
    }

    buffer += decoder.decode(value, { stream: true })
    const blocks = buffer.split('\n\n')
    buffer = blocks.pop() ?? ''

    for (const block of blocks) {
      const dataLine = block
        .split('\n')
        .find((line) => line.startsWith('data: '))

      if (!dataLine) {
        console.debug('[article-analysis] stream block without data line', { block })
        continue
      }

      try {
        onEvent(JSON.parse(dataLine.slice('data: '.length)) as WorkflowEvent)
      } catch (parseError) {
        console.error('[article-analysis] failed to parse stream event', {
          dataLine,
          parseError,
        })
        throw parseError
      }
    }
  }
}
