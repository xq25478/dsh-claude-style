/**
 * The sent message answers under itself: the last settled user row carries the
 * skin's sent line while its turn runs, one press ends that turn the way the
 * host's own stop does, and the line leaves when the turn is over. Only the last
 * user row carries it — an earlier message is not the one the answer belongs to.
 *
 * @capability chat-stop
 * @features chat-stop
 * @risk The line stands under a finished turn, under an earlier message, two lines share the flow, the press reaches no cancel, or the turn's end leaves the line behind.
 */
import { host, spec } from '../../fixtures/behaviour.mjs'
import { LINE, SESSION, STOP, setup } from './host.mjs'

const FLOW = host('chat.flow')

export default spec({ page: 'model-meter' }, ({ test }) => {
  test('a running turn answers the last sent message, and the press ends it', async t => {
    const host = await setup(t, { running: true })
    t.expectThat.visible(await t.read.box(LINE), 'the running turn answers on a sent line')
    t.expectThat.visible(await t.read.box(STOP), 'the line carries the stop')

    await t.page.click(STOP)
    await t.settle()
    t.expectThat.equal(await host.calls(), [SESSION], 'the press reaches the session’s own cancel')
    t.expectThat.absent(await t.read.box(LINE), 'the ended turn takes the line away')
  })

  test('a turn that is not running answers on no line', async t => {
    const host = await setup(t, { running: false })
    t.expectThat.absent(await t.read.box(LINE), 'an idle session answers nothing')

    await host.setRunning({})
    await t.settle()
    t.expectThat.visible(await t.read.box(LINE), 'the turn starting brings the line back')
  })

  test('the line stands under the last sent message, not under an earlier one', async t => {
    const host = await setup(t, { running: true })
    t.expectThat.equal(await host.rows(), [
      { key: 'first', line: false },
      { key: 'second', line: true },
    ], 'the last settled user row is the one the answer belongs to')
  })

  test('the line stands under the message, inside the flow', async t => {
    await setup(t, { running: true })
    const line = await t.read.box(LINE)
    const flow = await t.read.box(FLOW)
    t.expectThat.visible(line, 'the line draws')
    t.expectThat.boxWithin(line, flow, 'the line stands inside the chat column')
  })
})
