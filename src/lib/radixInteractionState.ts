const OPEN_MENU_LAYER_SELECTOR = [
  '[data-slot="dropdown-menu-content"][data-state="open"]',
  '[data-slot="dropdown-menu-sub-content"][data-state="open"]',
  '[data-slot="context-menu-content"][data-state="open"]',
  '[data-slot="context-menu-sub-content"][data-state="open"]',
].join(", ")

const OPEN_MODAL_OVERLAY_SELECTOR = [
  '[data-slot="dialog-overlay"][data-state="open"]',
  '[data-slot="alert-dialog-overlay"][data-state="open"]',
  '[data-slot="sheet-overlay"][data-state="open"]',
].join(", ")

const ACTIVE_MENU_LAYER_SELECTOR = [
  '[data-slot="dropdown-menu-content"]',
  '[data-slot="dropdown-menu-sub-content"]',
  '[data-slot="context-menu-content"]',
  '[data-slot="context-menu-sub-content"]',
].join(", ")

export function repairRadixInteractionState() {
  if (typeof document === "undefined") {
    return
  }

  const hasOpenMenu = Boolean(document.querySelector(OPEN_MENU_LAYER_SELECTOR))
  if (hasOpenMenu) {
    return
  }

  const hasOpenModalOverlay = Boolean(document.querySelector(OPEN_MODAL_OVERLAY_SELECTOR))
  if (!hasOpenModalOverlay) {
    if (document.body.style.pointerEvents === "none") {
      document.body.style.pointerEvents = ""
    }
    if (document.documentElement.style.pointerEvents === "none") {
      document.documentElement.style.pointerEvents = ""
    }
  }

  const activeElement = document.activeElement
  if (!(activeElement instanceof HTMLElement)) {
    return
  }

  if (activeElement.closest(ACTIVE_MENU_LAYER_SELECTOR)) {
    activeElement.blur()
  }
}

export function scheduleRadixInteractionStateRepair() {
  if (typeof window === "undefined") {
    return
  }

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      repairRadixInteractionState()
    })
  })
}
