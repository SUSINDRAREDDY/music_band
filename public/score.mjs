// Preview only complete lines: a token chunk can end inside a chord or decoration.
export function previewABC(text) {
  const lines = text.replace(/\r/g, '').split('\n');
  lines.pop();
  const abc = lines.join('\n');
  return /^K:/m.test(abc) && /^V:/m.test(abc) && /\|\s*$/m.test(abc)
    ? abc
    : null;
}
export class ScoreView {
  constructor(source, notation, status) {
    this.source = source;
    this.notation = notation;
    this.status = status;
    this.text = '';
  }
  reset() {
    this.cancel();
    this.text = '';
    this.bars = [];
    this.source.textContent = '';
    this.notation.replaceChildren();
    this.status.textContent = 'Waiting for ABC notation…';
  }
  append(delta) {
    this.text += delta;
    this.source.textContent = this.text;
    this.status.textContent = 'Composing · live preview';
    if (!this.timer)
      this.timer = setTimeout(() => {
        this.timer = null;
        const abc = previewABC(this.text);
        if (abc) this.render(abc);
      }, 150);
  }
  render(abc) {
    try {
      globalThis.ABCJS.renderAbc(this.notation, abc, {
        responsive: 'resize',
        add_classes: true,
      });
    } catch {
      this.status.textContent = 'Waiting for a complete measure…';
    }
  }
  complete(abc) {
    this.cancel();
    this.text = abc;
    this.source.textContent = abc;
    this.render(abc);
    this.status.textContent = 'Complete · validated ABC score';
  }
  appendBar(abc) {
    (this.bars ||= []).push(abc);
    this.bars = this.bars.slice(-64);
    this.text = this.bars.join('\n\n');
    this.source.textContent = this.text;
    const measure = document.createElement('div');
    this.notation.append(measure);
    while (this.notation.children?.length > 64)
      this.notation.firstChild.remove();
    try {
      globalThis.ABCJS.renderAbc(measure, abc, {
        responsive: 'resize',
        add_classes: true,
      });
      this.status.textContent = 'Playing · streamed ABC bars';
    } catch {
      this.status.textContent = 'ABC received · notation display unavailable';
    }
  }
  cancel(message) {
    clearTimeout(this.timer);
    this.timer = null;
    if (message) this.status.textContent = message;
  }
}
