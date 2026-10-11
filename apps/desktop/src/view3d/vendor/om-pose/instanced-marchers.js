// Vendored from om-pose (github.com/OpenMarch/om-pose), render/instanced-marchers.js at commit 87cc16e816f0d4a074098b9cb27fdb9431c95dac.
// Do not edit here: change it in om-pose and copy it again. Local changes: none.
// om-pose is OpenMarch's own (private) repository; these files ship under the app's license.

// Instanced marchers: thousands of skinned OpenMarch v4 bodies in a handful of draw calls.
//
// Every clip is sampled once into a float texture of skinning matrices (one row per sample, four texels per
// bone). Each body type is one InstancedMesh; per instance it carries which clip (first row, samples per
// loop, counts per loop), its phase and tempo, and a skin tone. The vertex shader skins from the texture, so
// the CPU writes one matrix per marcher per frame and nothing else. Measured in out/bench.html
// (docs/scale.md): ~200 fps at 2,000 marchers on an M1 Pro whatever the mix of bodies, sizes, directions,
// phases and tempos, and unchanged with the CPU throttled 4x.
//
//   import { bakeClips, instancedSkinning, instancedGeometry, disposeInstancedGeometry, writeMarcher, writeMatrix,
//            blockGeometry } from "./instanced-marchers.js";
//   const bake = bakeClips(THREE, gltf.scene, { "8to5": clip, "back8to5": clip2, ... });   // once, any v4 body
//   const mat = instancedSkinning(THREE, createUniformMaterial(THREE, look), bake);       // one per look
//   const geo = instancedGeometry(THREE, bodyMesh.geometry, n);                           // one per body type
//   const mesh = new THREE.InstancedMesh(geo, mat, n);
//   mesh.frustumCulled = false;   // the bounding sphere is computed once and doesn't follow the instances
//   writeMarcher(mesh, i, { row: bake.rows["8to5"], phase: -c0, rate: 1, skin: 0xc68863 });   // when it changes
//   writeMarcher(mesh, i, { row: bake.rows["8to5"], row2: bake.rows["6to5"], weight: 0.4, ... });   // in between sizes
//   writeMarcher(mesh, i, { row: bake.rows["8to5"], legYaw: 0.52, ... });   // travelling 30 deg left of the facing
//   writeMatrix(mesh.instanceMatrix.array, i, x, z, heading, h); mesh.instanceMatrix.needsUpdate = true;  // every frame
//   mat.userData.uniforms.uCount.value = counts;   // the show's count clock, every frame
//
// In-between step sizes (render/step-blend.js picks the pair and weight): an instance can blend a second clip
// of the same length at the same clip time. The shader lerps the two clips' skinning matrices, which lerps every
// vertex's position exactly, so a foot planted in both clips stays planted while the body travels the blended
// step (scripts/blend_check.py: the planted foot slides no more than in either clip alone). Re-orthonormalising
// the lerped matrices, or blending local rotations as AnimationMixer does, moves no vertex more than 7.5 mm
// (bones shrink at most 1.5%, 8-to-5/6-to-5 halfway) and the foot no differently, so the plain lerp is kept.
// Cost: a blended instance fetches twice the texels; with all 2,000 marchers blended, +0.6 to 0.85 ms a frame
// (2.7 -> 3.2 / 3.5 ms) on an RTX 3060 Ti; unblended instances cost what they did.
//
// Any direction (render/step-blend.js pickDirection picks the family and the turn): `legYaw` turns an instance's
// legs, pelvis and waist about the vertical through its origin while the upper body stays square to its heading,
// exactly as the slides were built offline (LEG TURN below; scripts/direction_check.py: 0.07 mm from the shipped
// slides at +-90). Cost: +0.5 ms a frame with all 2,000 marchers turned (3.0 -> 3.5 ms, RTX 3060 Ti); unturned
// instances cost what they did. turnSkeleton does the same on a mixer-posed skeleton.
//
// The shader plays each instance at clip time mod(uCount * rate + phase, counts per loop). To start a clip at
// its time 0 when the clock reads c0: phase = -c0 * rate. Transitions (one count) wrap too: switch the
// marcher to its next clip exactly one count later. With uCount as the show's count clock (counts elapsed,
// following its tempo), rate = 1; rate is only for sections marching at different tempos at the same moment.
//   disposeInstancedGeometry(geo);                  // never geo.dispose(): it shares the body's GPU buffers
//
// Requirements: WebGL2 (texelFetch, float textures) and WebGLRenderer, not WebGPURenderer: the patch hooks
// three's shader chunks (skinbase_vertex, skinnormal_vertex, skinning_vertex), so re-check it past r160. All v4 bodies (and the block bodies below) share one
// skeleton (same joints, order and inverse bind matrices), so one bake serves them all; a body on another
// skeleton needs its own bake. Shadows need a depth material with the same patch (not done yet).

const BAKED_COUNT_S = 0.5;   // clips are keyed on a 120 bpm clock: one count = 0.5 s

// Sample every clip on `root`'s skeleton at `samplesPerCount` (the clips' own 30) into one texture.
// Each loop gets its samples plus a closing one, so playback can blend across the seam. Rows wrap into
// columns of `maxRows` (WebGL2 guarantees 2048; one height class, 161 clips, is ~5,700 rows), so the texture fits any GPU.
export function bakeClips(THREE, root, clips, { samplesPerCount = 30, maxRows = 2048 } = {}) {
  const rig = cloneRig(THREE, root);
  let mesh; rig.traverse(o => { if (o.isSkinnedMesh && !mesh) mesh = o; });
  const bones = mesh.skeleton.bones, inv = mesh.skeleton.boneInverses, nb = bones.length;
  const rows = {}; let total = 0;
  for (const [name, clip] of Object.entries(clips)) {
    const frames = Math.round(clip.duration / BAKED_COUNT_S * samplesPerCount);
    rows[name] = { row: total, frames, counts: frames / samplesPerCount };
    total += frames + 1;
  }
  const height = Math.min(total, maxRows), cols = Math.ceil(total / height), width = nb * 4 * cols;
  const data = new Float32Array(width * height * 4);
  const mixer = new THREE.AnimationMixer(rig), m = new THREE.Matrix4();
  // what three's skinning shader forms per bone: bindMatrixInverse * bone world * bone inverse * bindMatrix
  const bind = mesh.bindMatrix, bindInv = bind.clone().invert();
  for (const [name, clip] of Object.entries(clips)) {
    const action = mixer.clipAction(clip); action.play(); action.paused = true;
    for (let i = 0; i <= rows[name].frames; i++) {
      action.time = Math.min(i / samplesPerCount * BAKED_COUNT_S, clip.duration); mixer.update(0);
      rig.updateMatrixWorld(true);
      for (let b = 0; b < nb; b++) {
        m.multiplyMatrices(bindInv, bones[b].matrixWorld).multiply(inv[b]).multiply(bind);
        const r = rows[name].row + i, x = Math.floor(r / height) * nb * 4 + b * 4, y = r % height;
        for (let k = 0; k < 4; k++) data.set(m.elements.slice(k * 4, k * 4 + 4), (y * width + x + k) * 4);   // a column per texel
      }
    }
    action.stop();
  }
  // The leg turn's per-row data, in the bottom row of `root`'s matrix (no v4 vertex is weighted to root, and the
  // shader only keeps .xyz of skinned positions, so that row is free): where the upper body's column stands
  // (DEF-spine.003's head, x and z) and the hip line's yaw. See LEG TURN below.
  const turn = legTurnSetup(THREE, bones, inv, bindInv);
  if (turn) {
    const w = new THREE.Matrix4(), m3 = new THREE.Matrix3(), p = new THREE.Vector3(), hip = new THREE.Vector3();
    for (const r of Object.values(rows)) for (let i = 0; i <= r.frames; i++) {
      const row = r.row + i, x0 = Math.floor(row / height) * nb * 4, y = row % height;
      const read = (b, out) => { for (let k = 0; k < 4; k++) for (let c = 0; c < 4; c++) out.elements[k * 4 + c] = data[(y * width + x0 + b * 4 + k) * 4 + c]; return out; };
      // DEF-spine.003's head: its skinning matrix applied to its bind position
      p.copy(turn.upperHead).applyMatrix4(read(turn.upper, w));
      // the hip line: DEF-spine's skinning matrix applied to the line between the thigh heads at bind
      hip.copy(turn.hipLine).applyMatrix3(m3.setFromMatrix4(read(turn.pelvis, w)));
      const at = (k) => (y * width + x0 + turn.root * 4 + k) * 4 + 3;
      data[at(0)] = p.x; data[at(1)] = p.z; data[at(2)] = Math.atan2(-hip.z, hip.x);
    }
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType);
  texture.needsUpdate = true;
  return { texture, rows, bones: nb, rowsPerColumn: height, bytes: data.byteLength, turn };
}

// LEG TURN: which bones turn with the legs, matching how the slides were built offline (the forward legs turned
// 90 degrees about the pelvis as joint positions, then retargeted: compose.lower_body_yaw, blender/retarget_v4.py).
// The retarget leads DEF-spine (the pelvis) and DEF-spine.001 by the hip line, so they turn with the legs; it aims
// DEF-spine.002 halfway between the hip line and the shoulder line (vectors averaged, so it turns by
// atan2(r sin(a + t), 1 + r cos(a + t)) - atan2(r sin a, 1 + r cos a), r = hip width / shoulder width, a the hip
// line's own yaw, t the turn: 27 degrees at t = 90); DEF-spine.003 and up stay square. The upper body is carried
// on the pelvis, whose roll puts its column up to 7 mm off the turning axis, so turning the pelvis moves it by
// (R(t) - 1) h. Classes: 1 turns by t, 2 (DEF-spine.002) by the waist angle about the column, 0 is carried.
// With these the turn reproduces the shipped slides to 0.07 mm (scripts/direction_check.py).
function legTurnSetup(THREE, bones, inv, bindInv) {
  const name = (b) => b.name.replace(/\./g, "");
  const find = (n) => bones.findIndex(b => name(b) === n);
  const root = find("root"), pelvis = find("DEF-spine"), upper = find("DEF-spine003");
  const legs = /^DEF-(thigh|shin|foot|toe)[LR]$/;
  if ([root, pelvis, upper, find("DEF-spine001"), find("DEF-spine002")].some(i => i < 0)) return null;   // not a v4 skeleton
  const classes = bones.map(b => legs.test(name(b)) || name(b) === "DEF-spine" || name(b) === "DEF-spine001" ? 1 : name(b) === "DEF-spine002" ? 2 : 0);
  const head = (n) => new THREE.Vector3().setFromMatrixPosition(inv[find(n)].clone().invert()).applyMatrix4(bindInv);
  const hipLine = head("DEF-thighL").sub(head("DEF-thighR")), shoulders = head("DEF-upper_armL").sub(head("DEF-upper_armR"));
  return { classes, root, pelvis, upper, upperHead: head("DEF-spine003"), hipLine, waist: hipLine.length() / shoulders.length() };
}

function cloneRig(THREE, root) {
  // a private copy of the hierarchy (bones re-linked), so baking never moves the caller's scene; at the
  // origin, so wherever the caller has placed or scaled its scene doesn't end up in the bake
  const clone = root.clone(true), byName = {};
  clone.position.set(0, 0, 0); clone.quaternion.identity(); clone.scale.set(1, 1, 1);
  clone.updateMatrixWorld(true);
  clone.traverse(o => { if (o.isBone) byName[o.name] = o; });
  clone.traverse(o => {
    if (!o.isSkinnedMesh) return;
    o.bind(new THREE.Skeleton(o.skeleton.bones.map(b => byName[b.name]), o.skeleton.boneInverses), o.bindMatrix);
  });
  return clone;
}

const BAKED_VERT_HEAD = /* glsl */`
uniform highp sampler2D uAnim;
uniform float uCount;
uniform int uRowsPerColumn, uBones;
attribute vec4 skinIndex;
attribute vec4 skinWeight;
attribute vec3 aClip;      // first row, samples per loop, counts per loop
attribute vec2 aTime;      // phase (counts), tempo / 120 bpm
attribute vec2 aBlend;     // a second clip of the same length: its first row, its weight (0 = aClip alone)
attribute vec4 aTurn;      // the legs' yaw (radians, + toward the performer's left) from, to, eased over [z, w] of the clip
attribute vec3 aSkin;
varying vec3 vSkinTone;
uniform int uTurnClass[BAKED_BONES];   // per bone: 1 turns with the legs, 2 the waist (DEF-spine.002), 0 carried
uniform int uTurnRoot;                 // the bone whose matrix's bottom row holds the turn's per-row data
uniform float uWaist;                  // hip width / shoulder width
// the turn's per-row data: x, z of the upper body's column, the hip line's yaw
vec3 turnData(ivec2 at) {
  int x = at.x + uTurnRoot * 4;
  return vec3(texelFetch(uAnim, ivec2(x, at.y), 0).w, texelFetch(uAnim, ivec2(x + 1, at.y), 0).w, texelFetch(uAnim, ivec2(x + 2, at.y), 0).w);
}
mat4 yawMatrix(float t) { float c = cos(t), s = sin(t); return mat4(c, 0.0, -s, 0.0, 0.0, 1.0, 0.0, 0.0, s, 0.0, c, 0.0, 0.0, 0.0, 0.0, 1.0); }
// where a row starts in the texture (rows wrap into columns); once per row, not per bone
ivec2 bakedRow(int row) {
  int col = row / uRowsPerColumn;
  return ivec2(col * uBones * 4, row - col * uRowsPerColumn);
}
mat4 bakedBone(float bone, ivec2 at) {
  int x = at.x + int(bone) * 4;
  return mat4(texelFetch(uAnim, ivec2(x, at.y), 0), texelFetch(uAnim, ivec2(x + 1, at.y), 0),
              texelFetch(uAnim, ivec2(x + 2, at.y), 0), texelFetch(uAnim, ivec2(x + 3, at.y), 0));
}
`;
const BAKED_SKINBASE = /* glsl */`
  float u = mod(uCount * aTime.y + aTime.x, aClip.z) / aClip.z * aClip.y;
  float r0 = floor(u), fr = u - r0;
  // weight 1 plays the second clip alone, through the same code as an unblended instance (so weights 0 and 1
  // draw exactly what the unblended clips draw); in between, both clips at the same time, matrices lerped
  float bw = aBlend.y, first = bw >= 1.0 ? aBlend.x : aClip.x;
  bool blend = bw > 0.0 && bw < 1.0;
  ivec2 ra = bakedRow(int(first + r0)), rb = bakedRow(int(first + r0) + 1);
  ivec2 sa = blend ? bakedRow(int(aBlend.x + r0)) : ra, sb = blend ? bakedRow(int(aBlend.x + r0) + 1) : rb;
  // the leg turn: aTurn.x easing (smootherstep) to aTurn.y over the fraction [aTurn.z, aTurn.w] of the clip
  float te = clamp((u / aClip.y - aTurn.z) / max(aTurn.w - aTurn.z, 1e-6), 0.0, 1.0);
  float turnT = aTurn.x == aTurn.y ? aTurn.x : mix(aTurn.x, aTurn.y, te * te * te * (te * (te * 6.0 - 15.0) + 10.0));
  bool turned = BAKED_TURN && turnT != 0.0;
  // skinning matrices summed per turn class (all in class 0 when unturned): the turn is linear in them
  mat4 bakeSkin = mat4(0.0), skinLeg = mat4(0.0), skinWaist = mat4(0.0);
  float wWaist = 0.0, wUpper = 0.0;
  for (int k = 0; k < 4; k++) {
    float w = skinWeight[k];
    if (w > 0.0) {
      mat4 m = (1.0 - fr) * bakedBone(skinIndex[k], ra) + fr * bakedBone(skinIndex[k], rb);
      if (blend) m = (1.0 - bw) * m + bw * ((1.0 - fr) * bakedBone(skinIndex[k], sa) + fr * bakedBone(skinIndex[k], sb));
      int cls = turned ? uTurnClass[int(skinIndex[k])] : 0;
      if (cls == 1) skinLeg += w * m;
      else if (cls == 2) { skinWaist += w * m; wWaist += w; }
      else { bakeSkin += w * m; wUpper += w; }
    }
  }
  if (turned) {
    mat4 turnLeg = yawMatrix(turnT);
    bakeSkin += turnLeg * skinLeg;
    if (wWaist + wUpper > 0.0) {   // (leg-only vertices skip the per-sample data)
      vec3 td = (1.0 - fr) * turnData(ra) + fr * turnData(rb);
      if (blend) td = (1.0 - bw) * td + bw * ((1.0 - fr) * turnData(sa) + fr * turnData(sb));
      float a = td.z, r = uWaist;
      mat4 turnWaist = yawMatrix(atan(r * sin(a + turnT), 1.0 + r * cos(a + turnT)) - atan(r * sin(a), 1.0 + r * cos(a)));
      vec3 h = vec3(td.x, 0.0, td.y), th = mat3(turnLeg) * h;
      bakeSkin += turnWaist * skinWaist;
      bakeSkin[3].xyz += wUpper * (th - h) + wWaist * (th - mat3(turnWaist) * h);
    }
  }
  vSkinTone = aSkin;
`;

// Patch a MeshStandardMaterial (plain, or from uniforms/uniform-shader.js) to skin from the bake. With the
// uniform shader, the skin tone comes from each instance instead of the material's uSkin, so one material
// serves a whole section. Returns the same material; drive `material.userData.uniforms.uCount`.
export function instancedSkinning(THREE, material, bake) {
  const base = material.onBeforeCompile, key = material.customProgramCacheKey?.() ?? "";
  const u = material.userData.uniforms ?? (material.userData.uniforms = {});
  u.uAnim = { value: bake.texture };
  u.uCount = { value: 0 };
  u.uRowsPerColumn = { value: bake.rowsPerColumn };
  u.uBones = { value: bake.bones };
  const turn = bake.turn;
  u.uTurnClass = { value: turn ? turn.classes : new Array(bake.bones).fill(0) };
  u.uTurnRoot = { value: turn ? turn.root : 0 };
  u.uWaist = { value: turn ? turn.waist : 0 };
  const head = BAKED_VERT_HEAD.replace("BAKED_BONES", String(bake.bones));
  material.onBeforeCompile = (shader, renderer) => {
    base?.call(material, shader, renderer);
    Object.assign(shader.uniforms, { uAnim: u.uAnim, uCount: u.uCount, uRowsPerColumn: u.uRowsPerColumn, uBones: u.uBones,
      uTurnClass: u.uTurnClass, uTurnRoot: u.uTurnRoot, uWaist: u.uWaist });
    shader.vertexShader = `#define BAKED_TURN ${turn ? "true" : "false"}\n` + head + shader.vertexShader
      .replace("#include <skinbase_vertex>", BAKED_SKINBASE)
      .replace("#include <skinnormal_vertex>", "objectNormal = (bakeSkin * vec4(objectNormal, 0.0)).xyz;")
      .replace("#include <skinning_vertex>", "transformed = (bakeSkin * vec4(transformed, 1.0)).xyz;");
    // the uniform shader's skin line, made per instance; warn if it ever stops matching
    const skinLine = "if (part == 0) return uSkin;";
    if (shader.fragmentShader.includes("uniformColor()") && !shader.fragmentShader.includes(skinLine))
      console.warn("instancedSkinning: uniform shader's skin line not found; every instance will use the material's uSkin");
    shader.fragmentShader = "varying vec3 vSkinTone;\n" + shader.fragmentShader.replace(skinLine, "if (part == 0) return vSkinTone;");
  };
  material.customProgramCacheKey = () => key + `|baked-instances|${bake.bones}|${turn ? 1 : 0}`;
  return material;
}

// A body's geometry for n instances: the same vertex buffers (shared, not copied) plus the per-instance
// attributes. One per body type.
export function instancedGeometry(THREE, source, n) {
  const g = new THREE.BufferGeometry();
  for (const [k, a] of Object.entries(source.attributes)) g.setAttribute(k, a);
  g.setIndex(source.index);
  g.setAttribute("aClip", new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute("aTime", new THREE.InstancedBufferAttribute(new Float32Array(n * 2), 2));
  g.setAttribute("aBlend", new THREE.InstancedBufferAttribute(new Float32Array(n * 2), 2));
  g.setAttribute("aTurn", new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4));
  g.setAttribute("aSkin", new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3));
  return g;
}

// Free an instancedGeometry's own (per-instance) buffers. Its vertex buffers belong to the source body:
// geometry.dispose() would delete them from the GPU under every other mesh that uses them.
export function disposeInstancedGeometry(g) {
  for (const k of Object.keys(g.attributes)) if (!g.attributes[k].isInstancedBufferAttribute) g.deleteAttribute(k);
  g.setIndex(null);
  g.dispose();
}

// What instance i plays: `row` from bake.rows, phase in counts, rate = bpm / 120, skin as a hex colour.
// Call when a marcher starts a new clip or tempo, not every frame.
// In-between step sizes: `row2` (another bake.rows entry of the same length: loop with loop, step-off with
// step-off, halt with the same halt) and `weight` in [0, 1] blend the two at the same clip time, skinning
// matrices lerped: (1 - weight) row + weight row2. With pickBlend (render/step-blend.js) the body then travels
// the drill distance per count exactly and the planted foot stays planted. Without row2 (or weight 0) the
// instance plays `row` alone, exactly as before.
// Direction (render/step-blend.js pickDirection): `legYaw` turns the legs, pelvis and waist about the vertical
// through the body origin by that many radians (+ toward the performer's left) while the upper body stays square
// to the instance's heading; travel along the turned direction. A number holds the turn over the clip;
// [from, to, u0, u1] eases it from `from` to `to` over the fraction [u0, u1] of the clip (smootherstep; u0, u1
// default 0, 1): turnedClips in step-blend.js gives it for a step-off or halt, with turnRoot for the body. Default
// 0: unturned, exactly as before.
const _c = { r: 0, g: 0, b: 0 };
export function writeMarcher(mesh, i, { row, row2, weight = 0, phase = 0, rate = 1, skin, legYaw = 0 }) {
  const g = mesh.geometry;
  if (row2 && row2.frames !== row.frames) throw new Error(`writeMarcher: blended clips differ in length (${row.frames} and ${row2.frames} samples)`);
  const w = row2 ? Math.min(Math.max(weight, 0), 1) : 0;
  const [y0, y1 = y0, u0 = 0, u1 = 1] = Array.isArray(legYaw) ? legYaw : [legYaw];
  g.attributes.aClip.array.set([row.row, row.frames, row.counts], i * 3); g.attributes.aClip.needsUpdate = true;
  g.attributes.aTime.array.set([phase, rate], i * 2); g.attributes.aTime.needsUpdate = true;
  g.attributes.aBlend.array.set([row2 ? row2.row : 0, w], i * 2); g.attributes.aBlend.needsUpdate = true;
  g.attributes.aTurn.array.set([y0, y1, u0, u1], i * 4); g.attributes.aTurn.needsUpdate = true;
  if (skin !== undefined) {
    _c.r = ((skin >> 16) & 255) / 255; _c.g = ((skin >> 8) & 255) / 255; _c.b = (skin & 255) / 255;
    const lin = (x) => x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;   // sRGB hex to linear, as THREE.Color does
    g.attributes.aSkin.array.set([lin(_c.r), lin(_c.g), lin(_c.b)], i * 3); g.attributes.aSkin.needsUpdate = true;
  }
}

// The same leg turn for a skeleton posed by an AnimationMixer (a viewer's shared driver, or one marcher's own
// rig): call after mixer.update(); `bones` maps names (dots dropped, as GLTFLoader names them) to the posed bones.
// It overwrites DEF-spine's, DEF-spine.002's and DEF-spine.003's local transforms (the mixer sets them again
// on its next update). The turn is about the vertical through the skeleton's origin, in the space of root's parent.
const _tm = {};
export function turnSkeleton(THREE, bones, t) {
  if (!_tm.a) Object.assign(_tm, { a: new THREE.Matrix4(), b: new THREE.Matrix4(), rt: new THREE.Matrix4(), rw: new THREE.Matrix4(),
    s1: new THREE.Matrix4(), s2: new THREE.Matrix4(), s3: new THREE.Matrix4(), v: new THREE.Vector3(), w: new THREE.Vector3(), h: new THREE.Vector3() });
  const B = (n) => bones[n] ?? bones[n.replace(/\./g, "")];
  const root = B("root"), pelvis = B("DEF-spine"), s1 = B("DEF-spine001"), s2 = B("DEF-spine002"), s3 = B("DEF-spine003");
  // The mixer only writes a bone when its value changes (PropertyMixer), so a turn written on the last call can
  // still be there (paused, or the same clip time): put back what the mixer last wrote before turning again.
  for (const b of [pelvis, s2, s3]) {
    const k = b.userData.turnSkeleton;
    if (k && b.position.equals(k.out[0]) && b.quaternion.equals(k.out[1]) && b.scale.equals(k.out[2])) {
      b.position.copy(k.in[0]); b.quaternion.copy(k.in[1]); b.scale.copy(k.in[2]);
    }
    b.userData.turnSkeleton = null;
  }
  if (!t) { root.updateMatrixWorld(true); return; }
  const keep = (b) => [b.position.clone(), b.quaternion.clone(), b.scale.clone()];
  const before = new Map([pelvis, s2, s3].map(b => [b, keep(b)]));
  root.updateWorldMatrix(true, true);
  const base = _tm.a.copy(root.parent ? root.parent.matrixWorld : _tm.a.identity()).invert();   // world -> the skeleton's space
  const M = (bone, out) => out.multiplyMatrices(base, bone.matrixWorld);
  const pos = (n, out) => out.setFromMatrixPosition(M(B(n), _tm.b));
  const hip = pos("DEF-thighL", _tm.v).sub(pos("DEF-thighR", _tm.w)), r = hip.length() / pos("DEF-upper_armL", _tm.h).sub(pos("DEF-upper_armR", _tm.w)).length();
  const a = Math.atan2(-hip.z, hip.x);
  const waist = Math.atan2(r * Math.sin(a + t), 1 + r * Math.cos(a + t)) - Math.atan2(r * Math.sin(a), 1 + r * Math.cos(a));
  const h = pos("DEF-spine003", _tm.h); h.y = 0;
  _tm.rt.makeRotationY(t); _tm.rw.makeRotationY(waist);
  M(s1, _tm.s1); M(s2, _tm.s2); M(s3, _tm.s3);
  const setLocal = (bone, parentModel, model) => {   // bone.matrix = parent^-1 model, in the skeleton's space
    _tm.b.copy(parentModel).invert().multiply(model).decompose(bone.position, bone.quaternion, bone.scale);
  };
  // pelvis (and with it the legs and DEF-spine.001): R(t) pelvis
  setLocal(pelvis, M(pelvis.parent, _tm.b.clone()), _tm.b.clone().multiplyMatrices(_tm.rt, M(pelvis, new THREE.Matrix4())));
  const s1n = _tm.s1.clone().premultiply(_tm.rt);
  // DEF-spine.002 by the waist angle about the column; DEF-spine.003 moved by (R(t) - 1) h
  const move = (rot) => _tm.v.copy(h).applyMatrix4(_tm.rt).sub(_tm.w.copy(h).applyMatrix4(rot));
  const s2n = _tm.s2.clone().premultiply(_tm.rw); const mw = move(_tm.rw); s2n.elements[12] += mw.x; s2n.elements[13] += mw.y; s2n.elements[14] += mw.z;
  setLocal(s2, s1n, s2n);
  const s3n = _tm.s3.clone(); const mu = move(new THREE.Matrix4()); s3n.elements[12] += mu.x; s3n.elements[13] += mu.y; s3n.elements[14] += mu.z;
  setLocal(s3, s2n, s3n);
  for (const [b, k] of before) b.userData.turnSkeleton = { in: k, out: keep(b) };
  root.updateMatrixWorld(true);
}

// Instance matrix for a marcher at field (x, z) facing `heading` (radians about +Y, 0 = +Z), drawn at
// scale h (its height class), written straight into the array.
export function writeMatrix(array, i, x, z, heading, h = 1) {
  const c = Math.cos(heading) * h, s = Math.sin(heading) * h, o = i * 16;
  array[o] = c; array[o + 1] = 0; array[o + 2] = -s; array[o + 3] = 0;
  array[o + 4] = 0; array[o + 5] = h; array[o + 6] = 0; array[o + 7] = 0;
  array[o + 8] = s; array[o + 9] = 0; array[o + 10] = c; array[o + 11] = 0;
  array[o + 12] = x; array[o + 13] = 0; array[o + 14] = z; array[o + 15] = 1;
}

// ---- block bodies: the performance level ----
// Boxes riding the v4 skeleton rigidly, one bone each (weight 1), so they play the same baked clips and the
// uniform shader paints them unchanged. Each box is [bone, from, to, width, depth, part] in the bone's frame:
// it runs along the bone's +Y from `from` to `to` metres. Parts are the uniform shader's (0 skin, 1 jacket,
// 2 sleeves, 3 pants, 4 shoes, 5 gloves, 7 shako, 8 plume). Knees, elbows and ankles still bend. 264
// triangles against the full body's 1,796; a sixth of the GPU time (docs/scale.md).
export const BLOCK_BODY = [
  ["DEF-spine", -0.05, 0.155, 0.30, 0.18, 3], ["DEF-spine.001", 0, 0.125, 0.31, 0.19, 1], ["DEF-spine.002", 0, 0.135, 0.33, 0.20, 1],
  ["DEF-spine.003", 0, 0.15, 0.36, 0.21, 1], ["DEF-spine.004", 0, 0.09, 0.09, 0.09, 0], ["DEF-spine.006", -0.02, 0.2, 0.19, 0.21, 0],
  ["DEF-spine.006", 0.2, 0.36, 0.17, 0.17, 7], ["DEF-spine.006", 0.36, 0.42, 0.05, 0.05, 8],
  ...["L", "R"].flatMap(k => [
    [`DEF-upper_arm.${k}`, 0, 0.205, 0.09, 0.09, 2], [`DEF-forearm.${k}`, 0, 0.264, 0.08, 0.08, 2], [`DEF-hand.${k}`, 0, 0.09, 0.07, 0.04, 5],
    [`DEF-thigh.${k}`, 0, 0.431, 0.13, 0.13, 3], [`DEF-shin.${k}`, 0, 0.417, 0.11, 0.11, 3],
    [`DEF-foot.${k}`, 0, 0.128, 0.10, 0.08, 4], [`DEF-toe.${k}`, 0, 0.06, 0.10, 0.05, 4]]),
];

// Build a box body on `skeleton` (any v4 body's: its rest pose comes from the inverse bind matrices).
// Faces are flat (own vertices), with position, normal, skinIndex, skinWeight and _part, like the v4u bodies.
export function blockGeometry(THREE, skeleton, boxes = BLOCK_BODY) {
  const pos = [], nrm = [], idx = [], si = [], sw = [], part = [];
  const v = new THREE.Vector3(), n = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  const names = skeleton.bones.map(b => b.name);
  for (const [bone, y0, y1, w, d, pt] of boxes) {
    const bi = names.indexOf(THREE.PropertyBinding.sanitizeNodeName(bone));   // GLTFLoader drops the dots
    if (bi < 0) throw new Error(`blockGeometry: no bone ${bone}`);
    const rest = skeleton.boneInverses[bi].clone().invert(), rot = new THREE.Matrix3().setFromMatrix4(rest);
    const half = [w / 2, 0, d / 2];
    for (const [ax, sg] of [[0, 1], [0, -1], [1, 1], [1, -1], [2, 1], [2, -1]]) {   // six faces
      const first = pos.length / 3, corners = [];
      for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const p = [0, 0, 0];
        p[ax] = sg; p[(ax + 1) % 3] = a; p[(ax + 2) % 3] = b;
        v.set(p[0] * half[0], p[1] > 0 ? y1 : y0, p[2] * half[2]).applyMatrix4(rest);
        pos.push(v.x, v.y, v.z); corners.push(v.clone());
        si.push(bi, 0, 0, 0); sw.push(1, 0, 0, 0); part.push(pt);
      }
      n.set(ax === 0 ? sg : 0, ax === 1 ? sg : 0, ax === 2 ? sg : 0).applyMatrix3(rot).normalize();
      for (let k = 0; k < 4; k++) nrm.push(n.x, n.y, n.z);
      const out = e1.subVectors(corners[1], corners[0]).cross(e2.subVectors(corners[2], corners[0])).dot(n) > 0;   // wind outward
      idx.push(...(out ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]).map(k => first + k));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute("skinWeight", new THREE.Float32BufferAttribute(sw, 4));
  g.setAttribute("_part", new THREE.Float32BufferAttribute(part, 1));
  g.setIndex(idx);
  return g;
}
