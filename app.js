import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

/* ------------------------------------------------------------------ */
/*  Basic scene setup                                                   */
/* ------------------------------------------------------------------ */

const container = document.getElementById("app");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fd0e8);
scene.fog = new THREE.Fog(0x8fd0e8, 9, 22);

const camera = new THREE.PerspectiveCamera(
  40,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);
camera.position.set(0, 1.7, 5.2);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.3, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 2.5;
controls.maxDistance = 9;
controls.maxPolarAngle = Math.PI * 0.52;
controls.update();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* Lighting */
const hemi = new THREE.HemisphereLight(0xffffff, 0x4a5a3a, 0.9);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xfff3d6, 1.15);
sun.position.set(4, 7, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -4;
sun.shadow.camera.right = 4;
sun.shadow.camera.top = 4;
sun.shadow.camera.bottom = -4;
scene.add(sun);

const fill = new THREE.DirectionalLight(0xbcd8ff, 0.35);
fill.position.set(-5, 3, -4);
scene.add(fill);

/* Ground */
const groundGeo = new THREE.CircleGeometry(9, 40);
const groundMat = new THREE.MeshStandardMaterial({
  color: 0x6fae52,
  flatShading: true,
  roughness: 1,
});
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const padGeo = new THREE.CylinderGeometry(1.15, 1.25, 0.1, 24);
const padMat = new THREE.MeshStandardMaterial({
  color: 0x8a6a4a,
  flatShading: true,
  roughness: 0.9,
});
const pad = new THREE.Mesh(padGeo, padMat);
pad.position.y = 0.05;
pad.receiveShadow = true;
scene.add(pad);

/* ------------------------------------------------------------------ */
/*  Spring helper - drives the "snap back" reaction                    */
/* ------------------------------------------------------------------ */

class Spring {
  constructor(stiffness = 170, damping = 11) {
    this.angle = 0;
    this.vel = 0;
    this.stiffness = stiffness;
    this.damping = damping;
  }
  hit(impulse) {
    this.vel += impulse;
    this.vel = THREE.MathUtils.clamp(this.vel, -9, 9);
  }
  update(dt) {
    const accel = -this.stiffness * this.angle - this.damping * this.vel;
    this.vel += accel * dt;
    this.angle += this.vel * dt;
  }
}

const springs = []; // { spring, pivot }
const squashGroups = []; // { spring, meshes: [...], baseScales: [...] }

function makeSpring(pivot, squashMeshes, opts = {}) {
  const s = new Spring(opts.stiffness ?? 170, opts.damping ?? 11);
  springs.push({ spring: s, pivot });
  const meshes = squashMeshes
    ? Array.isArray(squashMeshes)
      ? squashMeshes
      : [squashMeshes]
    : [];
  squashGroups.push({
    spring: s,
    meshes,
    baseScales: meshes.map((m) => m.scale.clone()),
  });
  return s;
}

/* ------------------------------------------------------------------ */
/*  Materials                                                           */
/* ------------------------------------------------------------------ */

const SKIN = 0xe3ad82;
const HAIR = 0x4a3728;
const JACKET = 0x232a35;
const JACKET_DARK = 0x171c24;
const JEANS = 0x45566e;
const SHOE = 0x1c1c1e;

function stdMat(color, extra = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    flatShading: true,
    roughness: 0.85,
    metalness: 0.02,
    ...extra,
  });
}

/* Simple canvas face texture */
function makeFaceTexture() {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#e3ad82";
  ctx.fillRect(0, 0, 128, 128);

  // eyes
  ctx.fillStyle = "#2a2a2a";
  ctx.beginPath();
  ctx.ellipse(42, 58, 7, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(86, 58, 7, 9, 0, 0, Math.PI * 2);
  ctx.fill();

  // eyebrows
  ctx.strokeStyle = "#5b4230";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(32, 42);
  ctx.lineTo(52, 40);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(76, 40);
  ctx.lineTo(96, 42);
  ctx.stroke();

  // nose
  ctx.strokeStyle = "#c88f63";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(64, 60);
  ctx.lineTo(60, 78);
  ctx.lineTo(68, 80);
  ctx.stroke();

  // mouth - gentle smirk
  ctx.strokeStyle = "#7a4030";
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(46, 96);
  ctx.quadraticCurveTo(64, 106, 84, 92);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const faceTexture = makeFaceTexture();

/* ------------------------------------------------------------------ */
/*  Bruise decals                                                       */
/* ------------------------------------------------------------------ */

function makeBruiseTexture() {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, "rgba(40,15,70,0.9)");
  g.addColorStop(0.35, "rgba(35,40,110,0.75)");
  g.addColorStop(0.7, "rgba(55,60,130,0.35)");
  g.addColorStop(1, "rgba(55,60,130,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

const bruiseTexture = makeBruiseTexture();
const bruiseGeo = new THREE.PlaneGeometry(0.16, 0.16);
const activeBruises = [];
const MAX_BRUISES = 140;

function addBruise(mesh, localPoint, localNormal) {
  const mat = new THREE.MeshBasicMaterial({
    map: bruiseTexture,
    transparent: true,
    opacity: 0.55 + Math.random() * 0.3,
    depthWrite: false,
  });
  const plane = new THREE.Mesh(bruiseGeo, mat);

  const n = localNormal.clone().normalize();
  plane.position.copy(localPoint).addScaledVector(n, 0.012);
  const quat = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    n
  );
  plane.quaternion.copy(quat);
  plane.rotateZ(Math.random() * Math.PI * 2);
  const s = 0.7 + Math.random() * 0.9;
  plane.scale.set(s, s, s);
  plane.renderOrder = 2;

  mesh.add(plane);
  activeBruises.push(plane);

  if (activeBruises.length > MAX_BRUISES) {
    const old = activeBruises.shift();
    old.parent && old.parent.remove(old);
    old.material.dispose();
  }
}

function clearBruises() {
  for (const b of activeBruises) {
    b.parent && b.parent.remove(b);
    b.material.dispose();
  }
  activeBruises.length = 0;
}

/* ------------------------------------------------------------------ */
/*  Avatar construction (low-poly / voxel-ish blocky humanoid)         */
/* ------------------------------------------------------------------ */

const avatar = new THREE.Group();
scene.add(avatar);

const hittable = []; // { mesh, spring, impulse }

function box(w, h, d, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/* dimensions */
const LOWER_LEG = 0.52;
const UPPER_LEG = 0.52;
const PELVIS_H = 0.28;
const TORSO_H = 0.62;
const NECK_H = 0.06;
const HEAD_S = 0.4;
const UPPER_ARM = 0.4;
const LOWER_ARM = 0.36;
const LEG_GAP = 0.17;
const ARM_GAP = 0.36;

const hipY = LOWER_LEG + UPPER_LEG;

/* Hips group - root of the ragdoll-ish rig, sits on the ground */
const hips = new THREE.Group();
hips.position.set(0, hipY, 0);
avatar.add(hips);

/* Pelvis */
const pelvisMesh = box(0.42, PELVIS_H, 0.28, stdMat(JEANS));
pelvisMesh.position.y = PELVIS_H / 2;
hips.add(pelvisMesh);
const hipsSpring = makeSpring(hips, pelvisMesh, { stiffness: 150, damping: 12 });
hittable.push({ mesh: pelvisMesh, spring: hipsSpring, impulse: 1.6, axis: "x" });

/* Torso pivot (chest) */
const torsoPivot = new THREE.Group();
torsoPivot.position.set(0, PELVIS_H, 0);
hips.add(torsoPivot);

const torsoMesh = box(0.5, TORSO_H, 0.3, stdMat(JACKET));
torsoMesh.position.y = TORSO_H / 2;
torsoPivot.add(torsoMesh);
const torsoSpring = makeSpring(torsoPivot, torsoMesh, {
  stiffness: 140,
  damping: 11,
});
hittable.push({ mesh: torsoMesh, spring: torsoSpring, impulse: 2.1, axis: "x" });

// jacket zipper detail
const zipMesh = box(0.05, TORSO_H * 0.85, 0.02, stdMat(JACKET_DARK));
zipMesh.position.set(0, TORSO_H / 2, 0.16);
torsoMesh.add(zipMesh);

/* Head pivot */
const headPivot = new THREE.Group();
headPivot.position.set(0, TORSO_H + NECK_H, 0);
torsoPivot.add(headPivot);

const headMat = [
  stdMat(SKIN), // +x
  stdMat(SKIN), // -x
  stdMat(SKIN), // +y
  stdMat(SKIN), // -y
  new THREE.MeshStandardMaterial({
    map: faceTexture,
    flatShading: true,
    roughness: 0.85,
  }), // +z face
  stdMat(SKIN), // -z
];
const headMesh = new THREE.Mesh(new THREE.BoxGeometry(HEAD_S, HEAD_S, HEAD_S), headMat);
headMesh.castShadow = true;
headMesh.position.y = HEAD_S / 2;
headPivot.add(headMesh);
const headSpring = makeSpring(headPivot, headMesh, {
  stiffness: 160,
  damping: 10,
});
hittable.push({ mesh: headMesh, spring: headSpring, impulse: 2.6, axis: "x" });

// hair - top cap
const hairTop = box(HEAD_S * 1.05, HEAD_S * 0.32, HEAD_S * 1.05, stdMat(HAIR));
hairTop.position.set(0, HEAD_S * 0.92, -0.01);
headMesh.add(hairTop);
// hair - front fringe
const hairFringe = box(HEAD_S * 1.02, HEAD_S * 0.22, HEAD_S * 0.35, stdMat(HAIR));
hairFringe.position.set(0, HEAD_S * 0.8, HEAD_S * 0.34);
hairFringe.rotation.x = -0.25;
headMesh.add(hairFringe);

/* Arms */
function buildArm(side) {
  const sign = side === "left" ? -1 : 1;
  const shoulder = new THREE.Group();
  shoulder.position.set(sign * (0.25 + ARM_GAP / 2), TORSO_H - 0.06, 0);
  torsoPivot.add(shoulder);

  const upperArmMesh = box(0.16, UPPER_ARM, 0.16, stdMat(JACKET));
  upperArmMesh.position.y = -UPPER_ARM / 2;
  shoulder.add(upperArmMesh);
  const shoulderSpring = makeSpring(shoulder, upperArmMesh, {
    stiffness: 150,
    damping: 10,
  });
  hittable.push({
    mesh: upperArmMesh,
    spring: shoulderSpring,
    impulse: 2.3,
    axis: "x",
  });

  const elbow = new THREE.Group();
  elbow.position.set(0, -UPPER_ARM, 0);
  shoulder.add(elbow);

  const lowerArmMesh = box(0.14, LOWER_ARM, 0.14, stdMat(SKIN));
  lowerArmMesh.position.y = -LOWER_ARM / 2;
  elbow.add(lowerArmMesh);

  const handMesh = box(0.15, 0.15, 0.15, stdMat(SKIN));
  handMesh.position.y = -LOWER_ARM - 0.06;
  elbow.add(handMesh);

  const elbowSpring = makeSpring(elbow, [lowerArmMesh, handMesh], {
    stiffness: 190,
    damping: 11,
  });
  hittable.push({
    mesh: lowerArmMesh,
    spring: elbowSpring,
    impulse: 2.4,
    axis: "x",
  });
  hittable.push({
    mesh: handMesh,
    spring: elbowSpring,
    impulse: 2.4,
    axis: "x",
  });

  return { shoulder, upperArmMesh, elbow, lowerArmMesh };
}

buildArm("left");
buildArm("right");

/* Legs */
function buildLeg(side) {
  const sign = side === "left" ? -1 : 1;
  const hipPivot = new THREE.Group();
  hipPivot.position.set(sign * LEG_GAP, 0, 0);
  hips.add(hipPivot);

  const upperLegMesh = box(0.2, UPPER_LEG, 0.2, stdMat(JEANS));
  upperLegMesh.position.y = -UPPER_LEG / 2;
  hipPivot.add(upperLegMesh);
  const hipSpring = makeSpring(hipPivot, upperLegMesh, {
    stiffness: 155,
    damping: 11,
  });
  hittable.push({
    mesh: upperLegMesh,
    spring: hipSpring,
    impulse: 2.2,
    axis: "x",
  });

  const knee = new THREE.Group();
  knee.position.set(0, -UPPER_LEG, 0);
  hipPivot.add(knee);

  const lowerLegMesh = box(0.18, LOWER_LEG, 0.18, stdMat(JEANS));
  lowerLegMesh.position.y = -LOWER_LEG / 2;
  knee.add(lowerLegMesh);

  const shoeMesh = box(0.2, 0.12, 0.28, stdMat(SHOE));
  shoeMesh.position.set(0, -LOWER_LEG - 0.02, 0.05);
  knee.add(shoeMesh);

  const kneeSpring = makeSpring(knee, [lowerLegMesh, shoeMesh], {
    stiffness: 200,
    damping: 12,
  });
  hittable.push({
    mesh: lowerLegMesh,
    spring: kneeSpring,
    impulse: 2.3,
    axis: "x",
  });
  hittable.push({
    mesh: shoeMesh,
    spring: kneeSpring,
    impulse: 2.3,
    axis: "x",
  });

  return { hipPivot, upperLegMesh, knee, lowerLegMesh };
}

buildLeg("left");
buildLeg("right");

avatar.position.y = 0;

/* ------------------------------------------------------------------ */
/*  Reset pose                                                          */
/* ------------------------------------------------------------------ */

function resetAvatar() {
  for (const s of springs) {
    s.spring.angle = 0;
    s.spring.vel = 0;
    s.pivot.rotation.set(0, 0, 0);
  }
  for (const g of squashGroups) {
    g.meshes.forEach((m, i) => m.scale.copy(g.baseScales[i]));
  }
  clearBruises();
  hitCount = 0;
  updateHitCounter();
}

/* ------------------------------------------------------------------ */
/*  Raycasting / click handling                                        */
/* ------------------------------------------------------------------ */

const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();
let pointerDown = null;

renderer.domElement.addEventListener("pointerdown", (e) => {
  pointerDown = { x: e.clientX, y: e.clientY, t: performance.now() };
  container.classList.add("dragging");
});

window.addEventListener("pointerup", (e) => {
  container.classList.remove("dragging");
  if (!pointerDown) return;
  const dx = e.clientX - pointerDown.x;
  const dy = e.clientY - pointerDown.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const dt = performance.now() - pointerDown.t;
  pointerDown = null;
  if (dist > 6 || dt > 350) return; // treat as drag / orbit, not a punch

  pointerNdc.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointerNdc.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointerNdc, camera);

  const meshes = hittable.map((h) => h.mesh);
  const hits = raycaster.intersectObjects(meshes, false);
  if (hits.length === 0) return;

  const hit = hits[0];
  const entry = hittable.find((h) => h.mesh === hit.object);
  if (!entry) return;

  punch(entry, hit);
});

function punch(entry, hit) {
  entry.spring.hit(entry.impulse);

  const localPoint = hit.object.worldToLocal(hit.point.clone());
  const localNormal = hit.face
    ? hit.face.normal.clone()
    : new THREE.Vector3(0, 0, 1);
  addBruise(hit.object, localPoint, localNormal);

  hitCount++;
  updateHitCounter();
  playPunchSound();
  shakeCamera(entry.impulse);
  maybeTriggerSpeechFromHit();
}

/* ------------------------------------------------------------------ */
/*  Hit counter UI                                                      */
/* ------------------------------------------------------------------ */

let hitCount = 0;
const hitCountEl = document.getElementById("hitCount");
function updateHitCounter() {
  hitCountEl.textContent = String(hitCount);
}

document.getElementById("resetBtn").addEventListener("click", resetAvatar);

/* ------------------------------------------------------------------ */
/*  Camera shake                                                        */
/* ------------------------------------------------------------------ */

let shakeTime = 0;
let shakeStrength = 0;
function shakeCamera(impulse) {
  shakeStrength = Math.min(0.12, 0.03 * impulse);
  shakeTime = 0.25;
}

/* ------------------------------------------------------------------ */
/*  Punch sound (procedural, no external assets)                       */
/* ------------------------------------------------------------------ */

let audioCtx = null;
let muted = false;

function ensureAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
}

function playPunchSound() {
  if (muted) return;
  ensureAudio();
  const now = audioCtx.currentTime;

  const bufferSize = audioCtx.sampleRate * 0.15;
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2.2);
  }
  const noise = audioCtx.createBufferSource();
  noise.buffer = buffer;

  const filter = audioCtx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(1200, now);
  filter.frequency.exponentialRampToValueAtTime(180, now + 0.12);

  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.9, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

  noise.connect(filter).connect(gain).connect(audioCtx.destination);
  noise.start(now);
  noise.stop(now + 0.16);

  // low thump
  const osc = audioCtx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(140, now);
  osc.frequency.exponentialRampToValueAtTime(45, now + 0.12);
  const oscGain = audioCtx.createGain();
  oscGain.gain.setValueAtTime(0.6, now);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
  osc.connect(oscGain).connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + 0.15);
}

const muteBtn = document.getElementById("muteBtn");
muteBtn.addEventListener("click", () => {
  muted = !muted;
  muteBtn.textContent = muted ? "🔇" : "🔊";
  if (!muted) ensureAudio();
});

/* ------------------------------------------------------------------ */
/*  Speech bubble                                                       */
/* ------------------------------------------------------------------ */

const SPEECH_LINE = "Orrr kömmer ni lieber skaten gehen?";
const bubble = document.getElementById("speechBubble");
const bubbleText = document.getElementById("speechText");

let speechVisible = false;
let speechTimer = null;
const worldHeadPos = new THREE.Vector3();

function showSpeech() {
  if (speechVisible) return;
  speechVisible = true;
  bubbleText.textContent = SPEECH_LINE;
  bubble.classList.remove("hidden");
  bubble.classList.add("visible");
  clearTimeout(speechTimer);
  speechTimer = setTimeout(hideSpeech, 3200);
}

function hideSpeech() {
  speechVisible = false;
  bubble.classList.remove("visible");
  bubble.classList.add("hidden");
  scheduleNextSpeech();
}

function scheduleNextSpeech() {
  const delay = 7000 + Math.random() * 9000;
  setTimeout(showSpeech, delay);
}
scheduleNextSpeech();

function maybeTriggerSpeechFromHit() {
  // small chance a punch immediately provokes his catchphrase
  if (!speechVisible && Math.random() < 0.18) {
    clearTimeout(speechTimer);
    showSpeech();
  }
}

function updateSpeechBubblePosition() {
  if (!speechVisible) return;
  headMesh.getWorldPosition(worldHeadPos);
  worldHeadPos.y += 0.32;
  const p = worldHeadPos.clone().project(camera);
  const x = (p.x * 0.5 + 0.5) * window.innerWidth;
  const y = (1 - (p.y * 0.5 + 0.5)) * window.innerHeight;
  bubble.style.left = `${x}px`;
  bubble.style.top = `${y}px`;
}

/* ------------------------------------------------------------------ */
/*  Animation loop                                                      */
/* ------------------------------------------------------------------ */

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  for (const s of springs) {
    s.spring.update(dt);
    s.pivot.rotation.x = s.spring.angle;
  }

  for (const g of squashGroups) {
    const squash = 1 - Math.min(Math.abs(g.spring.angle) * 0.12, 0.14);
    const bulge = 2 - squash;
    g.meshes.forEach((m, i) => {
      const base = g.baseScales[i];
      m.scale.set(base.x * bulge, base.y * squash, base.z * bulge);
    });
  }

  if (shakeTime > 0) {
    shakeTime -= dt;
    const f = Math.max(shakeTime, 0) / 0.25;
    const s = shakeStrength * f;
    camera.position.x += (Math.random() - 0.5) * s;
    camera.position.y += (Math.random() - 0.5) * s;
  }

  controls.update();
  updateSpeechBubblePosition();
  renderer.render(scene, camera);
}

animate();
