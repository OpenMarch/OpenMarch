// Vendored from om-pose (github.com/OpenMarch/om-pose), uniforms/uniform-shader.js at commit 87cc16e816f0d4a074098b9cb27fdb9431c95dac.
// Do not edit here: change it in om-pose and copy it again. Local changes: none.
// om-pose is OpenMarch's own (private) repository; these files ship under the app's license.

// Uniform skins for the OpenMarch v4 sandbox bodies (assets/body-v4u): a style (what goes where)
// plus a palette (which colours), painted by a small extension of three's MeshStandardMaterial.
//
// The bodies carry one material and a per-face `_PART` attribute (0 skin, 1 jacket, 2 sleeves,
// 3 pants, 4 shoes, 5 gloves, 6 eyes, 7 shako, 8 plume, 9 visor, 10 aussie crown, 11 aussie brim,
// 12 cape, 13 trumpet, 14 mellophone, 15 baritone). Hat type, cape and instrument are options:
// the parts not chosen are discarded. Instruments ride the right hand in the horn-up hold. Patterns are drawn in the body's
// rest pose (the `position` attribute before skinning), so they ride the animation with no UVs and
// stay sharp at any distance. One material per look (a section), one draw call per body type with
// render/instanced-marchers.js, which gives each marcher its own skin tone.
//
//   import { createUniformMaterial, setUniform, STYLES, PALETTE_SLOTS } from "./uniform-shader.js";
//   const mat = createUniformMaterial(THREE, { style: "sash", colors: { primary: 0x6e1f2a, ... }, skin: 0xc68863 });
//   skinnedMesh.material = mat;            // the mesh from assets/body-v4u/<type>.glb
//   setUniform(mat, { style: "plastron" }); // restyle or recolour at any time
//   setUniform(mat, { options: { stripe: false, mirror: true, hat: false } });
//
// Rest-pose landmarks are the v4 skeleton's (identical for all seven body types), glTF axes:
// +X performer's left, +Y up, +Z forward.

export const PALETTE_SLOTS = ["primary", "secondary", "accent", "trim", "pants", "shoes", "gloves", "hat", "plume", "visor"];

export const STYLES = {
  classic:   { id: 0, label: "Classic",   about: "Solid jacket, high collar and cuffs in trim, a stripe down the outer seam." },
  sash:      { id: 1, label: "Sash",      about: "A wide diagonal sash from the left shoulder to the right hip, edged in trim." },
  plastron:  { id: 2, label: "Plastron",  about: "A contrasting front panel (bib) that widens to the chest, edged in trim." },
  military:  { id: 3, label: "Military",  about: "Crossed belts over the chest, two rows of buttons, a banded jacket hem." },
  split:     { id: 4, label: "Split",     about: "Asymmetric: the jacket and sleeves split on a diagonal into two colours." },
  fade:      { id: 5, label: "Fade",      about: "A modern look: jacket fades from the secondary colour at the waist to the primary at the chest.", defaults: { stripe: false } },
};

export const PRESETS = {
  "Royal":        { style: "classic",  colors: { primary: 0x2d4f9e, secondary: 0xf2f2ee, accent: 0xf2f2ee, trim: 0xd8b04a, pants: 0x1c1f2b, shoes: 0x111114, gloves: 0xf2f2ee, hat: 0x2d4f9e, plume: 0xf2f2ee, visor: 0x111114 } },
  "Maroon":       { style: "sash",     colors: { primary: 0x6e1f2a, secondary: 0xd9cfb4, accent: 0xd8b04a, trim: 0xd9cfb4, pants: 0xd9cfb4, shoes: 0x111114, gloves: 0xf2f2ee, hat: 0x6e1f2a, plume: 0xd8b04a, visor: 0x111114 } },
  "Black & gold": { style: "military", colors: { primary: 0x1b1b1d, secondary: 0x2a2a2e, accent: 0xd8b04a, trim: 0xd8b04a, pants: 0x1b1b1d, shoes: 0x111114, gloves: 0xd8b04a, hat: 0x1b1b1d, plume: 0xd8b04a, visor: 0xd8b04a } },
  "Kelly":        { style: "plastron", colors: { primary: 0x1f7a45, secondary: 0xf0f0ea, accent: 0x1f7a45, trim: 0xf0f0ea, pants: 0xf0f0ea, shoes: 0xf0f0ea, gloves: 0xf2f2ee, hat: 0xf0f0ea, plume: 0x1f7a45, visor: 0x111114 } },
  "Midnight":     { style: "split",    colors: { primary: 0x23264a, secondary: 0x6c7fd8, accent: 0xf2f2ee, trim: 0xf2f2ee, pants: 0x23264a, shoes: 0x111114, gloves: 0xf2f2ee, hat: 0x23264a, plume: 0x6c7fd8, visor: 0x111114 } },
  "Sunset":       { style: "fade",     colors: { primary: 0xe8743b, secondary: 0x7a1f5c, accent: 0xffd36e, trim: 0xffd36e, pants: 0x2b1830, shoes: 0x111114, gloves: 0xf2f2ee, hat: 0x2b1830, plume: 0xffd36e, visor: 0x111114 } },
};

const L = {  // v4 rest landmarks (metres)
  collar: 1.42, belt: 0.97, hatBase: 1.721,
  wrist: [0.331, 0.964, 0.081], hip: [0.094, 0.938, -0.012], ankle: [0.162, 0.096, -0.011],
};
const f = (x) => x.toFixed(4);

const VERT_HEAD = /* glsl */`
attribute float _part;
varying float vPart;
varying vec3 vRest;
`;
const FRAG_HEAD = /* glsl */`
varying float vPart;
varying vec3 vRest;
uniform vec3 uPrimary, uSecondary, uAccent, uTrim, uPants, uShoes, uGloves, uHat, uPlume, uVisor, uSkin;
uniform int uStyle;
uniform float uStripe, uCollar, uCuffs, uMirror, uShowHat, uHatType, uCape, uInstrument;
uniform vec3 uMetal;
// 1 inside a band of half-width w around d = 0, antialiased
float band(float d, float w) { float fw = fwidth(d) + 1e-5; return 1.0 - smoothstep(w - fw, w + fw, abs(d)); }
// 1 where d > 0, antialiased
float over(float d) { float fw = fwidth(d) + 1e-5; return smoothstep(-fw, fw, d); }
float segDist(vec2 p, vec2 a, vec2 b) { vec2 ab = b - a; float t = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0); return length(p - a - ab * t); }

vec3 uniformColor() {
  vec3 p = vRest;
  if (uMirror > 0.5) p.x = -p.x;  // sash and split go the other way
  int part = int(vPart + 0.5);
  float side = p.x >= 0.0 ? 1.0 : -1.0;
  if (part == 0) return uSkin;
  if (part == 4) return uShoes;
  if (part == 5) return uGloves;
  if (part == 6) return vec3(0.02);
  if (part >= 7 && part <= 9 && (uShowHat < 0.5 || uHatType > 0.5)) discard;
  if ((part == 10 || part == 11) && (uShowHat < 0.5 || uHatType < 0.5 || uHatType > 1.5)) discard;
  if (part == 12 && uCape < 0.5) discard;
  if (part >= 13 && part <= 15) {  // instruments: show the chosen one, in its finish
    if (abs(float(part - 12) - uInstrument) > 0.5) discard;
    return uMetal;
  }
  if (part == 10) return mix(uHat, uTrim, 1.0 - over(p.y - (${f(L.hatBase)} + 0.03)));
  if (part == 11) return uHat;
  if (part == 12) return mix(uSecondary, uTrim, 1.0 - over(p.y - ${f(L.belt + 0.06)}));
  if (part == 7) return mix(uHat, uTrim, 1.0 - over(p.y - (${f(L.hatBase)} + 0.022)));
  if (part == 8) return uPlume;
  if (part == 9) return uVisor;
  if (part == 3) {  // pants: a stripe down the outer seam
    float t = clamp((p.y - ${f(L.ankle[1])}) / (${f(L.hip[1] - L.ankle[1])}), 0.0, 1.0);
    float cx = side * mix(${f(L.ankle[0])}, ${f(L.hip[0])}, t);
    float stripe = band(p.z - mix(${f(L.ankle[2])}, ${f(L.hip[2])}, t), 0.016) * over(side * (p.x - cx));
    return mix(uPants, uAccent, stripe * uStripe);
  }
  // jacket (1) and sleeves (2)
  vec3 c = uPrimary;
  if (uStyle == 4) c = mix(uSecondary, uPrimary, over(p.x + 0.45 * (p.y - 1.2)));
  if (uStyle == 5) c = mix(uSecondary, uPrimary, smoothstep(${f(L.belt + 0.05)}, 1.38, p.y));
  if (part == 1) {
    float front = over(p.z);
    if (uStyle == 1) {  // sash, left shoulder to right hip, front and back
      float d = segDist(p.xy, vec2(0.17, 1.43), vec2(-0.16, 0.95));
      c = mix(c, uTrim, band(d, 0.052));
      c = mix(c, uAccent, band(d, 0.042));
    }
    if (uStyle == 2) {  // plastron
      float halfw = mix(0.055, 0.105, smoothstep(${f(L.belt)}, 1.36, p.y));
      float d = halfw - abs(p.x);
      c = mix(c, uTrim, over(d + 0.008) * front);
      c = mix(c, uSecondary, over(d) * front);
    }
    if (uStyle == 3) {  // military: crossed belts, two rows of buttons, banded hem
      float b1 = segDist(p.xy, vec2(0.16, 1.42), vec2(-0.15, ${f(L.belt + 0.02)}));
      float b2 = segDist(p.xy, vec2(-0.16, 1.42), vec2(0.15, ${f(L.belt + 0.02)}));
      c = mix(c, uAccent, max(band(b1, 0.022), band(b2, 0.022)) * front);
      vec2 q = vec2(abs(abs(p.x) - 0.05), mod(p.y - ${f(L.belt)} + 0.0325, 0.065) - 0.0325);
      c = mix(c, uTrim, (1.0 - over(length(q) - 0.011)) * front * over(1.37 - p.y) * over(abs(p.x) - 0.02));
      c = mix(c, uTrim, 1.0 - over(p.y - (${f(L.belt)} + 0.03)));
    }
    c = mix(c, uTrim, over(p.y - ${f(L.collar)}) * uCollar);  // high collar
  }
  if (part == 2) {  // cuffs
    vec3 w = vec3(side * ${f(L.wrist[0])}, ${f(L.wrist[1])}, ${f(L.wrist[2])});
    c = mix(c, uTrim, (1.0 - over(distance(p, w) - 0.075)) * uCuffs);
  }
  return c;
}
`;

function colorsOf(THREE, colors = {}) {
  const out = {};
  for (const k of PALETTE_SLOTS) out[k] = new THREE.Color(colors[k] ?? 0x888888);
  return out;
}

export const DEFAULT_OPTIONS = { stripe: true, collar: true, cuffs: true, mirror: false, hat: true, hatType: "shako", cape: false,
  instrument: "none", finish: "brass" };
export const INSTRUMENTS = ["none", "trumpet", "mellophone", "baritone"];
export const FINISHES = { brass: 0xd9ad4f, silver: 0xd4d8de, black: 0x1c1c20 };
export const HAT_TYPES = ["shako", "aussie", "none"];

export function createUniformMaterial(THREE, { style = "classic", colors = {}, skin = 0xc68863, options = {}, flatShading = true } = {}) {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.78, metalness: 0.0, flatShading });
  const c = colorsOf(THREE, colors);
  const u = {
    uStyle: { value: (STYLES[style] ?? STYLES.classic).id },
    uSkin: { value: new THREE.Color(skin) },
    uStripe: { value: 1 }, uCollar: { value: 1 }, uCuffs: { value: 1 }, uMirror: { value: 0 }, uShowHat: { value: 1 },
    uHatType: { value: 0 }, uCape: { value: 0 }, uInstrument: { value: 0 }, uMetal: { value: new THREE.Color(FINISHES.brass) },
  };
  for (const k of PALETTE_SLOTS) u["u" + k[0].toUpperCase() + k.slice(1)] = { value: c[k] };
  mat.userData.uniforms = u;
  setOptions(u, { ...DEFAULT_OPTIONS, ...(STYLES[style]?.defaults ?? {}), ...options });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = VERT_HEAD + shader.vertexShader.replace(
      "#include <begin_vertex>", "#include <begin_vertex>\n  vRest = position;\n  vPart = _part;");
    shader.fragmentShader = FRAG_HEAD + shader.fragmentShader.replace(
      "vec4 diffuseColor = vec4( diffuse, opacity );", "vec4 diffuseColor = vec4( uniformColor(), opacity );");
  };
  mat.customProgramCacheKey = () => "om-uniform-v1";
  return mat;
}

function setOptions(u, o) {
  if (o.stripe !== undefined) u.uStripe.value = o.stripe ? 1 : 0;
  if (o.collar !== undefined) u.uCollar.value = o.collar ? 1 : 0;
  if (o.cuffs !== undefined) u.uCuffs.value = o.cuffs ? 1 : 0;
  if (o.mirror !== undefined) u.uMirror.value = o.mirror ? 1 : 0;
  if (o.hat !== undefined) u.uShowHat.value = o.hat ? 1 : 0;
  if (o.hatType !== undefined) u.uHatType.value = Math.max(0, HAT_TYPES.indexOf(o.hatType));
  if (o.cape !== undefined) u.uCape.value = o.cape ? 1 : 0;
  if (o.instrument !== undefined) u.uInstrument.value = Math.max(0, INSTRUMENTS.indexOf(o.instrument));
  if (o.finish !== undefined) u.uMetal.value.set(FINISHES[o.finish] ?? FINISHES.brass);
}

export function setUniform(mat, { style, colors, skin, options } = {}) {
  const u = mat.userData.uniforms;
  if (options) setOptions(u, options);
  if (style !== undefined) u.uStyle.value = (STYLES[style] ?? STYLES.classic).id;
  if (skin !== undefined) u.uSkin.value.set(skin);
  if (colors) for (const [k, v] of Object.entries(colors)) {
    const key = "u" + k[0].toUpperCase() + k.slice(1);
    if (u[key]) u[key].value.set(v);
  }
}
