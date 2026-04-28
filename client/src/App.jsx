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

  const [playerName, setPlayerName] = useState('');
  const [playerColor, setPlayerColor] = useState('#e63946');

  useEffect(() => {
    socket.on('connect', () => {
      setPlayerId(socket.id);
    });

    socket.on('gameStateUpdate', (state) => {
      setGameState(state);
    });

    socket.on('dice_rolled', (rollData) => {
      setDiceRoll(rollData);
    });

    return () => {
      socket.off('connect');
      socket.off('gameStateUpdate');
      socket.off('dice_rolled');
    };
  }, []);

  const handleJoin = (e) => {
    e.preventDefault();
    socket.emit('join_game', { name: playerName, color: playerColor });
  };

  const handleStartGame = () => socket.emit('start_game');
  const handlePlaceInitialPieces = () => socket.emit('place_initial_pieces');
  const handleRollDice = () => socket.emit('roll_dice');
  const handleEndTurn = () => socket.emit('end_turn');
  const handleDrawDevCard = () => socket.emit('draw_dev_card');

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

  return (
    <div className="App">
      <h1>Settlers of Catan Clone</h1>
      
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
                   <button onClick={handlePlaceInitialPieces}>Place Settlement & Road</button>
                 ) : (
                   <>
                     <button onClick={handleRollDice}>Roll Dice</button>
                     <button onClick={handleDrawDevCard}>Buy Dev Card (1W,1S,1O)</button>
                     <button onClick={handleEndTurn}>End Turn</button>
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

      <Board board={gameState.board} />
    </div>
  );
}

export default App;