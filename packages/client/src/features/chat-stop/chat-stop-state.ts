import { hostSessionStatus, hostSessions, hostSnapshot, stopConversationTurn } from '@dsh-claude-style/engine/host'
import type { HostContext } from '@dsh-claude-style/engine/host'

/**
 * The host the stop reads, held for one generation: the control stands in the
 * host's composer row and asks two things of it — whether the session it stands
 * for is running, and whether the host will end that turn when it is pressed.
 */
let host: HostContext | null = null

export function attachStopHost(ctx: HostContext | null) {
  host = ctx
}

/**
 * Whether the session's own turn runs. The live status answers it; a host that
 * publishes none leaves the session list's summary, which is the same reading
 * the sidebar draws its running marks from.
 */
export function sessionRuns(sessionId: string | null): boolean {
  if (host === null || sessionId === null) return false
  const live = hostSnapshot(hostSessionStatus(host))?.get(sessionId)
  if (live !== undefined) return live.running === true
  const summary = hostSnapshot(hostSessions(host)?.list)?.byId[sessionId]
  return summary?.running === true
}

/** The status store the running state moves through, for a pass on each change; null where the host publishes none. */
export function statusStore() {
  return host === null ? null : hostSessionStatus(host)
}

/**
 * End the session's in-flight turn through the session's own conversation
 * service — the act the host's own stop and its double Esc perform (D3). Null
 * where the host answers neither a binding nor a cancel, so the control can
 * report the press instead of dropping it.
 */
export function stopTurn(sessionId: string): Promise<void> | null {
  if (host === null) return null
  const lookup = hostSessions(host)?.binding(sessionId)?.ctx
  if (lookup === undefined || lookup === null) return null
  try {
    return stopConversationTurn(lookup)
  } catch (error) {
    return Promise.reject(error)
  }
}
