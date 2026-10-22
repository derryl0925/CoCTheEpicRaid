// Browser UI: hot-seat play with optional AI seats. Renders from state on every change.
(function () {
  const E = window.Engine;
  const SAVE_KEY = 'epicraid-save-v1';
  const app = document.getElementById('app');

  let G = null;
  const ui = {
    view: 'setup',
    seats: [
      { name: 'Player 1', isAI: false },
      { name: 'Computer 1', isAI: true },
      { name: 'Computer 2', isAI: true },
      { name: 'Computer 3', isAI: true },
    ],
    count: 2,
    focus: null,
    useMaster: false,
    modal: null,
    raid: { unit: null, count: 1, mode: 'building', wallbreak: false },
    speed: 700,
    aiTimer: null,
    lastCurrent: null,
  };

  // ---------- utils ----------
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const arg = (o) => esc(JSON.stringify(o));
  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => t.classList.add('hidden'), 2600);
  }
  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(G)); } catch (e) { /* storage full or disabled */ }
  }
  function loadSave() {
    try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { return null; }
  }
  const me = () => G.players[G.current];

  // ---------- actions ----------
  function doAct(a) {
    try {
      E.act(G, a);
    } catch (err) {
      toast(err.message);
      return;
    }
    if (a.type === 'deploy' || a.type === 'skipFollowup') {
      ui.raid.count = 1;
    }
    if (!G.pending || G.pending.kind !== 'raid') ui.raid = { unit: null, count: 1, mode: 'building', wallbreak: false };
    ui.modal = G.gameOver ? { kind: 'gameover' } : ui.modal;
    save();
    render();
  }

  function scheduleAI() {
    if (!G || G.gameOver || ui.view !== 'game' || ui.aiTimer) return;
    if (!me().isAI) return;
    ui.aiTimer = setTimeout(() => {
      ui.aiTimer = null;
      if (!G || G.gameOver || !me().isAI) return;
      const a = window.AI.chooseAction(G);
      if (a) doAct(a);
    }, ui.speed);
  }

  // Pick a concrete action space for an action type, honoring the master builder toggle.
  function pickSpace(action, column) {
    const p = me();
    const spaces = DATA.SPACES.filter((sp) => sp.action === action && (column == null || sp.column === column));
    if (!ui.useMaster) {
      const sp = spaces.find((x) => E.spaceAvailable(G, p.id, x.id, false));
      if (sp) return { space: sp.id, master: false };
    }
    const sp = spaces.find((x) => E.spaceAvailable(G, p.id, x.id, true));
    if (sp) return { space: sp.id, master: true };
    return null;
  }
  function actionAvailable(action, column) {
    return !!pickSpaceSilent(action, column);
  }
  function pickSpaceSilent(action, column) {
    if (!G || G.pending || me().isAI) return null;
    return pickSpace(action, column);
  }
  function takeAction(action, extra, column) {
    const sp = pickSpace(action, column);
    if (!sp) return toast('No available space for that action');
    ui.useMaster = false;
    doAct({ type: 'space', ...sp, ...extra });
  }

  // ---------- event handling ----------
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-cmd]');
    if (!el) return;
    const cmd = el.dataset.cmd;
    const a = el.dataset.arg ? JSON.parse(el.dataset.arg) : null;
    handle(cmd, a, el);
  });
  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset.seat != null) {
      const i = Number(el.dataset.seat);
      if (el.tagName === 'SELECT') ui.seats[i].isAI = el.value === 'ai';
      else ui.seats[i].name = el.value;
    }
    if (el.id === 'pcount') { ui.count = Number(el.value); render(); }
    if (el.id === 'speed') ui.speed = Number(el.value);
  });

  function handle(cmd, a) {
    switch (cmd) {
      case 'start': {
        const players = ui.seats.slice(0, ui.count).map((s) => ({ name: s.name.trim() || 'Player', isAI: s.isAI }));
        G = E.newGame({ players, firstPlayer: Math.floor(Math.random() * players.length) });
        ui.view = 'game';
        ui.modal = null;
        save();
        return render();
      }
      case 'resume': {
        const s = loadSave();
        if (!s) return toast('No saved game');
        G = s;
        ui.view = 'game';
        return render();
      }
      case 'menu':
        if (ui.view === 'game' && !G.gameOver && !confirm('Leave this game? It stays saved so you can resume it.')) return;
        clearTimeout(ui.aiTimer);
        ui.aiTimer = null;
        ui.view = 'setup';
        ui.modal = null;
        return render();
      case 'rules':
        ui.modal = { kind: 'rules' };
        return render();
      case 'close':
        ui.modal = null;
        return render();
      case 'focus':
        ui.focus = a;
        return render();
      case 'master':
        ui.useMaster = !ui.useMaster;
        return render();
      case 'collector':
        return takeAction('collector', { res: a });
      case 'build': {
        const col = DATA.BUILD_SLOTS[a].column;
        return takeAction('build', { slot: a }, col);
      }
      case 'upgrade':
        return takeAction('upgrade', {});
      case 'first':
        return takeAction('first', {});
      case 'defense':
        return takeAction('defense', { battery: a });
      case 'raidMenu':
        ui.modal = { kind: 'raid', action: a, bonus: 'gold' };
        return render();
      case 'bonus':
        ui.modal.bonus = a;
        return render();
      case 'raidGo': {
        const m = ui.modal;
        ui.modal = null;
        return takeAction(m.action, { target: a, bonus: m.bonus });
      }
      case 'cell':
        return doAct({ type: 'placeBuilding', key: a });
      case 'vertex':
        return doAct({ type: 'placeBattery', key: a });
      case 'edge':
        return doAct({ type: 'placeWall', key: a });
      case 'skipPlace':
        return doAct({ type: 'skipPlacement' });
      case 'selUnit':
        ui.raid = { unit: a, count: 1, mode: 'building', wallbreak: false };
        return render();
      case 'count': {
        const max = E.unusedUnits(me(), ui.raid.unit).length;
        ui.raid.count = Math.max(1, Math.min(max, ui.raid.count + a));
        return render();
      }
      case 'mode':
        ui.raid.mode = ui.raid.mode === 'building' ? 'defenses' : 'building';
        return render();
      case 'wallbreak':
        ui.raid.wallbreak = !ui.raid.wallbreak;
        return render();
      case 'target': {
        const fu = G.raid.followup;
        const unit = fu ? fu.unit : ui.raid.unit;
        if (!unit) return toast('Pick a unit type first');
        return doAct({ type: 'deploy', unit, count: ui.raid.count, target: a, mode: unit === 'giant' ? ui.raid.mode : 'building', useWallbreak: ui.raid.wallbreak });
      }
      case 'skipFollowup':
        return doAct({ type: 'skipFollowup' });
      case 'endRaid':
        return doAct({ type: 'endRaid' });
    }
  }

  // ---------- rendering ----------
  function render() {
    if (ui.view === 'setup') app.innerHTML = setupView();
    else app.innerHTML = gameView();
    if (ui.modal) app.insertAdjacentHTML('beforeend', modalView());
    const log = document.querySelector('.log');
    if (log) log.scrollTop = log.scrollHeight;
    scheduleAI();
  }

  function setupView() {
    const saved = loadSave();
    const seats = ui.seats.slice(0, ui.count).map((s, i) => `
      <div class="seat">
        <span class="swatch" style="background:${DATA.COLORS[i]}"></span>
        <input data-seat="${i}" value="${esc(s.name)}" maxlength="16" />
        <select data-seat="${i}">
          <option value="human" ${!s.isAI ? 'selected' : ''}>Human</option>
          <option value="ai" ${s.isAI ? 'selected' : ''}>Computer</option>
        </select>
      </div>`).join('');
    return `
    <div class="setup">
      <div class="title">CLASH OF CLANS</div>
      <div class="subtitle">THE EPIC RAID · FAN-MADE DIGITAL EDITION</div>
      <p>Build your village, train troops and raid your rivals. First to <b>40★</b> triggers the end of the game. Pass-and-play on one screen. Any seat can be a computer player.</p>
      <div class="row"><label><b>Players</b></label>
        <select id="pcount">${[2, 3, 4].map((n) => `<option ${n === ui.count ? 'selected' : ''}>${n}</option>`).join('')}</select>
      </div>
      ${seats}
      <div class="row" style="margin-top:14px">
        <button data-cmd="start">Start new game</button>
        ${saved && !saved.gameOver ? `<button class="secondary" data-cmd="resume">Resume saved game (round ${saved.round})</button>` : ''}
        <button class="secondary" data-cmd="rules">How to play</button>
      </div>
      <p class="note">Based on the v9 rulebook. Values the rulebook doesn't print (most building tiles, exact die faces) are best guesses and live in <code>js/data.js</code>. Not affiliated with Supercell or Maestro Media.</p>
    </div>`;
  }

  function promptText() {
    const p = me();
    if (G.gameOver) return 'Game over!';
    if (p.isAI) return `${esc(p.name)} (computer) is thinking…`;
    const pend = G.pending;
    if (!pend) {
      const b = `${p.buildersLeft} builder${p.buildersLeft === 1 ? '' : 's'}` + (p.masterLeft ? ' + Master Builder' : '');
      return `${esc(p.name)}: place a builder (${b} left). Pick an action on the center board.`;
    }
    if (pend.kind === 'placeBuilding') return `Place your ${DATA.BUILDINGS[pend.tile].name} on a highlighted spot next to your village.`;
    if (pend.kind === 'placeDefense') {
      if (pend.battery) return `Place your ${DATA.DEFENSES[pend.battery].name} on a highlighted corner (it defends the tiles and walls it touches).`;
      return `Place a wall on a highlighted tile edge (${pend.walls} left).`;
    }
    if (pend.kind === 'raid') {
      const d = G.players[G.raid.defender];
      if (G.raid.followup) return `${DATA.UNITS[G.raid.followup.unit].name} can attack again! Click a target in ${esc(d.name)}'s village, or skip.`;
      return `Raiding ${esc(d.name)}: choose a unit type and how many, then click an exposed target.`;
    }
    return '';
  }

  function gameView() {
    if (ui.lastCurrent !== G.current) {
      ui.lastCurrent = G.current;
      ui.focus = null;
      ui.useMaster = false;
    }
    const p = me();
    const pend = G.pending;
    let extra = '';
    if (!p.isAI && pend && pend.kind === 'placeDefense' && !pend.battery) extra = `<button class="secondary" data-cmd="skipPlace">Skip remaining walls</button>`;
    if (!p.isAI && pend && pend.kind === 'raid') {
      extra = G.raid.followup
        ? `<button class="secondary" data-cmd="skipFollowup">Skip extra attack</button>`
        : `<button class="danger" data-cmd="endRaid">End raid</button>`;
    }
    if (!p.isAI && !pend && p.masterLeft > 0) extra += `<button class="${ui.useMaster ? '' : 'secondary'}" data-cmd="master">${ui.useMaster ? '✔ Using' : 'Use'} Master Builder</button>`;
    return `
    <div class="game">
      <div class="topbar">
        <span class="round">Round ${G.round}</span>
        <span class="turn-pill" style="background:${p.color}">${esc(p.name)}'s turn</span>
        <span class="prompt">${promptText()}</span>
        ${extra}
        <label class="note">AI speed <select id="speed">
          ${[[1500, 'Slow'], [700, 'Normal'], [250, 'Fast'], [30, 'Instant']].map(([v, l]) => `<option value="${v}" ${ui.speed === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select></label>
        <button class="secondary small" data-cmd="rules">Rules</button>
        <button class="secondary small" data-cmd="menu">Menu</button>
      </div>
      <div class="col">
        ${trackView()}
        ${boardView()}
        ${logView()}
      </div>
      <div class="col">
        ${playersView()}
        ${villagePanel()}
      </div>
    </div>`;
  }

  function trackView() {
    const rows = G.players.map((p) => `
      <div class="track-row">
        <span style="color:${p.color}">${esc(p.name)}${G.firstPlayer === p.id ? ' 🚩' : ''}</span>
        <div class="track-bar"><div style="width:${Math.min(100, (p.stars / DATA.WIN_STARS) * 100)}%;background:${p.color}"></div></div>
        <span>${p.stars}★</span>
      </div>`).join('');
    return `<div class="panel"><h3>Victory stars (first to ${DATA.WIN_STARS})</h3><div class="track">${rows}</div></div>`;
  }

  function slotsView(action) {
    return `<div class="slots">${DATA.SPACES.filter((s) => s.action === action).map((sp) => {
      const occ = G.spaces[sp.id];
      const locked = sp.min > G.players.length;
      const dots = occ.map((o) => `<span class="dot ${o.master ? 'master' : ''}" style="background:${G.players[o.pid].color}"></span>`).join('');
      return `<span class="slot ${locked ? 'locked' : ''}" title="${locked ? sp.min + '+ players' : ''}">${dots}</span>`;
    }).join('')}</div>`;
  }

  function boardView() {
    const p = me();
    const human = !p.isAI && !G.pending;
    const can = (action, col) => human && actionAvailable(action, col);
    const nextTH = DATA.TOWNHALL[p.thLevel + 1];
    const defBtns = Object.keys(DATA.DEFENSES).map((id) => {
      const d = DATA.DEFENSES[id];
      const ok = can('defense') && G.defenseSupply[id] > 0 && E.canPay(p, 'gold', d.cost);
      return `<button class="small" ${ok ? '' : 'disabled'} data-cmd="defense" data-arg="${arg(id)}" title="${esc(d.text)}">${d.icon} ${d.name} (${d.cost}🪙) ×${G.defenseSupply[id]}</button>`;
    }).join('') + `<button class="small secondary" ${can('defense') && G.wallSupply > 0 ? '' : 'disabled'} data-cmd="defense" data-arg="null">Walls only</button>`;

    const cols = [0, 1, 2].map((c) => {
      const cards = DATA.BUILD_SLOTS.map((bs, i) => ({ bs, i })).filter((x) => x.bs.column === c).map(({ i }) => cardView(i, human)).join('');
      return `<div class="build-col"><div class="row" style="justify-content:space-between"><b style="font-size:12px">BUILD</b>${slotsViewOne('build' + c)}</div>${cards}</div>`;
    }).join('');

    const colBtn = (res) => {
      const id = res === 'gold' ? 'goldCollector' : 'elixirCollector';
      const b = DATA.BUILDINGS[id];
      const ok = can('collector') && G.collectors[id] > 0;
      return `<button class="small" ${ok ? '' : 'disabled'} data-cmd="collector" data-arg="${arg(res)}">${b.icon} ${b.name} (1🪙) ×${G.collectors[id]}</button>`;
    };

    return `
    <div class="panel">
      <h3>Center board</h3>
      <div class="actions">
        <div class="action green">
          <span class="name">Collectors</span>${slotsView('collector')}
          <span class="desc">Build a collector (1 gold) next to your village.</span>
          <div class="btns">${colBtn('gold')}${colBtn('elixir')}</div>
        </div>
        <div class="action red">
          <span class="name">Upgrade Town Hall</span>${slotsView('upgrade')}
          <span class="desc">${nextTH ? `To level ${p.thLevel + 1}: ${nextTH.cost} elixir. ${nextTH.text}.` : 'Town Hall is max level.'}</span>
          <div class="btns"><button class="small" ${can('upgrade') ? '' : 'disabled'} data-cmd="upgrade">Upgrade</button></div>
        </div>
        <div class="action red">
          <span class="name">Take 1st Player</span>${slotsView('first')}
          <span class="desc">+1 gem. You go first next round.</span>
          <div class="btns"><button class="small" ${can('first') ? '' : 'disabled'} data-cmd="first">Take</button></div>
        </div>
        <div class="action red">
          <span class="name">Epic Raid</span>${slotsView('epic')}
          <span class="desc">Bonus +1 gold or elixir, then raid one rival.</span>
          <div class="btns"><button class="small" ${can('epic') ? '' : 'disabled'} data-cmd="raidMenu" data-arg="${arg('epic')}">Epic Raid</button></div>
        </div>
        <div class="action red">
          <span class="name">Raid</span>${slotsView('raid')}
          <span class="desc">Raid one rival (no bonus).</span>
          <div class="btns"><button class="small" ${can('raid') ? '' : 'disabled'} data-cmd="raidMenu" data-arg="${arg('raid')}">Raid</button></div>
        </div>
        <div class="action yellow" style="grid-column: span 2">
          <span class="name">Defenses</span>${slotsView('defense')}
          <span class="desc">Build 1 defense battery and always get 2 walls. Walls left: ${G.wallSupply}</span>
          <div class="btns">${defBtns}</div>
        </div>
      </div>
      <h3 style="margin-top:10px">Build area <span class="note">(deck: ${G.deck.length})</span></h3>
      <div class="build-area">${cols}</div>
    </div>`;
  }
  function slotsViewOne(spaceId) {
    const occ = G.spaces[spaceId];
    const dots = occ.map((o) => `<span class="dot ${o.master ? 'master' : ''}" style="background:${G.players[o.pid].color}"></span>`).join('');
    return `<span class="slots"><span class="slot">${dots}</span></span>`;
  }

  function cardView(i, human) {
    const sl = G.buildArea[i];
    if (!E.slotActive(G, i)) return `<div class="card locked"><div class="ctext" style="margin-top:30px">${DATA.BUILD_SLOTS[i].min}+ players</div></div>`;
    if (!sl.tile) return `<div class="card empty"><div class="ctext" style="margin-top:30px">Empty — refills at round end</div></div>`;
    const t = sl.tile;
    const c = E.slotCost(G, i);
    const col = DATA.BUILD_SLOTS[i].column;
    const ok = human && E.buildableSlots(G, G.current, col).includes(i) && actionAvailable('build', col);
    const disc = sl.discount ? `<span class="disc" title="Discount tokens">-${sl.discount}</span>` : '';
    const costCls = c.res === 'gold' ? 'gold' : 'elixir';
    const costIcon = c.res === 'gold' ? '🪙' : '🧪';
    if (t.kind === 'unit') {
      const u = DATA.UNITS[t.id];
      return `<div class="card unit ${ok ? 'can' : 'disabled'}" ${ok ? `data-cmd="build" data-arg="${i}"` : ''} title="${esc(u.text)}">
        ${disc}<div class="stats"><span class="cost ${costCls}">${c.n}${costIcon}</span><span>⚔${u.attack} 🛡${u.defense}</span></div>
        <div class="icon">${u.icon}</div><div class="cname">${u.name}</div><div class="ctext">${esc(u.text)}</div></div>`;
    }
    const b = DATA.BUILDINGS[t.id];
    return `<div class="card ${ok ? 'can' : 'disabled'}" ${ok ? `data-cmd="build" data-arg="${i}"` : ''} title="${esc(b.text)}">
      ${disc}<div class="stats"><span class="cost ${costCls}">${c.n}${costIcon}</span><span>🛡${b.defense}</span></div>
      <div class="icon">${b.icon}</div><div class="cname">${b.name}</div><div class="ctext">${esc(b.text)}</div></div>`;
  }

  function unitsSummary(p) {
    const groups = {};
    for (const u of p.units) {
      groups[u.type] = groups[u.type] || { total: 0, ready: 0 };
      groups[u.type].total++;
      if (!u.used) groups[u.type].ready++;
    }
    return Object.entries(groups).map(([type, g]) => {
      const u = DATA.UNITS[type];
      return `<span class="ubadge ${g.ready ? '' : 'used'}" title="${esc(u.name)}: ⚔${u.attack} 🛡${u.defense}. ${esc(u.text)}">${u.icon} ${g.ready}/${g.total}</span>`;
    }).join('');
  }

  function playersView() {
    return `<div class="players">${G.players.map((p) => {
      const pot = E.scoreVillage(p).total;
      return `<div class="pcard ${p.id === G.current ? 'active' : ''}" style="border-color:${p.color}" data-cmd="focus" data-arg="${p.id}">
        <div class="pname"><span style="color:${p.color}">${esc(p.name)}${p.isAI ? ' 🤖' : ''}</span><span>🏰 TH ${p.thLevel}</span></div>
        <div class="res"><span class="g">🪙 ${p.gold}</span><span class="e">🧪 ${p.elixir}</span><span class="m">💎 ${p.gems}</span><span class="s">★ ${p.stars}</span></div>
        <div class="note">Builders: ${'🔨'.repeat(p.buildersLeft)}${p.masterLeft ? '⭐' : ''} · scores ~${pot}★ this round</div>
        <div class="units">${unitsSummary(p)}</div>
      </div>`;
    }).join('')}</div>`;
  }

  function villagePanel() {
    const pend = G.pending;
    let shown = ui.focus != null ? ui.focus : G.current;
    const human = !me().isAI;
    let hl = null;
    let header = '';
    if (pend && pend.kind === 'raid') {
      shown = G.raid.defender;
      header = raidBar(human);
      const fu = G.raid.followup;
      const unit = fu ? fu.unit : ui.raid.unit;
      if (human && unit) hl = { targets: E.raidTargets(G, unit) };
    } else if (pend && (pend.kind === 'placeBuilding' || pend.kind === 'placeDefense')) {
      shown = G.current;
      const p = me();
      if (human) {
        if (pend.kind === 'placeBuilding') hl = { cells: E.legalBuildingCells(p) };
        else if (pend.battery) hl = { vertices: E.legalBatteryVertices(p), battery: pend.battery };
        else hl = { edges: E.legalWallEdges(p) };
      }
    }
    const tabs = G.players.map((p) => `<span class="tab ${p.id === shown ? 'active' : ''}" style="color:${p.color}" data-cmd="focus" data-arg="${p.id}">${esc(p.name)}'s village</span>`).join('');
    return `<div class="panel village-wrap" style="flex:1">
      <div class="tabs">${tabs}</div>
      ${header}
      <div class="village">${villageSVG(G.players[shown], hl)}</div>
      ${combatView()}
      <div class="note" style="margin-top:4px">Shield = defense. Batteries sit in tile corners and roll 1 black die against attackers on any tile/wall they touch. 🔥 = burned this round (doesn't score).</div>
    </div>`;
  }

  function raidBar(human) {
    const p = me();
    const fu = G.raid.followup;
    if (!human) return `<div class="raidbar"><b>${esc(p.name)} is raiding…</b></div>`;
    if (fu) return `<div class="raidbar"><b>${DATA.UNITS[fu.unit].icon} ${fu.count}× ${DATA.UNITS[fu.unit].name} attacks again.</b> Click a highlighted target.</div>`;
    const types = [...new Set(E.unusedUnits(p).map((u) => u.type))];
    const picks = types.map((t) => {
      const u = DATA.UNITS[t];
      const n = E.unusedUnits(p, t).length;
      return `<span class="unitpick ${ui.raid.unit === t ? 'sel' : ''}" data-cmd="selUnit" data-arg="${arg(t)}" title="${esc(u.text)}">${u.icon} ${u.name} ×${n} <span class="note">⚔${u.attack} 🛡${u.defense}</span></span>`;
    }).join('');
    let opts = '';
    if (ui.raid.unit) {
      const max = E.unusedUnits(p, ui.raid.unit).length;
      opts = `<span class="row"><b>Send</b><button class="small secondary" data-cmd="count" data-arg="-1">−</button><b>${ui.raid.count}</b><button class="small secondary" data-cmd="count" data-arg="1">+</button><span class="note">of ${max}</span></span>`;
      if (ui.raid.unit === 'giant') opts += `<button class="small ${ui.raid.mode === 'defenses' ? '' : 'secondary'}" data-cmd="mode">${ui.raid.mode === 'defenses' ? '✔ ' : ''}Attack all neighboring defenses</button>`;
      if (ui.raid.unit === 'wallbreaker') opts += `<button class="small ${ui.raid.wallbreak ? '' : 'secondary'}" data-cmd="wallbreak">${ui.raid.wallbreak ? '✔ ' : ''}Breach a wall first</button>`;
    }
    return `<div class="raidbar">${picks || '<span class="note">No units left.</span>'}</div>${opts ? `<div class="raidbar">${opts}</div>` : ''}`;
  }

  function diceView(faces, color) {
    return `<span class="dice">${faces.map((f) => `<span class="die ${color}">${'⚔'.repeat(f.dmg)}${f.plus ? '+' : ''}</span>`).join('')}</span>`;
  }
  function combatView() {
    const c = G.lastCombat;
    if (!c) return '';
    const u = DATA.UNITS[c.unit];
    const defs = c.defense.length
      ? c.defense.map((d) => `${DATA.DEFENSES[d.battery].icon} ${diceView(d.faces, 'black')}`).join(' ')
      : '<span class="note">no defenses could fire</span>';
    const atk = c.attack ? `${diceView(c.attack.faces, 'red')} = <b>${c.attack.dmg}</b> dmg` : '<span class="note">none survived</span>';
    return `<div class="combat"><b>${esc(G.players[c.attacker].name)}: ${c.count}× ${u.icon} ${u.name}${c.followup ? ' (extra attack)' : ''}</b><br>
      Defense: ${defs} → ${c.defenseTotal} dmg, ${c.killed} defeated<br>
      Attack: ${atk}${c.burned.length ? `<br>🔥 Burned: <b>${esc(c.burned.join(', '))}</b> (+${c.burned.length}★)` : ''}</div>`;
  }

  function logView() {
    return `<div class="panel"><h3>Log</h3><div class="log">${G.log.slice(-120).map((l) => `<div>${esc(l)}</div>`).join('')}</div></div>`;
  }

  // ---------- village SVG ----------
  const C = 84; // cell size
  const CUT = 17; // corner cut for batteries
  const M = 24;
  const TILE_COLORS = { townhall: '#2f5f2a', goldCollector: '#86b65a', elixirCollector: '#86b65a' };

  function villageSVG(p, hl) {
    const v = p.village;
    const keys = Object.keys(v.tiles);
    const pts = keys.map(E.P);
    if (hl && hl.cells) hl.cells.forEach((k) => pts.push(E.P(k)));
    let minX = Math.min(...pts.map((q) => q[0])) - 1;
    let maxX = Math.max(...pts.map((q) => q[0])) + 1;
    let minY = Math.min(...pts.map((q) => q[1])) - 1;
    let maxY = Math.max(...pts.map((q) => q[1])) + 1;
    const W = (maxX - minX + 1) * C + 2 * M;
    const H = (maxY - minY + 1) * C + 2 * M;
    const X = (x) => (x - minX) * C + M;
    const Y = (y) => (y - minY) * C + M;
    const out = [];
    const oct = (x0, y0, x1, y1, c) =>
      [[x0 + c, y0], [x1 - c, y0], [x1, y0 + c], [x1, y1 - c], [x1 - c, y1], [x0 + c, y1], [x0, y1 - c], [x0, y0 + c]].map((q) => q.join(',')).join(' ');

    // tiles
    for (const k of keys) {
      const [x, y] = E.P(k);
      const t = v.tiles[k];
      const b = DATA.BUILDINGS[t.id];
      const burned = v.burned['c:' + k];
      const x0 = X(x) + 2, y0 = Y(y) + 2, x1 = X(x + 1) - 2, y1 = Y(y + 1) - 2;
      const fill = burned ? '#5b3a22' : TILE_COLORS[t.id] || (b.score ? '#3d7230' : '#6fa548');
      const def = E.tileDefense(p, k);
      const name = t.id === 'townhall' ? `Town Hall L${p.thLevel}` : b.name;
      out.push(`<g><title>${esc(name)} — defense ${def}. ${esc(b.text)}</title>
        <polygon class="tile" points="${oct(x0, y0, x1, y1, CUT - 2)}" fill="${fill}"/>
        <text class="tile-icon" x="${(x0 + x1) / 2}" y="${(y0 + y1) / 2 - 6}">${burned ? '🔥' : b.icon}</text>
        <text class="tile-label" x="${(x0 + x1) / 2}" y="${y1 - 10}">${esc(name)}</text>
        <circle cx="${x1 - 14}" cy="${y0 + 14}" r="9" fill="#7d8790" stroke="#333"/>
        <text class="shield" x="${x1 - 14}" y="${y0 + 14}">${def}</text></g>`);
    }
    // walls
    for (const e in v.walls) out.push(wallLine(e, X, Y, v.burned['w:' + e] ? 'wall burned' : 'wall'));
    // batteries
    const BCOL = { cannon: '#3b3b3b', archer: '#b07a3a', wizard: '#7b3fa0' };
    for (const vt in v.batteries) {
      const [x, y] = E.P(vt);
      const b = v.batteries[vt];
      const burned = v.burned['b:' + vt];
      out.push(`<g><title>${DATA.DEFENSES[b].name}. ${esc(DATA.DEFENSES[b].text)}</title>
        <circle class="battery" cx="${X(x)}" cy="${Y(y)}" r="14" fill="${burned ? '#5b3a22' : BCOL[b]}"/>
        <text class="tile-icon" style="font-size:15px" x="${X(x)}" y="${Y(y)}">${burned ? '🔥' : DATA.DEFENSES[b].icon}</text></g>`);
    }
    // attackers standing / fallen
    const byCell = {};
    for (const st of v.standing) if (st.count > 0) (byCell[st.key] = byCell[st.key] || []).push({ ...st, up: true });
    for (const st of v.fallen) if (st.key) (byCell[st.key] = byCell[st.key] || []).push({ ...st, up: false });
    for (const k in byCell) {
      const [x, y] = E.P(k);
      byCell[k].forEach((st, i) => {
        const cx = X(x) + 18 + i * 26, cy = Y(y) + 20;
        out.push(`<g opacity="${st.up ? 1 : 0.45}"><title>${st.count}× ${DATA.UNITS[st.unit].name} (${st.up ? 'standing' : 'defeated'})</title>
          <rect x="${cx - 12}" y="${cy - 11}" width="24" height="22" rx="5" fill="#fff" stroke="${G.players[st.owner].color}" stroke-width="3"/>
          <text x="${cx}" y="${cy}" class="tile-icon" style="font-size:13px">${DATA.UNITS[st.unit].icon}</text>
          <text x="${cx + 10}" y="${cy + 10}" style="font-size:10px;font-weight:900">${st.count}</text></g>`);
      });
    }
    // highlights
    if (hl) {
      if (hl.cells) for (const k of hl.cells) {
        const [x, y] = E.P(k);
        out.push(`<polygon class="hl-cell clickable" data-cmd="cell" data-arg="${arg(k)}" points="${oct(X(x) + 4, Y(y) + 4, X(x + 1) - 4, Y(y + 1) - 4, CUT - 2)}"/>`);
      }
      if (hl.edges) for (const e of hl.edges) out.push(wallLine(e, X, Y, 'hl-edge clickable', `data-cmd="edge" data-arg="${arg(e)}"`));
      if (hl.vertices) for (const vt of hl.vertices) {
        const [x, y] = E.P(vt);
        out.push(`<circle class="hl-vertex clickable" data-cmd="vertex" data-arg="${arg(vt)}" cx="${X(x)}" cy="${Y(y)}" r="11"/>`);
      }
      if (hl.targets) {
        const t = hl.targets;
        for (const tt of t.tiles) {
          const [x, y] = E.P(tt.key);
          out.push(`<polygon class="hl-target clickable" data-cmd="target" data-arg="${arg({ type: 'tile', key: tt.key })}" points="${oct(X(x) + 5, Y(y) + 5, X(x + 1) - 5, Y(y + 1) - 5, CUT - 3)}"><title>Attack this tile${tt.side ? '' : ' (breach wall)'}</title></polygon>`);
        }
        for (const e of t.walls) out.push(wallLine(e, X, Y, 'hl-edge clickable', `data-cmd="target" data-arg="${arg({ type: 'wall', key: e })}"`));
        for (const b of t.batteries) {
          const [x, y] = E.P(b);
          out.push(`<circle class="hl-vertex clickable" data-cmd="target" data-arg="${arg({ type: 'battery', key: b })}" cx="${X(x)}" cy="${Y(y)}" r="17" fill-opacity="0.3"/>`);
        }
      }
    }
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${out.join('')}</svg>`;
  }
  function wallLine(e, X, Y, cls, attrs = '') {
    const [a, b] = E.edgeEnds(e).map(E.P);
    const horiz = a[1] === b[1];
    const x1 = X(a[0]) + (horiz ? CUT : 0), y1 = Y(a[1]) + (horiz ? 0 : CUT);
    const x2 = X(b[0]) - (horiz ? CUT : 0), y2 = Y(b[1]) - (horiz ? 0 : CUT);
    if (cls.startsWith('hl-edge')) {
      // clickable highlight: a rect, so the hit area isn't a zero-height line
      const T = 12;
      const rx = horiz ? x1 : x1 - T / 2, ry = horiz ? y1 - T / 2 : y1;
      const w = horiz ? x2 - x1 : T, h = horiz ? T : y2 - y1;
      return `<rect class="${cls}" ${attrs} x="${rx}" y="${ry}" width="${w}" height="${h}" rx="5"/>`;
    }
    return `<line class="${cls}" ${attrs} x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
  }

  // ---------- modals ----------
  function modalView() {
    const m = ui.modal;
    if (m.kind === 'raid') {
      const p = me();
      const opps = G.players.filter((o) => o.id !== p.id).map((o) =>
        `<button data-cmd="raidGo" data-arg="${o.id}" style="background:${o.color};color:#fff">${esc(o.name)} — ${o.stars}★, scores ~${E.scoreVillage(o).total}★</button>`).join('');
      const bonus = m.action === 'epic'
        ? `<div class="row"><b>Epic Raid bonus:</b>
            <button class="small ${m.bonus === 'gold' ? '' : 'secondary'}" data-cmd="bonus" data-arg="${arg('gold')}">+1 🪙 gold</button>
            <button class="small ${m.bonus === 'elixir' ? '' : 'secondary'}" data-cmd="bonus" data-arg="${arg('elixir')}">+1 🧪 elixir</button></div>`
        : '';
      return `<div class="overlay"><div class="modal"><h2>${m.action === 'epic' ? 'Epic Raid' : 'Raid'}: who do you attack?</h2>
        <p class="note">A raid targets one player. Burned buildings don't score this round, and each thing you burn earns you 1★.</p>
        ${bonus}<div class="row">${opps}</div>
        <div class="row"><button class="secondary" data-cmd="close">Cancel</button></div></div></div>`;
    }
    if (m.kind === 'gameover') {
      const ranked = [...G.players].sort((a, b) => b.stars - a.stars);
      return `<div class="overlay"><div class="modal">
        <div class="winner">🏆 ${G.winners.map((i) => esc(G.players[i].name)).join(' & ')} win${G.winners.length > 1 ? '' : 's'}!</div>
        <ol>${ranked.map((p) => `<li><b style="color:${p.color}">${esc(p.name)}</b> — ${p.stars}★ (Town Hall ${p.thLevel})</li>`).join('')}</ol>
        <div class="row"><button data-cmd="menu">New game</button><button class="secondary" data-cmd="close">View board</button></div></div></div>`;
    }
    if (m.kind === 'rules') return `<div class="overlay"><div class="modal rules">${rulesHTML()}<div class="row"><button data-cmd="close">Close</button></div></div></div>`;
    return '';
  }

  function rulesHTML() {
    const units = Object.values(DATA.UNITS).map((u) => `<tr><td>${u.icon} ${u.name}</td><td>${u.cost}🧪</td><td>${u.attack}</td><td>${u.defense}</td><td>${esc(u.text)}</td></tr>`).join('');
    const th = [2, 3, 4, 5].map((l) => `<tr><td>Level ${l}</td><td>${DATA.TOWNHALL[l].cost}🧪</td><td>${DATA.TOWNHALL[l].defense}</td><td>${DATA.TOWNHALL[l].text}</td></tr>`).join('');
    const defs = Object.values(DATA.DEFENSES).map((d) => `<tr><td>${d.icon} ${d.name}</td><td>${d.cost}🪙</td><td>${esc(d.text)}</td></tr>`).join('');
    return `<h2>How to play</h2>
    <p>Lead your Clan to victory by earning <b>stars</b>: upgrade your Town Hall, build scoring buildings, and set rival villages on fire. When a player has <b>40★</b> at the end of a Score phase, the game ends and the most stars wins.</p>
    <h4>Each round</h4>
    <ol>
      <li><b>Collect:</b> every collector, mine and storage produces resources. 🪙 Gold buys buildings and defenses, 🧪 elixir buys units and Town Hall upgrades, 💎 gems count as either.</li>
      <li><b>Builder actions:</b> starting with the first player, take turns placing one builder (you have 3) on a free action space and do that action immediately. Some spaces only open with 3 or 4 players. From Town Hall level 4 your <b>Master Builder</b> can go on any space, even an occupied one (not the 1st Player space once it's taken).</li>
      <li><b>Score village:</b> Town Halls not on fire score 1★ per level. Scoring buildings not on fire score what their tile says.</li>
      <li><b>Remove:</b> all fire is cleared and units return to their owners.</li>
      <li><b>Discount &amp; refill:</b> every tile left in the build area gets a discount token (−1 cost each). Empty spaces refill from the deck.</li>
    </ol>
    <h4>Actions</h4>
    <ul>
      <li><b>Collectors / Build:</b> pay and take a tile. Buildings go next to a building already in your village; units join your army.</li>
      <li><b>Upgrade Town Hall:</b> pay elixir for the next level and take its reward right away.</li>
      <li><b>Take 1st Player:</b> +1 gem, and you go first next round.</li>
      <li><b>Defenses:</b> build 1 battery (Cannon, Archer Tower or Wizard Tower) in a tile corner, plus 2 walls on tile edges.</li>
      <li><b>Epic Raid / Raid:</b> attack one rival (Epic gives +1 gold or elixir first).</li>
    </ul>
    <h4>Raiding</h4>
    <ul>
      <li>Pick a unit type and how many of them, then deploy onto an <b>exposed</b> building or wall. Exposed means it has an edge with no wall, facing empty ground, a burned tile, or one of your undefeated units. Flying units ignore walls.</li>
      <li>Every defense battery touching that tile or wall rolls a black die. If the total damage is at least a unit's defense, that unit is defeated (no partial damage carries over).</li>
      <li>Survivors roll red dice equal to their total attack. ⚔ = 1 damage, + = roll another die. If the damage equals the target's defense, it <b>burns</b>: +1★, and burning a collector also gives you its resource. Burned buildings don't score this round.</li>
      <li>Keep sending more unit types until you're out of units or choose to stop. Each unit raids once per round.</li>
    </ul>
    <h4>Units</h4><table><tr><th>Unit</th><th>Cost</th><th>Attack</th><th>Def</th><th>Ability</th></tr>${units}</table>
    <h4>Defenses</h4><table><tr><th></th><th>Cost</th><th>Notes</th></tr>${defs}</table><p>Every defense, walls included, has 1 shield. Walls always come in pairs with a defense action.</p>
    <h4>Town Hall</h4><table><tr><th></th><th>Cost</th><th>Defense</th><th>Reward</th></tr>${th}</table>
    <p class="note">Fan implementation of the v9 rulebook. Where the rulebook is silent (building tile list, exact die faces), values are best guesses kept in js/data.js.</p>`;
  }

  render();
})();
