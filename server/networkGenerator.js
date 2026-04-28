const HEX_SIZE = 50;

const hexToPixel = (q, r) => {
  const x = HEX_SIZE * Math.sqrt(3) * (q + r / 2);
  const y = HEX_SIZE * 3 / 2 * r;
  return { x, y };
};

const generateNetwork = (board) => {
  const nodes = [];
  const edges = [];

  const addNode = (x, y, hexId) => {
    let found = nodes.find(n => Math.abs(n.x - x) < 1 && Math.abs(n.y - y) < 1);
    if (!found) {
      found = { id: nodes.length, x, y, hexes: [], occupant: null, buildingType: null };
      nodes.push(found);
    }
    if (!found.hexes.includes(hexId)) found.hexes.push(hexId);
    return found;
  };

  const addEdge = (v1Id, v2Id, hexId) => {
    let found = edges.find(e => 
      (e.v1 === v1Id && e.v2 === v2Id) || (e.v1 === v2Id && e.v2 === v1Id)
    );
    if (!found) {
      found = { id: edges.length, v1: v1Id, v2: v2Id, hexes: [], occupant: null };
      edges.push(found);
    }
    if (!found.hexes.includes(hexId)) found.hexes.push(hexId);
    return found;
  };
  
  board.forEach(hex => {
    const center = hexToPixel(hex.coord.q, hex.coord.r);
    const hexNodeIds = [];
    for (let i = 0; i < 6; i++) {
      const angle_deg = 60 * i - 30;
      const angle_rad = Math.PI / 180 * angle_deg;
      const x = center.x + HEX_SIZE * Math.cos(angle_rad);
      const y = center.y + HEX_SIZE * Math.sin(angle_rad);
      
      const node = addNode(x, y, hex.id);
      hexNodeIds.push(node.id);
    }
    
    // Edges around the hex
    for (let i = 0; i < 6; i++) {
      addEdge(hexNodeIds[i], hexNodeIds[(i + 1) % 6], hex.id);
    }
  });

  // Filter out nodes and edges that only touch Ocean hexes.
  // A valid building node must touch at least one land hex.
  const isLand = (hexId) => board[hexId] && board[hexId].resource !== 'Ocean';
  
  const validNodes = nodes.filter(n => n.hexes.some(isLand));
  const validEdges = edges.filter(e => e.hexes.some(isLand));

  // Remap IDs to ensure they are sequential after filtering
  const nodeIdMap = {};
  const remappedNodes = validNodes.map((n, i) => {
      nodeIdMap[n.id] = i;
      return { ...n, id: i };
  });

  // Also filter edges that might have connected to invalid nodes
  const remappedEdges = validEdges
      .filter(e => nodeIdMap[e.v1] !== undefined && nodeIdMap[e.v2] !== undefined)
      .map((e, i) => ({
          ...e,
          id: i,
          v1: nodeIdMap[e.v1],
          v2: nodeIdMap[e.v2]
      }));

  // Assign port connections to exactly 2 nodes for each port
  board.forEach(hex => {
    if (hex.port) {
      // Find an edge that belongs to this hex and is a valid land edge
      const validEdgeForPort = remappedEdges.find(e => e.hexes.includes(hex.id));
      if (validEdgeForPort) {
        hex.portNodeIds = [validEdgeForPort.v1, validEdgeForPort.v2];
        // Also tag the nodes themselves
        remappedNodes[validEdgeForPort.v1].port = hex.port;
        remappedNodes[validEdgeForPort.v2].port = hex.port;
      }
    }
  });

  return { nodes: remappedNodes, edges: remappedEdges };
};

module.exports = { generateNetwork };