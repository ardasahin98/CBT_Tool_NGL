/* "About" dropdown in the top bar: opens on hover (mouse), click or tap, and with the keyboard;
   closes on Escape, on a click outside, or when a link is chosen. */
"use strict";
document.querySelectorAll(".navdrop").forEach(drop => {
  const btn = drop.querySelector(".navdrop-btn");
  const set = (open) => { drop.classList.toggle("open", open); btn.setAttribute("aria-expanded", String(open)); };
  btn.addEventListener("click", (e) => { e.stopPropagation(); set(!drop.classList.contains("open")); });
  drop.addEventListener("mouseenter", () => { if (matchMedia("(hover: hover)").matches) set(true); });
  drop.addEventListener("mouseleave", () => { if (matchMedia("(hover: hover)").matches) set(false); });
  drop.querySelectorAll(".navdrop-menu a").forEach(a => a.addEventListener("click", () => set(false)));
  document.addEventListener("click", (e) => { if (!drop.contains(e.target)) set(false); });
  drop.addEventListener("keydown", (e) => {
    const items = [...drop.querySelectorAll(".navdrop-menu a")];
    const i = items.indexOf(document.activeElement);
    if (e.key === "Escape") { set(false); btn.focus(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); set(true); items[(i + 1) % items.length].focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); set(true); items[(i - 1 + items.length) % items.length].focus(); }
  });
});
