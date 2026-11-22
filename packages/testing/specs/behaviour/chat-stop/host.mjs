/**
 * Only the host services the stop control reads are supplied: the live status
 * and the session list, and one binding whose conversation service records the
 * cancel. The conversation body carries the session id the host writes on it,
 * which is where the control reads the session it stands for — the same place
 * the host's own double Esc reads it.
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
      /** The card mark features/composer writes while the host's own stop holds the send seat. */
      markHostStop(on) {
        const control = document.querySelector(card)
        if (control === null) throw new Error('chat-stop host: the page has no composer card')
        control.toggleAttribute('data-dsh-claude-host-stop', on)
      },
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
      markHostStop: async (on) => {
        await t.page.evaluate((value) => { window.__stopHost.markHostStop(value) }, on)
        await t.settle()
      },
      calls: () => t.page.evaluate(() => window.__stopHost.calls()),
    }
  })
}

export const STOP = '.dsh-claude-stop'
