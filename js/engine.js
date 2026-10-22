// Rules engine. State is a plain JSON-serializable object; all mutations go through act().
(function (root) {
  const DATA = root.DATA || (typeof require !== 'undefined' ? require('./data.js') : null);

  // ---------- RNG (seeded, stored in state so saves are reproducible) ----------
  function rand(s) {
    let t = (s.seed = (s.seed + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function shuffle(s, arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand(s) * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // ---------- Geometry ----------
  // Cells "x,y". Vertices "x,y" = top-left corner of cell (x,y).
  // Edges "h:x,y" = top edge of cell (x,y); "v:x,y" = left edge of cell (x,y).
  const K = (x, y) => x + ',' + y;
  const P = (k) => k.split(',').map(Number);
  function tileSides(key) {
    const [x, y] = P(key);
    return [
      { edge: 'h:' + K(x, y), n: K(x, y - 1), dir: [0, 1] },
      { edge: 'h:' + K(x, y + 1), n: K(x, y + 1), dir: [0, -1] },
      { edge: 'v:' + K(x, y), n: K(x - 1, y), dir: [1, 0] },
      { edge: 'v:' + K(x + 1, y), n: K(x + 1, y), dir: [-1, 0] },
    ];
  }
  function tileCorners(key) {
    const [x, y] = P(key);
    return [K(x, y), K(x + 1, y), K(x, y + 1), K(x + 1, y + 1)];
  }
  function edgeCells(e) {
    const [t, rest] = e.split(':');
    const [x, y] = P(rest);
    return t === 'h' ? [K(x, y - 1), K(x, y)] : [K(x - 1, y), K(x, y)];
  }
  function edgeEnds(e) {
    const [t, rest] = e.split(':');
    const [x, y] = P(rest);
    return t === 'h' ? [K(x, y), K(x + 1, y)] : [K(x, y), K(x, y + 1)];
  }
  function vertexCells(v) {
    const [x, y] = P(v);
    return [K(x - 1, y - 1), K(x, y - 1), K(x - 1, y), K(x, y)];
  }
  function neighbors(key) {
    return tileSides(key).map((s) => s.n);
  }

  // ---------- Helpers ----------
  const log = (s, msg) => {
    s.log.push(msg);
    if (s.log.length > 300) s.log.shift();
  };
  const cur = (s) => s.players[s.current];
  const tileDef = (t) => DATA.BUILDINGS[t.id];
  function tileDefense(p, key) {
    const t = p.village.tiles[key];
    if (t.id === 'townhall') return DATA.TOWNHALL[p.thLevel].defense;
    return tileDef(t).defense;
  }
  function canPay(p, res, n) {
    return p[res] + p.gems >= n;
  }
  function pay(p, res, n) {
    const fromRes = Math.min(p[res], n);
    p[res] -= fromRes;
    p.gems -= n - fromRes;
  }
  function slotActive(s, i) {
    return DATA.BUILD_SLOTS[i].min <= s.players.length;
  }
  function slotCost(s, i) {
    const sl = s.buildArea[i];
    if (!sl || !sl.tile) return null;
    const base = sl.tile.kind === 'unit' ? DATA.UNITS[sl.tile.id].cost : DATA.BUILDINGS[sl.tile.id].cost;
    return {
      res: sl.tile.kind === 'unit' ? 'elixir' : 'gold',
      n: Math.max(0, base - sl.discount),
    };
  }
  function unusedUnits(p, type) {
    return p.units.filter((u) => !u.used && (!type || u.type === type));
  }
  function countWizardTowers(p) {
    return Object.values(p.village.batteries).filter((b) => b === 'wizard').length;
  }
  function owns(p, type) {
    return p.units.some((u) => u.type === type);
  }

  // ---------- Setup ----------
  function newGame(config) {
    const n = config.players.length;
    if (n < 2 || n > 4) throw new Error('2-4 players');
    const s = {
      version: 1,
      seed: config.seed != null ? config.seed : (Math.random() * 2 ** 31) | 0,
      round: 0,
      phase: 'builder',
      players: [],
      firstPlayer: 0,
      nextFirst: null,
      current: 0,
      spaces: {},
      buildArea: [],
      deck: [],
      collectors: { goldCollector: DATA.COLLECTOR_SUPPLY - n, elixirCollector: DATA.COLLECTOR_SUPPLY - n },
      defenseSupply: {},
      wallSupply: DATA.WALL_SUPPLY,
      pending: null,
      raid: null,
      lastCombat: null,
      log: [],
      gameOver: false,
      winners: null,
    };
    for (const id in DATA.DEFENSES) s.defenseSupply[id] = DATA.DEFENSES[id].supply;
    config.players.forEach((cp, i) => {
      s.players.push({
        id: i,
        name: cp.name || DATA.COLOR_NAMES[i],
        color: DATA.COLORS[i],
        isAI: !!cp.isAI,
        gold: 0,
        elixir: 0,
        gems: 1,
        stars: 0,
        thLevel: 1,
        masterUnlocked: false,
        buildersLeft: 3,
        masterLeft: 0,
        units: [
          { type: 'barbarian', used: false },
          { type: 'archer', used: false },
        ],
        village: {
          tiles: { '-1,0': { id: 'goldCollector' }, '0,0': { id: 'townhall' }, '1,0': { id: 'elixirCollector' } },
          batteries: {},
          walls: {},
          burned: {},
          standing: [],
          fallen: [],
        },
      });
    });
    const deck = [];
    for (const id in DATA.DECK.buildings) for (let i = 0; i < DATA.DECK.buildings[id]; i++) deck.push({ kind: 'building', id });
    for (const id in DATA.DECK.units) for (let i = 0; i < DATA.DECK.units[id]; i++) deck.push({ kind: 'unit', id });
    s.deck = shuffle(s, deck);
    s.buildArea = DATA.BUILD_SLOTS.map(() => ({ tile: null, discount: 0 }));
    refill(s);
    s.firstPlayer = config.firstPlayer != null ? config.firstPlayer : 0;
    log(s, `New game with ${n} players. ${s.players[s.firstPlayer].name} goes first.`);
    startRound(s);
    return s;
  }

  function refill(s) {
    s.buildArea.forEach((sl, i) => {
      if (slotActive(s, i) && !sl.tile && s.deck.length) {
        sl.tile = s.deck.pop();
        sl.discount = 0;
      }
    });
  }

  // ---------- Round flow ----------
  function startRound(s) {
    s.round++;
    s.phase = 'collect';
    log(s, `— Round ${s.round} —`);
    for (const p of s.players) {
      const got = { gold: 0, elixir: 0, gems: 0 };
      for (const k in p.village.tiles) {
        const c = tileDef(p.village.tiles[k]).collect;
        if (c) for (const r in c) got[r] += c[r];
      }
      p.gold += got.gold;
      p.elixir += got.elixir;
      p.gems += got.gems;
      p.buildersLeft = 3;
      p.masterLeft = p.masterUnlocked ? 1 : 0;
      p.units.forEach((u) => (u.used = false));
      log(s, `${p.name} collects ${fmtRes(got)}.`);
    }
    s.spaces = {};
    DATA.SPACES.forEach((sp) => (s.spaces[sp.id] = []));
    s.phase = 'builder';
    s.current = s.firstPlayer;
    s.nextFirst = null;
    s.pending = null;
  }
  function fmtRes(r) {
    const parts = [];
    if (r.gold) parts.push(r.gold + ' gold');
    if (r.elixir) parts.push(r.elixir + ' elixir');
    if (r.gems) parts.push(r.gems + ' gem' + (r.gems > 1 ? 's' : ''));
    return parts.join(', ') || 'nothing';
  }

  function hasBuilders(p) {
    return p.buildersLeft > 0 || p.masterLeft > 0;
  }
  function advanceTurn(s) {
    s.pending = null;
    s.raid = null;
    const n = s.players.length;
    for (let i = 1; i <= n; i++) {
      const idx = (s.current + i) % n;
      if (hasBuilders(s.players[idx]) && anyLegalSpace(s, idx)) {
        s.current = idx;
        return;
      }
    }
    endRound(s);
  }
  function anyLegalSpace(s, pid) {
    return DATA.SPACES.some((sp) => spaceAvailable(s, pid, sp.id, false) || spaceAvailable(s, pid, sp.id, true));
  }

  function endRound(s) {
    // Score village phase
    s.phase = 'score';
    for (const p of s.players) {
      const gained = scoreVillage(p);
      p.stars += gained.total;
      log(s, `${p.name} scores ${gained.total}★ (${gained.parts.join(', ') || 'village burned'}).`);
    }
    // End check (rulebook: end of round in which someone reached 40)
    const max = Math.max(...s.players.map((p) => p.stars));
    if (max >= DATA.WIN_STARS) {
      s.gameOver = true;
      s.phase = 'over';
      s.winners = s.players.filter((p) => p.stars === max).map((p) => p.id);
      log(s, `Game over! Winner: ${s.winners.map((i) => s.players[i].name).join(' & ')} with ${max}★.`);
      s.pending = null;
      return;
    }
    // Remove phase
    for (const p of s.players) {
      p.village.burned = {};
      p.village.standing = [];
      p.village.fallen = [];
    }
    // Discount & refill
    s.buildArea.forEach((sl, i) => {
      if (slotActive(s, i) && sl.tile) sl.discount++;
    });
    refill(s);
    if (s.nextFirst != null) s.firstPlayer = s.nextFirst;
    startRound(s);
  }

  function scoreVillage(p) {
    const v = p.village;
    const parts = [];
    let total = 0;
    for (const k in v.tiles) {
      if (v.burned['c:' + k]) continue;
      const t = v.tiles[k];
      let n = 0;
      if (t.id === 'townhall') n = p.thLevel;
      else n = scoreBuilding(p, t.id);
      if (n > 0) {
        total += n;
        parts.push(`${DATA.BUILDINGS[t.id].name} ${n}`);
      }
    }
    return { total, parts };
  }
  function scoreBuilding(p, id) {
    const sc = DATA.BUILDINGS[id].score;
    if (!sc) return 0;
    const tiles = Object.values(p.village.tiles);
    switch (sc.kind) {
      case 'flat': return sc.n;
      case 'perNamed': return tiles.filter((t) => t.id === sc.name).length;
      case 'distinctBuildings': return new Set(tiles.map((t) => t.id)).size;
      case 'perUnits': return Math.floor(p.units.length / sc.n);
      case 'distinctUnits': return new Set(p.units.map((u) => u.type)).size;
      case 'perBatteries': return Math.floor(Object.keys(p.village.batteries).length / sc.n);
      case 'perWalls': return Math.floor(Object.keys(p.village.walls).length / sc.n);
    }
    return 0;
  }

  // ---------- Action spaces ----------
  function spaceDef(id) {
    return DATA.SPACES.find((x) => x.id === id);
  }
  function spaceAvailable(s, pid, id, master) {
    const sp = spaceDef(id);
    const p = s.players[pid];
    if (sp.min > s.players.length) return false;
    if (master ? p.masterLeft <= 0 : p.buildersLeft <= 0) return false;
    const occ = s.spaces[id];
    if (occ.length && !master) return false;
    if (master && id === 'first' && occ.length) return false;
    return actionPossible(s, pid, sp);
  }
  function actionPossible(s, pid, sp) {
    const p = s.players[pid];
    switch (sp.action) {
      case 'collector':
        return canPay(p, 'gold', 1) && (s.collectors.goldCollector > 0 || s.collectors.elixirCollector > 0);
      case 'build':
        return buildableSlots(s, pid, sp.column).length > 0;
      case 'upgrade':
        return p.thLevel < 5 && canPay(p, 'elixir', DATA.TOWNHALL[p.thLevel + 1].cost);
      case 'first':
        return true;
      case 'defense':
        return Object.keys(DATA.DEFENSES).some((d) => s.defenseSupply[d] > 0 && canPay(p, 'gold', DATA.DEFENSES[d].cost)) || s.wallSupply > 0;
      case 'epic':
      case 'raid':
        return unusedUnits(p).length > 0;
    }
    return false;
  }
  function buildableSlots(s, pid, column) {
    const p = s.players[pid];
    const out = [];
    s.buildArea.forEach((sl, i) => {
      if (DATA.BUILD_SLOTS[i].column !== column || !slotActive(s, i) || !sl.tile) return;
      const c = slotCost(s, i);
      if (canPay(p, c.res, c.n)) out.push(i);
    });
    return out;
  }

  // ---------- Placement legality ----------
  function legalBuildingCells(p) {
    const v = p.village;
    const out = new Set();
    for (const k in v.tiles) for (const n of neighbors(k)) if (!v.tiles[n]) out.add(n);
    return [...out];
  }
  function legalBatteryVertices(p) {
    const v = p.village;
    const out = new Set();
    for (const k in v.tiles) for (const c of tileCorners(k)) if (!v.batteries[c]) out.add(c);
    return [...out];
  }
  function legalWallEdges(p) {
    const v = p.village;
    const out = new Set();
    for (const k in v.tiles) for (const sd of tileSides(k)) if (!v.walls[sd.edge]) out.add(sd.edge);
    return [...out];
  }

  // ---------- Raid targeting ----------
  function isOpen(s, v, key) {
    if (!v.tiles[key]) return true;
    if (v.burned['c:' + key]) return true;
    return v.standing.some((st) => st.key === key && st.owner === s.raid.attacker && st.count > 0);
  }
  function wallIntact(v, e) {
    return v.walls[e] && !v.burned['w:' + e];
  }
  // Returns legal targets for a unit type in the current raid.
  function raidTargets(s, unitType) {
    const v = s.players[s.raid.defender].village;
    const u = DATA.UNITS[unitType];
    const tiles = [];
    for (const k in v.tiles) {
      if (v.burned['c:' + k]) continue;
      let normal = null;
      let wb = null;
      for (const sd of tileSides(k)) {
        if (!isOpen(s, v, sd.n)) continue;
        const w = wallIntact(v, sd.edge);
        if (!w || u.flying) {
          if (!normal) normal = sd;
        } else if (unitType === 'wallbreaker' && !wb) wb = sd;
      }
      if (normal || wb) tiles.push({ key: k, side: normal, wbSide: wb });
    }
    const walls = [];
    for (const e in v.walls) {
      if (!wallIntact(v, e)) continue;
      if (edgeCells(e).some((c) => isOpen(s, v, c))) walls.push(e);
    }
    const batteries = [];
    if (unitType === 'archer') {
      for (const vt in v.batteries) {
        if (v.burned['b:' + vt]) continue;
        if (vertexCells(vt).some((c) => isOpen(s, v, c))) batteries.push(vt);
      }
    }
    return { tiles, walls, batteries };
  }

  // ---------- Dice ----------
  function rollPool(s, color, n, wizard) {
    const faces = [];
    let dmg = 0;
    let toRoll = n;
    let guard = 0;
    while (toRoll > 0 && guard++ < 100) {
      toRoll--;
      const f = DATA.DICE[color][Math.floor(rand(s) * 6)];
      const d = wizard && f.plus ? 2 : f.dmg;
      faces.push({ dmg: d, plus: f.plus });
      dmg += d;
      if (f.plus) toRoll++;
    }
    return { faces, dmg };
  }

  // ---------- Combat ----------
  function burn(s, attacker, defender, kind, key) {
    const v = defender.village;
    const bk = kind + ':' + key;
    if (v.burned[bk]) return null;
    v.burned[bk] = true;
    attacker.stars += 1;
    let label;
    if (kind === 'c') {
      const t = v.tiles[key];
      const def = tileDef(t);
      label = def.name;
      if (def.collect) {
        for (const r in def.collect) attacker[r] += def.collect[r];
        label += ` (+${fmtRes(def.collect)})`;
      }
    } else if (kind === 'w') label = 'Wall';
    else label = DATA.DEFENSES[v.batteries[key]].name;
    return label;
  }

  function deploy(s, a) {
    const raid = s.raid;
    const attacker = s.players[raid.attacker];
    const defender = s.players[raid.defender];
    const v = defender.village;
    const fu = raid.followup;
    const unitType = fu ? fu.unit : a.unit;
    const u = DATA.UNITS[unitType];
    let count = fu ? fu.count : a.count;
    if (!u) throw new Error('Unknown unit');
    if (!fu) {
      const avail = unusedUnits(attacker, unitType);
      if (count < 1 || count > avail.length) throw new Error('Not enough units');
    }
    const targets = raidTargets(s, unitType);
    const tg = a.target;
    let side = null;
    let preBurn = null;
    if (tg.type === 'tile') {
      const t = targets.tiles.find((x) => x.key === tg.key);
      if (!t) throw new Error('Target not exposed');
      if (unitType === 'wallbreaker' && t.wbSide && (a.useWallbreak || !t.side)) {
        side = t.wbSide;
        preBurn = side.edge;
      } else if (t.side) side = t.side;
      else throw new Error('Target not exposed');
      if (unitType === 'dragon') {
        // pick the open side giving the longest line
        const opts = tileSides(tg.key).filter((sd) => isOpen(s, v, sd.n));
        let best = side;
        let bestLen = -1;
        for (const sd of opts) {
          let len = 0;
          let [x, y] = P(tg.key);
          while (v.tiles[K(x, y)]) { len++; x += sd.dir[0]; y += sd.dir[1]; }
          if (len > bestLen) { bestLen = len; best = sd; }
        }
        side = best;
      }
    } else if (tg.type === 'wall') {
      if (!targets.walls.includes(tg.key)) throw new Error('Wall not exposed');
    } else if (tg.type === 'battery') {
      if (!targets.batteries.includes(tg.key)) throw new Error('Battery not exposed');
    } else throw new Error('Bad target');

    if (!fu) {
      let n = count;
      for (const unit of attacker.units) if (n > 0 && !unit.used && unit.type === unitType) { unit.used = true; n--; }
    } else if (fu.standingIdx != null && v.standing[fu.standingIdx]) {
      v.standing[fu.standingIdx].count = 0; // units move on
    }

    const combat = {
      attacker: attacker.id, defender: defender.id, unit: unitType, count,
      target: tg, defense: [], killed: 0, attack: null, burned: [], mode: a.mode || 'building', followup: !!fu,
    };
    const tLabel = targetLabel(defender, tg);

    if (preBurn) {
      const lbl = burn(s, attacker, defender, 'w', preBurn);
      if (lbl) combat.burned.push(lbl + ' (Wall Breaker)');
    }

    // Defense batteries roll
    let vertices = [];
    if (tg.type === 'tile') vertices = tileCorners(tg.key);
    else if (tg.type === 'wall') vertices = edgeEnds(tg.key);
    else vertices = [tg.key];
    let total = 0;
    for (const vt of vertices) {
      const b = v.batteries[vt];
      if (!b || v.burned['b:' + vt]) continue;
      const bd = DATA.DEFENSES[b];
      if (u.flying && !bd.air) continue;
      const r = rollPool(s, 'black', 1, bd.wizard);
      combat.defense.push({ battery: b, key: vt, faces: r.faces, dmg: r.dmg });
      total += r.dmg;
    }
    combat.defenseTotal = total;
    const killed = Math.min(count, Math.floor(total / u.defense));
    combat.killed = killed;
    const survivors = count - killed;
    combat.survivors = survivors;
    if (killed) v.fallen.push({ owner: attacker.id, unit: unitType, key: tg.type === 'tile' ? tg.key : null, count: killed });

    if (survivors > 0) {
      let dice = survivors * u.attack;
      if (unitType === 'barbarian' && owns(attacker, 'king')) dice += survivors;
      if (unitType === 'wizard') dice += survivors * countWizardTowers(attacker);
      const r = rollPool(s, 'red', dice, false);
      combat.attack = { dice, faces: r.faces, dmg: r.dmg };
      const dmg = r.dmg;
      if (tg.type === 'tile' && combat.mode === 'defenses' && unitType === 'giant') {
        // Giant: hits assigned to neighboring defenses, batteries first.
        const defs = [];
        for (const vt of tileCorners(tg.key)) if (v.batteries[vt] && !v.burned['b:' + vt]) defs.push(['b', vt]);
        for (const sd of tileSides(tg.key)) if (wallIntact(v, sd.edge)) defs.push(['w', sd.edge]);
        let hits = Math.floor(dmg / DATA.DEFENSE_SHIELD);
        for (const [kind, key] of defs) {
          if (hits <= 0) break;
          const lbl = burn(s, attacker, defender, kind, key);
          if (lbl) combat.burned.push(lbl);
          hits--;
        }
      } else if (tg.type === 'tile') {
        if (dmg >= tileDefense(defender, tg.key)) {
          const lbl = burn(s, attacker, defender, 'c', tg.key);
          if (lbl) combat.burned.push(lbl);
        }
        if (unitType === 'dragon' && side) {
          let [x, y] = P(tg.key);
          x += side.dir[0]; y += side.dir[1];
          while (v.tiles[K(x, y)]) {
            const k = K(x, y);
            if (!v.burned['c:' + k] && dmg >= tileDefense(defender, k)) {
              const lbl = burn(s, attacker, defender, 'c', k);
              if (lbl) combat.burned.push(lbl);
            }
            x += side.dir[0]; y += side.dir[1];
          }
        }
      } else if (dmg >= DATA.DEFENSE_SHIELD) {
        const lbl = burn(s, attacker, defender, tg.type === 'wall' ? 'w' : 'b', tg.key);
        if (lbl) combat.burned.push(lbl);
      }
      // Undefeated units stand on the tile (or in front of the wall).
      let standKey = null;
      if (tg.type === 'tile') standKey = tg.key;
      else if (tg.type === 'wall') standKey = edgeCells(tg.key).find((c) => v.tiles[c] && isOpen(s, v, c)) || null;
      let standingIdx = null;
      if (standKey) {
        v.standing.push({ owner: attacker.id, unit: unitType, key: standKey, count: survivors });
        standingIdx = v.standing.length - 1;
      }
      // Extra attacks: P.E.K.K.A, or Archers with the Archer Queen.
      if (!fu && (unitType === 'pekka' || (unitType === 'archer' && owns(attacker, 'queen')))) {
        raid.followup = { unit: unitType, count: survivors, standingIdx };
      } else raid.followup = null;
    } else raid.followup = null;

    const summary = `${attacker.name}: ${count}× ${u.name} → ${tLabel}. Defense dealt ${total}, ${killed} defeated` +
      (combat.attack ? `; attack rolled ${combat.attack.dice} dice for ${combat.attack.dmg} dmg` : '') +
      (combat.burned.length ? `; burned ${combat.burned.join(', ')} (+${combat.burned.length}★)` : '') + '.';
    log(s, summary);
    combat.summary = summary;
    s.lastCombat = combat;
    maybeAutoEndRaid(s);
  }
  function targetLabel(p, tg) {
    if (tg.type === 'tile') return DATA.BUILDINGS[p.village.tiles[tg.key].id].name;
    if (tg.type === 'wall') return 'Wall';
    return DATA.DEFENSES[p.village.batteries[tg.key]].name;
  }
  function raidHasMoves(s) {
    const a = s.players[s.raid.attacker];
    if (s.raid.followup) return true;
    for (const un of unusedUnits(a)) {
      const t = raidTargets(s, un.type);
      if (t.tiles.length || t.walls.length || t.batteries.length) return true;
    }
    return false;
  }
  function maybeAutoEndRaid(s) {
    if (!raidHasMoves(s)) {
      log(s, `${s.players[s.raid.attacker].name}'s raid ends.`);
      advanceTurn(s);
    }
  }

  // ---------- Main dispatcher ----------
  function act(s, a) {
    if (s.gameOver) throw new Error('Game over');
    const p = cur(s);
    const pend = s.pending;
    if (!pend) {
      if (a.type !== 'space') throw new Error('Place a builder first');
      return takeSpace(s, a);
    }
    switch (pend.kind) {
      case 'placeBuilding': {
        if (a.type !== 'placeBuilding') throw new Error('Place your building');
        if (!legalBuildingCells(p).includes(a.key)) throw new Error('Must be adjacent to your village');
        p.village.tiles[a.key] = { id: pend.tile };
        log(s, `${p.name} builds ${DATA.BUILDINGS[pend.tile].name}.`);
        return advanceTurn(s);
      }
      case 'placeDefense': {
        if (a.type === 'placeBattery' && pend.battery) {
          if (!legalBatteryVertices(p).includes(a.key)) throw new Error('Must touch one of your tiles, empty corner');
          p.village.batteries[a.key] = pend.battery;
          s.defenseSupply[pend.battery]--;
          log(s, `${p.name} builds a ${DATA.DEFENSES[pend.battery].name}.`);
          pend.battery = null;
        } else if (a.type === 'placeWall' && pend.walls > 0) {
          if (!legalWallEdges(p).includes(a.key)) throw new Error('Walls go on an edge of your tiles');
          p.village.walls[a.key] = true;
          s.wallSupply--;
          pend.walls--;
          if (s.wallSupply <= 0) pend.walls = 0;
        } else if (a.type === 'skipPlacement') {
          pend.battery = null;
          pend.walls = 0;
        } else throw new Error('Place your defenses');
        if (!pend.battery && pend.walls <= 0) return advanceTurn(s);
        return;
      }
      case 'raid': {
        if (a.type === 'deploy') return deploy(s, a);
        if (a.type === 'skipFollowup' && s.raid.followup) {
          s.raid.followup = null;
          return maybeAutoEndRaid(s);
        }
        if (a.type === 'endRaid') {
          log(s, `${p.name} ends the raid.`);
          return advanceTurn(s);
        }
        throw new Error('Raid in progress');
      }
    }
    throw new Error('Unknown state');
  }

  function takeSpace(s, a) {
    const p = cur(s);
    const sp = spaceDef(a.space);
    if (!sp) throw new Error('Unknown space');
    const master = !!a.master;
    if (!spaceAvailable(s, p.id, sp.id, master)) throw new Error('Space not available');
    const commit = () => {
      s.spaces[sp.id].push({ pid: p.id, master });
      if (master) p.masterLeft--;
      else p.buildersLeft--;
    };
    switch (sp.action) {
      case 'collector': {
        const id = a.res === 'elixir' ? 'elixirCollector' : 'goldCollector';
        if (s.collectors[id] <= 0) throw new Error('None left');
        commit();
        pay(p, 'gold', 1);
        s.collectors[id]--;
        s.pending = { kind: 'placeBuilding', tile: id };
        return;
      }
      case 'build': {
        if (!buildableSlots(s, p.id, sp.column).includes(a.slot)) throw new Error('Cannot build that tile');
        const c = slotCost(s, a.slot);
        const tile = s.buildArea[a.slot].tile;
        commit();
        pay(p, c.res, c.n);
        s.buildArea[a.slot] = { tile: null, discount: 0 };
        if (tile.kind === 'unit') {
          p.units.push({ type: tile.id, used: false });
          log(s, `${p.name} trains a ${DATA.UNITS[tile.id].name}.`);
          return advanceTurn(s);
        }
        s.pending = { kind: 'placeBuilding', tile: tile.id };
        return;
      }
      case 'upgrade': {
        const next = p.thLevel + 1;
        const info = DATA.TOWNHALL[next];
        commit();
        pay(p, 'elixir', info.cost);
        p.thLevel = next;
        log(s, `${p.name} upgrades Town Hall to level ${next} (${info.text}).`);
        const rw = info.reward;
        if (rw.stars) p.stars += rw.stars;
        if (rw.master) {
          p.masterUnlocked = true;
          p.masterLeft = 1;
        }
        const battery = rw.cannon && s.defenseSupply.cannon > 0 ? 'cannon' : null;
        const walls = Math.min(rw.walls || 0, s.wallSupply);
        if (battery || walls) {
          s.pending = { kind: 'placeDefense', battery, walls, reward: true };
          return;
        }
        return advanceTurn(s);
      }
      case 'first': {
        commit();
        p.gems += 1;
        s.nextFirst = p.id;
        log(s, `${p.name} takes the First Player marker (+1 gem).`);
        return advanceTurn(s);
      }
      case 'defense': {
        let battery = a.battery || null;
        if (battery) {
          const d = DATA.DEFENSES[battery];
          if (!d || s.defenseSupply[battery] <= 0) throw new Error('None left');
          if (!canPay(p, 'gold', d.cost)) throw new Error('Cannot afford');
        }
        commit();
        if (battery) pay(p, 'gold', DATA.DEFENSES[battery].cost);
        s.pending = { kind: 'placeDefense', battery, walls: Math.min(2, s.wallSupply) };
        if (!battery && !s.pending.walls) return advanceTurn(s);
        return;
      }
      case 'epic':
      case 'raid': {
        const target = s.players[a.target];
        if (!target || target.id === p.id) throw new Error('Pick an opponent');
        commit();
        if (sp.action === 'epic') {
          const r = a.bonus === 'elixir' ? 'elixir' : 'gold';
          p[r] += 1;
        }
        log(s, `${p.name} ${sp.action === 'epic' ? 'launches an Epic Raid (+1 ' + (a.bonus === 'elixir' ? 'elixir' : 'gold') + ')' : 'raids'} ${target.name}!`);
        s.raid = { attacker: p.id, defender: target.id, followup: null };
        s.pending = { kind: 'raid' };
        s.lastCombat = null;
        maybeAutoEndRaid(s);
        return;
      }
    }
  }

  const Engine = {
    newGame, act, rand, K, P,
    tileSides, tileCorners, edgeCells, edgeEnds, vertexCells, neighbors,
    spaceAvailable, spaceDef, buildableSlots, slotCost, slotActive, canPay,
    legalBuildingCells, legalBatteryVertices, legalWallEdges,
    raidTargets, unusedUnits, tileDefense, scoreVillage, scoreBuilding, wallIntact, owns,
  };
  root.Engine = Engine;
  if (typeof module !== 'undefined') module.exports = Engine;
})(typeof window !== 'undefined' ? window : globalThis);
