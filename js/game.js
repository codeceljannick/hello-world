// Farm Idle Game — core game logic & rendering.
// All state is persisted to localStorage and is timestamp-based so that
// crops keep growing and animals keep producing while the tab is closed.

const SAVE_KEY = "farmIdleSave_v1";
const TICK_MS = 1000;
const AUTOSAVE_MS = 10000;
const MAX_STACK = 999;

const CROPS = {
  wheat: { name: "Weizen", growMs: 4 * 60 * 1000, stages: 4, sellPrice: 1, seedPrice: 2, yieldMin: 1, yieldMax: 3 },
  carrot: { name: "Karotten", growMs: 2 * 60 * 1000, stages: 4, sellPrice: 2, seedPrice: 3, yieldMin: 1, yieldMax: 2 },
  potato: { name: "Kartoffeln", growMs: 3 * 60 * 1000, stages: 4, sellPrice: 2, seedPrice: 3, yieldMin: 1, yieldMax: 2 },
};

const ANIMALS = {
  sheep: { name: "Schafe", product: "wool", productName: "Wolle", intervalMs: 45 * 1000, basePrice: 25, sellPrice: 3 },
  cow: { name: "Kühe", product: "milk", productName: "Milch", intervalMs: 70 * 1000, basePrice: 40, sellPrice: 4 },
  pufferfish: { name: "Kugelfische", product: "pufferfish", productName: "Kugelfisch", intervalMs: 35 * 1000, basePrice: 30, sellPrice: 5 },
};

const FIELD_BASE_PRICE = 12;
const FIELD_PRICE_GROWTH = 1.6;
const ANIMAL_PRICE_GROWTH = 1.35;
const TOTAL_PLOTS = 16; // 4x4 grid, some locked at start

function defaultState() {
  const plots = [];
  for (let i = 0; i < TOTAL_PLOTS; i++) {
    plots.push({ unlocked: i < 6, crop: null });
  }
  return {
    emeralds: 40,
    seeds: { wheat: 3, carrot: 0, potato: 0 },
    inventory: { wheat: 0, carrot: 0, potato: 0, wool: 0, milk: 0, pufferfish: 0 },
    plots,
    animals: { sheep: 0, cow: 0, pufferfish: 0 },
    animalCollect: { sheep: Date.now(), cow: Date.now(), pufferfish: Date.now() },
    autoSell: false,
    lastSave: Date.now(),
    selectedSeed: "wheat",
  };
}

let state = load();
let lastRenderSecond = -1;

function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    const base = defaultState();
    return Object.assign(base, parsed, {
      seeds: Object.assign(base.seeds, parsed.seeds),
      inventory: Object.assign(base.inventory, parsed.inventory),
      animals: Object.assign(base.animals, parsed.animals),
      animalCollect: Object.assign(base.animalCollect, parsed.animalCollect),
      plots: parsed.plots && parsed.plots.length === TOTAL_PLOTS ? parsed.plots : base.plots,
    });
  } catch (e) {
    console.warn("Save konnte nicht geladen werden, starte neu.", e);
    return defaultState();
  }
}

function save() {
  state.lastSave = Date.now();
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
}

function fieldPrice(index) {
  return Math.round(FIELD_BASE_PRICE * Math.pow(FIELD_PRICE_GROWTH, index - 6));
}

function animalPrice(kind) {
  const owned = state.animals[kind];
  return Math.round(ANIMALS[kind].basePrice * Math.pow(ANIMAL_PRICE_GROWTH, owned));
}

function cropStage(plot) {
  const def = CROPS[plot.crop.type];
  const elapsed = Date.now() - plot.crop.plantedAt;
  const progress = Math.min(1, elapsed / def.growMs);
  return Math.min(def.stages - 1, Math.floor(progress * def.stages));
}

function isReady(plot) {
  if (!plot.crop) return false;
  const def = CROPS[plot.crop.type];
  return Date.now() - plot.crop.plantedAt >= def.growMs;
}

function readyCount(kind) {
  const def = ANIMALS[kind];
  const owned = state.animals[kind];
  if (owned <= 0) return 0;
  const elapsed = Date.now() - state.animalCollect[kind];
  const intervals = Math.floor(elapsed / def.intervalMs);
  return Math.min(MAX_STACK, intervals * owned);
}

function addToInventoryOrSell(item, amount, price) {
  if (state.autoSell) {
    state.emeralds += amount * price;
  } else {
    state.inventory[item] = Math.min(MAX_STACK, state.inventory[item] + amount);
  }
}

// ---------- Actions ----------

function plantSeed(index) {
  const plot = state.plots[index];
  if (!plot.unlocked || plot.crop) return;
  const type = state.selectedSeed;
  if (state.seeds[type] <= 0) {
    toast(`Keine ${CROPS[type].name}-Saat übrig! Im Shop kaufen.`);
    return;
  }
  state.seeds[type]--;
  plot.crop = { type, plantedAt: Date.now() };
  renderAll();
}

function harvestPlot(index) {
  const plot = state.plots[index];
  if (!plot.crop || !isReady(plot)) return;
  const def = CROPS[plot.crop.type];
  const amount = def.yieldMin + Math.floor(Math.random() * (def.yieldMax - def.yieldMin + 1));
  addToInventoryOrSell(plot.crop.type, amount, def.sellPrice);
  // small chance of bonus seed drop for wheat (like Minecraft wheat seeds)
  if (plot.crop.type === "wheat" && Math.random() < 0.6) {
    state.seeds.wheat = Math.min(MAX_STACK, state.seeds.wheat + 1);
  }
  plot.crop = null;
  renderAll();
}

function onPlotClick(index) {
  const plot = state.plots[index];
  if (!plot.unlocked) {
    buyField(index);
    return;
  }
  if (plot.crop && isReady(plot)) {
    harvestPlot(index);
  } else if (!plot.crop) {
    plantSeed(index);
  }
}

function buyField(index) {
  const plot = state.plots[index];
  if (plot.unlocked) return;
  const price = fieldPrice(index);
  if (state.emeralds < price) {
    toast(`Zu teuer! Feld kostet ${price} Smaragde.`);
    return;
  }
  state.emeralds -= price;
  plot.unlocked = true;
  renderAll();
  save();
}

function buySeed(type, amount) {
  const price = CROPS[type].seedPrice * amount;
  if (state.emeralds < price) {
    toast(`Zu teuer! ${amount}x ${CROPS[type].name}-Saat kostet ${price} Smaragde.`);
    return;
  }
  state.emeralds -= price;
  state.seeds[type] = Math.min(MAX_STACK, state.seeds[type] + amount);
  renderAll();
  save();
}

function buyAnimal(kind) {
  const price = animalPrice(kind);
  if (state.emeralds < price) {
    toast(`Zu teuer! ${ANIMALS[kind].name} kostet ${price} Smaragde.`);
    return;
  }
  // collect pending products first so buying doesn't lose progress
  collectAnimal(kind, true);
  state.emeralds -= price;
  state.animals[kind]++;
  renderAll();
  save();
}

function collectAnimal(kind, silent) {
  const count = readyCount(kind);
  const def = ANIMALS[kind];
  if (count > 0) {
    addToInventoryOrSell(def.product, count, def.sellPrice);
    state.animalCollect[kind] = Date.now();
    if (!silent) toast(`${count}x ${def.productName} eingesammelt!`);
  }
  if (!silent) {
    renderAll();
    save();
  }
}

function sellAll() {
  let total = 0;
  for (const [item, count] of Object.entries(state.inventory)) {
    const def = CROPS[item] || ANIMALS_BY_PRODUCT[item];
    const price = CROPS[item] ? CROPS[item].sellPrice : ANIMALS_BY_PRODUCT[item].sellPrice;
    if (count > 0) {
      total += count * price;
      state.inventory[item] = 0;
    }
  }
  if (total > 0) {
    state.emeralds += total;
    toast(`Verkauft für ${total} Smaragde!`);
    renderAll();
    save();
  }
}

const ANIMALS_BY_PRODUCT = {};
for (const [kind, def] of Object.entries(ANIMALS)) ANIMALS_BY_PRODUCT[def.product] = def;

function toggleAutoSell() {
  state.autoSell = !state.autoSell;
  renderAll();
  save();
}

function selectSeed(type) {
  state.selectedSeed = type;
  renderAll();
}

// ---------- Rendering ----------

let toastTimer = null;
function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}

function img(src, alt = "") {
  return `<img src="${src}" alt="${alt}" draggable="false">`;
}

function renderHeader() {
  document.getElementById("emerald-count").textContent = state.emeralds;
  document.getElementById("emerald-icon").src = Textures.emerald();
}

function renderPlots() {
  const grid = document.getElementById("farm-grid");
  grid.innerHTML = "";
  state.plots.forEach((plot, i) => {
    const cell = document.createElement("div");
    cell.className = "plot";
    if (!plot.unlocked) {
      cell.classList.add("locked");
      cell.style.backgroundImage = `url(${Textures.grass()})`;
      cell.innerHTML = `
        <div class="locked-overlay">
          ${img(Textures.lockIcon())}
          <div class="price">${fieldPrice(i)}${img(Textures.emerald(), "emerald")}</div>
        </div>`;
    } else if (!plot.crop) {
      cell.style.backgroundImage = `url(${Textures.farmland(false)})`;
      cell.classList.add("empty");
      cell.title = "Klicken zum Pflanzen";
    } else {
      const def = CROPS[plot.crop.type];
      const stage = cropStage(plot);
      const ready = isReady(plot);
      cell.style.backgroundImage = `url(${Textures.farmland(true)})`;
      cell.classList.add("planted");
      if (ready) cell.classList.add("ready");
      const cropTex =
        plot.crop.type === "wheat"
          ? Textures.wheat(stage)
          : plot.crop.type === "carrot"
          ? Textures.carrot(stage)
          : Textures.potato(stage);
      cell.innerHTML = `<div class="crop-layer">${img(cropTex, def.name)}</div>${
        ready ? '<div class="ready-badge">✓</div>' : ""
      }`;
      cell.title = ready ? `${def.name} ernten!` : `${def.name} wächst...`;
    }
    cell.addEventListener("click", () => onPlotClick(i));
    grid.appendChild(cell);
  });
}

function renderAnimals() {
  const wrap = document.getElementById("animal-pens");
  wrap.innerHTML = "";
  for (const [kind, def] of Object.entries(ANIMALS)) {
    const count = state.animals[kind];
    const ready = readyCount(kind);
    const price = animalPrice(kind);
    const tex = kind === "sheep" ? Textures.sheep() : kind === "cow" ? Textures.cow() : Textures.pufferfish();
    const bgTex = kind === "pufferfish" ? Textures.water() : Textures.grass();
    const pen = document.createElement("div");
    pen.className = "pen";
    pen.innerHTML = `
      <div class="pen-visual" style="background-image:url(${bgTex})">
        ${count > 0 ? img(tex, def.name) : `<div class="pen-empty">${img(Textures.lockIcon())}</div>`}
        ${ready > 0 ? `<div class="pen-ready-badge">+${ready}</div>` : ""}
      </div>
      <div class="pen-info">
        <strong>${def.name}</strong>
        <span class="pen-count">${count} gehalten</span>
        <button class="btn small" data-action="collect" ${ready === 0 ? "disabled" : ""}>
          Einsammeln ${ready > 0 ? `(+${ready})` : ""}
        </button>
        <button class="btn small buy" data-action="buy">
          Kaufen — ${price}${img(Textures.emerald(), "e")}
        </button>
      </div>`;
    pen.querySelector('[data-action="collect"]').addEventListener("click", () => collectAnimal(kind));
    pen.querySelector('[data-action="buy"]').addEventListener("click", () => buyAnimal(kind));
    wrap.appendChild(pen);
  }
}

function renderShopSeeds() {
  const wrap = document.getElementById("seed-shop");
  wrap.innerHTML = "";
  for (const [type, def] of Object.entries(CROPS)) {
    const row = document.createElement("div");
    row.className = "shop-row";
    const selected = state.selectedSeed === type;
    row.innerHTML = `
      <div class="shop-icon">${img(Textures.seedIcon(type), def.name)}</div>
      <div class="shop-label">
        <strong>${def.name}</strong>
        <span>Vorrat: ${state.seeds[type]}</span>
      </div>
      <button class="btn small ${selected ? "active" : ""}" data-action="select">Auswählen</button>
      <button class="btn small buy" data-action="buy1">+1 (${def.seedPrice}${"💚"})</button>
      <button class="btn small buy" data-action="buy10">+10 (${def.seedPrice * 10}${"💚"})</button>
    `;
    row.querySelector('[data-action="select"]').addEventListener("click", () => selectSeed(type));
    row.querySelector('[data-action="buy1"]').addEventListener("click", () => buySeed(type, 1));
    row.querySelector('[data-action="buy10"]').addEventListener("click", () => buySeed(type, 10));
    wrap.appendChild(row);
  }
}

function renderInventory() {
  const wrap = document.getElementById("inventory-bar");
  wrap.innerHTML = "";
  const entries = [
    ["wheat", Textures.seedIcon("wheat"), CROPS.wheat],
    ["carrot", Textures.carrot(3), CROPS.carrot],
    ["potato", Textures.potato(3), CROPS.potato],
    ["wool", Textures.wool(), ANIMALS.sheep],
    ["milk", Textures.milk(), ANIMALS.cow],
    ["pufferfish", Textures.fishItem(), ANIMALS.pufferfish],
  ];
  for (const [key, tex, def] of entries) {
    const slot = document.createElement("div");
    slot.className = "inv-slot";
    const count = state.inventory[key];
    slot.innerHTML = `${img(tex, key)}<span class="inv-count">${count}</span>`;
    slot.title = `${def.name || key}: ${count}`;
    wrap.appendChild(slot);
  }
  document.getElementById("autosell-toggle").classList.toggle("active", state.autoSell);
  document.getElementById("autosell-toggle").textContent = state.autoSell
    ? "Auto-Verkauf: AN"
    : "Auto-Verkauf: AUS";
}

function renderAll() {
  renderHeader();
  renderPlots();
  renderAnimals();
  renderShopSeeds();
  renderInventory();
}

// ---------- Game loop ----------

function tick() {
  renderAll();
}

function init() {
  document.body.style.backgroundImage = `url(${Textures.grass()})`;
  document.getElementById("sell-all").addEventListener("click", sellAll);
  document.getElementById("autosell-toggle").addEventListener("click", toggleAutoSell);

  const since = Date.now() - state.lastSave;
  renderAll();
  if (since > 60 * 1000) {
    toast("Willkommen zurück! Deine Farm ist weitergewachsen.");
  }

  setInterval(tick, TICK_MS);
  setInterval(save, AUTOSAVE_MS);
  window.addEventListener("beforeunload", save);
}

document.addEventListener("DOMContentLoaded", init);
