import { CONVERSATION_SESSION_ANCESTOR_SELECTOR, FLOW_KIND_ATTRIBUTE, USER_ROW_KIND } from '@dsh-claude-style/contracts/dom'
import { observeMatches } from '@dsh-claude-style/engine/bus'
import { closestFrom } from '@dsh-claude-style/engine/dom'
import { requestFrame } from '@dsh-claude-style/engine/frame'
import { conversationSessionId, observeSession } from '@dsh-claude-style/engine/host'
import { copy } from './copy'
import { attachStopHost, sessionRuns, statusStore, stopTurn } from './chat-stop-state'
import type { HostContext } from '@dsh-claude-style/engine/host'
import type { FeatureUi } from '../../core/feature'
import type manifest from './chat-stop.manifest'

/**
 * The sent message's own line: 「已发送」, and while its turn runs, the stop that
 * ends it.
 *
 * Claude Code Desktop answers a sent message under the message itself rather
 * than in the composer — the reader reads there whether the message went out and
 * presses there to interrupt the answer. The composer is where the answer will
 * be typed next, so it keeps no stop of the skin's: the host's own stop still
 * stands in the send button's seat for an empty draft (skeleton/InputBar.tsx),
 * and this line covers the case that seat leaves open — a turn sent with words
 * still in the field.
 *
 * The line is the skin's own node appended to the host's last user row: the row
 * is where the reader looks, and a node of our own needs no React render of the
 * host's to reach it. One bus subscription keeps it (D40); the pass that writes
 * it runs in the frame's write phase (D40). The press is the host's own act —
 * the session conversation service's cancel, the one double Esc reaches.
 */

/** On the line, and how a spec finds it. */
export const SENT_LINE_ATTR = 'data-dsh-claude-sent-line'
/** On the control that ends the turn. */
export const STOP_ATTR = 'data-dsh-claude-stop'
/** The button's word, when a press has been handed over and its answer is not in yet. */
const STOPPING_CLASS = 'is-stopping'
/** The last press reached no cancel; the next one may. */
const FAILED_CLASS = 'is-failed'
const GLYPH_NS = 'http://www.w3.org/2000/svg'
/** The host's settled user row: the last one in the flow is the message the running turn answers. */
const USER_ROW_SELECTOR = `[${FLOW_KIND_ATTRIBUTE}="${USER_ROW_KIND}"]`
/** The control's word, the label over it, and the line's own two parts. */
const WORD_CLASS = 'dsh-claude-stop-word'
const SENT_WORD_CLASS = 'dsh-claude-sent-word'

/** One row's line, kept per row so a pass can take every other one down. */
interface SentLine {
  line: HTMLElement
  word: HTMLElement
  control: HTMLButtonElement
  label: HTMLElement
}

export function install(ctx: HostContext, ui: FeatureUi<typeof manifest>) {
  attachStopHost(ctx)
  /** The host's settled user rows, in document order, kept current by the bus. */
  const userRows = observeMatches<HTMLElement>(USER_ROW_SELECTOR, schedule)
  const lines = new Map<HTMLElement, SentLine>()
  /** The row standing with a press in flight, so its answer lands on it after the turn ends. */
  const pressed = new Set<HTMLElement>()
  let pending: (() => void) | null = null
  let stopped = false

  /** The square the host's own stop draws, one size down: a rounded block, which reads as "hold" where the send arrow reads as "go". */
  function glyph(): SVGSVGElement {
    const svg = document.createElementNS(GLYPH_NS, 'svg')
    svg.setAttribute('viewBox', '0 0 16 16')
    svg.setAttribute('width', '12')
    svg.setAttribute('height', '12')
    svg.setAttribute('aria-hidden', 'true')
    svg.setAttribute('focusable', 'false')
    const rect = document.createElementNS(GLYPH_NS, 'rect')
    rect.setAttribute('x', '3.5')
    rect.setAttribute('y', '3.5')
    rect.setAttribute('width', '9')
    rect.setAttribute('height', '9')
    rect.setAttribute('rx', '2.5')
    rect.setAttribute('fill', 'currentColor')
    svg.appendChild(rect)
    return svg
  }

  /** The session a row speaks for: the id the host names on the column above it. */
  function sessionOf(row: HTMLElement): string | null {
    return conversationSessionId(closestFrom(row, CONVERSATION_SESSION_ANCESTOR_SELECTOR))
  }

  function writeWords(entry: SentLine, failed: boolean) {
    const stopping = entry.control.classList.contains(STOPPING_CLASS)
    const word = copy(failed ? 'stopFailed' : stopping ? 'stopping' : 'stopAction')
    const label = copy(failed ? 'stopFailed' : stopping ? 'stopping' : 'stop')
    if (entry.label.textContent !== word) entry.label.textContent = word
    if (entry.control.getAttribute('aria-label') !== label) entry.control.setAttribute('aria-label', label)
    if (entry.control.getAttribute('title') !== label) entry.control.setAttribute('title', label)
  }

  /** The press: resolved from the row the line stands in, so a switch under it cannot reach the wrong session. */
  function press(row: HTMLElement, entry: SentLine) {
    if (pressed.has(row) || entry.control.classList.contains(STOPPING_CLASS)) return
    const sessionId = sessionOf(row)
    if (sessionId === null) return
    const sent = stopTurn(sessionId)
    if (sent === null) {
      entry.control.classList.add(FAILED_CLASS)
      writeWords(entry, true)
      return
    }
    entry.control.classList.remove(FAILED_CLASS)
    entry.control.classList.add(STOPPING_CLASS)
    writeWords(entry, false)
    pressed.add(row)
    const settle = (failed: boolean) => {
      pressed.delete(row)
      if (stopped) return
      entry.control.classList.remove(STOPPING_CLASS)
      if (failed) entry.control.classList.add(FAILED_CLASS)
      writeWords(entry, failed)
      schedule()
    }
    sent.then(() => settle(false), () => settle(true))
  }

  /** The line inside `row`, made the first time it is needed. */
  function ensureLine(row: HTMLElement): SentLine {
    const existing = lines.get(row)
    if (existing !== undefined && row.contains(existing.line)) return existing
    const line = document.createElement('div')
    line.className = 'dsh-claude-sent-line'
    line.setAttribute(SENT_LINE_ATTR, '')
    const word = document.createElement('span')
    word.className = SENT_WORD_CLASS
    word.textContent = copy('sent')
    const control = document.createElement('button')
    control.className = 'dsh-claude-stop'
    control.setAttribute(STOP_ATTR, '')
    control.setAttribute('type', 'button')
    control.appendChild(glyph())
    const label = document.createElement('span')
    label.className = WORD_CLASS
    control.appendChild(label)
    line.append(word, control)
    row.appendChild(line)
    const entry: SentLine = { line, word, control, label }
    control.addEventListener('click', () => press(row, entry))
    writeWords(entry, false)
    lines.set(row, entry)
    return entry
  }

  function drop(row: HTMLElement) {
    const entry = lines.get(row)
    if (entry === undefined) return
    entry.line.remove()
    lines.delete(row)
  }

  /**
   * One line stands, under the last settled user message, and only while its
   * session runs: the reader reads there that the message went out and, while
   * the answer is being written, that it can be ended.
   */
  function sync() {
    if (stopped) return
    const rows = userRows.all()
    const last = rows.length === 0 ? null : rows[rows.length - 1]
    const sessionId = last === null ? null : sessionOf(last)
    const running = sessionRuns(sessionId)
    for (const row of [...lines.keys()]) {
      if (row !== last || !running) drop(row)
    }
    if (last !== null && running) ensureLine(last)
  }

  /** One pass per frame: the bus's records and the status both land here (D40). */
  function schedule() {
    if (stopped || pending !== null) return
    pending = requestFrame({
      write() {
        pending = null
        sync()
      },
    })
  }

  const status = statusStore()
  const offStatus = typeof status?.subscribe === 'function' ? status.subscribe(schedule) : null
  const offSession = observeSession(schedule)
  ui.chatStop = { sync }
  sync()

  return () => {
    stopped = true
    if (pending !== null) pending()
    pending = null
    offStatus?.()
    offSession()
    userRows.release()
    for (const entry of lines.values()) entry.line.remove()
    lines.clear()
    pressed.clear()
    attachStopHost(null)
  }
}
