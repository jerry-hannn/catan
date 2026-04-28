const HEX_SIZE = 50;
const hexToPixel = (q, r) => {
  const x = HEX_SIZE * Math.sqrt(3) * (q + r / 2);
  const y = HEX_SIZE * 3 / 2 * r;
  return { x, y };
};
const getHexVertices = (q, r) => {
  const center = hexToPixel(q, r);
  const vertices = [];
  for (let i = 0; i < 6; i++) {
    const angle_deg = 60 * i - 30;
    const angle_rad = Math.PI / 180 * angle_deg;
    const x = center.x + HEX_SIZE * Math.cos(angle_rad);
    const y = center.y + HEX_SIZE * Math.sin(angle_rad);
    vertices.push({ x, y });
  }
  return vertices;
};

const v1 = getHexVertices(0, 0); // Center
const v2 = getHexVertices(1, 0); // Right
console.log("v1[0] (top right):", v1[0]);
console.log("v1[1] (bottom right):", v1[1]);
console.log("v2[3] (top left):", v2[3]);
console.log("v2[4] (bottom left):", v2[4]);

// Can we use a fuzzy map?
const nodes = [];
const addNode = (x, y, hexId) => {
    let found = nodes.find(n => Math.abs(n.x - x) < 1 && Math.abs(n.y - y) < 1);
    if (!found) {
        found = { id: nodes.length, x, y, hexes: [] };
        nodes.push(found);
    }
    if (!found.hexes.includes(hexId)) found.hexes.push(hexId);
    return found;
};

v1.forEach(v => addNode(v.x, v.y, 0));
v2.forEach(v => addNode(v.x, v.y, 1));
console.log("Total nodes:", nodes.length, "(expected 10 since 2 are shared)");

