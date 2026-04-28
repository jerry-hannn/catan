const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { generateBoard, shuffle } = require('./boardGenerator');
const { generateNetwork } = require('./networkGenerator');
const { INITIAL_DEV_CARDS } = require('./gameConstants');

const app = express();
app.use(cors()); // Allow all origins

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Allow Ngrok dynamic URLs
    methods: ["GET", "POST"]
  }
});

// Single source of truth for the game state
const initialBoard = generateBoard();
const initialNetwork = generateNetwork(initialBoard);
let gameState = {
  board: initialBoard,
  nodes: initialNetwork.nodes,
  edges: initialNetwork.edges,
  players: [], // { id, name, color, resources: {}, vp: 0, longestRoad: 0, knightsPlayed: 0 }
  turnOrder: [],
  setupTurnQueue: [],
  currentTurnIndex: 0,
  setupState: { settlementPlaced: false, roadPlaced: false, lastSettlementNodeId: null },
  hasRolled: false,
  mustMoveRobber: false,
  discardingPlayers: [],
  robberHexId: initialBoard.find(h => h.resource === 'Desert')?.id || 0,
  phase: 'LOBBY', // LOBBY, INITIAL_SETUP, MAIN, END
  devCards: shuffle(INITIAL_DEV_CARDS),
  longestRoadPlayer: null,
  largestArmyPlayer: null
};

const ObjectColors = ['#e63946', '#457b9d', '#f4a261', '#2a9d8f', '#8338ec', '#ffb703'];

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Send current state to newly connected player
  socket.emit('gameStateUpdate', gameState);

  socket.on('join_game', ({ name, color }) => {
    if (gameState.phase !== 'LOBBY') {
      socket.emit('error', 'Game has already started');
      return;
    }
    if (gameState.players.length >= 4) {
      socket.emit('error', 'Game is full');
      return;
    }

    const playerExists = gameState.players.find(p => p.id === socket.id);
    if (!playerExists) {
      const assignedColor = color || ObjectColors[gameState.players.length % ObjectColors.length];
      const newPlayer = {
        id: socket.id,
        name: name || `Player ${gameState.players.length + 1}`,
        color: assignedColor,
        resources: { Wood: 0, Brick: 0, Sheep: 0, Wheat: 0, Ore: 0 },
        vp: 0,
        longestRoad: 0,
        knightsPlayed: 0
      };
      gameState.players.push(newPlayer);
      gameState.turnOrder.push(socket.id);
      
      io.emit('gameStateUpdate', gameState);
    }
  });

  socket.on('start_game', () => {
    if (gameState.phase === 'LOBBY' && gameState.players.length > 0) {
      gameState.phase = 'INITIAL_SETUP';
      
      // Create a snake-draft order: e.g., 1, 2, 3, 4, 4, 3, 2, 1
      const forward = [...gameState.turnOrder];
      const backward = [...gameState.turnOrder].reverse();
      gameState.setupTurnQueue = [...forward, ...backward];
      gameState.currentTurnIndex = 0;
      gameState.setupState = { settlementPlaced: false, roadPlaced: false, lastSettlementNodeId: null };
      gameState.hasRolled = false;
      gameState.mustMoveRobber = false;
      gameState.discardingPlayers = [];
      
      io.emit('gameStateUpdate', gameState);
    }
  });

  socket.on('build_settlement', ({ nodeId }) => {
    const activePlayerId = gameState.phase === 'INITIAL_SETUP' 
      ? gameState.setupTurnQueue[gameState.currentTurnIndex] 
      : gameState.turnOrder[gameState.currentTurnIndex];
      
    if (socket.id !== activePlayerId) return;
    
    const p = gameState.players.find(p => p.id === activePlayerId);
    if (!p) return;

    if (gameState.phase === 'INITIAL_SETUP') {
      if (gameState.setupState.settlementPlaced) return; // Only 1 settlement per setup turn
    } else if (gameState.phase === 'MAIN') {
      // Check resources
      if (p.resources.Wood < 1 || p.resources.Brick < 1 || p.resources.Wheat < 1 || p.resources.Sheep < 1) {
        socket.emit('error', 'Not enough resources for a settlement');
        return;
      }
    }

    const node = gameState.nodes.find(n => n.id === nodeId);
    if (!node || node.occupant) return;

    // Check distance rule (no adjacent nodes can have a settlement)
    const adjacentEdges = gameState.edges.filter(e => e.v1 === nodeId || e.v2 === nodeId);
    const adjacentNodeIds = adjacentEdges.map(e => e.v1 === nodeId ? e.v2 : e.v1);
    const hasAdjacentSettlement = adjacentNodeIds.some(id => {
      const adjNode = gameState.nodes.find(n => n.id === id);
      return adjNode && adjNode.occupant !== null;
    });

    if (hasAdjacentSettlement) {
      socket.emit('error', 'Distance rule: too close to another settlement');
      return;
    }

    if (gameState.phase === 'MAIN') {
      // Must connect to at least one of the player's roads
      const hasConnectingRoad = adjacentEdges.some(e => e.occupant === activePlayerId);
      if (!hasConnectingRoad) {
        socket.emit('error', 'Settlement must be connected to your road');
        return;
      }
    }

    // Place settlement
    node.occupant = activePlayerId;
    node.buildingType = 'Settlement';
    p.vp += 1;

    if (gameState.phase === 'INITIAL_SETUP') {
      gameState.setupState.settlementPlaced = true;
      gameState.setupState.lastSettlementNodeId = nodeId;
      // If it's the second round of initial setup, grant starting resources
      if (gameState.currentTurnIndex >= gameState.turnOrder.length) {
        node.hexes.forEach(hexId => {
          const hex = gameState.board[hexId];
          if (hex && hex.resource !== 'Ocean' && hex.resource !== 'Desert') {
            p.resources[hex.resource] += 1;
          }
        });
      }
    } else if (gameState.phase === 'MAIN') {
      // Deduct resources
      p.resources.Wood -= 1;
      p.resources.Brick -= 1;
      p.resources.Wheat -= 1;
      p.resources.Sheep -= 1;
    }

    io.emit('gameStateUpdate', gameState);
  });

  socket.on('build_city', ({ nodeId }) => {
    if (gameState.phase !== 'MAIN') return;
    const activePlayerId = gameState.turnOrder[gameState.currentTurnIndex];
    if (socket.id !== activePlayerId) return;

    const p = gameState.players.find(p => p.id === activePlayerId);
    if (!p) return;

    // Check resources
    if (p.resources.Wheat < 2 || p.resources.Ore < 3) {
      socket.emit('error', 'Not enough resources for a city');
      return;
    }

    const node = gameState.nodes.find(n => n.id === nodeId);
    if (!node || node.occupant !== activePlayerId || node.buildingType !== 'Settlement') {
      socket.emit('error', 'Can only upgrade your own settlement to a city');
      return;
    }

    node.buildingType = 'City';
    p.vp += 1; // cities are worth 2 VP, but settlement was already 1 VP

    p.resources.Wheat -= 2;
    p.resources.Ore -= 3;

    io.emit('gameStateUpdate', gameState);
  });

  socket.on('build_road', ({ edgeId }) => {
    const activePlayerId = gameState.phase === 'INITIAL_SETUP' 
      ? gameState.setupTurnQueue[gameState.currentTurnIndex] 
      : gameState.turnOrder[gameState.currentTurnIndex];
      
    if (socket.id !== activePlayerId) return;

    const p = gameState.players.find(p => p.id === activePlayerId);
    if (!p) return;

    if (gameState.phase === 'INITIAL_SETUP') {
      // Must build settlement first in setup
      if (!gameState.setupState.settlementPlaced || gameState.setupState.roadPlaced) return; 
    } else if (gameState.phase === 'MAIN') {
      // Check resources
      if (p.resources.Wood < 1 || p.resources.Brick < 1) {
        socket.emit('error', 'Not enough resources for a road');
        return;
      }
    }

    const edge = gameState.edges.find(e => e.id === edgeId);
    if (!edge || edge.occupant) return;

    if (gameState.phase === 'INITIAL_SETUP') {
      if (edge.v1 !== gameState.setupState.lastSettlementNodeId && edge.v2 !== gameState.setupState.lastSettlementNodeId) {
        socket.emit('error', 'Road must connect to the settlement you just placed');
        return;
      }
    } else {
      // Must connect to player's own road, settlement, or city
      const v1 = edge.v1;
      const v2 = edge.v2;
      
      const isConnectedToOwnBuilding = gameState.nodes.some(n => 
        (n.id === v1 || n.id === v2) && n.occupant === activePlayerId
      );

      const adjacentEdgesToV1 = gameState.edges.filter(e => e.id !== edgeId && (e.v1 === v1 || e.v2 === v1));
      const adjacentEdgesToV2 = gameState.edges.filter(e => e.id !== edgeId && (e.v1 === v2 || e.v2 === v2));
      const isConnectedToOwnRoad = [...adjacentEdgesToV1, ...adjacentEdgesToV2].some(e => e.occupant === activePlayerId);

      if (!isConnectedToOwnBuilding && !isConnectedToOwnRoad) {
        socket.emit('error', 'Road must be connected to your own road or settlement');
        return;
      }
    }

    // Place road
    edge.occupant = activePlayerId;

    if (gameState.phase === 'INITIAL_SETUP') {
      gameState.setupState.roadPlaced = true;
      // In setup, placing a road ends your turn
      gameState.currentTurnIndex++;
      gameState.setupState = { settlementPlaced: false, roadPlaced: false, lastSettlementNodeId: null };
      
      if (gameState.currentTurnIndex >= gameState.setupTurnQueue.length) {
        gameState.phase = 'MAIN';
        gameState.currentTurnIndex = 0; // Reset to normal turnOrder
      }
    } else if (gameState.phase === 'MAIN') {
      // Deduct resources
      p.resources.Wood -= 1;
      p.resources.Brick -= 1;
    }

    io.emit('gameStateUpdate', gameState);
  });

  socket.on('roll_dice', () => {
    const currentPlayerId = gameState.turnOrder[gameState.currentTurnIndex];
    if (socket.id !== currentPlayerId) {
      // Not their turn
      return;
    }
    if (gameState.hasRolled) return;

    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    const roll = d1 + d2;
    
    gameState.hasRolled = true;

    io.emit('dice_rolled', { d1, d2, roll });

    // Resource calculation
    if (roll !== 7) {
      // Find hexes that produce
      const producingHexes = gameState.board.filter(hex => hex.numberToken === roll && hex.resource !== 'Desert' && hex.resource !== 'Ocean' && hex.id !== gameState.robberHexId);
      
      producingHexes.forEach(hex => {
        // Find nodes adjacent to this hex
        const adjacentNodes = gameState.nodes.filter(n => n.hexes.includes(hex.id));
        
        adjacentNodes.forEach(node => {
          if (node.occupant) {
            const player = gameState.players.find(p => p.id === node.occupant);
            if (player) {
              const amount = node.buildingType === 'City' ? 2 : 1;
              player.resources[hex.resource] += amount;
            }
          }
        });
      });
    } else {
      // 7 rolled
      gameState.discardingPlayers = [];
      gameState.players.forEach(player => {
        const totalResources = Object.values(player.resources).reduce((sum, val) => sum + val, 0);
        if (totalResources > 7) {
          gameState.discardingPlayers.push({
            id: player.id,
            count: Math.floor(totalResources / 2)
          });
        }
      });
      
      if (gameState.discardingPlayers.length === 0) {
        gameState.mustMoveRobber = true;
      }
    }

    // Check Largest Army / Longest Road if they were updated in this turn (placeholder)
    // evaluateSpecialConditions();

    io.emit('gameStateUpdate', gameState);
  });

  socket.on('discard_cards', ({ resourcesToDiscard }) => {
    const discardInfoIndex = gameState.discardingPlayers.findIndex(dp => dp.id === socket.id);
    if (discardInfoIndex === -1) return;

    const discardInfo = gameState.discardingPlayers[discardInfoIndex];
    const p = gameState.players.find(p => p.id === socket.id);
    if (!p) return;

    // Validate total count
    const totalToDiscard = Object.values(resourcesToDiscard).reduce((sum, val) => sum + val, 0);
    if (totalToDiscard !== discardInfo.count) {
      socket.emit('error', `You must discard exactly ${discardInfo.count} resources`);
      return;
    }

    // Validate player has these resources
    for (const [res, count] of Object.entries(resourcesToDiscard)) {
      if (p.resources[res] < count) {
        socket.emit('error', `You do not have enough ${res} to discard`);
        return;
      }
    }

    // Deduct resources
    for (const [res, count] of Object.entries(resourcesToDiscard)) {
      p.resources[res] -= count;
    }

    // Remove player from discarding list
    gameState.discardingPlayers.splice(discardInfoIndex, 1);

    // If everyone is done discarding, the active player must now move the robber
    if (gameState.discardingPlayers.length === 0) {
      gameState.mustMoveRobber = true;
    }

    io.emit('gameStateUpdate', gameState);
  });

  socket.on('move_robber', ({ hexId, victimId }) => {
    const currentPlayerId = gameState.turnOrder[gameState.currentTurnIndex];
    if (socket.id !== currentPlayerId) return;
    if (!gameState.mustMoveRobber) return;
    if (gameState.discardingPlayers.length > 0) return; // Wait for discards
    
    if (hexId === gameState.robberHexId) {
      socket.emit('error', 'Robber must be moved to a different hex');
      return;
    }
    
    const hex = gameState.board.find(h => h.id === hexId);
    if (!hex || hex.resource === 'Ocean') return;

    gameState.robberHexId = hexId;
    gameState.mustMoveRobber = false;
    
    if (victimId) {
      // Validate victim is on the hex
      const adjacentNodes = gameState.nodes.filter(n => n.hexes.includes(hexId));
      const potentialVictims = adjacentNodes.map(n => n.occupant).filter(occ => occ && occ !== currentPlayerId);
      
      if (potentialVictims.includes(victimId)) {
        const victim = gameState.players.find(p => p.id === victimId);
        const thief = gameState.players.find(p => p.id === currentPlayerId);
        
        const resources = ['Wood', 'Brick', 'Sheep', 'Wheat', 'Ore'];
        const available = resources.filter(res => victim.resources[res] > 0);
        
        if (available.length > 0) {
          const resToSteal = available[Math.floor(Math.random() * available.length)];
          victim.resources[resToSteal] -= 1;
          thief.resources[resToSteal] += 1;
        }
      }
    }
    
    io.emit('gameStateUpdate', gameState);
  });

  socket.on('end_turn', () => {
    const currentPlayerId = gameState.turnOrder[gameState.currentTurnIndex];
    if (socket.id === currentPlayerId && gameState.hasRolled) {
      gameState.currentTurnIndex = (gameState.currentTurnIndex + 1) % gameState.players.length;
      gameState.hasRolled = false;
      io.emit('gameStateUpdate', gameState);
    }
  });

  // Example of drawing a dev card
  socket.on('draw_dev_card', () => {
    const currentPlayerId = gameState.turnOrder[gameState.currentTurnIndex];
    if (socket.id !== currentPlayerId) return;

    const p = gameState.players.find(p => p.id === currentPlayerId);
    if (!p) return;
    
    // Check cost (1 Wheat, 1 Sheep, 1 Ore)
    if (p.resources.Wheat >= 1 && p.resources.Sheep >= 1 && p.resources.Ore >= 1) {
      if (gameState.devCards.length > 0) {
        // Deduct resources
        p.resources.Wheat -= 1;
        p.resources.Sheep -= 1;
        p.resources.Ore -= 1;
        
        // Draw card
        const card = gameState.devCards.pop();
        
        // Send card privately to player
        socket.emit('dev_card_drawn', card);
        io.emit('gameStateUpdate', gameState);
      }
    }
  });

  socket.on('bank_trade', ({ offerResource, requestResource }) => {
    if (gameState.phase !== 'MAIN') return;
    
    const currentPlayerId = gameState.turnOrder[gameState.currentTurnIndex];
    if (socket.id !== currentPlayerId) return;
    if (!gameState.hasRolled) {
      socket.emit('error', 'Must roll dice before trading');
      return;
    }

    const p = gameState.players.find(p => p.id === currentPlayerId);
    if (!p) return;

    if (!offerResource || !requestResource || offerResource === requestResource) {
      socket.emit('error', 'Invalid trade request');
      return;
    }

    // Determine the exchange rate (default 4:1)
    let rate = 4;

    // Check player's settlements/cities for ports
    const playerNodes = gameState.nodes.filter(n => n.occupant === currentPlayerId);
    playerNodes.forEach(node => {
      if (node.port) {
        if (node.port === '3:1') {
          rate = Math.min(rate, 3);
        } else if (node.port === `${offerResource} 2:1`) {
          rate = Math.min(rate, 2);
        }
      }
    });

    if (p.resources[offerResource] >= rate) {
      p.resources[offerResource] -= rate;
      p.resources[requestResource] += 1;
      io.emit('gameStateUpdate', gameState);
    } else {
      socket.emit('error', `Not enough ${offerResource} to trade. You need ${rate}.`);
    }
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
  });
});

const evaluateSpecialConditions = () => {
    // Logic for finding the player with the largest army (>= 3 knights)
    // Logic for finding the player with longest road (>= 5 continuous roads)
};

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});