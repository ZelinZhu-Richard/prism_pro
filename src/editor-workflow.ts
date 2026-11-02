/** A canceled or stale idle task must never start a write against another editor. */
export function afterEditorIdle(
  delay: number,
  eligible: () => boolean,
  action: () => void,
) {
  let canceled = false;
  const timer = setTimeout(() => {
    if (!canceled && eligible()) action();
  }, delay);
  return () => {
    canceled = true;
    clearTimeout(timer);
  };
}
