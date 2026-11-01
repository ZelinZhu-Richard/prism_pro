import type { PdfAnchor, PdfZoom } from "./pdf-layout";
export interface PdfReadingView {
  anchor: PdfAnchor;
  horizontal: number;
  zoom: PdfZoom;
  preferred: number;
}
const copy = (view: PdfReadingView): PdfReadingView => ({
  ...view,
  anchor: { ...view.anchor },
});
export class PdfViewHistory {
  private previous: PdfReadingView[] = [];
  private following: PdfReadingView[] = [];
  constructor(private limit = 100) {}
  get counts() {
    return { back: this.previous.length, forward: this.following.length };
  }
  record(view: PdfReadingView) {
    this.previous.push(copy(view));
    if (this.previous.length > this.limit) this.previous.shift();
    this.following = [];
  }
  back(view: PdfReadingView) {
    const target = this.previous.pop();
    if (target) this.following.push(copy(view));
    return target;
  }
  forward(view: PdfReadingView) {
    const target = this.following.pop();
    if (target) {
      this.previous.push(copy(view));
      if (this.previous.length > this.limit) this.previous.shift();
    }
    return target;
  }
  clear() {
    this.previous = [];
    this.following = [];
  }
}
