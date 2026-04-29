const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const cors = require('cors');
const { generateBoard, shuffle } = require('./boardGenerator');
const { generateNetwork } = require('./networkGenerator');
const { INITIAL_DEV_CARDS } = require('./gameConstants');

const app = express();
app.use(cors());

// Serve static files from the React app
app.use(express.static(path.join(__dirname, '../client/dist')));

app.get('/health', (req, res) => {
  res.send('Catan backend is live and running!');
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const ObjectColors = ['#e63946', '#457b9d', '#f4a261', '#2a9d8f', '#8338ec', '#ffb703'];

const createInitialGameState = () => {
  const board = generateBoard();
  const network = generateNetwork(board);
  return {
    board,
    nodes: network.nodes,
    edges: network.edges,
    players: [],
    turnOrder: [],
    setupTurnQueue: [],
    currentTurnIndex: 0,
    setupState: { settlementPlaced: false, roadPlaced: false, lastSettlementNodeId: null },
    hasRolled: false,
    mustMoveRobber: false,
    discardingPlayers: [],
    lastRoll: null,
    tradeProposal: null,
    robberHexId: board.find(h => h.resource === 'Desert')?.id || 0,
    phase: 'LOBBY',
    devCards: shuffle([...INITIAL_DEV_CARDS]),
    longestRoadPlayer: null,
    largestArmyPlayer: null,
    hasPlayedDevCard: false,
    freeRoadsCount: 0
  };
};

let gameState = createInitialGameState();

const checkWinner = () => {
  const winner = gameState.players.find(p => p.vp >= 10);
  if (winner) {
    gameState.phase = 'GAME_OVER';
  }
};

const createLCG = (seed) => {
  let s = Math.floor(seed * 4294967296);
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
};

const runDicePhysics = (seed, width, height) => {
  const lcg = createLCG(seed);
  const mainX = 320;
  const mainWidth = width - 320;
  
  let dice = [
    { x: mainX + mainWidth/2 - 80, y: height + 100, vx: (lcg() - 0.5) * 40, vy: -40 - lcg() * 20, rx: lcg() * 360, ry: lcg() * 360, rz: lcg() * 360, vrx: lcg() * 20, vry: lcg() * 20, vrz: lcg() * 20 },
    { x: mainX + mainWidth/2 + 80, y: height + 100, vx: (lcg() - 0.5) * 40, vy: -40 - lcg() * 20, rx: lcg() * 360, ry: lcg() * 360, rz: lcg() * 360, vrx: lcg() * 20, vry: lcg() * 20, vrz: lcg() * 20 }
  ];

  const duration = 2000;
  const dt = 16.67; 
  const steps = Math.floor(duration / dt);

  for (let i = 0; i < steps; i++) {
    dice = dice.map(d => {
      let { x, y, vx, vy, rx, ry, rz, vrx, vry, vrz } = d;
      
      // Basic Physics
      x += vx;
      y += vy;
      vy += 1.2; // Gravity
      rx += vrx;
      ry += vry;
      rz += vrz;

      // Friction
      vx *= 0.99;
      vy *= 0.99;
      
      // Alignment Torque (settling logic)
      // When near ground and slow, pull toward nearest 90deg
      if (y > height - 120 && Math.abs(vy) < 5) {
        const getTorque = (angle) => {
          const target = Math.round(angle / 90) * 90;
          return (target - angle) * 0.1;
        };
        vrx += getTorque(rx);
        vry += getTorque(ry);
        vrz += getTorque(rz);
        // Higher friction during settling
        vrx *= 0.94;
        vry *= 0.94;
        vrz *= 0.94;
      } else {
        vrx *= 0.98;
        vry *= 0.98;
        vrz *= 0.98;
      }

      // Bounds
      if (x < mainX + 50 || x > width - 50) vx *= -0.7;
      if (y < 50) vy *= -0.7;
      if (y > height - 100) {
        y = height - 100;
        vy *= -0.6;
        vx *= 0.8;
      }
      return { ...d, x, y, vx, vy, rx, ry, rz, vrx, vry, vrz };
    });

    // Collision
    const dx = dice[0].x - dice[1].x;
    const dy = dice[0].y - dice[1].y;
    const dist = Math.sqrt(dx*dx + dy*dy);
    if (dist < 100) {
      const tempVx = dice[0].vx;
      const tempVy = dice[0].vy;
      dice[0].vx = dice[1].vx * 0.8;
      dice[0].vy = dice[1].vy * 0.8;
      dice[1].vx = tempVx * 0.8;
      dice[1].vy = tempVy * 0.8;
      const overlap = 100 - dist;
      dice[0].x += (dx / dist) * overlap / 2;
      dice[0].y += (dy / dist) * overlap / 2;
      dice[1].x -= (dx / dist) * overlap / 2;
      dice[1].y -= (dy / dist) * overlap / 2;
    }
  }

  const rotateVector = (v, rx, ry, rz) => {
    const radX = rx * Math.PI / 180;
    const radY = ry * Math.PI / 180;
    const radZ = rz * Math.PI / 180;

    let { x, y, z } = { x: v[0], y: v[1], z: v[2] };

    // CSS applies transform: rotateX rotateY rotateZ in reverse order to the point (Z, then Y, then X)
    
    // 1. Rotate Z
    let nx = x * Math.cos(radZ) - y * Math.sin(radZ);
    let ny = x * Math.sin(radZ) + y * Math.cos(radZ);
    x = nx; y = ny;

    // 2. Rotate Y
    nx = x * Math.cos(radY) + z * Math.sin(radY);
    let nz = -x * Math.sin(radY) + z * Math.cos(radY);
    x = nx; z = nz;

    // 3. Rotate X
    ny = y * Math.cos(radX) - z * Math.sin(radX);
    nz = y * Math.sin(radX) + z * Math.cos(radX);
    y = ny; z = nz;

    return [x, y, z];
  };

  const getFace = (rx, ry, rz) => {
    // 6 local face vectors matching CSS 3D coordinate system (Y is DOWN)
    const faces = [
      { id: 1, v: [0, 0, 1] },   // Front (+Z)
      { id: 6, v: [0, 0, -1] },  // Back (-Z)
      { id: 2, v: [0, -1, 0] },  // Top (-Y)
      { id: 5, v: [0, 1, 0] },   // Bottom (+Y)
      { id: 3, v: [1, 0, 0] },   // Right (+X)
      { id: 4, v: [-1, 0, 0] }   // Left (-X)
    ];

    let maxZ = -Infinity;
    let bestFace = 1;

    faces.forEach(f => {
      const rotated = rotateVector(f.v, rx, ry, rz);
      // The face pointing most directly at the user (+Z in camera space) is the visible one
      if (rotated[2] > maxZ) {
        maxZ = rotated[2];
        bestFace = f.id;
      }
    });

    return bestFace;
  };

  const d1 = getFace(dice[0].rx, dice[0].ry, dice[0].rz);
  const d2 = getFace(dice[1].rx, dice[1].ry, dice[1].rz);
  
  return { d1, d2, dice };
};

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);
  socket.emit('gameStateUpdate', gameState);

  socket.on('join_game', ({ name, color }) => {
    if (gameState.phase !== 'LOBBY') return socket.emit('error', 'Game already started');
    if (gameState.players.length >= 4) return socket.emit('error', 'Game full');

    if (!gameState.players.find(p => p.id === socket.id)) {
      const assignedColor = color || ObjectColors[gameState.players.length % ObjectColors.length];
      gameState.players.push({
        id: socket.id,
        name: name || `Player ${gameState.players.length + 1}`,
        color: assignedColor,
        resources: { Wood: 0, Brick: 0, Sheep: 0, Wheat: 0, Ore: 0 },
        devCards: [],
        vp: 0,
        settlementCount: 0,
        cityCount: 0,
        vpCardCount: 0,
        longestRoad: 0,
        knightsPlayed: 0
      });
      gameState.turnOrder.push(socket.id);
      io.emit('gameStateUpdate', gameState);
    }
  });

  socket.on('start_game', () => {
    if (gameState.phase !== 'LOBBY' || gameState.players.length === 0) return;
    
    gameState.phase = 'INITIAL_SETUP';
    const forward = [...gameState.turnOrder];
    const backward = [...gameState.turnOrder].reverse();
    gameState.setupTurnQueue = [...forward, ...backward];
    gameState.currentTurnIndex = 0;
    gameState.setupState = { settlementPlaced: false, roadPlaced: false, lastSettlementNodeId: null };
    
    io.emit('gameStateUpdate', gameState);
  });

  socket.on('build_settlement', ({ nodeId }) => {
    const activePlayerId = gameState.phase === 'INITIAL_SETUP' 
      ? gameState.setupTurnQueue[gameState.currentTurnIndex] 
      : gameState.turnOrder[gameState.currentTurnIndex];
      
    if (socket.id !== activePlayerId) return;
    const p = gameState.players.find(p => p.id === activePlayerId);
    if (!p) return;

    if (gameState.phase === 'INITIAL_SETUP' && gameState.setupState.settlementPlaced) return;
    if (gameState.phase === 'MAIN' && (p.resources.Wood < 1 || p.resources.Brick < 1 || p.resources.Wheat < 1 || p.resources.Sheep < 1)) {
      return socket.emit('error', 'Not enough resources');
    }

    const node = gameState.nodes.find(n => n.id === nodeId);
    if (!node || node.occupant) return;

    const adjNodes = gameState.edges.filter(e => e.v1 === nodeId || e.v2 === nodeId).map(e => e.v1 === nodeId ? e.v2 : e.v1);
    if (adjNodes.some(id => gameState.nodes.find(n => n.id === id).occupant)) {
      return socket.emit('error', 'Too close to another settlement');
    }

    if (gameState.phase === 'MAIN' && !gameState.edges.some(e => (e.v1 === nodeId || e.v2 === nodeId) && e.occupant === activePlayerId)) {
      return socket.emit('error', 'Must connect to a road');
    }

    node.occupant = activePlayerId;
    node.buildingType = 'Settlement';
    p.vp += 1;
    p.settlementCount += 1;
    checkWinner();

    if (gameState.phase === 'INITIAL_SETUP') {
      gameState.setupState.settlementPlaced = true;
      gameState.setupState.lastSettlementNodeId = nodeId;
      if (gameState.currentTurnIndex >= gameState.turnOrder.length) {
        node.hexes.forEach(hId => {
          const hex = gameState.board[hId];
          if (hex && hex.resource !== 'Ocean' && hex.resource !== 'Desert') p.resources[hex.resource] += 1;
        });
      }
    } else {
      p.resources.Wood -= 1; p.resources.Brick -= 1; p.resources.Wheat -= 1; p.resources.Sheep -= 1;
    }
    evaluateSpecialConditions();
    io.emit('gameStateUpdate', gameState);
  });

  socket.on('build_road', ({ edgeId }) => {
    const activePlayerId = gameState.phase === 'INITIAL_SETUP' 
      ? gameState.setupTurnQueue[gameState.currentTurnIndex] 
      : gameState.turnOrder[gameState.currentTurnIndex];
      
    if (socket.id !== activePlayerId) return;
    const p = gameState.players.find(p => p.id === activePlayerId);
    if (!p) return;

    if (gameState.phase === 'INITIAL_SETUP' && (!gameState.setupState.settlementPlaced || gameState.setupState.roadPlaced)) return;
    if (gameState.phase === 'MAIN' && gameState.freeRoadsCount === 0 && (p.resources.Wood < 1 || p.resources.Brick < 1)) {
      return socket.emit('error', 'Not enough resources');
    }

    const edge = gameState.edges.find(e => e.id === edgeId);
    if (!edge || edge.occupant) return;

    if (gameState.phase === 'INITIAL_SETUP') {
      if (edge.v1 !== gameState.setupState.lastSettlementNodeId && edge.v2 !== gameState.setupState.lastSettlementNodeId) {
        return socket.emit('error', 'Must connect to the settlement just placed');
      }
    } else {
      const connected = gameState.nodes.some(n => (n.id === edge.v1 || n.id === edge.v2) && n.occupant === activePlayerId) ||
                        gameState.edges.some(e => (e.v1 === edge.v1 || e.v2 === edge.v1 || e.v1 === edge.v2 || e.v2 === edge.v2) && e.occupant === activePlayerId);
      if (!connected) return socket.emit('error', 'Must connect to your network');
    }

    edge.occupant = activePlayerId;
    if (gameState.phase === 'INITIAL_SETUP') {
      gameState.setupState.roadPlaced = true;
      gameState.currentTurnIndex++;
      gameState.setupState = { settlementPlaced: false, roadPlaced: false, lastSettlementNodeId: null };
      if (gameState.currentTurnIndex >= gameState.setupTurnQueue.length) {
        gameState.phase = 'MAIN';
        gameState.currentTurnIndex = 0;
      }
    } else {
      if (gameState.freeRoadsCount > 0) gameState.freeRoadsCount--;
      else { p.resources.Wood -= 1; p.resources.Brick -= 1; }
    }
    evaluateSpecialConditions();
    io.emit('gameStateUpdate', gameState);
  });

  socket.on('build_city', ({ nodeId }) => {
    if (gameState.phase !== 'MAIN') return;
    const p = gameState.players.find(p => p.id === socket.id);
    if (!p || p.resources.Wheat < 2 || p.resources.Ore < 3) return socket.emit('error', 'Not enough resources');
    const node = gameState.nodes.find(n => n.id === nodeId);
    if (!node || node.occupant !== socket.id || node.buildingType !== 'Settlement') return;
    node.buildingType = 'City';
    p.vp += 1;
    p.cityCount += 1;
    p.settlementCount -= 1;
    checkWinner();
    p.resources.Wheat -= 2; p.resources.Ore -= 3;
    io.emit('gameStateUpdate', gameState);
  });

  socket.on('roll_dice', () => {
    if (gameState.phase !== 'MAIN' || gameState.hasRolled || socket.id !== gameState.turnOrder[gameState.currentTurnIndex]) return;
    
    const physicsSeed = Math.random();
    // Deterministic simulation (assume 1920x1080 viewport for headless consistency)
    const { d1, d2 } = runDicePhysics(physicsSeed, 1920, 1080);
    const roll = d1 + d2;
    
    gameState.hasRolled = true;
    gameState.lastRoll = { d1, d2, roll };
    
    // Broadcast the seed so clients can run the same animation
    io.emit('dice_rolled_start', { physicsSeed, result: { d1, d2, roll } });

    if (roll === 7) {
      gameState.players.forEach(player => {
        const total = Object.values(player.resources).reduce((a, b) => a + b, 0);
        if (total > 7) gameState.discardingPlayers.push({ id: player.id, count: Math.floor(total / 2) });
      });
      if (gameState.discardingPlayers.length === 0) gameState.mustMoveRobber = true;
    } else {
      gameState.board.filter(h => h.numberToken === roll && h.id !== gameState.robberHexId).forEach(hex => {
        gameState.nodes.filter(n => n.hexes.includes(hex.id) && n.occupant).forEach(node => {
          const player = gameState.players.find(p => p.id === node.occupant);
          player.resources[hex.resource] += (node.buildingType === 'City' ? 2 : 1);
        });
      });
    }
    io.emit('gameStateUpdate', gameState);
  });

  socket.on('discard_cards', ({ resourcesToDiscard }) => {
    const playerIndex = gameState.discardingPlayers.findIndex(p => p.id === socket.id);
    if (playerIndex === -1) return;

    const player = gameState.players.find(p => p.id === socket.id);
    const requiredCount = gameState.discardingPlayers[playerIndex].count;
    
    // Validate count
    const totalDiscarded = Object.values(resourcesToDiscard).reduce((a, b) => a + b, 0);
    if (totalDiscarded !== requiredCount) return socket.emit('error', `Must discard exactly ${requiredCount} cards`);

    // Validate resource availability
    for (const res in resourcesToDiscard) {
      if (player.resources[res] < resourcesToDiscard[res]) return socket.emit('error', 'Not enough resources');
    }

    // Deduct resources
    for (const res in resourcesToDiscard) {
      player.resources[res] -= resourcesToDiscard[res];
    }

    // Remove from discarding list
    gameState.discardingPlayers.splice(playerIndex, 1);

    // If all done, trigger robber movement
    if (gameState.discardingPlayers.length === 0) {
      gameState.mustMoveRobber = true;
    }
    
    io.emit('gameStateUpdate', gameState);
  });

  socket.on('move_robber', ({ hexId, victimId }) => {
    if (!gameState.mustMoveRobber || socket.id !== gameState.turnOrder[gameState.currentTurnIndex]) return;
    const hex = gameState.board.find(h => h.id === hexId);
    if (!hex || hex.resource === 'Ocean' || hexId === gameState.robberHexId) return;
    gameState.robberHexId = hexId;
    gameState.mustMoveRobber = false;
    if (victimId) {
      const victim = gameState.players.find(p => p.id === victimId);
      const res = Object.keys(victim.resources).filter(k => victim.resources[k] > 0);
      if (res.length > 0) {
        const stolen = res[Math.floor(Math.random() * res.length)];
        victim.resources[stolen]--;
        gameState.players.find(p => p.id === socket.id).resources[stolen]++;
      }
    }
    io.emit('gameStateUpdate', gameState);
  });

  socket.on('bank_trade', ({ offerResource, requestResource }) => {
    if (gameState.phase !== 'MAIN' || !gameState.hasRolled || socket.id !== gameState.turnOrder[gameState.currentTurnIndex]) return;
    if (offerResource === requestResource) return;

    const p = gameState.players.find(p => p.id === socket.id);
    if (!p) return;

    // Calculate trade rate
    let tradeRate = 4;
    const playerNodes = gameState.nodes.filter(n => n.occupant === socket.id);
    playerNodes.forEach(node => {
      if (node.port) {
        if (node.port === '3:1') tradeRate = Math.min(tradeRate, 3);
        if (node.port === `${offerResource} 2:1`) tradeRate = Math.min(tradeRate, 2);
      }
    });

    if (p.resources[offerResource] < tradeRate) return socket.emit('error', 'Not enough resources for trade');

    p.resources[offerResource] -= tradeRate;
    p.resources[requestResource] += 1;
    
    io.emit('gameStateUpdate', gameState);
  });

  socket.on('propose_trade', ({ offer, request }) => {
    if (gameState.phase !== 'MAIN' || !gameState.hasRolled || socket.id !== gameState.turnOrder[gameState.currentTurnIndex]) return;
    const p = gameState.players.find(p => p.id === socket.id);
    if (!p) return;

    // Validate proposer has offered resources
    for (const res in offer) {
      if (p.resources[res] < offer[res]) return socket.emit('error', `Not enough ${res} to trade`);
    }

    gameState.tradeProposal = {
      proposerId: socket.id,
      offer,
      request,
      responses: []
    };
    io.emit('gameStateUpdate', gameState);
  });

  socket.on('respond_to_trade', ({ accepted }) => {
    if (!gameState.tradeProposal || socket.id === gameState.tradeProposal.proposerId) return;
    
    if (accepted) {
      const p = gameState.players.find(p => p.id === socket.id);
      const request = gameState.tradeProposal.request;
      // Validate responder has requested resources
      for (const res in request) {
        if (p.resources[res] < request[res]) return socket.emit('error', `Not enough ${res} to accept trade`);
      }
      if (!gameState.tradeProposal.responses.includes(socket.id)) {
        gameState.tradeProposal.responses.push(socket.id);
      }
    } else {
      gameState.tradeProposal.responses = gameState.tradeProposal.responses.filter(id => id !== socket.id);
    }
    io.emit('gameStateUpdate', gameState);
  });

  socket.on('confirm_trade', ({ responderId }) => {
    if (!gameState.tradeProposal || socket.id !== gameState.tradeProposal.proposerId) return;
    if (!gameState.tradeProposal.responses.includes(responderId)) return;

    const proposer = gameState.players.find(p => p.id === socket.id);
    const responder = gameState.players.find(p => p.id === responderId);
    const { offer, request } = gameState.tradeProposal;

    // Final validation of both sides
    for (const res in offer) if (proposer.resources[res] < offer[res]) return socket.emit('error', 'Trade failed: proposer no longer has resources');
    for (const res in request) if (responder.resources[res] < request[res]) return socket.emit('error', 'Trade failed: responder no longer has resources');

    // Swap
    for (const res in offer) {
      proposer.resources[res] -= offer[res];
      responder.resources[res] += offer[res];
    }
    for (const res in request) {
      responder.resources[res] -= request[res];
      proposer.resources[res] += request[res];
    }

    gameState.tradeProposal = null;
    io.emit('gameStateUpdate', gameState);
  });

  socket.on('cancel_trade', () => {
    if (!gameState.tradeProposal || socket.id !== gameState.tradeProposal.proposerId) return;
    gameState.tradeProposal = null;
    io.emit('gameStateUpdate', gameState);
  });

  socket.on('draw_dev_card', () => {
    if (gameState.phase !== 'MAIN' || !gameState.hasRolled || socket.id !== gameState.turnOrder[gameState.currentTurnIndex]) return;
    const p = gameState.players.find(p => p.id === socket.id);
    if (p.resources.Wheat < 1 || p.resources.Sheep < 1 || p.resources.Ore < 1 || gameState.devCards.length === 0) return;
    p.resources.Wheat--; p.resources.Sheep--; p.resources.Ore--;
    const type = gameState.devCards.pop();
    const card = { id: Math.random().toString(36).substr(2, 9), type, canPlay: false };
    p.devCards.push(card);
    if (type === 'Victory Point') {
      p.vp++;
      p.vpCardCount++;
      checkWinner();
    }
    socket.emit('dev_card_drawn', card);
    io.emit('gameStateUpdate', gameState);
  });

  socket.on('play_knight', ({ cardId }) => {
    const p = gameState.players.find(p => p.id === socket.id);
    const idx = p?.devCards.findIndex(c => c.id === cardId && c.type === 'Knight' && c.canPlay);
    if (idx === -1 || gameState.hasPlayedDevCard) return;
    p.devCards.splice(idx, 1);
    p.knightsPlayed++;
    gameState.hasPlayedDevCard = true;
    gameState.mustMoveRobber = true;
    evaluateSpecialConditions();
    io.emit('gameStateUpdate', gameState);
  });

  socket.on('play_year_of_plenty', ({ cardId, resources }) => {
    const p = gameState.players.find(p => p.id === socket.id);
    if (!p || gameState.hasPlayedDevCard || !gameState.hasRolled || socket.id !== gameState.turnOrder[gameState.currentTurnIndex]) return;
    const idx = p.devCards.findIndex(c => c.id === cardId && c.type === 'Year of Plenty' && c.canPlay);
    if (idx === -1) return;

    resources.forEach(res => {
      p.resources[res]++;
    });
    p.devCards.splice(idx, 1);
    gameState.hasPlayedDevCard = true;
    io.emit('gameStateUpdate', gameState);
  });

  socket.on('play_monopoly', ({ cardId, resource }) => {
    const p = gameState.players.find(p => p.id === socket.id);
    if (!p || gameState.hasPlayedDevCard || !gameState.hasRolled || socket.id !== gameState.turnOrder[gameState.currentTurnIndex]) return;
    const idx = p.devCards.findIndex(c => c.id === cardId && c.type === 'Monopoly' && c.canPlay);
    if (idx === -1) return;

    let total = 0;
    gameState.players.forEach(other => {
      if (other.id !== p.id) {
        total += other.resources[resource];
        other.resources[resource] = 0;
      }
    });
    p.resources[resource] += total;
    p.devCards.splice(idx, 1);
    gameState.hasPlayedDevCard = true;
    io.emit('gameStateUpdate', gameState);
  });

  socket.on('play_road_building', ({ cardId, edgeIds }) => {
    const p = gameState.players.find(p => p.id === socket.id);
    if (!p || gameState.hasPlayedDevCard || !gameState.hasRolled || socket.id !== gameState.turnOrder[gameState.currentTurnIndex]) return;
    const idx = p.devCards.findIndex(c => c.id === cardId && c.type === 'Road Building' && c.canPlay);
    if (idx === -1) return;

    edgeIds.forEach(edgeId => {
      const edge = gameState.edges.find(e => e.id === edgeId);
      if (edge && !edge.occupant) {
        // We'll trust the client slightly more on placement logic for dev cards
        // to avoid complex pathfinding during the card play itself.
        edge.occupant = p.id;
      }
    });

    p.devCards.splice(idx, 1);
    gameState.hasPlayedDevCard = true;
    evaluateSpecialConditions();
    io.emit('gameStateUpdate', gameState);
  });

  socket.on('end_turn', () => {
    if (socket.id !== gameState.turnOrder[gameState.currentTurnIndex] || !gameState.hasRolled) return;
    const p = gameState.players.find(p => p.id === socket.id);
    p.devCards.forEach(c => c.canPlay = true);
    gameState.currentTurnIndex = (gameState.currentTurnIndex + 1) % gameState.players.length;
    gameState.hasRolled = false;
    gameState.lastRoll = null;
    gameState.tradeProposal = null;
    gameState.hasPlayedDevCard = false;
    gameState.freeRoadsCount = 0;
    io.emit('gameStateUpdate', gameState);
  });

  socket.on('restart_game', () => {
    if (gameState.turnOrder[0] !== socket.id) return;
    const players = gameState.players.map(p => ({
      ...p,
      resources: { Wood: 0, Brick: 0, Sheep: 0, Wheat: 0, Ore: 0 },
      devCards: [],
      vp: 0,
      settlementCount: 0,
      cityCount: 0,
      vpCardCount: 0,
      longestRoad: 0,
      knightsPlayed: 0
    }));
    const turnOrder = players.map(p => p.id);
    gameState = { ...createInitialGameState(), players, turnOrder, phase: 'LOBBY' };
    io.emit('gameStateUpdate', gameState);
  });

  socket.on('disconnect', () => console.log(`User disconnected: ${socket.id}`));
});

const calculateLongestRoad = (playerId) => {
  const playerEdges = gameState.edges.filter(e => e.occupant === playerId);
  if (playerEdges.length === 0) return 0;

  const findLongestPathFromNode = (nodeId, visitedEdges) => {
    const node = gameState.nodes.find(n => n.id === nodeId);
    // Road connection is broken if node is occupied by another player
    if (node && node.occupant && node.occupant !== playerId) return 0;

    let maxBranch = 0;
    const adjEdges = playerEdges.filter(e => 
      (e.v1 === nodeId || e.v2 === nodeId) && !visitedEdges.has(e.id)
    );

    for (const edge of adjEdges) {
      visitedEdges.add(edge.id);
      const nextNode = (edge.v1 === nodeId) ? edge.v2 : edge.v1;
      maxBranch = Math.max(maxBranch, 1 + findLongestPathFromNode(nextNode, visitedEdges));
      visitedEdges.delete(edge.id);
    }
    return maxBranch;
  };

  let maxLen = 0;
  const nodesWithRoads = new Set();
  playerEdges.forEach(e => { nodesWithRoads.add(e.v1); nodesWithRoads.add(e.v2); });

  nodesWithRoads.forEach(nodeId => {
    maxLen = Math.max(maxLen, findLongestPathFromNode(nodeId, new Set()));
  });

  return maxLen;
};

const evaluateSpecialConditions = () => {
  // Largest Army (min 3 knights)
  let bestArmy = 2;
  let currentLeader = gameState.largestArmyPlayer;
  
  gameState.players.forEach(p => {
    if (p.knightsPlayed > bestArmy) {
      bestArmy = p.knightsPlayed;
      gameState.largestArmyPlayer = p.id;
    }
  });

  if (gameState.largestArmyPlayer !== currentLeader) {
    gameState.players.forEach(p => {
      if (p.id === currentLeader) p.vp -= 2;
      if (p.id === gameState.largestArmyPlayer) p.vp += 2;
    });
    checkWinner();
  }

  // Longest Road (min 5 roads)
  let longestRoadLen = 4; // Threshold to get the award is 5
  let currentRoadLeader = gameState.longestRoadPlayer;
  
  // Calculate each player's longest road and update their stats
  gameState.players.forEach(p => {
    p.longestRoad = calculateLongestRoad(p.id);
  });

  if (currentRoadLeader) {
    const leader = gameState.players.find(p => p.id === currentRoadLeader);
    longestRoadLen = leader.longestRoad;
  }

  let newRoadLeader = currentRoadLeader;
  gameState.players.forEach(p => {
    // Standard Catan rule: must strictly exceed current leader to take award
    if (p.longestRoad > longestRoadLen) {
      longestRoadLen = p.longestRoad;
      newRoadLeader = p.id;
    }
  });

  if (newRoadLeader !== currentRoadLeader) {
    gameState.players.forEach(p => {
      if (p.id === currentRoadLeader) p.vp -= 2;
      if (p.id === newRoadLeader) p.vp += 2;
    });
    gameState.longestRoadPlayer = newRoadLeader;
    checkWinner();
  }
};

app.get('*path', (req, res) => res.sendFile(path.join(__dirname, '../client/dist/index.html')));
server.listen(process.env.PORT || 3001, '0.0.0.0', () => console.log(`Server running`));