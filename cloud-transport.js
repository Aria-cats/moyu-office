/* CloudBase authenticates players; the UI never reads or writes database documents. */
(function () {
  "use strict";
  const config = window.MOYU_CONFIG;
  if (!config.cloudbaseEnv) return;
  const app = cloudbase.init({ env: config.cloudbaseEnv, region: "ap-shanghai",
    accessKey: config.publishableKey, auth: { persistence: "local", detectSessionInUrl: true } });
  const auth = app.auth;
  let login;
  async function ready() {
    if (!login) login = (async () => {
      const session = await auth.getSession();
      if (session.error) throw session.error;
      if (!session.data?.session) {
        const signed = await auth.signInAnonymously();
        if (signed.error) throw signed.error;
      }
      const verified = await auth.getSession();
      if (!verified.data?.session) throw new Error("暂时连不上大家，请刷新后重试。");
    })().catch(error => { login = null; throw error; });
    return login;
  }
  auth.onAuthStateChange(event => { if (event === "SIGNED_OUT") login = null; });
  window.MOYU_CLOUD_TRANSPORT = async (url, options) => {
    const task = (async () => {
      await ready();
      const action = url.split("/").pop();
      const result = await app.callFunction({ name: config.cloudbaseFunction || "moyu-pond",
        data: { ...(options.body ? JSON.parse(options.body) : {}), action } });
      const data = result.result;
      if (!data || typeof data !== "object") throw new Error("鱼塘的消息没收完整，请稍后重试。");
      return { ok: !data.error, status: data.status || 200, json: async () => data };
    })();
    if (!options.signal) return task;
    return new Promise((resolve, reject) => {
      const abort = () => reject(new DOMException("请求超时", "AbortError"));
      if (options.signal.aborted) return abort();
      options.signal.addEventListener("abort", abort, { once: true });
      task.then(resolve, reject).finally(() => options.signal.removeEventListener("abort", abort));
    });
  };
})();
