/**
 * The stand-in's context with named services replaced.
 *
 * A fixture hands over only the services its feature reads, and every other read
 * keeps the page's own answer: `get` is answered from the table first, then from
 * the context the page booted with. `inject` answers the same way, in the shape
 * the runner's effect scoping expects, so a feature installed through it sees the
 * fixture's services too.
 *
 * The shim is installed once per page (it cannot cross the page boundary as a
 * value: the services are page-side objects), then a fixture calls
 * `window.__overrideHostServices(services)` before it applies the skin again.
 */
export async function installHostServiceOverride(page) {
  await page.evaluate(() => {
    window.__overrideHostServices = (services) => {
      const originalGet = window.__ctxOriginalGet ?? window.__ctx.get.bind(window.__ctx)
      window.__ctxOriginalGet = originalGet
      window.__ctx.get = (name) => (Object.hasOwn(services, name) ? services[name] : originalGet(name))
      window.__ctx.inject = (_dependencies, callback) => {
        const disposers = []
        callback({
          get: window.__ctx.get,
          effect: (effect) => {
            const dispose = effect()
            if (typeof dispose === 'function') disposers.push(dispose)
            return dispose
          },
        })
        return { dispose: () => { for (const dispose of disposers.splice(0).reverse()) dispose() } }
      }
    }
  })
}
