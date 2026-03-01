const fs = require('fs');
const raw = JSON.parse(fs.readFileSync('public/data/trainers_expert.json', 'utf8'));
const leaders = {};
for (const [k, v] of Object.entries(raw)) {
  if (!v || typeof v !== 'object' || !v.__ivars__) continue;
  const d = v.__ivars__;
  if (!d.trainer_type) continue;
  if (d.version > 0) continue; // skip rematches
  const tt = d.trainer_type.toUpperCase();
  if (
    tt.includes('LEADER') || tt.includes('ELITEFOUR') ||
    tt.includes('CHAMPION') || tt.includes('GIOVANNI') || tt.includes('RIVAL')
  ) {
    leaders[d.trainer_type] = {
      real_name: d.real_name,
      pokemon: (d.pokemon || []).map(p => ({
        species: p.species,
        level: p.level,
        nature: p.nature || null,
        ability: p.ability || null,
        item: p.item || null,
        ev: p.ev || null,
        iv: p.iv || null,
        moves: p.moves || [],
      }))
    };
  }
}
fs.writeFileSync('public/data/expert_leaders.json', JSON.stringify(leaders, null, 2));
console.log('Exported', Object.keys(leaders).length, 'expert leaders');
console.log('Trainers:', Object.keys(leaders).join(', '));
