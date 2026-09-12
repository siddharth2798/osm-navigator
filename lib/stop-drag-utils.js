// Geometry helper for the "drag a stop above start / below destination to promote it" feature.
// Extracted from app.js for testing in plain Node; takes plain {top, height} rects, no DOM needed.

/** Returns 'from' or 'to' if draggedCenter crosses that row's vertical midpoint, else null. */
export function stopDragPromoteTarget(draggedCenter, fromRect, toRect) {
  if (draggedCenter < fromRect.top + fromRect.height / 2) return 'from';
  if (draggedCenter > toRect.top + toRect.height / 2) return 'to';
  return null;
}
