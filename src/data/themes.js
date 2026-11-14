// Visual themes for the sky bridge. Colors are sRGB hex strings.
// sun.az / sun.el in degrees: az 0 = straight ahead (-Z), positive = to the right.

const base = {
  road: { a: '#ffffff', b: '#e2f6f3', side: '#dcecff', under: '#9db7dc', trim: '#f4c24f', divider: '#a8d6ff', dividerTop: '#e9f6ff' },
  island: { grass: '#7fdc6a', grassDark: '#4fb85a', rock: '#c9a77f', rockDark: '#8f7563', crystal: '#7ff0ff' },
  stars: 0,
  fog: { near: 70, far: 210 },
};

function theme(t) {
  return {
    ...base, ...t,
    road: { ...base.road, ...(t.road || {}) },
    island: { ...base.island, ...(t.island || {}) },
    fog: { ...base.fog, ...(t.fog || {}) },
  };
}

export const THEMES = {
  noon: theme({
    id: 'noon', name: 'Bright Noon',
    sky: { top: '#2a86ff', mid: '#5cb8ff', horizon: '#c4eaff', bottom: '#e4f4ff' },
    sun: { color: '#fff4c8', az: -7, el: 3.2, size: 1.6, glow: 1.0, moon: false },
    hemi: { sky: '#ffffff', ground: '#9cc2ee', intensity: 2.1 },
    dir: { color: '#fff6e3', intensity: 2.0 },
    cloud: { light: '#ffffff', shade: '#bcd6f4', emissive: 0.32 },
    sea: { light: '#ffffff', shade: '#a9cdf3', deep: '#8cb9ec' },
  }),
  dawn: theme({
    id: 'dawn', name: 'Pink Dawn',
    sky: { top: '#5b8be6', mid: '#f2b3cf', horizon: '#ffdcc0', bottom: '#ffe9dc' },
    sun: { color: '#fff1c9', az: 4, el: 2.6, size: 2.8, glow: 1.0, moon: false },
    hemi: { sky: '#fff1f4', ground: '#d7a8c8', intensity: 2.0 },
    dir: { color: '#ffe7cf', intensity: 2.0 },
    cloud: { light: '#fff4f1', shade: '#e6b7d2', emissive: 0.34 },
    sea: { light: '#fff2ef', shade: '#e8b9d3', deep: '#d39fc6' },
    road: { b: '#fdeef0' },
  }),
  sunset: theme({
    id: 'sunset', name: 'Golden Sunset',
    sky: { top: '#4659c6', mid: '#ff8f7e', horizon: '#ffc884', bottom: '#ffd9a8' },
    sun: { color: '#ffe48f', az: -5, el: 1.8, size: 3.8, glow: 1.25, moon: false },
    hemi: { sky: '#fff0dd', ground: '#e39b8f', intensity: 2.0 },
    dir: { color: '#ffd8a8', intensity: 2.1 },
    cloud: { light: '#ffeedd', shade: '#ec9ea4', emissive: 0.34 },
    sea: { light: '#ffe9d4', shade: '#f0a3a2', deep: '#d98a9a' },
    road: { b: '#fff1df' },
  }),
  dusk: theme({
    id: 'dusk', name: 'Violet Dusk',
    sky: { top: '#262c7a', mid: '#8a5cbd', horizon: '#ffa6b4', bottom: '#f7bfd0' },
    sun: { color: '#ffd1dc', az: 4, el: 1.8, size: 3.4, glow: 1.1, moon: false },
    hemi: { sky: '#f3e6ff', ground: '#9a7fc4', intensity: 1.9 },
    dir: { color: '#ffd9ea', intensity: 1.9 },
    cloud: { light: '#f6e1f6', shade: '#a487cc', emissive: 0.3 },
    sea: { light: '#f3dcf3', shade: '#a98bd0', deep: '#8d72c0' },
    road: { a: '#fbf8ff', b: '#e6e8ff' },
    stars: 0.35,
  }),
  storm: theme({
    id: 'storm', name: 'Thunder Storm',
    sky: { top: '#3a4866', mid: '#64779a', horizon: '#aebccc', bottom: '#c3cfdb' },
    sun: { color: '#e9f1ff', az: -8, el: 4.5, size: 2.2, glow: 0.4, moon: false },
    hemi: { sky: '#e8eefb', ground: '#7e8ea6', intensity: 1.9 },
    dir: { color: '#eef3ff', intensity: 1.7 },
    cloud: { light: '#e3e9f1', shade: '#8a99ae', emissive: 0.22 },
    sea: { light: '#dfe6ee', shade: '#8796ab', deep: '#6f7f98' },
    road: { a: '#f7f9fc', b: '#e3ebf3', trim: '#e8b84a' },
    fog: { near: 55, far: 185 },
  }),
  night: theme({
    id: 'night', name: 'Starry Night',
    sky: { top: '#0a1140', mid: '#1c2e74', horizon: '#5469b4', bottom: '#6a7cc4' },
    sun: { color: '#eef3ff', az: 5, el: 4.2, size: 2.6, glow: 0.7, moon: true },
    hemi: { sky: '#c4d0ff', ground: '#4f5fa6', intensity: 1.9 },
    dir: { color: '#dfe6ff', intensity: 1.8 },
    cloud: { light: '#c9d4f7', shade: '#5f70ad', emissive: 0.2 },
    sea: { light: '#b9c7f2', shade: '#5a6aa8', deep: '#45558f' },
    road: { a: '#eef3ff', b: '#d5e1ff', side: '#c8d4f5', trim: '#f4c24f', divider: '#8fb8ff' },
    island: { grass: '#5fc79a', grassDark: '#3e9a7f' },
    stars: 1,
  }),
};

export const THEME_ORDER = ['noon', 'dawn', 'sunset', 'dusk', 'storm', 'night'];

export function getTheme(id) { return THEMES[id] || THEMES.noon; }
