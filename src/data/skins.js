// Skin data (data only). Hero skins recolor Pip and tint the Raiders' accents; weapon skins override the
// bullet color/trail per tier (the tier keeps its shape). In-game application arrives in a later stage.
//
// hero.pip:    { helmet, visor, suit, scarf, jet, glow }   (Pip's main parts)
// hero.raider: { body, helmet, visor, pack }              (squad member accents)
// weapon.tiers: 6 entries { color, core, trail } indexed by tier-1; prism cycles hue over time.

export const HERO_SKINS = [
  { id: 'classic', name: 'Classic', cost: 0, rarity: 'common',
    pip: { helmet: '#ffffff', visor: '#2fd6c8', suit: '#2f8cff', scarf: '#ff8a2a', jet: '#cfd8e6', glow: '#7fe8ff' },
    raider: { body: '#2f8cff', helmet: '#ffffff', visor: '#2fd6c8', pack: '#cfd8e6' } },
  { id: 'ninja', name: 'Neon Ninja', cost: 300, rarity: 'rare',
    pip: { helmet: '#2a2d3e', visor: '#3dff9c', suit: '#1d1f2c', scarf: '#ff2fa8', jet: '#3a3f58', glow: '#3dff9c' },
    raider: { body: '#262a3d', helmet: '#33384f', visor: '#3dff9c', pack: '#ff2fa8' } },
  { id: 'gold', name: 'Royal Gold', cost: 650, rarity: 'rare',
    pip: { helmet: '#fff3c4', visor: '#7a3dff', suit: '#e6a91a', scarf: '#c8102e', jet: '#ffd34d', glow: '#ffe98a' },
    raider: { body: '#e6a91a', helmet: '#fff3c4', visor: '#7a3dff', pack: '#ffd34d' } },
  { id: 'arctic', name: 'Arctic Scout', cost: 1100, rarity: 'epic',
    pip: { helmet: '#f4fbff', visor: '#4dc3ff', suit: '#bfe6ff', scarf: '#ffffff', jet: '#9fc8e8', glow: '#b8f2ff' },
    raider: { body: '#a9dcff', helmet: '#f4fbff', visor: '#4dc3ff', pack: '#e8f6ff' } },
  { id: 'lava', name: 'Lava Core', cost: 1800, rarity: 'epic',
    pip: { helmet: '#3a2a2a', visor: '#ffb21f', suit: '#d8321e', scarf: '#ffd34d', jet: '#4a3434', glow: '#ff7a1f' },
    raider: { body: '#d8321e', helmet: '#3a2a2a', visor: '#ffb21f', pack: '#ff7a1f' } },
  { id: 'galaxy', name: 'Galaxy', cost: 3000, rarity: 'legendary', unlock: { threeStars: 10 },
    pip: { helmet: '#2b1a5e', visor: '#ff7af0', suit: '#3b2a8f', scarf: '#7af0ff', jet: '#20154a', glow: '#c48aff' },
    raider: { body: '#3b2a8f', helmet: '#2b1a5e', visor: '#ff7af0', pack: '#7af0ff' } },
];

const t = (color, core, trail) => ({ color, core, trail: trail || color });

export const WEAPON_SKINS = [
  { id: 'factory', name: 'Factory', cost: 0, rarity: 'common', tiers: null }, // null = data/weapons.js colors
  { id: 'candy', name: 'Candy', cost: 400, rarity: 'rare', tiers: [
    t('#ff8ad8', '#fff0fa'), t('#8ad8ff', '#effaff'), t('#b48aff', '#f6f0ff'),
    t('#ff6fb5', '#ffe6f3', '#ffb3dc'), t('#8affc8', '#effff7', '#c6ffe4'), t('#fff08a', '#ffffff', '#ff8ad8')] },
  { id: 'inferno', name: 'Inferno', cost: 900, rarity: 'epic', tiers: [
    t('#ffb21f', '#fff2c4'), t('#ff6a1f', '#ffd9b8', '#ffa35a'), t('#ff3b1f', '#ffd0c4'),
    t('#ff2a4e', '#ffd6dd', '#ff8a3d'), t('#ff8a1f', '#fff0c4', '#ffd34d'), t('#ffe14d', '#ffffff', '#ff4b1f')] },
  { id: 'frost', name: 'Frost', cost: 1400, rarity: 'epic', tiers: [
    t('#bff4ff', '#ffffff'), t('#7fdcff', '#e8faff', '#b8eeff'), t('#4dc3ff', '#e0f6ff'),
    t('#6f9bff', '#e6eeff', '#a8c4ff'), t('#9ffcff', '#ffffff', '#d4fdff'), t('#e8fbff', '#ffffff', '#7fdcff')] },
  { id: 'prism', name: 'Prism', cost: 2500, rarity: 'legendary', prism: true, tiers: [
    t('#ff5a7a', '#ffffff'), t('#ffb34d', '#ffffff'), t('#7dff6a', '#ffffff'),
    t('#4dc3ff', '#ffffff'), t('#a26bff', '#ffffff'), t('#ff6bd9', '#ffffff', '#4dc3ff')] },
];

// Online-only skins (online stage 4): earned in online matches, never bought (cost Infinity: buySkin always refuses),
// never in a new save or the daily reward pool. They are NOT in HERO_SKINS / WEAPON_SKINS (so PAID_SKIN_IDS,
// FREE_SKIN_IDS and the online rival's outfit pick stay as they were); only the two id lookups below know them.
// `kind` says which lookup; `earn` is the server profile field that earns it (src/online/leagues.js SKIN_RULES).
export const ONLINE_SKINS = [
  { id: 'on-silver', kind: 'hero', name: 'Silver Storm', cost: Infinity, rarity: 'epic', online: true,
    earn: { field: 'pk', min: 300, hint: 'Reach SILVER league online' },
    pip: { helmet: '#eef3fa', visor: '#4dc3ff', suit: '#9aa9c4', scarf: '#2f8cff', jet: '#c9d3e3', glow: '#9fe6ff' },
    raider: { body: '#9aa9c4', helmet: '#eef3fa', visor: '#4dc3ff', pack: '#2f8cff' } },
  { id: 'on-wins10', kind: 'weapon', name: 'Victory Gold', cost: Infinity, rarity: 'epic', online: true,
    earn: { field: 'w', min: 10, hint: 'Win 10 online matches' }, tiers: [
      t('#ffe98a', '#fffbe6'), t('#ffd34d', '#fff6cc', '#ffe98a'), t('#ffc21f', '#fff0b8'),
      t('#f0a800', '#ffefb0', '#ffd34d'), t('#ffdd55', '#ffffff', '#fff3a8'), t('#fff3a8', '#ffffff', '#ffc21f')] },
  { id: 'on-streak5', kind: 'weapon', name: 'Hot Streak', cost: Infinity, rarity: 'epic', online: true,
    earn: { field: 'bs', min: 5, hint: 'Win 5 online matches in a row' }, tiers: [
      t('#ff7ab8', '#ffe6f2'), t('#ff4f8f', '#ffd9e8', '#ff9ac4'), t('#ff3b6b', '#ffd6df'),
      t('#ff5a2a', '#ffe0d4', '#ff4f8f'), t('#ff2a8a', '#ffe6f2', '#ffb21f'), t('#ffb21f', '#ffffff', '#ff2a8a')] },
  { id: 'on-champion', kind: 'hero', name: 'Storm Champion', cost: Infinity, rarity: 'legendary', online: true,
    earn: { field: 'pk', min: 1800, hint: 'Reach STORM CHAMPION online' },
    pip: { helmet: '#f4ecff', visor: '#ffd34d', suit: '#6a4cff', scarf: '#ffd34d', jet: '#3b2a8f', glow: '#b49dff' },
    raider: { body: '#6a4cff', helmet: '#f4ecff', visor: '#ffd34d', pack: '#b49dff' } },
];

export const HERO_BY_ID = Object.fromEntries([...HERO_SKINS, ...ONLINE_SKINS.filter((s) => s.kind === 'hero')].map((s) => [s.id, s]));
export const WEAPON_SKIN_BY_ID = Object.fromEntries([...WEAPON_SKINS, ...ONLINE_SKINS.filter((s) => s.kind === 'weapon')].map((s) => [s.id, s]));

/** Ids of the skins that cost something (the free defaults are always owned). */
export const PAID_SKIN_IDS = [...HERO_SKINS, ...WEAPON_SKINS].filter((s) => s.cost > 0).map((s) => s.id);
export const FREE_SKIN_IDS = [...HERO_SKINS, ...WEAPON_SKINS].filter((s) => s.cost === 0).map((s) => s.id);
