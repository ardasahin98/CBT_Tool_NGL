/* CBT Tool – corner handles for stretching the four boxes in the top row.
   All four share one height and always fill the row; dragging a corner sideways moves
   the border shared with the neighbouring box (sizes are kept as proportions, so the
   row adapts to the window). When the row wraps (narrow screens) only the height changes. */
"use strict";
(() => {
const q = (s) => document.querySelector(s);
const controls = q(".controls");
const MIN_W = 180, MIN_H = 70;
const nCols = (grid) => getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function addHandle(card, mode) {
  const h = document.createElement("span");
  h.className = "rz";
  h.title = "Drag to resize";
  h.setAttribute("aria-hidden", "true");
  card.appendChild(h);
  h.addEventListener("pointerdown", (e) => start(e, card, mode, h));
}

function start(e, card, mode, h) {
  if (e.button !== 0) return;
  e.preventDefault();
  h.setPointerCapture(e.pointerId);
  const x0 = e.clientX, y0 = e.clientY, r0 = card.getBoundingClientRect();
  const ctx = {};
  if (mode === "ctrl") {
    ctx.items = [...controls.children].filter(c => c.classList.contains("card"));
    ctx.i = ctx.items.indexOf(card);
    ctx.oneRow = nCols(controls) === ctx.items.length;
    ctx.w = ctx.items.map(c => c.getBoundingClientRect().width);
  }
  document.body.classList.add("resizing");
  const move = (ev) => {
    const dx = ev.clientX - x0, dy = ev.clientY - y0;
    if (mode === "ctrl") {
      controls.style.setProperty("--ctrl-h", Math.max(MIN_H, r0.height + dy) + "px");
      if (ctx.oneRow) {
        const i = ctx.i, j = i < ctx.items.length - 1 ? i + 1 : i - 1;   // neighbour sharing the border
        const total = ctx.w[i] + ctx.w[j];
        const wi = clamp(ctx.w[i] + dx, MIN_W, total - MIN_W);
        const w = ctx.w.slice(); w[i] = wi; w[j] = total - wi;
        // proportions (fr), so the row keeps filling the width when the window changes
        controls.style.setProperty("--ctrl-cols", w.map(v => v.toFixed(1) + "fr").join(" "));
      }
    }
  };
  const end = () => {
    h.removeEventListener("pointermove", move);
    h.removeEventListener("pointerup", end);
    h.removeEventListener("pointercancel", end);
    document.body.classList.remove("resizing");
    window.dispatchEvent(new Event("resize"));   // redraw plots at the final size
  };
  h.addEventListener("pointermove", move);
  h.addEventListener("pointerup", end);
  h.addEventListener("pointercancel", end);
}

controls.querySelectorAll(":scope > .card").forEach(c => addHandle(c, "ctrl"));

window.cbtResetSizes = () => {
  controls.style.removeProperty("--ctrl-h");
  controls.style.removeProperty("--ctrl-cols");
  document.querySelectorAll(".controls > .card, .ngl-dlg").forEach(el => { el.style.width = ""; el.style.height = ""; });
  window.dispatchEvent(new Event("resize"));
};
})();
