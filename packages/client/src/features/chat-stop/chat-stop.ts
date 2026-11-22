import { HOST_STOP_ATTR } from '../../constants'
import { CONVERSATION_SESSION_ANCESTOR_SELECTOR } from '@dsh-claude-style/contracts/dom'
import { closestFrom } from '@dsh-claude-style/engine/dom'
import { requestFrame } from '@dsh-claude-style/engine/frame'
import { conversationSessionId, findComposerRowIn, observeComposerCards, observeSession } from '@dsh-claude-style/engine/host'
import { copy } from './copy'
import { attachStopHost, sessionRuns, statusStore, stopTurn } from './chat-stop-state'
import type { HostContext } from '@dsh-claude-style/engine/host'
import type { FeatureUi } from '../../core/feature'
import type manifest from './chat-stop.manifest'

/**
 * Claude's stop, in the composer row beside the model seat.
 *
 * The host's own stop stands in the send button's place only while the draft is
 * empty or an owner block holds the turn (skeleton/InputBar.tsx): with words in
 * the field a running turn offers no stop at all, and the reader's only way out
 * is double Esc. This control fills that seat and stands down whenever the
 * host's own stop holds it, so one stop is on screen at a time, and it presses
 * the same act: the session's conversation service cancel, which ends the turn
 * and keeps the queue.
 *
 * The node is the skin's own, appended to the host's row rather than registered
 * into a slot: the row is where the send button lives, and a node beside it
 * needs no React render of the host's to reach the reader (D40: the pass that
 * keeps it is the bus's, not a second observer's).
 */

/** On the control, and how a spec finds it. */
export const STOP_ATTR = 'data-dsh-claude-stop'
/** The stop is out of the row: the host's own stop holds the seat, or nothing runs. */
const OUT_CLASS = 'is-out'
/** A press has been handed to the host and its answer is not in yet. */
const STOPPING_CLASS = 'is-stopping'
/** The last press reached no cancel; the next one may. */
const FAILED_CLASS = 'is-failed'
const GLYPH_NS = 'http://www.w3.org/2000/svg'
/** The row lays its controls out in a flex line: the stop takes the seat before the send button. */
const BUTTON_SELECTOR = 'button'

export function install(ctx: HostContext, ui: FeatureUi<typeof manifest>) {
  attachStopHost(ctx)
  const cards = observeComposerCards()
  /** Each row's control, kept per row so the cleanup takes every one down. */
  const controls = new Set<HTMLElement>()
  let pending: (() => void) | null = null
  let stopped = false

  /**
   * The square the host's own stop draws, one size down: a rounded block, which
   * reads as "hold" where the send arrow reads as "go".
   */
  function glyph(): SVGSVGElement {
    const svg = document.createElementNS(GLYPH_NS, 'svg')
    svg.setAttribute('viewBox', '0 0 16 16')
    svg.setAttribute('width', '16')
    svg.setAttribute('height', '16')
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

  /** The session the control inside `row` speaks for: the id the host names on the column above it. */
  function sessionOf(row: HTMLElement): string | null {
    return conversationSessionId(closestFrom(row, CONVERSATION_SESSION_ANCESTOR_SELECTOR))
  }

  function writeLabel(control: HTMLElement) {
    const label = copy(control.classList.contains(FAILED_CLASS) ? 'stopFailed' : control.classList.contains(STOPPING_CLASS) ? 'stopping' : 'stop')
    if (control.getAttribute('aria-label') !== label) control.setAttribute('aria-label', label)
    if (control.getAttribute('title') !== label) control.setAttribute('title', label)
  }

  /** The press: resolved from the column the control stands in, so a switch under it cannot reach the wrong session. */
  function press(control: HTMLElement) {
    const sessionId = sessionOf(control)
    if (sessionId === null) return
    if (control.classList.contains(STOPPING_CLASS)) return
    const sent = stopTurn(sessionId)
    if (sent === null) {
      control.classList.add(FAILED_CLASS)
      writeLabel(control)
      return
    }
    control.classList.remove(FAILED_CLASS)
    control.classList.add(STOPPING_CLASS)
    writeLabel(control)
    const settle = (failed: boolean) => {
      if (stopped) return
      control.classList.remove(STOPPING_CLASS)
      if (failed) control.classList.add(FAILED_CLASS)
      writeLabel(control)
      schedule()
    }
    sent.then(() => settle(false), () => settle(true))
  }

  /** The control inside `row`, made and placed the first time; the seat before the send button. */
  function ensureControl(row: HTMLElement): HTMLElement {
    const existing = row.querySelector<HTMLElement>(`[${STOP_ATTR}]`)
    if (existing !== null) {
      controls.add(existing)
      return existing
    }
    const control = document.createElement('button')
    control.setAttribute(STOP_ATTR, '')
    control.className = 'dsh-claude-stop'
    control.setAttribute('type', 'button')
    control.appendChild(glyph())
    control.addEventListener('click', () => press(control))
    // The row's own line holds the send button: the control takes the seat just
    // before it, and stands at the row's end where the host draws no send.
    const buttons = row.querySelectorAll<HTMLElement>(BUTTON_SELECTOR)
    const send = buttons.length === 0 ? null : buttons[buttons.length - 1]
    const anchor = send === null ? null : send.parentElement
    if (send !== null && anchor !== null && row.contains(anchor)) anchor.insertBefore(control, send)
    else row.appendChild(control)
    controls.add(control)
    return control
  }

  function sync() {
    if (stopped) return
    const live = new Set<HTMLElement>()
    for (const card of cards.all()) {
      const row = findComposerRowIn(card) ?? card
      const control = ensureControl(row)
      live.add(control)
      const running = sessionRuns(sessionOf(row))
      const out = !running || card.hasAttribute(HOST_STOP_ATTR)
      if (control.classList.contains(OUT_CLASS) !== out) control.classList.toggle(OUT_CLASS, out)
      writeLabel(control)
    }
    // A row the host took away leaves its control; the cleanup takes the rest.
    for (const control of [...controls]) {
      if (live.has(control)) continue
      control.remove()
      controls.delete(control)
    }
  }

  /** One pass per frame: publishes and status changes both land here (D40). */
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
    cards.release()
    for (const control of controls) control.remove()
    controls.clear()
    attachStopHost(null)
  }
}
