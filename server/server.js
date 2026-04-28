const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { generateBoard, shuffle } = require('./boardGenerator');
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
let gameState = {
  board: generateBoard(),
  players: [], // { id, name, color, resources: {}, vp: 0, longestRoad: 0, knightsPlayed: 0 }
  turnOrder: [],
  setupTurnQueue: [],
  currentTurnIndex: 0,
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
      gameState.currentTurnIndex = 0; // Use this to track index in setupTurnQueue during SETUP
      
      io.emit('gameStateUpdate', gameState);
    }
  });

  socket.on('place_initial_pieces', () => {
    if (gameState.phase !== 'INITIAL_SETUP') return;
    
    const currentPlayerId = gameState.setupTurnQueue[gameState.currentTurnIndex];
    if (socket.id !== currentPlayerId) return;

    // Simulate placing pieces (placeholder until board clicking is implemented)
    // Normally the 2nd settlement gives starting resources
    const p = gameState.players.find(p => p.id === currentPlayerId);
    if (p && gameState.currentTurnIndex >= gameState.turnOrder.length) {
      // Mock giving 1 of each resource on the second placement
      p.resources.Wood += 1;
      p.resources.Brick += 1;
      p.resources.Wheat += 1;
      p.resources.Sheep += 1;
    }

    gameState.currentTurnIndex++;

    if (gameState.currentTurnIndex >= gameState.setupTurnQueue.length) {
      // Setup phase is over
      gameState.phase = 'MAIN';
      gameState.currentTurnIndex = 0; // Reset to normal turnOrder
    }
    
    io.emit('gameStateUpdate', gameState);
  });

  socket.on('roll_dice', () => {
    const currentPlayerId = gameState.turnOrder[gameState.currentTurnIndex];
    if (socket.id !== currentPlayerId) {
      // Not their turn
      return;
    }

    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    const roll = d1 + d2;

    io.emit('dice_rolled', { d1, d2, roll });

    // Resource calculation
    if (roll !== 7) {
      // Find hexes that produce
      const producingHexes = gameState.board.filter(hex => hex.numberToken === roll && hex.resource !== 'Desert');
      
      // In a full game, we would check settlements on vertices of these hexes.
      // For this prototype, we'll mock giving 1 resource to the current player for each producing hex
      // (This serves as a placeholder until settlement-vertex map is implemented)
      producingHexes.forEach(hex => {
          const p = gameState.players.find(p => p.id === currentPlayerId);
          if (p) p.resources[hex.resource] += 1;
      });
    } else {
      // 7 rolled, robber logic goes here
    }

    // Check Largest Army / Longest Road if they were updated in this turn (placeholder)
    // evaluateSpecialConditions();

    io.emit('gameStateUpdate', gameState);
  });

  socket.on('end_turn', () => {
    const currentPlayerId = gameState.turnOrder[gameState.currentTurnIndex];
    if (socket.id === currentPlayerId) {
      gameState.currentTurnIndex = (gameState.currentTurnIndex + 1) % gameState.players.length;
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