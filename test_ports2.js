const { generateBoard } = require('./server/boardGenerator');
const { generateNetwork } = require('./server/networkGenerator');

const board = generateBoard();
const { nodes, edges } = generateNetwork(board);

const portHexes = board.filter(h => h.port !== null);

portHexes.forEach(ph => {
    // Find all valid nodes that are part of this ocean hex
    const hexNodes = nodes.filter(n => n.hexes.includes(ph.id));
    console.log(`Port ${ph.port} at hex ${ph.id} has ${hexNodes.length} valid nodes.`);
    // A port should connect to exactly 2 nodes (1 edge).
    // Let's check the edges that are shared between this ocean hex and a land hex.
    const landHexes = board.filter(h => h.resource !== 'Ocean');
    
    // Let's find edges where one hex is ph and the other is a land hex.
    // Actually, networkGenerator.js didn't keep ocean hexes in edges?
    // Let's check networkGenerator.js: `const validEdges = edges.filter(e => e.hexes.some(isLand));`
    // Yes, valid edges keep all hexIds they had.
});

