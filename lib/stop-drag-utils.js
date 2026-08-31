// Pure geometry helper for the "drag a stop above start / below
// destination to promote it" feature — extracted from app.js so it's
// testable in plain Node with no DOM (see tests/stop-drag-utils.test.js).
// app.js's startStopDrag computes fromRect/toRect via the real DOM
// (el.fromInput/el.toInput's own .search-row) and passes them in; this
// function itself only ever does arithmetic on plain {top, height} shapes.

/** 'from' if draggedCenter is above the starting-point row's own vertical
 * middle, 'to' if below the destination row's, else null (an ordinary
 * reorder-within-stops drag, not a promote). Shared by startStopDrag's own
 * onMove (for the drop-target highlight) and onUp (for the actual
 * promote). */
export function stopDragPromoteTarget(draggedCenter, fromRect, toRect) {
  if (draggedCenter < fromRect.top + fromRect.height / 2) return 'from';
  if (draggedCenter > toRect.top + toRect.height / 2) return 'to';
  return null;
}
