// Heuristic computer opponent. chooseAction(state) returns the next action for the current player.
(function (root) {
  const DATA = root.DATA || require('./data.js');
  const E = root.Engine || require('./engine.js');

  const EXP_RED = 1.0; // approx expected damage per red die (incl. chained dice)
  const EXP_BLACK = 0.8;

  function roundsLeft(s) {
    const max = Math.max(...s.players.map((p) => p.stars));
    return Math.max(1, Math.min(8, (DATA.WIN_STARS - max) / 6));
  }

  function opponents(s, p) {
    return s.players.filter((o) => o.id !== p.id);
  }

  function buildingValue(s, p, id) {
    const R = roundsLeft(s);
    const b = DATA.BUILDINGS[id];
    let v = 0;
    if (b.collect) v += R * 0.7 * ((b.collect.gold || 0) + (b.collect.elixir || 0) + 1.3 * (b.collect.gems || 0));
    if (b.score) {
      p.village.tiles['999,999'] = { id };
      v += R * E.scoreBuilding(p, id);
      delete p.village.tiles['999,999'];
    }
    // collectors boost matching statues; new names boost workshops
    const tiles = Object.values(p.village.tiles);
    for (const t of tiles) {
      const sc = DATA.BUILDINGS[t.id].score;
      if (!sc) continue;
      if (sc.kind === 'perNamed' && sc.name === id) v += R;
      if (sc.kind === 'distinctBuildings' && !tiles.some((x) => x.id === id)) v += R;
    }
    return v;
  }

  function unitValue(s, p, id) {
    const R = roundsLeft(s);
    const u = DATA.UNITS[id];
    let v = R * 0.35 * u.attack * (0.6 + 0.2 * u.defense);
    if (u.flying) v *= 1.2;
    if (id === 'pekka') v *= 1.5;
    if (id === 'king') v += R * 0.3 * p.units.filter((x) => x.type === 'barbarian').length;
    if (id === 'queen') v += R * 0.4 * p.units.filter((x) => x.type === 'archer').length;
    if (id === 'wizard') v += R * 0.3 * Object.values(p.village.batteries).filter((b) => b === 'wizard').length;
    // army camps / labs reward more units
    for (const t of Object.values(p.village.tiles)) {
      const sc = DATA.BUILDINGS[t.id].score;
      if (sc && sc.kind === 'perUnits') v += R / sc.n;
      if (sc && sc.kind === 'distinctUnits' && !p.units.some((x) => x.type === id)) v += R;
    }
    return v;
  }

  function threat(s, p) {
    let t = 0;
    for (const o of opponents(s, p)) for (const u of o.units) t += DATA.UNITS[u.type].attack;
    return t / Math.max(1, s.players.length - 1);
  }

  function bestBattery(s, p) {
    const flyers = opponents(s, p).some((o) => o.units.some((u) => DATA.UNITS[u.type].flying));
    const order = [];
    if (E.canPay(p, 'gold', 2) && p.gold >= 4) order.push('wizard');
    if (flyers && E.canPay(p, 'gold', 1)) order.push('archer');
    order.push('cannon');
    if (E.canPay(p, 'gold', 1)) order.push('archer');
    return order.find((d) => s.defenseSupply[d] > 0 && E.canPay(p, 'gold', DATA.DEFENSES[d].cost)) || null;
  }

  function raidTargetPlayer(s, p) {
    let best = null;
    let bestV = -1e9;
    for (const o of opponents(s, p)) {
      const pot = E.scoreVillage(o).total;
      const nb = Object.keys(o.village.batteries).length;
      const v = pot + o.stars * 0.15 - nb * 0.4 - Object.keys(o.village.burned).length * 0.8;
      if (v > bestV) { bestV = v; best = o; }
    }
    return best;
  }

  function spaceOptions(s, p) {
    const R = roundsLeft(s);
    const out = [];
    const anyArmy = E.unusedUnits(p).length;
    for (const sp of DATA.SPACES) {
      for (const master of [false, true]) {
        if (!E.spaceAvailable(s, p.id, sp.id, master)) continue;
        const occupied = s.spaces[sp.id].length > 0;
        if (master && !occupied && p.buildersLeft > 0) continue; // save the master builder for blocked spaces
        const pen = master ? 0.3 : 0;
        const base = { type: 'space', space: sp.id, master };
        switch (sp.action) {
          case 'collector': {
            for (const res of ['gold', 'elixir']) {
              const id = res === 'gold' ? 'goldCollector' : 'elixirCollector';
              if (s.collectors[id] <= 0) continue;
              let v = buildingValue(s, p, id) - 0.6;
              if (res === 'elixir' && p.elixir < 2) v += 0.5;
              out.push({ a: { ...base, res }, v: v - pen });
            }
            break;
          }
          case 'build': {
            for (const slot of E.buildableSlots(s, p.id, sp.column)) {
              const t = s.buildArea[slot].tile;
              const c = E.slotCost(s, slot);
              const val = t.kind === 'unit' ? unitValue(s, p, t.id) : buildingValue(s, p, t.id);
              out.push({ a: { ...base, slot }, v: val - c.n * 0.55 - pen });
            }
            break;
          }
          case 'upgrade': {
            const next = DATA.TOWNHALL[p.thLevel + 1];
            let v = R + (next.reward.stars || 0) + (next.reward.cannon ? 1.5 : 0) + (next.reward.walls ? 1 : 0) + (next.reward.master ? R * 1.2 : 0);
            out.push({ a: base, v: v - next.cost * 0.5 - pen });
            break;
          }
          case 'first':
            out.push({ a: base, v: 1.2 + (s.nextFirst == null ? 0.3 : -5) - pen });
            break;
          case 'defense': {
            const battery = bestBattery(s, p);
            const nb = Object.keys(p.village.batteries).length;
            const v = 1.0 + threat(s, p) * 0.25 - nb * 0.35 - (battery ? DATA.DEFENSES[battery].cost * 0.4 : 1);
            out.push({ a: { ...base, battery }, v: v - pen });
            break;
          }
          case 'epic':
          case 'raid': {
            if (!anyArmy) break;
            const tgt = raidTargetPlayer(s, p);
            let atk = 0;
            for (const u of E.unusedUnits(p)) atk += DATA.UNITS[u.type].attack;
            const v = 0.55 * atk + (sp.action === 'epic' ? 1 : 0) + 0.5;
            out.push({ a: { ...base, target: tgt.id, bonus: p.gold <= p.elixir ? 'gold' : 'elixir' }, v: v - pen });
            break;
          }
        }
      }
    }
    return out;
  }

  // ---------- Placement ----------
  function placeBuilding(s, p) {
    const v = p.village;
    let best = null;
    let bestV = -1e9;
    for (const k of E.legalBuildingCells(p)) {
      const [x, y] = E.P(k);
      const nb = E.neighbors(k).filter((n) => v.tiles[n]).length;
      const val = nb * 2 - (Math.abs(x) + Math.abs(y)) * 0.5 + E.rand(s) * 0.1;
      if (val > bestV) { bestV = val; best = k; }
    }
    return { type: 'placeBuilding', key: best };
  }
  function tileWorth(p, key) {
    const t = p.village.tiles[key];
    if (!t) return 0;
    if (t.id === 'townhall') return 3 + p.thLevel;
    return 1 + E.scoreBuilding(p, t.id) + (DATA.BUILDINGS[t.id].collect ? 0.5 : 0);
  }
  function placeBattery(s, p) {
    const v = p.village;
    let best = null;
    let bestV = -1e9;
    for (const vt of E.legalBatteryVertices(p)) {
      let val = 0;
      for (const c of E.vertexCells(vt)) val += tileWorth(p, c);
      for (const c of E.vertexCells(vt)) for (const vv of E.tileCorners(c)) if (v.batteries[vv]) val -= 0.4;
      val += E.rand(s) * 0.1;
      if (val > bestV) { bestV = val; best = vt; }
    }
    return { type: 'placeBattery', key: best };
  }
  function placeWall(s, p) {
    const v = p.village;
    let best = null;
    let bestV = -1e9;
    for (const e of E.legalWallEdges(p)) {
      const cells = E.edgeCells(e);
      const outer = cells.some((c) => !v.tiles[c]);
      let val = 0;
      for (const c of cells) val += tileWorth(p, c);
      if (outer) val += 2;
      val += E.rand(s) * 0.1;
      if (val > bestV) { bestV = val; best = e; }
    }
    return best ? { type: 'placeWall', key: best } : { type: 'skipPlacement' };
  }

  // ---------- Raid ----------
  function pSuccess(expDmg, need) {
    if (need <= 0) return 1;
    const x = (expDmg - need + 0.5) / Math.max(1, Math.sqrt(expDmg + 0.5));
    return 1 / (1 + Math.exp(-2.2 * x));
  }
  function targetOptions(s, attacker, defender, unitType, avail) {
    const u = DATA.UNITS[unitType];
    const v = defender.village;
    const t = E.raidTargets(s, unitType);
    const opts = [];
    const defenseAt = (verts) => {
      let d = 0;
      for (const vt of verts) {
        const b = v.batteries[vt];
        if (!b || v.burned['b:' + vt]) continue;
        if (u.flying && !DATA.DEFENSES[b].air) continue;
        d += EXP_BLACK * (DATA.DEFENSES[b].wizard ? 1.3 : 1);
      }
      return d;
    };
    const evalGroup = (verts, need, worth, extra) => {
      const expDef = defenseAt(verts);
      let best = null;
      for (let n = 1; n <= avail; n++) {
        const surv = Math.max(0, n - expDef / u.defense);
        let dice = surv * u.attack;
        if (unitType === 'barbarian' && E.owns(attacker, 'king')) dice += surv;
        if (unitType === 'wizard') dice += surv * Object.values(attacker.village.batteries).filter((b) => b === 'wizard').length;
        const ps = surv > 0 ? pSuccess(dice * EXP_RED, need) : 0;
        const val = ps * worth - n * 0.12 + (extra || 0) * ps;
        if (!best || val > best.val) best = { n, val };
      }
      return best;
    };
    for (const tt of t.tiles) {
      const worth = 1 + tileWorth(defender, tt.key) * 0.6 + (DATA.BUILDINGS[v.tiles[tt.key].id].collect ? 0.6 : 0);
      const need = E.tileDefense(defender, tt.key);
      let extra = 0;
      if (unitType === 'dragon') extra = 1;
      const g = evalGroup(E.tileCorners(tt.key), need, worth, extra);
      opts.push({ target: { type: 'tile', key: tt.key }, count: g.n, val: g.val + (tt.side ? 0 : 0.8), useWallbreak: !tt.side });
      if (unitType === 'giant') {
        let nd = 0;
        for (const vt of E.tileCorners(tt.key)) if (v.batteries[vt] && !v.burned['b:' + vt]) nd++;
        for (const sd of E.tileSides(tt.key)) if (E.wallIntact(v, sd.edge)) nd++;
        if (nd >= 2) {
          const g2 = evalGroup(E.tileCorners(tt.key), 1, Math.min(nd, avail * 3 * EXP_RED), 0);
          opts.push({ target: { type: 'tile', key: tt.key }, count: g2.n, val: g2.val, mode: 'defenses' });
        }
      }
    }
    for (const e of t.walls) {
      // walls are only worth it if they open something up
      const behind = E.edgeCells(e).filter((c) => v.tiles[c] && !v.burned['c:' + c]);
      const worth = 1 + behind.reduce((a, c) => a + tileWorth(defender, c) * 0.25, 0);
      const g = evalGroup(E.edgeEnds(e), 1, worth, 0);
      opts.push({ target: { type: 'wall', key: e }, count: g.n, val: g.val - 0.2 });
    }
    for (const b of t.batteries) {
      const g = evalGroup([b], 1, 1.6, 0);
      opts.push({ target: { type: 'battery', key: b }, count: g.n, val: g.val });
    }
    return opts;
  }
  function raidAction(s, p) {
    const defender = s.players[s.raid.defender];
    if (s.raid.followup) {
      const fu = s.raid.followup;
      const opts = targetOptions(s, p, defender, fu.unit, fu.count);
      const best = opts.sort((a, b) => b.val - a.val)[0];
      if (!best || best.val < 0.1) return { type: 'skipFollowup' };
      return { type: 'deploy', target: best.target, mode: best.mode, useWallbreak: best.useWallbreak };
    }
    let best = null;
    const types = [...new Set(E.unusedUnits(p).map((u) => u.type))];
    for (const ty of types) {
      const avail = E.unusedUnits(p, ty).length;
      for (const o of targetOptions(s, p, defender, ty, avail)) {
        // prefer spending cheap units first
        const v = o.val - DATA.UNITS[ty].cost * 0.03;
        if (!best || v > best.v) best = { v, a: { type: 'deploy', unit: ty, count: o.count, target: o.target, mode: o.mode, useWallbreak: o.useWallbreak } };
      }
    }
    if (!best || best.v < 0.05) return { type: 'endRaid' };
    return best.a;
  }

  function chooseAction(s) {
    const p = s.players[s.current];
    const pend = s.pending;
    if (!pend) {
      const opts = spaceOptions(s, p);
      opts.forEach((o) => (o.v += E.rand(s) * 0.25));
      opts.sort((a, b) => b.v - a.v);
      return opts[0] ? opts[0].a : null;
    }
    if (pend.kind === 'placeBuilding') return placeBuilding(s, p);
    if (pend.kind === 'placeDefense') return pend.battery ? placeBattery(s, p) : placeWall(s, p);
    if (pend.kind === 'raid') return raidAction(s, p);
    return null;
  }

  const AI = { chooseAction };
  root.AI = AI;
  if (typeof module !== 'undefined') module.exports = AI;
})(typeof window !== 'undefined' ? window : globalThis);
