import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => {
  cleanup()
})

// jsdom is missing a few APIs Radix touches.
if (!('ResizeObserver' in globalThis)) {
  ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

for (const method of ['hasPointerCapture', 'setPointerCapture', 'releasePointerCapture', 'scrollIntoView'] as const) {
  if (!(method in Element.prototype)) {
    ;(Element.prototype as unknown as Record<string, () => void>)[method] = () => {}
  }
}

if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent() {
        return false
      },
    }) as unknown as MediaQueryList
}
