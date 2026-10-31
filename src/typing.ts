/** Network chunks are not character boundaries. Keep the final grapheme pending
 * until the next chunk (or EOF) so split surrogates, accents and ZWJ emoji join. */
export class TypingBuffer {
  pending = "";
  visible = "";
  ended = false;
  paused = false;
  stopped = false;
  segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  push(text: string) {
    if (!this.stopped) this.pending += text;
  }
  complete() {
    this.ended = true;
  }
  stop() {
    this.pending = "";
    this.stopped = true;
    this.ended = true;
    this.paused = false;
  }
  take(instant = false): string {
    if (this.paused || this.stopped) return "";
    const parts = [...this.segmenter.segment(this.pending)].map(
      (p) => p.segment,
    );
    const count = this.ended ? parts.length : Math.max(0, parts.length - 1);
    if (!count) return "";
    const text = parts.slice(0, instant ? count : 1).join("");
    this.pending = this.pending.slice(text.length);
    this.visible += text;
    return text;
  }
  get finished() {
    return this.ended && !this.pending;
  }
}
export function typingDelay(
  character: string,
  speed: number,
  random = Math.random,
) {
  if (speed === 0) return 0;
  const pause = /[.!?\n]/u.test(character)
    ? 260 + random() * 400
    : /[,;:]/u.test(character)
      ? 120 + random() * 200
      : 0;
  return (100 + random() * 110 + pause) / speed;
}
