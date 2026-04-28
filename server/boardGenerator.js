const { RESOURCES, INITIAL_PORTS } = require('./gameConstants');

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

// Cube coordinates for a standard 2-radius hex map (19 hexes)
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

// Generates the ring of 18 ocean hexes surrounding the main board (radius 3)
const generateOceanHexCoordinates = () => {
  const coords = [];
  let q = 0, r = -3;
  const directions = [
    [1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]
  ];
  let dirIdx = 0;
  for (let i = 0; i < 18; i++) {
    const s = -q - r;
    coords.push({ q, r, s, isPort: i % 2 === 0 });
    
    let nextQ = q + directions[dirIdx][0];
    let nextR = r + directions[dirIdx][1];
    if (Math.max(Math.abs(nextQ), Math.abs(nextR), Math.abs(-nextQ - nextR)) > 3) {
      dirIdx++;
      nextQ = q + directions[dirIdx][0];
      nextR = r + directions[dirIdx][1];
    }
    q = nextQ;
    r = nextR;
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
  
  const board = coords.map((coord, index) => {
    const resource = resources[index];
    const numberToken = resource === RESOURCES.DESERT ? null : tokens.pop();
    
    return {
      id: index,
      coord,
      resource,
      numberToken,
      port: null
    };
  });

  const oceanCoords = generateOceanHexCoordinates();
  const ports = shuffle(INITIAL_PORTS);
  
  oceanCoords.forEach((oceanCoord) => {
     board.push({
       id: board.length,
       coord: { q: oceanCoord.q, r: oceanCoord.r, s: oceanCoord.s },
       resource: RESOURCES.OCEAN,
       numberToken: null,
       port: oceanCoord.isPort ? ports.pop() : null
     });
  });

  return board;
};

module.exports = { generateBoard, shuffle };