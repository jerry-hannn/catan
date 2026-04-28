import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { GiWoodPile, GiBrickWall, GiSheep, GiWheat, GiOre } from 'react-icons/gi';
import Board from './Board';
import './App.css';

// Read server URL from env or fallback to localhost
const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';
const socket = io(SERVER_URL);

function App() {
  const [gameState, setGameState] = useState(null);
  const [playerId, setPlayerId] = useState(null);
  const [diceRoll, setDiceRoll] = useState(null);
  const [buildingMode, setBuildingMode] = useState(null); // 'ROAD', 'SETTLEMENT', 'CITY', null

  const [playerName, setPlayerName] = useState('');
  const [playerColor, setPlayerColor] = useState('#e63946');
  const [tradeOffer, setTradeOffer] = useState('Wood');
  const [tradeRequest, setTradeRequest] = useState('Brick');

  const [discardSelection, setDiscardSelection] = useState({ Wood: 0, Brick: 0, Sheep: 0, Wheat: 0, Ore: 0 });
  const [robberTargetHex, setRobberTargetHex] = useState(null);

  useEffect(() => {
    socket.on('connect', () => {
      setPlayerId(socket.id);
    });

    socket.on('gameStateUpdate', (state) => {
      setGameState(state);
      // Reset mode on turn end or phase change, but it might be easier to leave it unless turn changes
      // Actually let's just let the user toggle it.
    });

    socket.on('dice_rolled', (rollData) => {
      setDiceRoll(rollData);
    });

    socket.on('error', (msg) => {
      alert(msg); // Provide feedback to the user on error
    });

    return () => {
      socket.off('connect');
      socket.off('gameStateUpdate');
      socket.off('dice_rolled');
      socket.off('error');
    };
  }, []);

  const handleJoin = (e) => {
    e.preventDefault();
    socket.emit('join_game', { name: playerName, color: playerColor });
  };

  const handleStartGame = () => socket.emit('start_game');
  
  const handleNodeClick = (nodeId) => {
    if (gameState.phase === 'INITIAL_SETUP') {
      socket.emit('build_settlement', { nodeId });
    } else if (buildingMode === 'SETTLEMENT') {
      socket.emit('build_settlement', { nodeId });
      setBuildingMode(null);
    } else if (buildingMode === 'CITY') {
      socket.emit('build_city', { nodeId });
      setBuildingMode(null);
    }
  };

  const handleEdgeClick = (edgeId) => {
    if (gameState.phase === 'INITIAL_SETUP') {
      socket.emit('build_road', { edgeId });
    } else if (buildingMode === 'ROAD') {
      socket.emit('build_road', { edgeId });
      setBuildingMode(null);
    }
  };

  const handleHexClick = (hexId) => {
    if (gameState.mustMoveRobber && gameState.discardingPlayers.length === 0) {
      // Find victims
      const adjacentNodes = gameState.nodes.filter(n => n.hexes.includes(hexId));
      const potentialVictims = adjacentNodes
        .map(n => n.occupant)
        .filter(occ => occ && occ !== playerId);
      const uniqueVictims = [...new Set(potentialVictims)];

      if (uniqueVictims.length > 1) {
        setRobberTargetHex({ hexId, victims: uniqueVictims });
      } else if (uniqueVictims.length === 1) {
        socket.emit('move_robber', { hexId, victimId: uniqueVictims[0] });
      } else {
        socket.emit('move_robber', { hexId, victimId: null });
      }
    }
  };

  const handleDiscardSubmit = () => {
    socket.emit('discard_cards', { resourcesToDiscard: discardSelection });
    setDiscardSelection({ Wood: 0, Brick: 0, Sheep: 0, Wheat: 0, Ore: 0 });
  };

  const handleDiscardChange = (res, delta) => {
    setDiscardSelection(prev => {
      const next = { ...prev };
      next[res] += delta;
      // Clamp bounds
      if (next[res] < 0) next[res] = 0;
      if (next[res] > player.resources[res]) next[res] = player.resources[res];
      return next;
    });
  };

  const handleVictimSelect = (victimId) => {
    socket.emit('move_robber', { hexId: robberTargetHex.hexId, victimId });
    setRobberTargetHex(null);
  };

  const handleRollDice = () => socket.emit('roll_dice');
  const handleEndTurn = () => {
    setBuildingMode(null);
    socket.emit('end_turn');
  };
  const handleDrawDevCard = () => socket.emit('draw_dev_card');
  const handleBankTrade = () => {
    socket.emit('bank_trade', { offerResource: tradeOffer, requestResource: tradeRequest });
  };

  if (!gameState) return <div>Loading...</div>;

  const player = gameState.players.find(p => p.id === playerId);

  if (gameState.phase === 'LOBBY') {
    return (
      <div className="App">
        <h1>Settlers of Catan - Lobby</h1>
        
        {!player ? (
          <form onSubmit={handleJoin} className="lobby-form">
            <input 
              type="text" 
              placeholder="Your Name" 
              value={playerName} 
              onChange={e => setPlayerName(e.target.value)} 
              required 
            />
            <input 
              type="color" 
              value={playerColor} 
              onChange={e => setPlayerColor(e.target.value)} 
              title="Choose your color"
            />
            <button type="submit">Join Game</button>
          </form>
        ) : (
          <div className="lobby-waiting">
            <h2>Welcome, {player.name}!</h2>
            {gameState.players[0].id === playerId && (
              <button onClick={handleStartGame} disabled={gameState.players.length < 1}>
                Start Game
              </button>
            )}
            {gameState.players[0].id !== playerId && (
              <p>Waiting for the host to start the game...</p>
            )}
          </div>
        )}
        
        <div className="players-list">
          <h3>Players Joined ({gameState.players.length}/4)</h3>
          <ul>
            {gameState.players.map(p => (
              <li key={p.id} style={{ color: p.color, fontWeight: 'bold' }}>{p.name}</li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  // Determine turn status for INITIAL_SETUP or MAIN phases
  let isMyTurn = false;
  let activePlayerName = '';
  
  if (gameState.phase === 'INITIAL_SETUP') {
    const activeId = gameState.setupTurnQueue[gameState.currentTurnIndex];
    isMyTurn = activeId === playerId;
    activePlayerName = gameState.players.find(p => p.id === activeId)?.name || `Player`;
  } else if (gameState.phase === 'MAIN') {
    const activeId = gameState.turnOrder[gameState.currentTurnIndex];
    isMyTurn = activeId === playerId;
    activePlayerName = gameState.players.find(p => p.id === activeId)?.name || `Player`;
  }

  const canAffordRoad = player && player.resources.Wood >= 1 && player.resources.Brick >= 1;
  const canAffordSettlement = player && player.resources.Wood >= 1 && player.resources.Brick >= 1 && player.resources.Wheat >= 1 && player.resources.Sheep >= 1;
  const canAffordCity = player && player.resources.Wheat >= 2 && player.resources.Ore >= 3;
  const canAffordDevCard = player && player.resources.Wheat >= 1 && player.resources.Sheep >= 1 && player.resources.Ore >= 1;

  let tradeRate = 4;
  if (player && gameState.phase === 'MAIN') {
    const playerNodes = gameState.nodes.filter(n => n.occupant === playerId);
    playerNodes.forEach(node => {
      if (node.port) {
        if (node.port === '3:1') tradeRate = Math.min(tradeRate, 3);
        if (node.port === `${tradeOffer} 2:1`) tradeRate = Math.min(tradeRate, 2);
      }
    });
  }
  const canAffordTrade = player && player.resources[tradeOffer] >= tradeRate;

  const getButtonClass = (isActive, isAffordable) => {
    let classes = ['purchase-btn'];
    if (isActive) classes.push('active');
    if (isAffordable) classes.push('affordable');
    return classes.join(' ');
  };

  return (
    <div className="App">
      <h1>Settlers of Catan</h1>
      
      {player && (
        <div className="player-info" style={{ borderColor: player.color }}>
          <h2>{player.name}</h2>
          
          {gameState.phase === 'MAIN' && (
            <div className="resources">
              <span title="Wood"><GiWoodPile /> {player.resources.Wood}</span>
              <span title="Brick"><GiBrickWall /> {player.resources.Brick}</span>
              <span title="Sheep"><GiSheep /> {player.resources.Sheep}</span>
              <span title="Wheat"><GiWheat /> {player.resources.Wheat}</span>
              <span title="Ore"><GiOre /> {player.resources.Ore}</span>
            </div>
          )}
          
          {gameState.phase === 'INITIAL_SETUP' && (
             <p className="phase-indicator"><strong>Phase: Initial Setup</strong></p>
          )}

          <div className="controls">
             {isMyTurn ? (
               <>
                 <p><strong>It's your turn!</strong></p>
                 {gameState.phase === 'INITIAL_SETUP' ? (
                   <p>Click on an intersection to build a Settlement, then click on an edge to build a Road.</p>
                 ) : (
                   <>
                     <div className="main-actions">
                       <button 
                         className="action-btn" 
                         onClick={handleRollDice} 
                         disabled={gameState.hasRolled}
                         style={{ opacity: gameState.hasRolled ? 0.5 : 1, cursor: gameState.hasRolled ? 'not-allowed' : 'pointer' }}
                       >
                         Roll Dice
                       </button>
                       <button 
                         className="action-btn" 
                         onClick={handleEndTurn}
                         disabled={!gameState.hasRolled || gameState.mustMoveRobber}
                         style={{ opacity: (!gameState.hasRolled || gameState.mustMoveRobber) ? 0.5 : 1, cursor: (!gameState.hasRolled || gameState.mustMoveRobber) ? 'not-allowed' : 'pointer' }}
                       >
                         End Turn
                       </button>
                     </div>
                     {gameState.mustMoveRobber && (
                       <p className="build-prompt" style={{ color: '#e63946', fontSize: '1.4rem' }}>You rolled a 7! Click a hex to move the Robber.</p>
                     )}
                     <div className="purchase-actions" style={{ opacity: gameState.mustMoveRobber ? 0.3 : 1, pointerEvents: gameState.mustMoveRobber ? 'none' : 'auto' }}>
                       <button 
                         className={getButtonClass(buildingMode === 'ROAD', canAffordRoad)}
                         onClick={() => setBuildingMode(buildingMode === 'ROAD' ? null : 'ROAD')}
                       >
                         Road (1W, 1B)
                       </button>
                       <button 
                         className={getButtonClass(buildingMode === 'SETTLEMENT', canAffordSettlement)}
                         onClick={() => setBuildingMode(buildingMode === 'SETTLEMENT' ? null : 'SETTLEMENT')}
                       >
                         Settlement (1W, 1B, 1S, 1Wh)
                       </button>
                       <button 
                         className={getButtonClass(buildingMode === 'CITY', canAffordCity)}
                         onClick={() => setBuildingMode(buildingMode === 'CITY' ? null : 'CITY')}
                       >
                         City (2Wh, 3O)
                       </button>
                       <button 
                         className={getButtonClass(false, canAffordDevCard)}
                         onClick={handleDrawDevCard}
                       >
                         Dev Card (1Wh, 1S, 1O)
                       </button>
                     </div>
                     {buildingMode && !gameState.mustMoveRobber && (
                        <p className="build-prompt">Click the board to place your {buildingMode.toLowerCase()}!</p>
                     )}
                     
                     <div className="trade-actions" style={{ opacity: gameState.mustMoveRobber ? 0.3 : 1, pointerEvents: gameState.mustMoveRobber ? 'none' : 'auto' }}>
                       <p><strong>Bank Trade</strong></p>
                       <div className="trade-ui">
                         <label>
                           Offer:
                           <select value={tradeOffer} onChange={e => setTradeOffer(e.target.value)}>
                             <option value="Wood">Wood</option>
                             <option value="Brick">Brick</option>
                             <option value="Sheep">Sheep</option>
                             <option value="Wheat">Wheat</option>
                             <option value="Ore">Ore</option>
                           </select>
                         </label>
                         <span> &rarr; </span>
                         <label>
                           Request:
                           <select value={tradeRequest} onChange={e => setTradeRequest(e.target.value)}>
                             <option value="Wood">Wood</option>
                             <option value="Brick">Brick</option>
                             <option value="Sheep">Sheep</option>
                             <option value="Wheat">Wheat</option>
                             <option value="Ore">Ore</option>
                           </select>
                         </label>
                         <button 
                           className={getButtonClass(false, canAffordTrade && tradeOffer !== tradeRequest && gameState.hasRolled)}
                           onClick={handleBankTrade}
                           disabled={!canAffordTrade || tradeOffer === tradeRequest || !gameState.hasRolled}
                         >
                           Trade {tradeRate} {tradeOffer} for 1 {tradeRequest}
                         </button>
                       </div>
                     </div>
                   </>
                 )}
               </>
             ) : (
               <p>Waiting for {activePlayerName}'s turn...</p>
             )}
          </div>
        </div>
      )}

      {diceRoll && gameState.phase === 'MAIN' && (
        <div className="dice-result">
          <h3>Last Roll: {diceRoll.d1} + {diceRoll.d2} = {diceRoll.roll}</h3>
        </div>
      )}

      {/* Discard Overlay */}
      {gameState.discardingPlayers && gameState.discardingPlayers.find(dp => dp.id === playerId) && (
        <div className="overlay">
          <div className="overlay-content">
            <h3>You must discard {gameState.discardingPlayers.find(dp => dp.id === playerId).count} cards!</h3>
            <div className="discard-selectors">
              {['Wood', 'Brick', 'Sheep', 'Wheat', 'Ore'].map(res => (
                <div key={res} className="discard-row">
                  <span>{res} ({player.resources[res]} available):</span>
                  <div className="discard-controls">
                    <button onClick={() => handleDiscardChange(res, -1)} disabled={discardSelection[res] === 0}>-</button>
                    <span>{discardSelection[res]}</span>
                    <button onClick={() => handleDiscardChange(res, 1)} disabled={discardSelection[res] === player.resources[res]}>+</button>
                  </div>
                </div>
              ))}
            </div>
            <p>Selected: {Object.values(discardSelection).reduce((a, b) => a + b, 0)} / {gameState.discardingPlayers.find(dp => dp.id === playerId).count}</p>
            <button 
              className="action-btn"
              onClick={handleDiscardSubmit} 
              disabled={Object.values(discardSelection).reduce((a, b) => a + b, 0) !== gameState.discardingPlayers.find(dp => dp.id === playerId).count}
            >
              Confirm Discard
            </button>
          </div>
        </div>
      )}

      {/* Victim Selection Overlay */}
      {robberTargetHex && (
        <div className="overlay">
          <div className="overlay-content">
            <h3>Choose a player to rob:</h3>
            <div className="victim-buttons">
              {robberTargetHex.victims.map(vid => {
                const victim = gameState.players.find(p => p.id === vid);
                return (
                  <button key={vid} onClick={() => handleVictimSelect(vid)} style={{ backgroundColor: victim.color, color: 'white', padding: '10px', margin: '5px', borderRadius: '5px', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>
                    {victim.name}
                  </button>
                );
              })}
            </div>
            <button onClick={() => setRobberTargetHex(null)} style={{ marginTop: '10px' }}>Cancel</button>
          </div>
        </div>
      )}

      <Board 
        board={gameState.board} 
        nodes={gameState.nodes} 
        edges={gameState.edges} 
        players={gameState.players}
        robberHexId={gameState.robberHexId}
        onNodeClick={isMyTurn && !gameState.mustMoveRobber && gameState.discardingPlayers.length === 0 && (gameState.phase === 'INITIAL_SETUP' || buildingMode === 'SETTLEMENT' || buildingMode === 'CITY') ? handleNodeClick : null}
        onEdgeClick={isMyTurn && !gameState.mustMoveRobber && gameState.discardingPlayers.length === 0 && (gameState.phase === 'INITIAL_SETUP' || buildingMode === 'ROAD') ? handleEdgeClick : null}
        onHexClick={isMyTurn && gameState.mustMoveRobber && gameState.discardingPlayers.length === 0 ? handleHexClick : null}
      />
    </div>
  );
}

export default App;