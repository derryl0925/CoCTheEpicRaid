// Headless all-AI games: checks the engine never errors or stalls, and prints balance stats.
// Usage: node test/simulate.js [games]
require('../js/data.js');
const E = require('../js/engine.js');
const AI = require('../js/ai.js');

const games = Number(process.argv[2] || 200);
const stats = { rounds: [], winnerStars: [], raids: 0, burns: 0, thLevels: [], byCount: {} };

for (let g = 0; g < games; g++) {
  const n = 2 + (g % 3);
  const s = E.newGame({ seed: 1000 + g, players: Array.from({ length: n }, (_, i) => ({ name: 'AI' + i, isAI: true })) });
  let steps = 0;
  while (!s.gameOver) {
    if (++steps > 20000) throw new Error(`Game ${g} stalled in round ${s.round}`);
    const a = AI.chooseAction(s);
    if (!a) throw new Error(`Game ${g}: AI returned no action, pending=${JSON.stringify(s.pending)}`);
    try {
      E.act(s, a);
    } catch (err) {
      throw new Error(`Game ${g} round ${s.round}: ${err.message} for ${JSON.stringify(a)} pending=${JSON.stringify(s.pending)}`);
    }
    if (a.type === 'deploy') stats.raids++;
  }
  if (s.round > 40) throw new Error(`Game ${g} too long: ${s.round} rounds`);
  JSON.parse(JSON.stringify(s)); // must stay serializable
  stats.rounds.push(s.round);
  stats.winnerStars.push(Math.max(...s.players.map((p) => p.stars)));
  stats.burns += s.log.filter((l) => l.includes('burned')).length;
  s.players.forEach((p) => stats.thLevels.push(p.thLevel));
  (stats.byCount[n] = stats.byCount[n] || []).push(s.round);
}
const avg = (a) => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1);
console.log(`${games} games OK`);
console.log(`avg rounds ${avg(stats.rounds)} (min ${Math.min(...stats.rounds)}, max ${Math.max(...stats.rounds)})`);
for (const n in stats.byCount) console.log(`  ${n}p: avg rounds ${avg(stats.byCount[n])}`);
console.log(`avg winner stars ${avg(stats.winnerStars)}, avg final TH level ${avg(stats.thLevels)}`);
console.log(`deploys/game ${(stats.raids / games).toFixed(1)}, deploys that burned something (last 300 log lines) ~${(stats.burns / games).toFixed(1)}`);
