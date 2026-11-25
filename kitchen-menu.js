(() => {
  "use strict";
  const dishes = Array.from(document.querySelectorAll("[data-dish]"));
  const canvas = document.querySelector(".kitchen-canvas");
  const caption = document.querySelector(".kitchen-caption");
  const replay = document.querySelector("#replay");
  const player = window.createKitchenPlayer?.(canvas, caption);
  replay.disabled = !player;

  function playSelection() {
    const selected = dishes.find(link => link.hash === location.hash) || dishes[0];
    for (const link of dishes) {
      if (link === selected) link.setAttribute("aria-current", "true");
      else link.removeAttribute("aria-current");
    }
    document.title = selected.textContent + " · 摸鱼小厨房";
    canvas.setAttribute("aria-label", selected.textContent + "制作动画");
    if (player) player.play(selected.dataset.dish);
    else caption.textContent = selected.textContent + "的动画暂时无法播放。";
  }

  replay.addEventListener("click", playSelection);
  window.addEventListener("hashchange", playSelection);
  window.addEventListener("pagehide", () => player?.stop());
  window.addEventListener("pageshow", event => {
    if (event.persisted) playSelection();
  });
  playSelection();
})();
