# The Epic Raid: fan-made digital edition

A browser version of *Clash of Clans: The Epic Raid* (Eric M. Lang & Ken Gruhl, Maestro Media), built from the publisher's v9 beta rulebook. You can play 2–4 players on one screen (hot-seat), and any seat can be a computer player.

> This material is unofficial and is not endorsed by Supercell. For more information see Supercell's Fan Content Policy: www.supercell.com/fan-content-policy. Not affiliated with Maestro Media. If you enjoy it, buy the real board game.

## Play

Clone or download this repo, then open `index.html` in a browser (double-click it). There's no server and no install. The game autosaves to the browser, and **Resume** on the start screen picks up where you left off.

## Files

| File | What it is |
|---|---|
| `js/data.js` | All game numbers: units, buildings, defenses, Town Hall levels, action spaces, dice, deck mix |
| `js/engine.js` | Rules engine (pure, JSON state, seeded dice) |
| `js/ai.js` | Heuristic computer opponent |
| `js/ui.js`, `css/styles.css`, `index.html` | Browser UI |
| `test/simulate.js` | Headless all-AI games for rule and balance checks: `node test/simulate.js 300` |

## Where the rules come from

**From the v9 rulebook:** round phases (Collect → Builder actions → Score → Remove → Discount & refill → end check); action spaces and their 3/4-player icons; the 6-slot build area; collector and Town Hall stats; Town Hall costs, defense values and rewards; the Master Builder; defense battery costs and abilities; walls arriving in pairs; deploy, exposure and combat rules; the field guide stats for all 10 units; the Gold Statue, Elixir Statue and Workshop tiles; and 40★ to end the game.

**Clarifications taken from BoardGameGeek rules threads:** no partial damage carries over; defenses deal total damage across a group of units; units return to your board after a raid; resources are collected before raids; one burn per building per round; anyone can raid a village that was already raided; the Giant puts its hits on all neighboring defenses; you can approach a tile from a side with no wall.

**Best guesses** (the rulebook doesn't print them; change them in `js/data.js`):
- Die faces. Red: 2 blank, 2 ⚔, 1 ⚔+, 1 ⚔⚔. Black: 2 blank, 3 ⚔, 1 ⚔+.
- The other 14 building tiles (Gold Mine, storages, Army Camp, Laboratory, Clan Castle, …) and the exact mix of tiles in the deck.
- Wizard Tower: its ⚔+ face does 2 damage.
- Archers can hit any exposed battery.
- Dragon line: the same damage hits every building in a straight line from where it entered.
- Archer Queen: your Archers get a second attack, like the P.E.K.K.A.
- Ties share the win.

## License

The source code is under the [MIT License](LICENSE). That covers only the code in this repo. *Clash of Clans* names and trademarks belong to Supercell Oy, and *The Epic Raid* board game belongs to its designers and Maestro Media. The repo contains no official artwork (the visuals are emoji) and no copy of the rulebook. This is a non-commercial fan project.
