(() => {
  // ===== 基本設定 =====
  const BASE_ICON = "https://genshin.jmp.blue";
  const DATA_URL  = new URL("characters_ja.json", document.baseURI).toString();

  // ローカルアイコン置き場（あなたの構成）
  const ICON_DIR  = new URL("./assets/icons/", document.baseURI).toString();

  const KEY_OWNED = "genshin_owned_ids_v2";
  const KEY_LAST  = "genshin_last_draw_ids_v2";

  const el = (id) => document.getElementById(id);

  const status = el("status");
  const list   = el("list");
  const result = el("result");

  const q = el("q");
  const maxShow = el("maxShow");
  const maxShowLabel = el("maxShowLabel");
  const mode = el("mode");
  const ownedK = el("ownedK");
  const ownedKWrap = el("ownedKWrap");
  const kleeBoost = el("kleeBoost");
  const rarityFilter = el("rarityFilter");

  if (maxShow) maxShow.step = "1";

  let ALL = [];
  let ownedIds = new Set(loadJSON(KEY_OWNED, []));
  let lastDraw = loadJSON(KEY_LAST, null);

  let HAS_RARITY = false;

  // 最終フォールバック（何も無い時だけ旅人）
  const fallbackIcon = new URL("./assets/icons/traveler.webp", document.baseURI).toString();

  function loadJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; }
    catch { return fallback; }
  }
  function saveJSON(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
  function setStatus(html) { if (status) status.innerHTML = html; }

  function escapeHTML(s){
    return String(s).replace(/[&<>"']/g, m => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[m]));
  }

  function updateOwnedKVisibility(){
    if (!ownedKWrap || !mode) return;
    ownedKWrap.style.display = mode.value.startsWith("混ぜる") ? "" : "none";
  }

  // ===== 属性表示（旅人・ドールは id から確実に出す） =====
  const ELEM_JP = {
    anemo: "風", geo: "岩", electro: "雷", dendro: "草",
    hydro: "水", pyro: "炎", cryo: "氷"
  };

  function elemBadgeFromChar(c){
    const id = String(c?.id || "");

    // traveler-xxx / doll-xxx は id から属性確定
    if (id.startsWith("traveler-") || id.startsWith("doll-")) {
      const parts = id.split("-");
      const elem = parts[1];
      return ELEM_JP[elem] || null;
    }

    // 通常キャラは element が入ってる場合だけ（入ってなければ出さない）
    const e = String(c?.element || "");
    if (e && ELEM_JP[e]) return ELEM_JP[e];

    return null;
  }

  // ===== レア度（旅人・ドールは★5固定） =====
  function getRarity(c){
    const id = String(c?.id || "");
    if (id.startsWith("traveler-") || id.startsWith("doll-")) return 5;

    const v = c?.rarity ?? c?.stars ?? c?.star ?? c?.rank;
    const n = Number(v);
    return (n === 4 || n === 5) ? n : null;
  }

  // ===== URL生成 =====
  function remoteIconUrl(id){
    return `${BASE_ICON}/characters/${encodeURIComponent(id)}/icon`;
  }
  function localIconUrl(file){
    return new URL(file, ICON_DIR).toString();
  }

  // 「旅人は traveler.webp 1枚」「ドールは doll.webp 1枚」
  function getLocalFileForId(id){
    if (id.startsWith("traveler-")) return "traveler.webp";
    if (id.startsWith("doll-"))     return "doll.webp";
    return `${id}.webp`;
  }

  // 重要：ローカル→失敗したらremote→それも失敗したらfallback
  // なので「ローカルに無いキャラが全部旅人」にはならない
  function buildImgTag(c, cls){
    const id = String(c.id || "");
    const local = localIconUrl(getLocalFileForId(id));
    const remote = remoteIconUrl(id);

    // onerror 1回目: remoteへ
    // onerror 2回目: fallbackへ
    return `
      <img class="face ${cls}"
           src="${local}"
           data-remote="${remote}"
           onerror="
             if(!this.dataset._step){
               this.dataset._step='remote';
               this.src=this.dataset.remote;
             } else {
               this.onerror=null;
               this.src='${fallbackIcon}';
             }
           " />
    `;
  }

  function updateStatus(extra="") {
    if (!ALL.length) {
      setStatus("読み込み中…");
      return;
    }
    const total = ALL.length;
    const owned = ALL.filter(c => ownedIds.has(c.id)).length;
    const unowned = total - owned;

    setStatus(
      `総キャラ: <b>${total}</b> / 所持（選択）: <b>${owned}</b> / 未所持: <b>${unowned}</b> / クレー優遇: <b>${kleeBoost && kleeBoost.checked ? "ON" : "OFF"}</b>` +
      (extra ? `<div class="muted">${extra}</div>` : "")
    );
  }

  function cardHTML(c) {
    const owned = ownedIds.has(c.id);
    const cls = owned ? "owned" : "unowned";

    const elem = elemBadgeFromChar(c);
    const rarity = getRarity(c);

    const leftBadge  = elem ? `<span class="corner-badge left">${escapeHTML(elem)}</span>` : "";
    const rightBadge = rarity ? `<span class="corner-badge">★${rarity}</span>` : "";

    return `
      <div class="card"
           data-id="${escapeHTML(c.id)}"
           title="${escapeHTML(c.name)} (${escapeHTML(c.id)})">
        ${leftBadge}
        ${rightBadge}
        ${buildImgTag(c, cls)}
        <div><div><b>${escapeHTML(c.name)}</b></div></div>
      </div>
    `;
  }

  function renderList() {
    if (!list) return;

    if (!ALL.length) {
      list.innerHTML = "<div class='muted'>読み込み中…</div>";
      return;
    }

    const query = (q?.value || "").trim().toLowerCase();
    const limit = Number(maxShow?.value || ALL.length);

    const filtered = ALL.filter(c => {
      if (!query) return true;
      return (c.name || "").toLowerCase().includes(query)
          || (c.en || "").toLowerCase().includes(query)
          || (c.id || "").toLowerCase().includes(query);
    }).slice(0, limit);

    list.innerHTML = filtered.map(cardHTML).join("");

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

    if (kleeBoost?.checked) {
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

  function filterByRarity(chars){
    if (!HAS_RARITY) return chars;
    const v = rarityFilter?.value || "all";
    if (v === "all") return chars;
    const want = Number(v);
    return chars.filter(c => getRarity(c) === want);
  }

  function drawOnce() {
    const eligible = filterByRarity(ALL);
    const owned = eligible.filter(c => ownedIds.has(c.id));
    const unowned = eligible.filter(c => !ownedIds.has(c.id));

    if (mode?.value === "所持のみ") return sampleK(owned, 4);
    if (mode?.value === "未所持のみ") return sampleK(unowned, 4);

    const k = Number(ownedK?.value || 0);
    const picks = [...sampleK(owned, k), ...sampleK(unowned, 4-k)];

    for (let i = picks.length - 1; i > 0; i--) {
      const j = sysRandomInt(i + 1);
      [picks[i], picks[j]] = [picks[j], picks[i]];
    }
    return picks;
  }

  function renderResult(picks) {
    if (!result) return;

    result.innerHTML = `
      <h2>🎲 抽選結果</h2>
      <div id="resultCards">
        ${picks.map(c => {
          const elem = elemBadgeFromChar(c);
          const rarity = getRarity(c);
          const leftBadge  = elem ? `<span class="corner-badge left">${escapeHTML(elem)}</span>` : "";
          const rightBadge = rarity ? `<span class="corner-badge">★${rarity}</span>` : "";

          return `
            <div class="card">
              ${leftBadge}
              ${rightBadge}
              <img class="face owned" style="width:64px;height:64px;"
                   src="${localIconUrl(getLocalFileForId(String(c.id||"")))}"
                   data-remote="${remoteIconUrl(String(c.id||""))}"
                   onerror="
                     if(!this.dataset._step){
                       this.dataset._step='remote';
                       this.src=this.dataset.remote;
                     } else {
                       this.onerror=null;
                       this.src='${fallbackIcon}';
                     }
                   " />
              <div>
                <div style="font-size:16px;"><b>${escapeHTML(c.name)}</b></div>
                <div class="small">EN: ${escapeHTML(c.en || "")}</div>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  async function loadData() {
    setStatus("読み込み中…（JSON取得中）");
    const r = await fetch(DATA_URL, { cache: "no-store" });
    if (!r.ok) throw new Error(`データ読み込み失敗: ${r.status}`);

    setStatus("読み込み中…（JSON解析中）");
    const data = await r.json();
    if (!Array.isArray(data)) throw new Error("characters_ja.json の形式が想定外");

    ALL = data;
    ALL.sort((a,b) => String(a.sort||"").localeCompare(String(b.sort||""), "ja"));

    HAS_RARITY = ALL.some(c => getRarity(c) === 4 || getRarity(c) === 5);
    if (rarityFilter) {
      rarityFilter.disabled = !HAS_RARITY;
      if (!HAS_RARITY) rarityFilter.value = "all";
    }

    if (maxShow) {
      maxShow.step = "1";
      maxShow.max = String(Math.max(1, ALL.length));
      maxShow.value = String(ALL.length);
    }
    if (maxShowLabel) maxShowLabel.textContent = String(maxShow?.value || "");

    updateStatus("✅ 自動読み込み完了。アイコンをクリックして所持/未所持を切り替えてください。");
    renderList();
  }

  el("clearCache")?.addEventListener("click", () => {
    localStorage.removeItem(KEY_OWNED);
    localStorage.removeItem(KEY_LAST);
    ownedIds = new Set();
    lastDraw = null;
    updateStatus("🧹 選択・抽選履歴を削除しました。");
    renderList();
    if (result) result.innerHTML = "";
  });

  el("selectAll")?.addEventListener("click", () => {
    if (!ALL.length) return updateStatus("⚠️ まだ読み込み中です。少し待ってください。");
    ownedIds = new Set(ALL.map(c => c.id));
    saveJSON(KEY_OWNED, [...ownedIds]);
    updateStatus("✅ 全選択しました。");
    renderList();
  });

  el("reset")?.addEventListener("click", () => {
    ownedIds = new Set();
    saveJSON(KEY_OWNED, []);
    updateStatus("✅ 選択を全解除しました。");
    renderList();
  });

  el("draw")?.addEventListener("click", () => {
    if (!ALL.length) {
      if (result) result.innerHTML = "<div class='muted'>⚠️ まだ読み込み中です。少し待ってください。</div>";
      return;
    }
    try {
      const picks = drawOnce();
      lastDraw = picks.map(x => x.id).sort();
      saveJSON(KEY_LAST, lastDraw);
      renderResult(picks);
    } catch (e) {
      if (result) result.innerHTML = `<div class='muted'>❌ エラー: ${escapeHTML(e?.message || String(e))}</div>`;
    }
  });

  q?.addEventListener("input", renderList);
  maxShow?.addEventListener("input", () => {
    if (maxShowLabel) maxShowLabel.textContent = String(maxShow.value);
    renderList();
  });
  mode?.addEventListener("change", () => { updateOwnedKVisibility(); });
  kleeBoost?.addEventListener("change", () => { updateStatus(); });
  rarityFilter?.addEventListener("change", () => { updateStatus(); });

  updateOwnedKVisibility();
  updateStatus("読み込み中…");
  loadData().catch((e) => {
    setStatus(`❌ ${escapeHTML(e?.message || String(e))}<div class="muted">ページを更新すると直ることがあります。</div>`);
    if (list) list.innerHTML = "";
  });
})();
