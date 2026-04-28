const { RESOURCES } = require('./gameConstants');

// 19 hexes total
const hexResourceDistribution = [
  ...Array(4).fill(RESOURCES.WOOD),
  ...Array(3).fill(RESOURCES.BRICK),
  ...Array(4).fill(RESOURCES.SHEEP),
  ...Array(4).fill(RESOURCES.WHEAT),
  ...Array(3).fill(RESOURCES.ORE),
  RESOURCES.DESERT
];

// Number tokens (excluding 7)
const numberTokens = [
  2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12
];

// Cube coordinates for a standard 3-radius hex map (19 hexes)
const generateHexCoordinates = () => {
  const coords = [];
  const radius = 2; // Center is 0,0,0. Rings 1 and 2.
  for (let q = -radius; q <= radius; q++) {
    for (let r = Math.max(-radius, -q - radius); r <= Math.min(radius, -q + radius); r++) {
      const s = -q - r;
      coords.push({ q, r, s });
    }
  }
  return coords;
};

// Fisher-Yates shuffle
const shuffle = (array) => {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

const generateBoard = () => {
  const coords = generateHexCoordinates();
  const resources = shuffle(hexResourceDistribution);
  const tokens = shuffle(numberTokens);
  
  return coords.map((coord, index) => {
    const resource = resources[index];
    const numberToken = resource === RESOURCES.DESERT ? null : tokens.pop();
    
    return {
      id: index,
      coord,
      resource,
      numberToken
    };
  });
};

module.exports = { generateBoard, shuffle };