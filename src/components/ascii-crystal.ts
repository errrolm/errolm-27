const columns = 43;
const rows = 29;
const shades = ".:-=+*#%@";
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const shade = (n: number) => shades[Math.round(clamp(n, 0, 1) * (shades.length - 1))];

export function renderCrystal(angle = .55, tilt = -.32) {
  const grid = Array.from({ length: rows }, () => Array<string>(columns).fill(" "));
  const points = [[0, .96, 0], [.72, 0, 0], [0, 0, .72], [-.72, 0, 0], [0, 0, -.72], [0, -.96, 0]].map(([x, y, z]) => {
    const depth = z * Math.cos(angle) - x * Math.sin(angle);
    return [x * Math.cos(angle) + z * Math.sin(angle), y * Math.cos(tilt) - depth * Math.sin(tilt), y * Math.sin(tilt) + depth * Math.cos(tilt)];
  });
  const faces = [[0,2,1], [0,3,2], [0,4,3], [0,1,4], [5,1,2], [5,2,3], [5,3,4], [5,4,1]];
  for (const [first, second, third] of faces) {
    const [ax, ay, az] = points[first], [bx, by, bz] = points[second], [cx, cy, cz] = points[third];
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    const nz = ux * vy - uy * vx;
    if (nz <= 0) continue;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz;
    const light = (-.46 * nx + .5 * ny + .72 * nz) / Math.hypot(nx, ny, nz);
    for (let row = 0; row < rows; row++) {
      const y = (14 - row) / 14 - ay;
      for (let col = 0; col < columns; col++) {
        const x = (col - 21) / 21 - ax;
        const u = (x * vy - y * vx) / nz, v = (ux * y - uy * x) / nz;
        const edge = Math.min(u, v, 1 - u - v);
        if (edge >= -.012) grid[row][col] = shade(.27 + .58 * light + (edge < .045 ? .35 : 0) + ((row + col) % 2) * .08);
      }
    }
  }
  return grid.map((line) => line.join("")).join("\n");
}
