/* CBT Tool – corner handles for stretching the boxes.
   Top row: every box shares one height, and the boxes always fill the row; dragging a
   corner sideways moves the border shared with the neighbouring box.
   Workspace: dragging a left-column box sideways sets the column width (the plot panel
   takes the rest) and dragging down sets that box's height; the plot panel stretches in
   height and its plots grow with it. Both columns always end at the same height.
   On narrow screens (stacked layout) only heights change, so the page stays responsive. */
"use strict";
(() => {
const q = (s) => document.querySelector(s);
const controls = q(".controls"), ws = q(".ws"), leftcol = q(".leftcol"), rightcol = q(".rightcol");
const MIN_W = 180, MIN_H = 70, MIN_LEFT = 280, MIN_RIGHT = 420;
const nCols = (grid) => getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function addHandle(card, mode) {
  const h = document.createElement("span");
  h.className = "rz" + (mode === "right" || mode === "v" ? " v" : "");
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
  if (mode === "left") {
    ctx.sideBySide = nCols(ws) === 2;
    ctx.w0 = leftcol.getBoundingClientRect().width;
    ctx.maxW = ws.getBoundingClientRect().width - MIN_RIGHT;
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
    } else if (mode === "left") {
      if (ctx.sideBySide) ws.style.setProperty("--left-w", clamp(ctx.w0 + dx, MIN_LEFT, Math.max(MIN_LEFT, ctx.maxW)) + "px");
      card.style.height = Math.max(MIN_H, r0.height + dy) + "px";
    } else {   // "right" (plot panel) and "v" (height only)
      card.style.height = Math.max(mode === "right" ? 300 : MIN_H, r0.height + dy) + "px";
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
leftcol.querySelectorAll(".card").forEach(c => addHandle(c, "left"));
addHandle(rightcol, "right");
addHandle(q("#emptyState"), "v");

window.cbtResetSizes = () => {
  controls.style.removeProperty("--ctrl-h");
  controls.style.removeProperty("--ctrl-cols");
  ws.style.removeProperty("--left-w");
  document.querySelectorAll(".card, .ngl-dlg").forEach(el => { el.style.width = ""; el.style.height = ""; });
  window.dispatchEvent(new Event("resize"));
};
})();
