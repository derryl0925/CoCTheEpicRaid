// Game data for Clash of Clans: The Epic Raid (fan implementation).
// Values marked [RULEBOOK] come from the v9 rulebook. Values marked [GUESS]
// are not given in the rulebook and are best-effort; edit freely.
(function (root) {
  const DATA = {};

  DATA.WIN_STARS = 40; // [RULEBOOK]

  // Dice faces: dmg = swords, plus = roll an additional die. [GUESS] distribution;
  // face types [RULEBOOK]: red has blank / sword / sword+plus / double sword,
  // black has blank / sword / sword+plus.
  DATA.DICE = {
    red: [
      { dmg: 0, plus: false }, { dmg: 0, plus: false },
      { dmg: 1, plus: false }, { dmg: 1, plus: false },
      { dmg: 1, plus: true }, { dmg: 2, plus: false },
    ],
    black: [
      { dmg: 0, plus: false }, { dmg: 0, plus: false },
      { dmg: 1, plus: false }, { dmg: 1, plus: false }, { dmg: 1, plus: false },
      { dmg: 1, plus: true },
    ],
  };

  // Units [RULEBOOK field guide]: cost (elixir), attack (red dice), defense (HP).
  DATA.UNITS = {
    barbarian:   { name: 'Barbarian',      icon: '🪓', cost: 1, attack: 2, defense: 1, text: 'Basic Barbarian.' },
    archer:      { name: 'Archer',         icon: '🏹', cost: 2, attack: 2, defense: 2, text: 'Can attack defenses.' },
    wallbreaker: { name: 'Wall Breaker',   icon: '💣', cost: 3, attack: 2, defense: 1, text: 'Fire a wall before attacking.' },
    balloon:     { name: 'Balloon',        icon: '🎈', cost: 3, attack: 3, defense: 1, flying: true, text: 'Flying (can move over Walls).' },
    wizard:      { name: 'Wizard',         icon: '🧙', cost: 4, attack: 3, defense: 2, text: '+1 attack die per Wizard Tower.' },
    giant:       { name: 'Giant',          icon: '💪', cost: 5, attack: 3, defense: 2, text: 'Can attack ALL neighboring defenses (walls and defense batteries).' },
    pekka:       { name: 'P.E.K.K.A',      icon: '🤖', cost: 6, attack: 3, defense: 3, text: 'Attacks twice, as long as it isn\'t killed by defense batteries.' },
    king:        { name: 'Barbarian King', icon: '👑', cost: 6, attack: 3, defense: 2, text: 'Each of your Barbarians get +1 attack die.' },
    queen:       { name: 'Archer Queen',   icon: '👸', cost: 6, attack: 3, defense: 2, text: 'Each of your Archers attack an extra time.' },
    dragon:      { name: 'Dragon',         icon: '🐉', cost: 8, attack: 3, defense: 2, flying: true, text: 'Flying. Each sword rolled hits all Buildings in a line.' },
  };

  // Building tiles. cost = gold, defense = HP.
  // collect: resources produced in the Collect phase.
  // score: { kind, n } evaluated in the Score phase (see engine scoreBuilding).
  DATA.BUILDINGS = {
    townhall:       { name: 'Town Hall',       icon: '🏰', cost: 0, defense: 2, text: 'Score: ★ per level.' },                        // [RULEBOOK]
    goldCollector:  { name: 'Gold Collector',  icon: '⛏️', cost: 1, defense: 2, collect: { gold: 1 }, text: 'Collect: 1 gold.' },    // [RULEBOOK]
    elixirCollector:{ name: 'Elixir Collector',icon: '⚗️', cost: 1, defense: 2, collect: { elixir: 1 }, text: 'Collect: 1 elixir.' }, // [RULEBOOK]
    goldStatue:     { name: 'Gold Statue',     icon: '🗿', cost: 2, defense: 2, score: { kind: 'perNamed', name: 'goldCollector' }, text: 'Score: ★ per Gold Collector.' },     // [RULEBOOK]
    elixirStatue:   { name: 'Elixir Statue',   icon: '🏺', cost: 2, defense: 2, score: { kind: 'perNamed', name: 'elixirCollector' }, text: 'Score: ★ per Elixir Collector.' }, // [RULEBOOK]
    workshop:       { name: 'Workshop',        icon: '🛠️', cost: 8, defense: 3, score: { kind: 'distinctBuildings' }, text: 'Score: ★ per differently named building.' },     // [RULEBOOK]
    // Everything below is [GUESS] (tile not shown in rulebook).
    goldMine:       { name: 'Gold Mine',       icon: '💰', cost: 3, defense: 2, collect: { gold: 2 }, text: 'Collect: 2 gold.' },
    elixirPump:     { name: 'Elixir Pump',     icon: '🧪', cost: 3, defense: 2, collect: { elixir: 2 }, text: 'Collect: 2 elixir.' },
    goldStorage:    { name: 'Gold Storage',    icon: '🏦', cost: 4, defense: 3, collect: { gold: 1 }, score: { kind: 'flat', n: 1 }, text: 'Collect: 1 gold. Score: ★.' },
    elixirStorage:  { name: 'Elixir Storage',  icon: '🛢️', cost: 4, defense: 3, collect: { elixir: 1 }, score: { kind: 'flat', n: 1 }, text: 'Collect: 1 elixir. Score: ★.' },
    gemMine:        { name: 'Gem Mine',        icon: '💎', cost: 4, defense: 2, collect: { gems: 1 }, text: 'Collect: 1 gem.' },
    armyCamp:       { name: 'Army Camp',       icon: '⛺', cost: 3, defense: 3, score: { kind: 'perUnits', n: 2 }, text: 'Score: ★ per 2 units you own.' },
    laboratory:     { name: 'Laboratory',      icon: '🔬', cost: 5, defense: 3, score: { kind: 'distinctUnits' }, text: 'Score: ★ per different unit type you own.' },
    builderHut:     { name: "Builder's Hut",   icon: '🛖', cost: 3, defense: 2, score: { kind: 'perBatteries', n: 2 }, text: 'Score: ★ per 2 defense batteries in your village.' },
    barbStatue:     { name: 'Barbarian Statue',icon: '🗽', cost: 2, defense: 2, score: { kind: 'perWalls', n: 3 }, text: 'Score: ★ per 3 walls in your village.' },
    clanCastle:     { name: 'Clan Castle',     icon: '🏯', cost: 6, defense: 4, score: { kind: 'flat', n: 3 }, text: 'Score: ★★★.' },
    flag:           { name: 'Flag',            icon: '🚩', cost: 2, defense: 1, score: { kind: 'flat', n: 1 }, text: 'Score: ★.' },
  };

  // Main deck composition: 22 building tiles + 15 unit tiles [counts RULEBOOK, mix GUESS].
  DATA.DECK = {
    buildings: {
      goldStatue: 1, elixirStatue: 1, workshop: 1, goldMine: 2, elixirPump: 2,
      goldStorage: 2, elixirStorage: 2, gemMine: 1, armyCamp: 2, laboratory: 1,
      builderHut: 2, barbStatue: 2, clanCastle: 1, flag: 2,
    },
    units: {
      barbarian: 1, archer: 1, wallbreaker: 2, balloon: 2, wizard: 2,
      giant: 2, pekka: 2, king: 1, queen: 1, dragon: 1,
    },
  };
  DATA.COLLECTOR_SUPPLY = 14; // per collector type [RULEBOOK]

  // Defense batteries [RULEBOOK]. Each rolls 1 black die; shield 1.
  DATA.DEFENSES = {
    cannon: { name: 'Cannon',       icon: '💥', cost: 0, supply: 10, air: false, text: 'Can target land units.' },
    archer: { name: 'Archer Tower', icon: '🗼', cost: 1, supply: 8,  air: true,  text: 'Can attack land and flying units.' },
    wizard: { name: 'Wizard Tower', icon: '🔮', cost: 2, supply: 8,  air: false, wizard: true, text: 'Each ⚔+ rolled counts as 2 damage.' },
  };
  DATA.WALL_SUPPLY = 45;
  DATA.DEFENSE_SHIELD = 1;

  // Town Hall levels [RULEBOOK player board]. cost = elixir to reach level.
  DATA.TOWNHALL = {
    1: { defense: 2 },
    2: { cost: 1, defense: 3, reward: { cannon: 1 }, text: 'Gain a Cannon' },
    3: { cost: 2, defense: 4, reward: { stars: 2, walls: 2 }, text: 'Gain 2★ and 2 walls' },
    4: { cost: 4, defense: 4, reward: { master: true }, text: 'Unlock Master Builder' },
    5: { cost: 5, defense: 5, reward: { stars: 4, walls: 2 }, text: 'Gain 4★ and 2 walls' },
  };

  // Center board action spaces. minPlayers from the 3/4 and 4 icons. [RULEBOOK layout]
  DATA.SPACES = [
    { id: 'col1', action: 'collector', min: 2 },
    { id: 'col2', action: 'collector', min: 3 },
    { id: 'col3', action: 'collector', min: 4 },
    { id: 'build0', action: 'build', column: 0, min: 2 },
    { id: 'build1', action: 'build', column: 1, min: 2 },
    { id: 'build2', action: 'build', column: 2, min: 2 },
    { id: 'up1', action: 'upgrade', min: 2 },
    { id: 'up2', action: 'upgrade', min: 3 },
    { id: 'up3', action: 'upgrade', min: 4 },
    { id: 'first', action: 'first', min: 2 },
    { id: 'def1', action: 'defense', min: 2 },
    { id: 'def2', action: 'defense', min: 3 },
    { id: 'def3', action: 'defense', min: 4 },
    { id: 'epic1', action: 'epic', min: 2 },
    { id: 'epic2', action: 'epic', min: 3 },
    { id: 'raid1', action: 'raid', min: 2 },
    { id: 'raid2', action: 'raid', min: 4 },
  ];

  // Build area: 3 columns x 2 rows; bottom row of columns 1 and 2 need 3+/4 players.
  DATA.BUILD_SLOTS = [
    { column: 0, row: 0, min: 2 }, { column: 1, row: 0, min: 2 }, { column: 2, row: 0, min: 2 },
    { column: 0, row: 1, min: 2 }, { column: 1, row: 1, min: 3 }, { column: 2, row: 1, min: 4 },
  ];

  DATA.COLORS = ['#e53935', '#1e88e5', '#43a047', '#e0a100'];
  DATA.COLOR_NAMES = ['Red', 'Blue', 'Green', 'Yellow'];

  root.DATA = DATA;
  if (typeof module !== 'undefined') module.exports = DATA;
})(typeof window !== 'undefined' ? window : globalThis);
