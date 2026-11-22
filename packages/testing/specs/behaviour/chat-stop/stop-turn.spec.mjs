/**
 * The stop control stands in the composer's right seat only while the session's
 * turn runs, and one press ends that turn the way the host's own stop does: the
 * card offers one stop at a time, and while the host's stop holds the send seat
 * this one stands down.
 *
 * @capability chat-stop
 * @features chat-stop, composer
 * @risk A stop stands beside a finished turn, two stops share the row, the press reaches no cancel, or the turn's end leaves the stop in the seat.
 */
import { host, spec } from '../../fixtures/behaviour.mjs'
import { SESSION, STOP, setup } from './host.mjs'

const CARD = host('composer.card')

export default spec({ page: 'model-meter' }, ({ test }) => {
  test('a running turn offers one stop, and the press ends it', async t => {
    const host = await setup(t, { running: true })
    t.expectThat.visible(await t.read.box(STOP), 'the running turn offers the stop')

    await t.page.click(STOP)
    await t.settle()
    t.expectThat.equal(await host.calls(), [SESSION], 'the press reaches the session’s own cancel')
    t.expectThat.absent(await t.read.box(STOP), 'the ended turn takes the stop back out of the row')
  })

  test('a turn that is not running offers no stop', async t => {
    const host = await setup(t, { running: false })
    t.expectThat.absent(await t.read.box(STOP), 'an idle session has nothing to stop')

    await host.setRunning({})
    await t.settle()
    t.expectThat.visible(await t.read.box(STOP), 'the turn starting brings the stop into the seat')
  })

  test('the host’s own stop keeps the seat, and this one stands down', async t => {
    const host = await setup(t, { running: true })
    t.expectThat.visible(await t.read.box(STOP), 'the reader has a stop while the draft leaves the host none')

    await host.markHostStop(true)
    await t.settle()
    t.expectThat.absent(await t.read.box(STOP), 'the host’s stop in the send seat is the only stop on screen')

    await host.markHostStop(false)
    await t.settle()
    t.expectThat.visible(await t.read.box(STOP), 'the seat comes back when the draft fills again')
  })

  test('the stop stands in the row beside the model seat, not over the card', async t => {
    await setup(t, { running: true })
    const seat = await t.read.box(STOP)
    const card = await t.read.box(CARD)
    t.expectThat.visible(seat, 'the seat draws the control')
    t.expectThat.boxWithin(seat, card, 'the stop stands inside the composer card')
  })
})
