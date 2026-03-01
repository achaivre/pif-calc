const fs = require('fs');
const raw = JSON.parse(fs.readFileSync('public/data/trainers_expert.json', 'utf8'));
const leaders = [];
for (const [k, v] of Object.entries(raw)) {
  if (!v || typeof v !== 'object' || !v.__ivars__) continue;
  const d = v.__ivars__;
  if (!d.trainer_type) continue;
  const tt = d.trainer_type.toUpperCase();
  if (tt.includes('LEADER') || tt.includes('ELITEFOUR') || tt.includes('CHAMPION') || tt.includes('GIOVANNI') || tt.includes('RIVAL')) {
    if (d.version > 0) continue; // skip rematches
    leaders.push({
      trainer_type: d.trainer_type,
      real_name: d.real_name,
      version: d.version,
      pokemon: (d.pokemon || []).map(p => ({
        species: p.species,
        level: p.level,
        nature: p.nature,
        ability: p.ability,
        item: p.item,
        ev: p.ev,
        iv: p.iv,
        moves: p.moves,
      }))
    });
  }
}
console.log(JSON.stringify(leaders, null, 2));
