(() => {
  "use strict";

  const timings = [0, 0.24, 0.48, 0.72, 0.86];
  const captions = {
    "红烧": ["热锅下鱼，先煎出一圈焦边。", "酱汁沿锅边淋下去。", "颠一下锅，让浓汁裹住鱼皮。", "收汁，起锅。", "红烧鱼上桌。米饭多盛一勺。"],
    "清蒸": ["鲜鱼上笼，听锅里的水咕嘟。", "揭盖，小心这股热气。", "葱丝铺好，热油一浇，滋啦！", "端稳，盘子烫。", "葱油清蒸鱼上桌。趁热夹第一筷。"],
    "剁椒": ["红椒剁碎，刀尖还沾着椒籽。", "剁椒下热油，翻出一锅红亮。", "把炒香的剁椒铺满鱼背。", "带着热油一起装盘。", "剁椒鱼上桌。红油底下那口鱼最嫩。"],
  };
  const duration = 6500;
  const frameInterval = 1000 / 30;

  window.createKitchenPlayer = function (canvas, caption) {
    if (!canvas || !caption || !window.paintKitchen || !canvas.getContext("2d")) return null;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let dish = null;
    let progress = 0;
    let frame = 0;
    let started = 0;
    let lastPaint = 0;

    function draw() {
      if (!dish || !canvas.clientWidth || !canvas.clientHeight) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.round(canvas.clientWidth * ratio);
      const height = Math.round(canvas.clientHeight * ratio);
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      window.paintKitchen(canvas, dish, progress);
      let step = timings.length - 1;
      while (progress < timings[step]) step--;
      const line = captions[dish][step];
      if (caption.textContent !== line) caption.textContent = line;
    }

    function cancel() {
      cancelAnimationFrame(frame);
      frame = 0;
    }

    function finish() {
      cancel();
      progress = 1;
      draw();
    }

    function tick(now) {
      progress = Math.max(0, Math.min(1, (now - started) / duration));
      if (progress === 1 || now - lastPaint >= frameInterval - 1) {
        draw();
        lastPaint = now;
      }
      frame = progress < 1 ? requestAnimationFrame(tick) : 0;
    }

    function play(nextDish) {
      if (!Array.isArray(captions[nextDish])) return false;
      cancel();
      dish = nextDish;
      if (motion.matches || document.hidden) {
        finish();
      } else {
        progress = 0;
        started = lastPaint = performance.now();
        draw();
        frame = requestAnimationFrame(tick);
      }
      return true;
    }

    function stop() {
      cancel();
      dish = null;
    }

    if (window.ResizeObserver) new ResizeObserver(draw).observe(canvas);
    else window.addEventListener("resize", draw);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && frame) finish();
    });
    const motionChanged = () => { if (motion.matches && frame) finish(); };
    if (motion.addEventListener) motion.addEventListener("change", motionChanged);
    else motion.addListener(motionChanged);
    return { play, finish, stop };
  };
})();
