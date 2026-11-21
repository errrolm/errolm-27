type FlightState = "ready" | "flying" | "paused" | "crashed";
const prizeMilestone = 8;
type Spark = { x: number; y: number; vx: number; vy: number; life: number; color: string };

const bestKey = "low-orbit-best";
const shipX = 132;
const ringSpacing = 290;
const firstRing = 330;
const ringRadius = 25;
const bonusRadius = 15;
const shipRadius = 8;
const firstHazard = firstRing + ringSpacing * 2.5;
const hazardSpacing = ringSpacing * 2;
const mineRadius = 17;
const gateHalfWidth = 7;
const gateOpening = 43;
const hazardColor = "#eeac98";
const colors = { ring: "#d6e7b6", ship: "#f3f5e8", shield: "#97d9c4", bonus: "#e3be83" };
const format = (value: number) => value.toLocaleString();

function tunnel(x: number) {
  const progress = Math.min(1, x / 6600);
  return {
    center: 200 + (22 + 41 * progress) * Math.sin((x - shipX) / 210)
      + (11 + 22 * progress) * Math.sin((x - shipX) / 96),
    gap: 124 - 50 * progress + 8 * Math.cos(x / 175),
  };
}

function ringY(x: number) {
  const progress = Math.min(1, x / 3800);
  return tunnel(x).center + Math.sin((x - firstRing) / 165) * 33 * progress;
}

function bonusY(x: number) {
  const index = (x - firstRing) / ringSpacing;
  if (index % 3 !== 2) return null;
  const { center, gap } = tunnel(x);
  const side = ringY(x) < center ? 1 : -1;
  return center + side * (gap - 24);
}

function hazardAt(index: number, flightTime: number) {
  const x = firstHazard + index * hazardSpacing;
  const { center, gap } = tunnel(x);
  const gate = index % 2 === 1;
  const y = gate
    ? center + Math.sin(flightTime * 1.65 + index) * Math.min(33, gap - gateOpening - 14)
    : center + (index % 4 === 0 ? -23 : 23);
  return { x, y, gate, top: center - gap, bottom: center + gap };
}

function getBest() {
  try {
    const saved = Number(localStorage.getItem(bestKey));
    return Number.isSafeInteger(saved) && saved > 0 ? saved : 0;
  } catch {
    return 0;
  }
}

export function mountLowOrbit(dialog: HTMLDialogElement, opener: HTMLButtonElement) {
  const canvas = dialog.querySelector("canvas")!;
  const context = canvas.getContext("2d");
  if (!context) return;
  const ctx = context;

  const launch = dialog.querySelector<HTMLButtonElement>("[data-launch]")!;
  const pauseButton = dialog.querySelector<HTMLButtonElement>("[data-pause]")!;
  const boostButton = dialog.querySelector<HTMLButtonElement>("[data-boost]")!;
  const menu = dialog.querySelector<HTMLElement>(".flight-menu")!;
  const prize = menu.querySelector<HTMLElement>("[data-prize]")!;
  const result = dialog.querySelector<HTMLElement>("[data-result]")!;
  const scoreLabel = dialog.querySelector<HTMLElement>("[data-score]")!;
  const chainLabel = dialog.querySelector<HTMLElement>("[data-chain]")!;
  const shieldLabel = dialog.querySelector<HTMLElement>("[data-shield]")!;
  const { width, height } = canvas;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const keys = new Set<string>();
  const sparks: Spark[] = [];
  const stars = Array.from({ length: 89 }, (_, i) => ({
    x: (i * 151.7) % width,
    y: (i * 79.3) % height,
    layer: i % 3,
  }));

  let state: FlightState = "ready";
  let pointer: number | null = null;
  let frame = 0;
  let last = 0;
  let best = getBest();
  let y = 200;
  let velocity = 0;
  let distance = 0;
  let flightTime = 0;
  let fuel = 2;
  let boostTime = 0;
  let smashed = 0;
  let brokenHazard = -1;
  let nextHazard = 0;
  let nextRing = firstRing;
  let points = 0;
  let chain = 0;
  let bonusCollected = 0;
  let longestChain = 0;
  let charge = 0;
  let recovery = 0;
  let callout = "";
  let calloutTime = 0;

  const thrusting = () => keys.size > 0 || pointer !== null;
  const score = () => Math.floor(distance / 10) + points;

  function clearInput() {
    keys.clear();
    const previous = pointer;
    pointer = null;
    if (previous !== null && canvas.hasPointerCapture(previous)) canvas.releasePointerCapture(previous);
  }

  function updateHud() {
    boostButton.disabled = fuel < 2 || boostTime > 0;
    const boostLabel = boostTime > 0 ? "Boosting" : fuel === 2 ? "Boost" : `Boost ${fuel}/2`;
    if (boostButton.textContent !== boostLabel) boostButton.textContent = boostLabel;
    const scoreText = format(score());
    const chainText = String(chain);
    const shieldText = charge === 3 ? "Ready" : charge + "/3";
    if (scoreLabel.textContent !== scoreText) scoreLabel.textContent = scoreText;
    if (chainLabel.textContent !== chainText) chainLabel.textContent = chainText;
    if (shieldLabel.textContent !== shieldText) shieldLabel.textContent = shieldText;
  }

  function burst(x: number, y: number, color: string) {
    if (reducedMotion.matches) return;
    for (let i = 0; i < 14; i++) {
      const angle = i * Math.PI * 2 / 14;
      const speed = 32 + (i % 5) * 18;
      sparks.push({ x, y, color, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: .55 });
    }
  }

  function drawWall(side: number) {
    const edge = side < 0 ? 0 : height;
    for (const inset of [0, 20, 45]) {
      ctx.beginPath();
      ctx.moveTo(0, edge);
      for (let x = 0; x <= width; x += 4) {
        const wall = tunnel(distance + x);
        ctx.lineTo(x, wall.center + side * (wall.gap + inset));
      }
      ctx.lineTo(width, edge);
      ctx.closePath();
      ctx.fillStyle = inset === 0 ? "#23372d" : inset === 20 ? "#192920" : "#121e17";
      ctx.fill();
      if (inset === 0) {
        ctx.strokeStyle = "#678d76";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  }

  function drawRing(world: number, y: number, bonus = false) {
    const x = world - distance;
    const radius = bonus ? bonusRadius : ringRadius;
    const color = bonus ? colors.bonus : colors.ring;
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = world === nextRing ? 1 : .55;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, bonus ? 9 : 11, radius, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = color;
    if (bonus) {
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-3, -3, 6, 6);
    } else {
      ctx.fillRect(-2, -radius - 3, 4, 5);
      ctx.fillRect(-2, radius - 2, 4, 5);
    }
    ctx.restore();
  }

  function drawShip() {
    ctx.save();
    ctx.translate(shipX, y);
    if (charge === 3 || recovery > 0) {
      ctx.strokeStyle = colors.shield;
      ctx.globalAlpha = charge === 3 ? .85 : Math.min(.85, recovery);
      ctx.beginPath();
      ctx.arc(0, 0, 20, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.rotate(Math.atan2(velocity, 340));
    if (boostTime > 0) {
      ctx.fillStyle = "#b9ded6";
      ctx.beginPath();
      ctx.moveTo(-7, -5);
      ctx.lineTo(-48, 0);
      ctx.lineTo(-7, 5);
      ctx.fill();
    }
    ctx.fillStyle = colors.shield;
    ctx.beginPath();
    ctx.moveTo(-10, -3);
    ctx.lineTo(thrusting() ? -31 : -19, 0);
    ctx.lineTo(-10, 3);
    ctx.fill();
    ctx.fillStyle = colors.ship;
    ctx.beginPath();
    ctx.moveTo(15, 0);
    ctx.lineTo(-11, -8);
    ctx.lineTo(-7, 0);
    ctx.lineTo(-11, 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawHazard(hazard: ReturnType<typeof hazardAt>) {
    const x = hazard.x - distance;
    const { y, top, bottom } = hazard;
    ctx.save();
    ctx.strokeStyle = hazardColor;
    ctx.fillStyle = "#502e2a";
    ctx.lineWidth = 2;
    if (hazard.gate) {
      for (const [start, end] of [[top, y - gateOpening], [y + gateOpening, bottom]]) {
        ctx.fillRect(x - gateHalfWidth, start, gateHalfWidth * 2, end - start);
        ctx.strokeRect(x - gateHalfWidth, start, gateHalfWidth * 2, end - start);
      }
      ctx.fillStyle = hazardColor;
      for (const edge of [y - gateOpening, y + gateOpening]) ctx.fillRect(x - 14, edge - 1, 28, 2);
    } else {
      ctx.translate(x, y);
      ctx.beginPath();
      for (let i = 0; i < 16; i++) {
        const angle = i * Math.PI / 8;
        const radius = i % 2 ? 11 : mineRadius;
        ctx.lineTo(radius * Math.cos(angle), radius * Math.sin(angle));
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = hazardColor;
      ctx.fillRect(-3, -3, 6, 6);
    }
    ctx.restore();
  }

  function draw() {
    ctx.fillStyle = "#0c110e";
    ctx.fillRect(0, 0, width, height);
    for (const star of stars) {
      const x = ((star.x - distance * (.1 + .12 * star.layer)) % width + width) % width;
      ctx.fillStyle = ["#283b30", "#3b5142", "#597061"][star.layer];
      ctx.fillRect(x, star.y, star.layer === 2 ? 2 : 1, 1);
    }
    drawWall(-1);
    drawWall(1);
    for (let index = Math.max(0, nextHazard - 1); firstHazard + index * hazardSpacing < distance + width + 24; index++) {
      if (index !== brokenHazard) drawHazard(hazardAt(index, flightTime));
    }
    for (let world = nextRing; world < distance + width + 40; world += ringSpacing) {
      drawRing(world, ringY(world));
      const bonus = bonusY(world);
      if (bonus !== null) drawRing(world, bonus, true);
    }
    for (const spark of sparks) {
      ctx.globalAlpha = Math.min(1, spark.life * 3);
      ctx.fillStyle = spark.color;
      ctx.fillRect(spark.x, spark.y, 3, 2);
    }
    ctx.globalAlpha = 1;
    drawShip();
    if (calloutTime > 0) {
      ctx.globalAlpha = Math.min(1, calloutTime * 3);
      ctx.fillStyle = colors.ship;
      ctx.font = "600 20px monospace";
      ctx.textAlign = "center";
      ctx.fillText(callout, width / 2, 34);
      ctx.textAlign = "start";
      ctx.globalAlpha = 1;
    }
  }

  function showMenu(nextState: FlightState, message: string, action: string) {
    state = nextState;
    cancelAnimationFrame(frame);
    clearInput();
    pauseButton.hidden = true;
    boostButton.hidden = true;
    result.textContent = message;
    launch.textContent = action;
    menu.hidden = false;
    prize.hidden = nextState !== "crashed" || nextHazard < prizeMilestone;
    draw();
    launch.focus();
  }

  function finish(reason: string) {
    const total = score();
    const record = total > best;
    best = Math.max(total, best);
    if (record) {
      try { localStorage.setItem(bestKey, String(best)); } catch { /* Keep the record for this visit. */ }
    }
    showMenu("crashed", [
      reason,
      format(total) + " points",
      longestChain + " best chain",
      bonusCollected + " gold",
      smashed + " smashed",
      record ? "New best" : "Best " + format(best),
    ].join(" · "), "Fly again");
  }

  function crossRing() {
    const target = ringY(nextRing);
    const bonus = bonusY(nextRing);
    const gold = bonus !== null && Math.abs(y - bonus) <= bonusRadius;
    if (gold || Math.abs(y - target) <= ringRadius) {
      fuel = Math.min(2, fuel + 1);
      chain++;
      longestChain = Math.max(longestChain, chain);
      if (gold) bonusCollected++;
      const multiplier = Math.min(chain, 5);
      const earned = (gold ? 250 : 100) * multiplier;
      points += earned;
      if (charge < 3) charge++;
      const shieldEarned = charge === 3 && chain === 3;
      callout = gold ? "+" + earned + " gold" + (shieldEarned ? " · shield ready" : "")
        : shieldEarned ? "Shield ready" : "+" + earned;
      calloutTime = 1.05;
      burst(nextRing - distance, gold ? bonus : target, gold ? colors.bonus : shieldEarned ? colors.shield : colors.ring);
    } else {
      chain = 0;
      if (charge < 3) charge = 0;
    }
    nextRing += ringSpacing;
  }

  function tick(now: number) {
    if (state !== "flying") return;
    const dt = Math.min((now - last) / 1000, .035);
    last = now;
    flightTime += dt;
    const boosting = boostTime > 0;
    boostTime = Math.max(0, boostTime - dt);
    const speed = (175 + Math.min(119, distance / 55)) * (boosting ? 1.65 : 1);
    distance += speed * dt;
    velocity = Math.max(-173, Math.min(173, velocity + (thrusting() ? -425 : 300) * dt));
    y += velocity * dt;
    const world = distance + shipX;
    const wall = tunnel(world);
    recovery = Math.max(0, recovery - dt);
    calloutTime = Math.max(0, calloutTime - dt);
    if (world >= nextRing) crossRing();

    const hazard = hazardAt(nextHazard, flightTime);
    const dx = world - hazard.x;
    const dy = y - hazard.y;
    const obstacleHit = hazard.gate
      ? Math.abs(dx) < gateHalfWidth + shipRadius && Math.abs(dy) > gateOpening - shipRadius
      : Math.hypot(dx, dy) < mineRadius + shipRadius;
    const wallHit = Math.abs(y - wall.center) + shipRadius >= wall.gap;
    if (dx > mineRadius + shipRadius) nextHazard++;

    if (boosting && obstacleHit && !wallHit) {
      brokenHazard = nextHazard++;
      smashed++;
      points += 400;
      burst(hazard.x - distance, y, hazardColor);
      callout = "Smashed +400";
      calloutTime = 1;
    } else if ((wallHit || obstacleHit) && recovery === 0) {
      if (charge === 3) {
        charge = 0;
        chain = 0;
        recovery = .65;
        callout = "Shield spent";
        calloutTime = 1.05;
        burst(shipX, y, colors.shield);
        y = hazard.gate && obstacleHit ? hazard.y : wall.center;
        velocity = 0;
      } else {
        updateHud();
        finish(wallHit ? "Wall hit" : hazard.gate ? "Gate hit" : "Mine hit");
        return;
      }
    } else if (wallHit) {
      y = Math.min(wall.center + wall.gap - shipRadius, Math.max(wall.center - wall.gap + shipRadius, y));
      velocity = 0;
    }

    for (let i = sparks.length - 1; i >= 0; i--) {
      const spark = sparks[i];
      spark.life -= dt;
      spark.x += (spark.vx - speed * .35) * dt;
      spark.y += spark.vy * dt;
      if (spark.life <= 0) sparks.splice(i, 1);
    }
    updateHud();
    draw();
    frame = requestAnimationFrame(tick);
  }

  function reset() {
    fuel = 2;
    boostTime = smashed = 0;
    brokenHazard = -1;
    clearInput();
    y = 200;
    velocity = distance = points = chain = charge = recovery = calloutTime = 0;
    longestChain = bonusCollected = flightTime = nextHazard = 0;
    nextRing = firstRing;
    sparks.length = 0;
    updateHud();
  }

  function fly() {
    if (state === "flying") return;
    if (state !== "paused") reset();
    prize.hidden = true;
    state = "flying";
    menu.hidden = true;
    pauseButton.hidden = false;
    boostButton.hidden = false;
    canvas.focus();
    last = performance.now();
    frame = requestAnimationFrame(tick);
  }

  function pause() {
    if (state === "flying") showMenu("paused", "Flight paused", "Resume");
  }

  opener.addEventListener("click", () => {
    if (dialog.open) return;
    reset();
    dialog.showModal();
    showMenu("ready", "Best " + format(best), "Launch");
  });
  launch.addEventListener("click", fly);
  pauseButton.addEventListener("click", pause);
  function boost() {
    if (state !== "flying" || fuel < 2 || boostTime > 0) return;
    fuel = 0;
    boostTime = .65;
    canvas.focus({preventScroll:true});
    updateHud();
  }
  boostButton.addEventListener("pointerdown", event => event.preventDefault());
  boostButton.addEventListener("click", boost);
  dialog.addEventListener("keydown", (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.code === "KeyB" && !event.repeat) boost();
    if (event.code === "KeyP" && (state === "flying" || state === "paused")) {
      event.preventDefault();
      if (!event.repeat) state === "flying" ? pause() : fly();
    }
    if (event.code === "KeyR" && state === "crashed" && !event.repeat) {
      event.preventDefault();
      fly();
    }
    if (state === "flying" && event.target === canvas && ["Space", "ArrowUp"].includes(event.code)) {
      event.preventDefault();
      keys.add(event.code);
    }
  });
  window.addEventListener("keyup", (event) => keys.delete(event.code));
  canvas.addEventListener("blur", clearInput);
  canvas.addEventListener("pointerdown", (event) => {
    if (state !== "flying" || pointer !== null || event.button !== 0) return;
    pointer = event.pointerId;
    canvas.setPointerCapture(pointer);
  });
  for (const name of ["pointerup", "pointercancel", "lostpointercapture"] as const) {
    canvas.addEventListener(name, (event) => {
      if (event.pointerId === pointer) pointer = null;
    });
  }
  window.addEventListener("blur", pause);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pause();
  });
  dialog.addEventListener("close", () => {
    state = "ready";
    cancelAnimationFrame(frame);
    clearInput();
    opener.focus();
  });
}
