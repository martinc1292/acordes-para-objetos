// True for a plain left-click the SPA router should intercept. Modified clicks
// (cmd/ctrl/shift/alt or non-primary button) are left to the browser so
// open-in-new-tab and friends keep working on anchor elements.
export function shouldHandleLinkClick(event) {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}
