(() => {
  const BASE_ICON = "https://genshin.jmp.blue";
  const DATA_URL  = "./characters_ja.json";

  const KEY_OWNED = "genshin_owned_ids_v2";
  const KEY_LAST  = "genshin_last_draw_ids_v2";

  const el = (id) => document.getElementById(id);
  const status = el("status");
  const list = el("list");
  const result = el("result");

  const q = el("q");
  const maxShow = el("maxShow");
  const maxShowLabel = el("maxShowLabel");
  const mode = el("mode");
  const ownedK = el("ownedK");
  const ownedKWrap = el("ownedKWrap");
  const kleeBoost = el("kleeBoost");

  // 91止まり対策：stepを必ず1にする（HTMLと二重で安全）
  maxShow.step = "1";

  let ALL = [];
  let ownedIds = new Set(loadJSON(KEY_OWNED, []));
  let lastDraw = loadJSON(KEY_LAST, null);

  const iconUrl = (cid) => `${BASE_ICON}/characters/${cid}/icon`;
  const fallbackIcon = iconUrl("traveler-anemo");

  function loadJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; }
    catch { return fallback; }
  }
  function saveJSON(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
  function setStatus(html) { status.innerHTML = html; }
  function updateOwnedKVisibility(){ ownedKWrap.style.display = mode.value.startsWith("混ぜる") ? "" : "none"; }

  function updateStatus(extra="") {
    if (!ALL.length) {
      setStatus("読み込み中…");
      return;
    }
    const total = ALL.length;
    const owned = ALL.filter(c => ownedIds.has(c.id)).length;
    const unowned = total - owned;
    setStatus(
      `総キャラ: <b>${total}</b> / 所持（選択）: <b>${owned}</b> / 未所持: <b>${unowned}</b> / クレー優遇: <b>${kleeBoost.checked ? "ON" : "OFF"}</b>` +
      (extra ? `<div class="muted">${extra}</div>` : "")
    );
  }

  function escapeHTML(s){
    return String(s).replace(/[&<>"']/g, m => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[m]));
  }

  // 一覧はアイコンだけ（CSSで文字非表示）
  // hoverで分かるように title に名前を入れる
  function cardHTML(c) {
    const owned = ownedIds.has(c.id);
    const cls = owned ? "owned" : "unowned";
    return `
      <div class="card"
           data-id="${escapeHTML(c.id)}"
           title="${escapeHTML(c.name)} (${escapeHTML(c.id)})">
        <img class="face ${cls}" src="${iconUrl(c.id)}"
             onerror="this.onerror=null;this.src='${fallbackIcon}';" />
        <div>
          <div><b>${escapeHTML(c.name)}</b> <span class="badge">${escapeHTML(c.id)}</span></div>
          <div class="small muted">顔クリックで所持/未所持切替（暗い=未所持 / 明るい=所持）</div>
        </div>
      </div>
    `;
  }

  function renderList() {
    if (!ALL.length) {
      list.innerHTML = "<div class='muted'>読み込み中…</div>";
      return;
    }
    const query = q.value.trim().toLowerCase();
    const limit = Number(maxShow.value);

    const filtered = ALL.filter(c => {
      if (!query) return true;
      return (c.name || "").toLowerCase().includes(query)
          || (c.en || "").toLowerCase().includes(query)
          || (c.id || "").toLowerCase().includes(query);
    }).slice(0, limit);

    list.innerHTML = filtered.map(cardHTML).join("");

    // タイル全体クリックで切替（押しやすい）
    list.querySelectorAll(".card").forEach(card => {
      card.addEventListener("click", () => {
        const cid = card.dataset.id;
        if (ownedIds.has(cid)) ownedIds.delete(cid);
        else ownedIds.add(cid);

        saveJSON(KEY_OWNED, [...ownedIds]);

        const img = card.querySelector(".face");
        img.classList.toggle("owned", ownedIds.has(cid));
        img.classList.toggle("unowned", !ownedIds.has(cid));
        updateStatus();
      });
    });
  }

  function sysRandomInt(max){
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] % max;
  }

  function isKlee(c){ return c.id === "klee" || (c.name || "").includes("クレー"); }

  function pickDistinct(pool, k){
    const arr = pool.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = sysRandomInt(i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr.slice(0, k);
  }

  function sampleK(pool, k) {
    if (k <= 0) return [];
    if (pool.length < k) throw new Error(`候補が ${pool.length} 人なので ${k} 人は抽選できません。`);

    if (kleeBoost.checked) {
      const klee = pool.find(isKlee);
      if (klee && k >= 1 && pool.length > 1) {
        const p = 0.65;
        const r = sysRandomInt(1000) / 1000;
        if (r < p) {
          const rest = pool.filter(x => x.id !== klee.id);
          return [klee, ...pickDistinct(rest, k-1)];
        }
      }
    }
    return pickDistinct(pool, k);
  }

  function drawOnce() {
    const owned = ALL.filter(c => ownedIds.has(c.id));
    const unowned = ALL.filter(c => !ownedIds.has(c.id));

    if (mode.value === "所持のみ") return sampleK(owned, 4);
    if (mode.value === "未所持のみ") return sampleK(unowned, 4);

    const k = Number(ownedK.value);
    const picks = [...sampleK(owned, k), ...sampleK(unowned, 4-k)];

    for (let i = picks.length - 1; i > 0; i--) {
      const j = sysRandomInt(i + 1);
      [picks[i], picks[j]] = [picks[j], picks[i]];
    }
    return picks;
  }

  function renderResult(picks) {
    result.innerHTML = `
      <h2>🎲 抽選結果（4人）</h2>
      ${picks.map(c => `
        <div class="card">
          <img class="face owned" style="width:64px;height:64px;" src="${iconUrl(c.id)}"
               onerror="this.onerror=null;this.src='${fallbackIcon}';" />
          <div>
            <div style="font-size:16px;"><b>${escapeHTML(c.name)}</b> <span class="badge">${escapeHTML(c.id)}</span></div>
            <div class="small">EN: ${escapeHTML(c.en || "")}</div>
          </div>
        </div>
      `).join("")}
    `;
  }

  async function loadData() {
    const r = await fetch(DATA_URL, { cache: "no-store" });
    if (!r.ok) throw new Error(`データ読み込み失敗: ${r.status}`);
    const data = await r.json();
    if (!Array.isArray(data)) throw new Error("characters_ja.json の形式が想定外");

    ALL = data;
    ALL.sort((a,b) => String(a.sort||"").localeCompare(String(b.sort||""), "ja"));

    maxShow.step = "1";
    maxShow.max = String(Math.max(1, ALL.length));
    maxShow.value = String(ALL.length);
    maxShowLabel.textContent = String(maxShow.value);

    updateStatus("✅ 自動読み込み完了。アイコンをクリックして所持/未所持を切り替えてください。");
    renderList();
  }

  // ---- ボタン類 ----
  el("clearCache").addEventListener("click", () => {
    localStorage.removeItem(KEY_OWNED);
    localStorage.removeItem(KEY_LAST);
    ownedIds = new Set();
    lastDraw = null;
    updateStatus("🧹 選択・抽選履歴を削除しました。");
    renderList();
    result.innerHTML = "";
  });

  el("selectAll").addEventListener("click", () => {
    if (!ALL.length) return updateStatus("⚠️ まだ読み込み中です。少し待ってください。");
    ownedIds = new Set(ALL.map(c => c.id));
    saveJSON(KEY_OWNED, [...ownedIds]);
    updateStatus("✅ 全選択しました。");
    renderList();
  });

  el("reset").addEventListener("click", () => {
    ownedIds = new Set();
    saveJSON(KEY_OWNED, []);
    updateStatus("✅ 選択を全解除しました。");
    renderList();
  });

  el("draw").addEventListener("click", () => {
    if (!ALL.length) {
      result.innerHTML = "<div class='muted'>⚠️ まだ読み込み中です。少し待ってください。</div>";
      return;
    }

    const maxRetry = 50;
    try {
      let picks = drawOnce();
      let ids = picks.map(x => x.id).sort();

      let poolN = ALL.length;
      if (mode.value === "所持のみ") poolN = ALL.filter(c => ownedIds.has(c.id)).length;
      if (mode.value === "未所持のみ") poolN = ALL.filter(c => !ownedIds.has(c.id)).length;

      if (lastDraw && poolN > 4) {
        let tries = 0;
        while (tries < maxRetry && JSON.stringify(ids) === JSON.stringify(lastDraw)) {
          picks = drawOnce();
          ids = picks.map(x => x.id).sort();
          tries++;
        }
      }

      lastDraw = ids;
      saveJSON(KEY_LAST, lastDraw);
      renderResult(picks);

    } catch (e) {
      result.innerHTML = `<div class='muted'>❌ エラー: ${escapeHTML(e?.message || String(e))}</div>`;
    }
  });

  q.addEventListener("input", renderList);
  maxShow.addEventListener("input", () => {
    maxShowLabel.textContent = String(maxShow.value);
    renderList();
  });
  mode.addEventListener("change", () => { updateOwnedKVisibility(); });
  kleeBoost.addEventListener("change", () => { updateStatus(); });

  // ---- 起動時：自動読み込み ----
  updateOwnedKVisibility();
  updateStatus("読み込み中…");
  loadData().catch((e) => {
    setStatus(`❌ ${escapeHTML(e?.message || String(e))}<div class="muted">ページを更新すると直ることがあります。</div>`);
    list.innerHTML = "";
  });
})();
