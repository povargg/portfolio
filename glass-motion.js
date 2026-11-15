export function glassPaintWindow(previous, scrollY, viewportHeight) {
  const overscan = Math.max(340, Math.ceil(viewportHeight * .5));
  const height = viewportHeight + overscan * 2;
  const guard = overscan * .75;
  const y = Math.max(0, scrollY);

  if (previous?.height === height
      && y >= (previous.top === 0 ? 0 : previous.top + guard)
      && y + viewportHeight <= previous.top + height - guard) {
    return previous;
  }

  return { top: Math.max(0, Math.floor(y - overscan)), height };
}

export function glassScrollSpeed(previous, scrollDelta, elapsed) {
  const velocity = Math.max(-1, Math.min(1, scrollDelta / elapsed * .85));
  const decay = Math.exp(-elapsed / 74);
  return previous * decay + velocity * (1 - decay);
}
