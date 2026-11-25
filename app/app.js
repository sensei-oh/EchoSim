(() => {
  "use strict";

  const PX_PER_METER = 100;
  const MIN_BLIND_METERS = 0.02;
  const WORLD_W = 860;
  const WORLD_H = 480;
  const CONE_RAYS = 48;

  const MATERIALS = {
    concrete: { label: "Concrete", reflectivity: 0.88, color: "#94A3B8" },
    parked_car: { label: "Parked Car", reflectivity: 0.85, color: "#E4E4E7" },
    moving_vehicle: { label: "Moving Vehicle", reflectivity: 0.85, color: "#E4E4E7" },
    glass: { label: "Specular Glass", reflectivity: 0.92, color: "#38BDF8", specular: true },
    fabric: { label: "Acoustic Fabric", reflectivity: 0.24, color: "#C084FC" },
    overhang: { label: "Overhang", reflectivity: 0.79, color: "#FB7185" },
    curb: { label: "Low Curb", reflectivity: 0.62, color: "#F59E0B" },
    pedestrian: { label: "Pedestrian", reflectivity: 0.68, color: "#F59E0B" },
    pole: { label: "Pole / Tree", reflectivity: 0.74, color: "#A3E635" }
  };

  const KEY_ACTIONS = {
    ArrowUp: "forward",
    w: "forward",
    W: "forward",
    ArrowDown: "backward",
    s: "backward",
    S: "backward",
    a: "strafeLeft",
    A: "strafeLeft",
    d: "strafeRight",
    D: "strafeRight",
    ArrowLeft: "turnLeft",
    q: "turnLeft",
    Q: "turnLeft",
    ArrowRight: "turnRight",
    e: "turnRight",
    E: "turnRight"
  };

  const state = {
    preset: "hallway",
    audioMode: "both",
    blindfold: false,
    tapMode: "aim",
    beamSpreadDeg: 30,
    maxRangeMeters: 3.5,
    showCaneArc: true,
    user: { x: 205, y: 265, angle: 0 },
    target: { x: 655, y: 260, r: 22 },
    segments: [],
    entities: [],
    placedStack: [],
    targetReachedNotified: false,
    telemetry: {
      distance: 2.15,
      intensity: 78.4,
      incidence: 12.8,
      material: "Concrete",
      status: "echo",
      pan: 0
    }
  };

  const dom = {
    simCanvas: document.getElementById("simCanvas"),
    signalCanvas: document.getElementById("signalCanvas"),
    presetMapSelect: document.getElementById("presetMapSelect"),
    audioModeBtn: document.getElementById("audioModeBtn"),
    audioModeLabel: document.getElementById("audioModeLabel"),
    blindfoldBtn: document.getElementById("blindfoldBtn"),
    blindfoldLabel: document.getElementById("blindfoldLabel"),
    blindfoldOverlay: document.getElementById("blindfoldOverlay"),
    tapModeBtn: document.getElementById("tapModeBtn"),
    tapModeText: document.getElementById("tapModeText"),
    objectTypeSelect: document.getElementById("objectTypeSelect"),
    undoBtn: document.getElementById("undoBtn"),
    resetBtn: document.getElementById("resetBtn"),
    beamSpreadSlider: document.getElementById("beamSpreadSlider"),
    beamSpreadVal: document.getElementById("beamSpreadVal"),
    maxRangeSlider: document.getElementById("maxRangeSlider"),
    maxRangeVal: document.getElementById("maxRangeVal"),
    caneArcToggle: document.getElementById("caneArcToggle"),
    telDistance: document.getElementById("telDistance"),
    telIntensity: document.getElementById("telIntensity"),
    telAngle: document.getElementById("telAngle"),
    telMaterial: document.getElementById("telMaterial"),
    pulseDelayText: document.getElementById("pulseDelayText"),
    compRangeCell: document.getElementById("compRangeCell"),
    compGlassCell: document.getElementById("compGlassCell"),
    toastBanner: document.getElementById("toastBanner")
  };

  const simCtx = dom.simCanvas.getContext("2d");
  const signalCtx = dom.signalCanvas.getContext("2d");

  const lastUI = {
    dist: "",
    intensity: "",
    angle: "",
    material: "",
    delay: "",
    compRange: "",
    compGlass: ""
  };

  // Offscreen Cached Dot Grid Pattern
  const gridCanvas = document.createElement("canvas");
  gridCanvas.width = WORLD_W;
  gridCanvas.height = WORLD_H;
  const gridCtx = gridCanvas.getContext("2d");
  gridCtx.fillStyle = "rgba(255, 255, 255, 0.08)";
  for (let gx = 24; gx < WORLD_W; gx += 28) {
    for (let gy = 24; gy < WORLD_H; gy += 28) {
      gridCtx.fillRect(gx, gy, 1.4, 1.4);
    }
  }

  // Event-Driven Canvas Sizing
  const simLayout = { scale: 1, offsetX: 0, offsetY: 0 };

  function resizeCanvases() {
    const dpr = window.devicePixelRatio || 1;
    const simRect = dom.simCanvas.parentElement.getBoundingClientRect();
    if (simRect.width > 0 && simRect.height > 0) {
      dom.simCanvas.width = Math.floor(simRect.width * dpr);
      dom.simCanvas.height = Math.floor(simRect.height * dpr);
      simLayout.scale = Math.min(dom.simCanvas.width / WORLD_W, dom.simCanvas.height / WORLD_H);
      simLayout.offsetX = (dom.simCanvas.width - WORLD_W * simLayout.scale) / 2;
      simLayout.offsetY = (dom.simCanvas.height - WORLD_H * simLayout.scale) / 2;
    }

    const sigRect = dom.signalCanvas.parentElement.getBoundingClientRect();
    if (sigRect.width > 0 && sigRect.height > 0) {
      dom.signalCanvas.width = Math.floor(sigRect.width * dpr);
      dom.signalCanvas.height = Math.floor(sigRect.height * dpr);
    }
  }

  if ("ResizeObserver" in window) {
    const ro = new ResizeObserver(resizeCanvases);
    ro.observe(dom.simCanvas.parentElement);
    ro.observe(dom.signalCanvas.parentElement);
  } else {
    window.addEventListener("resize", resizeCanvases);
  }

  let toastTimer = null;
  function showToast(msg) {
    dom.toastBanner.textContent = msg;
    dom.toastBanner.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => dom.toastBanner.classList.remove("show"), 2200);
  }

  // Audio Synthesizer & Voice Queue Hygiene
  let audioCtx = null;
  let lastPingTime = 0;
  let lastVoiceTime = 0;
  let lastSpokenKey = "";

  function ensureAudioContext() {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) audioCtx = new Ctx();
    }
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume();
    }
  }

  function updateAudio(now) {
    if (state.audioMode === "off") return;

    const { distance, status, material, pan, intensity } = state.telemetry;
    const intervalMs = Math.max(170, Math.min(950, distance * 230));

    if (now - lastPingTime > intervalMs && status !== "clear" && status !== "blind") {
      lastPingTime = now;
      ensureAudioContext();
      if (audioCtx) {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        const panner = audioCtx.createStereoPanner ? audioCtx.createStereoPanner() : null;

        osc.type = status === "specular" ? "triangle" : "sine";
        osc.frequency.setValueAtTime(
          status === "specular" ? 340 : 520 + (1 - Math.min(1, distance / state.maxRangeMeters)) * 680,
          audioCtx.currentTime
        );

        const vol = Math.max(0.03, Math.min(0.18, (intensity / 100) * 0.18));
        gain.gain.setValueAtTime(vol, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.09);

        if (panner) {
          panner.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), audioCtx.currentTime);
          osc.connect(gain).connect(panner).connect(audioCtx.destination);
        } else {
          osc.connect(gain).connect(audioCtx.destination);
        }
        osc.onended = () => {
          osc.disconnect();
          gain.disconnect();
          if (panner) panner.disconnect();
        };
        osc.start();
        osc.stop(audioCtx.currentTime + 0.095);
      }
    }

    if (state.audioMode === "both" && "speechSynthesis" in window && now - lastVoiceTime > 3400) {
      let phrase = "";
      if (status === "specular") {
        phrase = "Specular loss on glass";
      } else if (material === "Overhang" && distance < 2.8) {
        phrase = `Overhang ahead, ${distance.toFixed(1)} meters`;
      } else if (distance < 1.25 && status === "echo") {
        phrase = `${material} close, ${distance.toFixed(1)} meters`;
      }

      if (phrase && phrase !== lastSpokenKey && !window.speechSynthesis.speaking) {
        lastVoiceTime = now;
        lastSpokenKey = phrase;
        const utter = new SpeechSynthesisUtterance(phrase);
        utter.rate = 1.12;
        utter.volume = 0.75;
        window.speechSynthesis.speak(utter);
      }
    }
  }

  function loadPreset(name) {
    state.preset = name;
    state.placedStack.length = 0;
    state.targetReachedNotified = false;
    state.segments.length = 0;
    state.entities.length = 0;

    if (name === "hallway") {
      state.user = { x: 205, y: 265, angle: 0 };
      state.target = { x: 655, y: 260, r: 22 };
      state.segments.push(
        { x1: 110, y1: 110, x2: 330, y2: 110, type: "concrete" },
        { x1: 430, y1: 210, x2: 710, y2: 210, type: "concrete" },
        { x1: 710, y1: 210, x2: 710, y2: 335, type: "concrete" },
        { x1: 540, y1: 335, x2: 710, y2: 335, type: "concrete" },
        { x1: 110, y1: 110, x2: 110, y2: 335, type: "concrete" },
        { x1: 110, y1: 335, x2: 215, y2: 335, type: "concrete" },
        { x1: 295, y1: 335, x2: 350, y2: 335, type: "concrete" },
        { x1: 330, y1: 110, x2: 430, y2: 210, type: "glass" },
        { x1: 440, y1: 213, x2: 575, y2: 213, type: "overhang" }
      );
      state.entities.push(
        { kind: "parked_car", x: 435, y: 365, w: 96, h: 46, vx: 0, vy: 0 },
        { kind: "pedestrian", x: 525, y: 285, r: 10, vx: 0, vy: 0.35, minY: 245, maxY: 315 }
      );
    } else if (name === "street") {
      state.user = { x: 155, y: 335, angle: -0.14 };
      state.target = { x: 675, y: 150, r: 22 };
      state.segments.push(
        { x1: 80, y1: 85, x2: 750, y2: 85, type: "concrete" },
        { x1: 80, y1: 405, x2: 750, y2: 405, type: "concrete" },
        { x1: 230, y1: 290, x2: 590, y2: 290, type: "curb" },
        { x1: 470, y1: 88, x2: 600, y2: 145, type: "glass" }
      );
      state.entities.push(
        { kind: "parked_car", x: 300, y: 345, w: 94, h: 45, vx: 0, vy: 0 },
        { kind: "moving_vehicle", x: 610, y: 215, w: 100, h: 46, vx: -1.1, vy: 0 },
        { kind: "pedestrian", x: 435, y: 175, r: 10, vx: 0, vy: 0.42, minY: 120, maxY: 265 },
        { kind: "pole", x: 220, y: 262, r: 9, vx: 0, vy: 0 }
      );
    } else if (name === "blindfold") {
      state.user = { x: 140, y: 245, angle: 0 };
      state.target = { x: 685, y: 245, r: 24 };
      state.segments.push(
        { x1: 90, y1: 110, x2: 740, y2: 110, type: "concrete" },
        { x1: 90, y1: 380, x2: 740, y2: 380, type: "concrete" },
        { x1: 275, y1: 110, x2: 275, y2: 220, type: "fabric" },
        { x1: 435, y1: 260, x2: 435, y2: 380, type: "concrete" },
        { x1: 550, y1: 110, x2: 630, y2: 185, type: "glass" }
      );
      state.entities.push(
        { kind: "pole", x: 355, y: 305, r: 10, vx: 0, vy: 0 },
        { kind: "pedestrian", x: 590, y: 290, r: 10, vx: 0, vy: -0.35, minY: 215, maxY: 345 }
      );
    }
  }

  // Acoustic Raycasting Engine (Zero Per-Frame Buffer Reallocation)
  const activeSegments = [];
  const hitPoints = Array.from({ length: CONE_RAYS + 1 }, () => ({
    dist: 0,
    x: 0,
    y: 0,
    hit: false,
    type: null,
    incidenceDeg: 0,
    reflectAngle: 0
  }));

  function stepAndCollectSegments() {
    activeSegments.length = 0;
    for (let i = 0; i < state.segments.length; i++) {
      activeSegments.push(state.segments[i]);
    }

    for (let i = 0; i < state.entities.length; i++) {
      const ent = state.entities[i];
      if (ent.kind === "pedestrian") {
        ent.y += ent.vy;
        if (ent.y < ent.minY || ent.y > ent.maxY) ent.vy *= -1;
      } else if (ent.kind === "moving_vehicle") {
        ent.x += ent.vx;
        if (ent.x < 140) ent.x = 700;
      }

      if (ent.kind === "parked_car" || ent.kind === "moving_vehicle") {
        const hw = ent.w / 2;
        const hh = ent.h / 2;
        activeSegments.push(
          { x1: ent.x - hw, y1: ent.y - hh, x2: ent.x + hw, y2: ent.y - hh, type: ent.kind },
          { x1: ent.x + hw, y1: ent.y - hh, x2: ent.x + hw, y2: ent.y + hh, type: ent.kind },
          { x1: ent.x + hw, y1: ent.y + hh, x2: ent.x - hw, y2: ent.y + hh, type: ent.kind },
          { x1: ent.x - hw, y1: ent.y + hh, x2: ent.x - hw, y2: ent.y - hh, type: ent.kind }
        );
      } else {
        const sides = 10;
        for (let s = 0; s < sides; s++) {
          const a1 = (s / sides) * Math.PI * 2;
          const a2 = ((s + 1) / sides) * Math.PI * 2;
          activeSegments.push({
            x1: ent.x + Math.cos(a1) * ent.r,
            y1: ent.y + Math.sin(a1) * ent.r,
            x2: ent.x + Math.cos(a2) * ent.r,
            y2: ent.y + Math.sin(a2) * ent.r,
            type: ent.kind
          });
        }
      }
    }
  }

  function castRayInto(out, ox, oy, angle, maxDistPx) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    out.dist = maxDistPx;
    out.x = ox + dx * maxDistPx;
    out.y = oy + dy * maxDistPx;
    out.hit = false;
    out.type = null;
    out.incidenceDeg = 0;
    out.reflectAngle = 0;

    for (let i = 0; i < activeSegments.length; i++) {
      const seg = activeSegments[i];
      const sx = seg.x2 - seg.x1;
      const sy = seg.y2 - seg.y1;
      const denom = dx * sy - dy * sx;
      if (Math.abs(denom) < 1e-6) continue;

      const t = ((seg.x1 - ox) * sy - (seg.y1 - oy) * sx) / denom;
      if (t < 0 || t >= out.dist) continue;

      const u = ((seg.x1 - ox) * dy - (seg.y1 - oy) * dx) / denom;
      if (u < 0 || u > 1) continue;

      const len = Math.hypot(sx, sy) || 1;
      let nx = -sy / len;
      let ny = sx / len;
      if (nx * dx + ny * dy > 0) {
        nx = -nx;
        ny = -ny;
      }
      const dot = Math.max(-1, Math.min(1, -(dx * nx + dy * ny)));
      const rDot = dx * nx + dy * ny;

      out.dist = t;
      out.x = ox + dx * t;
      out.y = oy + dy * t;
      out.hit = true;
      out.type = seg.type;
      out.incidenceDeg = (Math.acos(dot) * 180) / Math.PI;
      out.reflectAngle = Math.atan2(dy - 2 * rDot * ny, dx - 2 * rDot * nx);
    }
  }

  function updateTelemetry() {
    const maxPx = state.maxRangeMeters * PX_PER_METER;
    const halfSpread = ((state.beamSpreadDeg / 2) * Math.PI) / 180;
    let bestRay = null;
    let bestPan = 0;

    for (let i = 0; i <= CONE_RAYS; i++) {
      const frac = i / CONE_RAYS - 0.5;
      const rayAngle = state.user.angle + frac * 2 * halfSpread;
      const out = hitPoints[i];
      castRayInto(out, state.user.x, state.user.y, rayAngle, maxPx);
      if (out.hit && (!bestRay || out.dist < bestRay.dist)) {
        bestRay = out;
        bestPan = frac * 1.6;
      }
    }

    const t = state.telemetry;
    if (!bestRay) {
      t.distance = state.maxRangeMeters;
      t.intensity = 0;
      t.incidence = 0;
      t.material = "Clear Path";
      t.status = "clear";
      t.pan = 0;
    } else {
      const distMeters = bestRay.dist / PX_PER_METER;
      const mat = MATERIALS[bestRay.type] || MATERIALS.concrete;
      if (distMeters < MIN_BLIND_METERS) {
        t.distance = distMeters;
        t.intensity = 0;
        t.incidence = bestRay.incidenceDeg;
        t.material = "Blind Zone";
        t.status = "blind";
        t.pan = bestPan;
      } else {
        const isSpecularLoss = Boolean(mat.specular && bestRay.incidenceDeg > 24);
        const angleFactor = Math.max(0.05, Math.cos((bestRay.incidenceDeg * Math.PI) / 180));
        t.distance = distMeters;
        t.intensity = isSpecularLoss ? 4.2 : Math.min(99.5, Math.max(8, mat.reflectivity * angleFactor * 100));
        t.incidence = bestRay.incidenceDeg;
        t.material = mat.label;
        t.status = isSpecularLoss ? "specular" : "echo";
        t.pan = bestPan;
      }
    }

    let distStr, intStr, angStr, matStr, delayStr, glassStr;
    if (t.status === "clear") {
      distStr = `> ${state.maxRangeMeters.toFixed(1)} m`;
      intStr = "0.0%";
      angStr = "0.0\u00B0";
      matStr = "Clear Path";
      delayStr = "No Echo";
      glassStr = lastUI.compGlass || "Specular Loss";
    } else if (t.status === "blind") {
      distStr = "< 0.02 m";
      intStr = "0.0%";
      angStr = `${t.incidence.toFixed(1)}\u00B0`;
      matStr = "Blind Zone";
      delayStr = "Ring-Down";
      glassStr = lastUI.compGlass || "Specular Loss";
    } else {
      distStr = `${t.distance.toFixed(2)} m`;
      intStr = `${t.intensity.toFixed(1)}%`;
      angStr = `${t.incidence.toFixed(1)}\u00B0`;
      matStr = t.material;
      delayStr = `\u0394t = ${(((2 * t.distance) / 343) * 1000).toFixed(1)} ms`;
      glassStr = t.status === "specular" ? "Specular Loss" : "Angle Dependent";
    }
    const rangeStr = `~${state.maxRangeMeters.toFixed(2)}m`;

    if (distStr !== lastUI.dist) dom.telDistance.textContent = lastUI.dist = distStr;
    if (intStr !== lastUI.intensity) dom.telIntensity.textContent = lastUI.intensity = intStr;
    if (angStr !== lastUI.angle) dom.telAngle.textContent = lastUI.angle = angStr;
    if (matStr !== lastUI.material) dom.telMaterial.textContent = lastUI.material = matStr;
    if (delayStr !== lastUI.delay) dom.pulseDelayText.textContent = lastUI.delay = delayStr;
    if (rangeStr !== lastUI.compRange) dom.compRangeCell.textContent = lastUI.compRange = rangeStr;
    if (glassStr !== lastUI.compGlass) dom.compGlassCell.textContent = lastUI.compGlass = glassStr;
  }

  function renderFloorplan() {
    simCtx.save();
    simCtx.clearRect(0, 0, dom.simCanvas.width, dom.simCanvas.height);
    simCtx.translate(simLayout.offsetX, simLayout.offsetY);
    simCtx.scale(simLayout.scale, simLayout.scale);

    simCtx.drawImage(gridCanvas, 0, 0);

    // Target Clearance Zone
    const tgtGrad = simCtx.createRadialGradient(
      state.target.x, state.target.y, 4,
      state.target.x, state.target.y, state.target.r + 14
    );
    tgtGrad.addColorStop(0, "rgba(245, 158, 11, 0.55)");
    tgtGrad.addColorStop(1, "rgba(245, 158, 11, 0)");
    simCtx.fillStyle = tgtGrad;
    simCtx.beginPath();
    simCtx.arc(state.target.x, state.target.y, state.target.r + 14, 0, Math.PI * 2);
    simCtx.fill();

    simCtx.strokeStyle = "rgba(245, 158, 11, 0.7)";
    simCtx.lineWidth = 1.5;
    simCtx.beginPath();
    simCtx.arc(state.target.x, state.target.y, 13, 0, Math.PI * 2);
    simCtx.stroke();

    simCtx.fillStyle = "#F59E0B";
    simCtx.font = "600 9.5px Inter, sans-serif";
    simCtx.textAlign = "right";
    simCtx.fillText("TARGET", state.target.x - 22, state.target.y + 3);

    // Structural Segments
    simCtx.lineCap = "round";
    for (let i = 0; i < state.segments.length; i++) {
      const seg = state.segments[i];
      const mat = MATERIALS[seg.type] || MATERIALS.concrete;
      if (seg.type === "overhang") {
        simCtx.fillStyle = "rgba(251, 113, 133, 0.18)";
        simCtx.strokeStyle = "#FB7185";
        simCtx.lineWidth = 1.5;
        const minX = Math.min(seg.x1, seg.x2);
        const w = Math.abs(seg.x2 - seg.x1) || 14;
        simCtx.fillRect(minX, seg.y1 - 8, w, 16);
        simCtx.strokeRect(minX, seg.y1 - 8, w, 16);
        simCtx.fillStyle = "#FB7185";
        simCtx.font = "600 9.5px Inter, sans-serif";
        simCtx.textAlign = "center";
        simCtx.fillText("OVERHANG", minX + w / 2, seg.y1 + 21);
      } else {
        simCtx.strokeStyle = mat.color;
        simCtx.lineWidth = 3.5;
        simCtx.beginPath();
        simCtx.moveTo(seg.x1, seg.y1);
        simCtx.lineTo(seg.x2, seg.y2);
        simCtx.stroke();

        const mx = (seg.x1 + seg.x2) / 2;
        const my = (seg.y1 + seg.y2) / 2;
        if (seg.type === "glass") {
          simCtx.fillStyle = "#38BDF8";
          simCtx.font = "600 9.5px Inter, sans-serif";
          simCtx.textAlign = "left";
          simCtx.fillText("GLASS", mx + 10, my - 6);
        } else if (seg.type === "fabric") {
          simCtx.fillStyle = "#C084FC";
          simCtx.font = "600 9px Inter, sans-serif";
          simCtx.textAlign = "left";
          simCtx.fillText("FABRIC", mx + 8, my);
        } else if (seg.type === "curb") {
          simCtx.fillStyle = "#F59E0B";
          simCtx.font = "600 9px Inter, sans-serif";
          simCtx.textAlign = "center";
          simCtx.fillText("LOW CURB", mx, seg.y1 + 14);
        }
      }
    }

    // Entities
    for (let i = 0; i < state.entities.length; i++) {
      const ent = state.entities[i];
      if (ent.kind === "parked_car" || ent.kind === "moving_vehicle") {
        simCtx.save();
        simCtx.translate(ent.x, ent.y);
        simCtx.fillStyle = "rgba(228, 228, 231, 0.08)";
        simCtx.strokeStyle = "#A1A1AA";
        simCtx.lineWidth = 1.5;
        simCtx.beginPath();
        simCtx.roundRect(-ent.w / 2, -ent.h / 2, ent.w, ent.h, 12);
        simCtx.fill();
        simCtx.stroke();
        simCtx.strokeStyle = "rgba(255, 255, 255, 0.25)";
        simCtx.strokeRect(-ent.w / 4, -ent.h / 2 + 6, ent.w / 2, ent.h - 12);
        simCtx.fillStyle = "#A1A1AA";
        simCtx.font = "600 9px Inter, sans-serif";
        simCtx.textAlign = "center";
        simCtx.fillText(ent.kind === "moving_vehicle" ? "MOVING VEHICLE" : "PARKED CAR", 0, ent.h / 2 + 14);
        simCtx.restore();
      } else {
        const isPed = ent.kind === "pedestrian";
        simCtx.fillStyle = isPed ? "#F59E0B" : "#A3E635";
        simCtx.beginPath();
        simCtx.arc(ent.x, ent.y, ent.r, 0, Math.PI * 2);
        simCtx.fill();
        simCtx.font = "600 9.5px Inter, sans-serif";
        simCtx.textAlign = "center";
        simCtx.fillText(isPed ? "PEDESTRIAN" : "POLE", ent.x, ent.y + 21);
      }
    }

    // Specular Deflection Vectors
    simCtx.strokeStyle = "rgba(251, 113, 133, 0.72)";
    simCtx.lineWidth = 1.2;
    for (let i = 0; i < hitPoints.length; i += 10) {
      const res = hitPoints[i];
      if (res.hit && res.type === "glass" && res.incidenceDeg > 24) {
        simCtx.beginPath();
        simCtx.moveTo(res.x, res.y);
        simCtx.lineTo(res.x + Math.cos(res.reflectAngle) * 75, res.y + Math.sin(res.reflectAngle) * 75);
        simCtx.stroke();
      }
    }

    // Ultrasonic Cone
    const maxPx = state.maxRangeMeters * PX_PER_METER;
    const beamGrad = simCtx.createRadialGradient(state.user.x, state.user.y, 6, state.user.x, state.user.y, maxPx);
    beamGrad.addColorStop(0, "rgba(52, 211, 153, 0.34)");
    beamGrad.addColorStop(1, "rgba(52, 211, 153, 0.06)");

    simCtx.fillStyle = beamGrad;
    simCtx.beginPath();
    simCtx.moveTo(state.user.x, state.user.y);
    for (let i = 0; i < hitPoints.length; i++) {
      simCtx.lineTo(hitPoints[i].x, hitPoints[i].y);
    }
    simCtx.closePath();
    simCtx.fill();

    simCtx.strokeStyle = "rgba(52, 211, 153, 0.72)";
    simCtx.lineWidth = 1.3;
    simCtx.stroke();

    const centerRay = hitPoints[Math.floor(hitPoints.length / 2)];
    simCtx.save();
    simCtx.setLineDash([4, 4]);
    simCtx.strokeStyle = "rgba(52, 211, 153, 0.55)";
    simCtx.beginPath();
    simCtx.moveTo(state.user.x, state.user.y);
    simCtx.lineTo(centerRay.x, centerRay.y);
    simCtx.stroke();
    simCtx.restore();

    simCtx.fillStyle = "#34D399";
    simCtx.font = "600 10px 'JetBrains Mono', monospace";
    simCtx.textAlign = "left";
    simCtx.fillText(
      `${state.maxRangeMeters.toFixed(1)}m`,
      state.user.x + Math.cos(state.user.angle) * (maxPx * 0.62) + 8,
      state.user.y + Math.sin(state.user.angle) * (maxPx * 0.62) - 6
    );

    if (state.showCaneArc) {
      const canePx = 1.1 * PX_PER_METER;
      simCtx.strokeStyle = "#F59E0B";
      simCtx.lineWidth = 1.6;
      simCtx.beginPath();
      simCtx.arc(state.user.x, state.user.y, canePx, state.user.angle - 0.52, state.user.angle + 0.52);
      simCtx.stroke();

      simCtx.save();
      simCtx.setLineDash([3, 3]);
      simCtx.strokeStyle = "rgba(245, 158, 11, 0.5)";
      simCtx.beginPath();
      simCtx.arc(state.user.x, state.user.y, canePx - 14, state.user.angle - 0.45, state.user.angle + 0.45);
      simCtx.stroke();
      simCtx.restore();

      simCtx.fillStyle = "#F59E0B";
      simCtx.font = "600 9.5px Inter, sans-serif";
      simCtx.textAlign = "center";
      simCtx.fillText(
        "Cane Sweep",
        state.user.x + Math.cos(state.user.angle - 0.58) * (canePx + 14),
        state.user.y + Math.sin(state.user.angle - 0.58) * (canePx + 14)
      );
      simCtx.fillText(
        "1.1m",
        state.user.x + Math.cos(state.user.angle + 0.58) * (canePx + 14),
        state.user.y + Math.sin(state.user.angle + 0.58) * (canePx + 14)
      );
    }

    simCtx.fillStyle = "rgba(52, 211, 153, 0.22)";
    simCtx.beginPath();
    simCtx.arc(state.user.x, state.user.y, 15, 0, Math.PI * 2);
    simCtx.fill();

    simCtx.fillStyle = "#34D399";
    simCtx.beginPath();
    simCtx.arc(state.user.x, state.user.y, 7, 0, Math.PI * 2);
    simCtx.fill();

    simCtx.restore();
  }

  function renderSignalGraph() {
    const w = dom.signalCanvas.width;
    const h = dom.signalCanvas.height;
    if (!w || !h) return;
    const dpr = window.devicePixelRatio || 1;

    signalCtx.clearRect(0, 0, w, h);

    signalCtx.strokeStyle = "rgba(255, 255, 255, 0.06)";
    signalCtx.lineWidth = 1;
    signalCtx.beginPath();
    for (let c = 1; c < 10; c++) {
      const gx = (w / 10) * c;
      signalCtx.moveTo(gx, 0);
      signalCtx.lineTo(gx, h);
    }
    for (let r = 1; r < 4; r++) {
      const gy = (h / 4) * r;
      signalCtx.moveTo(0, gy);
      signalCtx.lineTo(w, gy);
    }
    signalCtx.stroke();

    // CH1: Trigger Square Pulse
    const ch1Base = h * 0.34;
    const ch1High = h * 0.14;
    const trigStart = w * 0.08;
    const trigEnd = w * 0.17;

    signalCtx.strokeStyle = "#34D399";
    signalCtx.lineWidth = 1.6 * dpr;
    signalCtx.beginPath();
    signalCtx.moveTo(0, ch1Base);
    signalCtx.lineTo(trigStart, ch1Base);
    signalCtx.lineTo(trigStart, ch1High);
    signalCtx.lineTo(trigEnd, ch1High);
    signalCtx.lineTo(trigEnd, ch1Base);
    signalCtx.lineTo(w, ch1Base);
    signalCtx.stroke();

    // CH2: Echo Return Pulse
    const ch2Base = h * 0.76;
    const { status, distance, intensity } = state.telemetry;
    signalCtx.strokeStyle = status === "specular" ? "#FB7185" : "#34D399";
    signalCtx.beginPath();
    signalCtx.moveTo(0, ch2Base);

    if (status !== "clear" && status !== "blind") {
      const normDist = Math.min(1, distance / state.maxRangeMeters);
      const echoX = trigEnd + normDist * (w * 0.68);
      const amp = Math.max(3 * dpr, (intensity / 100) * (h * 0.18));

      signalCtx.lineTo(echoX - 8 * dpr, ch2Base);
      signalCtx.lineTo(echoX - 3 * dpr, ch2Base - amp);
      signalCtx.lineTo(echoX + 3 * dpr, ch2Base + amp * 0.85);
      signalCtx.lineTo(echoX + 8 * dpr, ch2Base - amp * 0.45);
      signalCtx.lineTo(echoX + 13 * dpr, ch2Base);
    }

    signalCtx.lineTo(w, ch2Base);
    signalCtx.stroke();
  }

  function moveUser(action) {
    const step = 14;
    const rot = 0.14;
    if (action === "forward") {
      state.user.x += Math.cos(state.user.angle) * step;
      state.user.y += Math.sin(state.user.angle) * step;
    } else if (action === "backward") {
      state.user.x -= Math.cos(state.user.angle) * step;
      state.user.y -= Math.sin(state.user.angle) * step;
    } else if (action === "strafeLeft") {
      state.user.x += Math.cos(state.user.angle - Math.PI / 2) * step;
      state.user.y += Math.sin(state.user.angle - Math.PI / 2) * step;
    } else if (action === "strafeRight") {
      state.user.x += Math.cos(state.user.angle + Math.PI / 2) * step;
      state.user.y += Math.sin(state.user.angle + Math.PI / 2) * step;
    } else if (action === "turnLeft") {
      state.user.angle -= rot;
    } else if (action === "turnRight") {
      state.user.angle += rot;
    }
    state.user.x = Math.max(40, Math.min(WORLD_W - 40, state.user.x));
    state.user.y = Math.max(40, Math.min(WORLD_H - 40, state.user.y));
  }

  dom.simCanvas.addEventListener("click", (e) => {
    const rect = dom.simCanvas.getBoundingClientRect();
    const scale = Math.min(rect.width / WORLD_W, rect.height / WORLD_H);
    const offsetX = (rect.width - WORLD_W * scale) / 2;
    const offsetY = (rect.height - WORLD_H * scale) / 2;
    const wx = (e.clientX - rect.left - offsetX) / scale;
    const wy = (e.clientY - rect.top - offsetY) / scale;

    if (state.tapMode === "aim") {
      state.user.angle = Math.atan2(wy - state.user.y, wx - state.user.x);
      return;
    }

    const kind = dom.objectTypeSelect.value;
    if (kind === "concrete" || kind === "glass" || kind === "fabric" || kind === "overhang" || kind === "curb") {
      const seg = { x1: wx - 42, y1: wy, x2: wx + 42, y2: wy, type: kind };
      state.segments.push(seg);
      state.placedStack.push({ target: "segments", item: seg });
    } else if (kind === "parked_car" || kind === "moving_vehicle") {
      const ent = {
        kind,
        x: wx,
        y: wy,
        w: 94,
        h: 46,
        vx: kind === "moving_vehicle" ? -1.0 : 0,
        vy: 0
      };
      state.entities.push(ent);
      state.placedStack.push({ target: "entities", item: ent });
    } else {
      const ent = {
        kind,
        x: wx,
        y: wy,
        r: 10,
        vx: 0,
        vy: kind === "pedestrian" ? 0.35 : 0,
        minY: Math.max(50, wy - 45),
        maxY: Math.min(WORLD_H - 50, wy + 45)
      };
      state.entities.push(ent);
      state.placedStack.push({ target: "entities", item: ent });
    }
    showToast(`Placed ${MATERIALS[kind].label}`);
  });

  document.querySelector(".nav-tabs").addEventListener("click", (e) => {
    const btn = e.target.closest(".nav-tab");
    if (!btn) return;
    document.querySelectorAll(".nav-tab").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
    if (btn.dataset.tab === "simulator") resizeCanvases();
  });

  document.getElementById("filterPills").addEventListener("click", (e) => {
    const pill = e.target.closest(".filter-pill");
    if (!pill) return;
    document.querySelectorAll(".filter-pill").forEach((p) => p.classList.remove("active"));
    pill.classList.add("active");
    const filter = pill.dataset.filter;
    document.querySelectorAll(".glossary-col").forEach((col) => {
      col.classList.toggle("hidden-col", filter !== "all" && col.dataset.category !== filter);
    });
  });

  document.getElementById("dpadGrid").addEventListener("click", (e) => {
    const btn = e.target.closest(".dpad-btn");
    if (btn) moveUser(btn.dataset.action);
  });

  dom.presetMapSelect.addEventListener("change", (e) => {
    loadPreset(e.target.value);
    showToast(`Loaded ${e.target.options[e.target.selectedIndex].text.replace("Preset Map: ", "")}`);
  });

  dom.audioModeBtn.addEventListener("click", () => {
    ensureAudioContext();
    if (state.audioMode === "both") {
      state.audioMode = "pings";
      dom.audioModeLabel.textContent = "Audio: Pings Only";
    } else if (state.audioMode === "pings") {
      state.audioMode = "off";
      dom.audioModeLabel.textContent = "Audio: OFF";
      dom.audioModeBtn.classList.remove("active-mint");
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    } else {
      state.audioMode = "both";
      dom.audioModeLabel.textContent = "Audio: Pings + Voice";
      dom.audioModeBtn.classList.add("active-mint");
    }
  });

  dom.blindfoldBtn.addEventListener("click", () => {
    state.blindfold = !state.blindfold;
    dom.blindfoldLabel.textContent = `Blindfold Mode: ${state.blindfold ? "ON" : "OFF"}`;
    dom.blindfoldBtn.classList.toggle("active-amber", state.blindfold);
    dom.blindfoldOverlay.classList.toggle("hidden", !state.blindfold);
    if (state.blindfold && state.audioMode === "off") {
      state.audioMode = "both";
      dom.audioModeLabel.textContent = "Audio: Pings + Voice";
      dom.audioModeBtn.classList.add("active-mint");
    }
  });

  dom.tapModeBtn.addEventListener("click", () => {
    state.tapMode = state.tapMode === "aim" ? "place" : "aim";
    dom.tapModeText.textContent = state.tapMode === "aim" ? "Tap: Aim" : "Tap: Place";
    dom.tapModeBtn.classList.toggle("place-mode", state.tapMode === "place");
  });

  dom.undoBtn.addEventListener("click", () => {
    const last = state.placedStack.pop();
    if (!last) return;
    const list = state[last.target];
    const idx = list.indexOf(last.item);
    if (idx !== -1) list.splice(idx, 1);
    showToast("Removed last placed object");
  });

  dom.resetBtn.addEventListener("click", () => {
    loadPreset(state.preset);
    showToast("Scene reset");
  });

  dom.beamSpreadSlider.addEventListener("input", (e) => {
    state.beamSpreadDeg = Number(e.target.value);
    dom.beamSpreadVal.textContent = `${state.beamSpreadDeg}\u00B0`;
  });

  dom.maxRangeSlider.addEventListener("input", (e) => {
    state.maxRangeMeters = Number(e.target.value);
    dom.maxRangeVal.textContent = `${state.maxRangeMeters.toFixed(1)} m`;
  });

  dom.caneArcToggle.addEventListener("change", (e) => {
    state.showCaneArc = e.target.checked;
  });

  window.addEventListener("keydown", (e) => {
    if (["INPUT", "SELECT"].includes(document.activeElement.tagName)) return;
    const action = KEY_ACTIONS[e.key];
    if (action) {
      e.preventDefault();
      moveUser(action);
    }
  });

  function loop(now) {
    stepAndCollectSegments();
    updateTelemetry();

    const distToTarget = Math.hypot(state.user.x - state.target.x, state.user.y - state.target.y);
    if (distToTarget < state.target.r + 16) {
      if (!state.targetReachedNotified) {
        state.targetReachedNotified = true;
        showToast("Target Zone Reached — Safe Clearance Verified");
      }
    } else {
      state.targetReachedNotified = false;
    }

    updateAudio(now);
    renderFloorplan();
    renderSignalGraph();
    requestAnimationFrame(loop);
  }

  loadPreset("hallway");
  resizeCanvases();
  requestAnimationFrame(loop);
})();
