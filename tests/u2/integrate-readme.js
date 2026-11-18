// SPEC2 §9 integrate-readme: the README marker sections equal scripts/readme-gen.mjs output byte for byte (the
// generator reads the data files, so a balance change shows up as a diff here): "Weapons & Heroes" (u2 markers)
// and, since update 3 stage 6, "Worlds and Bosses" (u3 markers); the old gun-ladder text and the old shop line
// are gone; the README names the new screens and controls; docs/armory.png and docs/heroes.png exist.
const fails = [];
const readme = await (await fetch('/README.md', { cache: 'no-store' })).text();
const gen = await import('/scripts/readme-gen.mjs');
// update 3 stage 6: the same byte-equal check for the second generated section ("Worlds and Bosses", u3 markers)
const sections = [
  ['u2', gen.generateSection(), gen.currentSection(readme)],
  ['u3', gen.generateWorlds(), gen.currentWorlds(readme)],
];
for (const [tag, want, have] of sections) {
  if (!have) { fails.push(`README has no <!-- ${tag}:begin --> / <!-- ${tag}:end --> section`); continue; }
  if (have === want) continue;
  let i = 0; while (i < want.length && want[i] === have[i]) i++;
  fails.push(`README ${tag} section differs from readme-gen output at char ${i}: README "${have.slice(i, i + 60)}" vs gen "${want.slice(i, i + 60)}" (run: node scripts/readme-gen.mjs --write)`);
}
if (gen.replaceAll(readme) !== readme) fails.push('node scripts/readme-gen.mjs --write would change README.md');
const want = sections[0][1];
for (const bad of ['**Guns:**', 'blaster pistol to a rifle', 'outfits for Pip and the guns']) if (readme.includes(bad)) fails.push(`old text still present: "${bad}"`);
for (const word of ['Armory', 'Heroes', 'loadout', 'TRY IT', 'Compare', 'crates', 'Space or E', 'Pip outfits and gun paint']) if (!readme.includes(word)) fails.push(`README does not mention "${word}"`);
const docs = {};
for (const f of ['docs/armory.png', 'docs/heroes.png']) {
  const r = await fetch('/' + f, { cache: 'no-store' });
  const b = r.ok ? await r.arrayBuffer() : null;
  const png = b && b.byteLength > 1000 && new Uint8Array(b, 0, 4).join() === '137,80,78,71';
  docs[f] = b ? b.byteLength : 0;
  if (!png) fails.push(`${f} missing or not a PNG`);
}
return { pass: fails.length === 0, fails, sectionChars: want.length, docs };
