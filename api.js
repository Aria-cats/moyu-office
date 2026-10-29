/* The only transport boundary between the game UI and the shared pond. */
(function (root) {
  "use strict";
  const dishes = ["红烧", "清蒸", "剁椒", "放生"];

  function validateState(state) {
    const integer = (n) => Number.isSafeInteger(n) && n >= 0;
    if (
      !state ||
      !integer(state.round) ||
      state.round < 1 ||
      !integer(state.target) ||
      state.target < 1 ||
      !integer(state.count) ||
      state.count > state.target ||
      !integer(state.mine) ||
      state.mine > state.count ||
      !integer(state.participants) ||
      typeof state.canChoose !== "boolean" ||
      !(state.dish === null || dishes.includes(state.dish)) ||
      !(state.winnerName === null || typeof state.winnerName === "string") ||
      !Array.isArray(state.history) ||
      typeof state.autoReleased !== "boolean" ||
      !(state.choiceRemaining === null || integer(state.choiceRemaining)) ||
      ("accepted" in state && typeof state.accepted !== "boolean") ||
      state.history.some(
        (h) =>
          !h ||
          !integer(h.round) ||
          h.round < 1 ||
          !integer(h.target) ||
          h.target < 1 ||
          !integer(h.participants) ||
          !dishes.includes(h.dish) ||
          typeof h.winnerName !== "string",
      )
    ) {
      throw new Error("鱼塘的消息没收完整，请稍后重试。");
    }
    return state;
  }

  root.createMoyuApi = function (
    config = {},
    transport = root.fetch.bind(root),
  ) {
    const base = String(config.apiBaseUrl || "/api").replace(/\/+$/, "");
    if (!/^\/(?!\/)/.test(base) && !/^https?:\/\//.test(base)) {
      throw new Error("Invalid apiBaseUrl: use /api or an http(s) URL");
    }
    const requestTimeoutMs = Math.max(
      1000,
      Number(config.requestTimeoutMs) || 6500,
    );
    const pollIntervalMs = Math.max(500, Number(config.pollIntervalMs) || 1300);

    async function request(path, data) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
      try {
        const response = await transport(base + "/" + path, {
          method: data ? "POST" : "GET",
          credentials: "include",
          cache: "no-store",
          ...(data
            ? {
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
              }
            : {}),
          signal: controller.signal,
        });
        if (!response.ok) {
          let message = "暂时连不上大家，稍后再试试。";
          try {
            const body = await response.json();
            if (
              response.status >= 400 &&
              response.status < 500 &&
              typeof body.error === "string"
            ) {
              message = body.error;
            }
          } catch {}
          const error = new Error(message);
          error.status = response.status;
          throw error;
        }
        return validateState(await response.json());
      } finally {
        clearTimeout(timeout);
      }
    }

    return Object.freeze({
      pollIntervalMs,
      getState: () => request("state"),
      touch: ({ round, event, name }) =>
        request("touch", { round, event, name }),
      cook: ({ round, dish, name }) => request("cook", { round, dish, name }),
      next: ({ round, name }) => request("next", { round, name }),
    });
  };
})(window);
