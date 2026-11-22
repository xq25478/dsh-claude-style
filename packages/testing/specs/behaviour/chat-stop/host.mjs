/**
 * Only the host services the sent line reads are supplied: the live status and
 * the session list, and one binding whose conversation service records the
 * cancel. The conversation body carries the session id the host writes on it,
 * which is where the line reads the session it stands for — the same place the
 * host's own double Esc reads it. The flow stands with two settled user rows,
 * so a spec can see the line take the last one.
 */
import { mountConversation } from '../../fixtures/host-frame.mjs'
import { installHostServiceOverride } from '../../fixtures/host-services.mjs'

export const SESSION = 'behaviour-session'

export async function setup(t, { running = true, cardSelector = t.host('composer.card') } = {}) {
  await mountConversation(t)
  await installHostServiceOverride(t.page)
  return t.page.evaluate(({ id, initialRunning, card }) => {
    const seat = document.querySelector(card)
    if (seat === null) throw new Error('chat-stop host: the page has no composer card')
    const body = seat.closest('[data-conversation-content]') ?? seat.parentElement
    body.setAttribute('data-conversation-session', id)

    const scroller = document.querySelector('[data-conversation-scroll]')
    if (scroller === null) throw new Error('chat-stop host: the page has no conversation scroller')
    const flow = document.createElement('div')
    flow.setAttribute('data-chat-flow', '')
    for (const key of ['first', 'second']) {
      const row = document.createElement('div')
      row.setAttribute('data-chat-flow-kind', 'user')
      row.setAttribute('data-chat-flow-key', key)
      row.textContent = key
      flow.append(row)
    }
    scroller.append(flow)

    const channels = { status: new Set(), list: new Set() }
    const subscribe = (key) => (listener) => { channels[key].add(listener); return () => { channels[key].delete(listener) } }
    const emit = (key) => { for (const listener of [...channels[key]]) listener() }
    let statusNow = new Map([[id, { running: initialRunning }]])
    let listNow = { ids: [id], byId: { [id]: { running: initialRunning } } }
    const calls = []
    const conversation = {
      cancel() {
        calls.push(id)
        statusNow = new Map([[id, { running: false }]])
        listNow = { ids: [id], byId: { [id]: { running: false } } }
        emit('status')
        emit('list')
        return Promise.resolve()
      },
    }
    const binding = { ctx: { get: (name) => (name === 'conversation' ? conversation : undefined) } }
    const sessions = {
      list: { getSnapshot: () => listNow, subscribe: subscribe('list') },
      binding: (wanted) => (wanted === id ? binding : undefined),
      refresh: () => Promise.resolve(),
    }
    const services = {
      'uiSession.sessionStatus': { getSnapshot: () => statusNow, subscribe: subscribe('status') },
      sessions,
    }
    window.__overrideHostServices(services)
    window.__stopHost = {
      id,
      calls: () => calls.slice(),
      setRunning(next) {
        statusNow = new Map([[id, next === undefined ? { running: false } : { running: true, ...next }]])
        listNow = { ids: [id], byId: { [id]: { running: next !== undefined } } }
        emit('status')
        emit('list')
      },
      /** How many settled user rows the flow holds, and which of them carries the line. */
      rows: () => [...document.querySelectorAll('[data-chat-flow-kind="user"]')].map((row) => ({
        key: row.getAttribute('data-chat-flow-key'),
        line: row.querySelector('[data-dsh-claude-sent-line]') !== null,
      })),
    }
    window.__dispose()
    window.__skin.apply(window.__ctx)
  }, { id: SESSION, initialRunning: running, card: cardSelector }).then(async (host) => {
    await t.settle()
    return {
      ...host,
      setRunning: async (next) => {
        await t.page.evaluate((value) => { window.__stopHost.setRunning(value) }, next)
        await t.settle()
      },
      rows: () => t.page.evaluate(() => window.__stopHost.rows()),
      calls: () => t.page.evaluate(() => window.__stopHost.calls()),
    }
  })
}

export const STOP = '.dsh-claude-stop'
export const LINE = '[data-dsh-claude-sent-line]'
