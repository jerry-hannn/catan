import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { GiWoodPile, GiBrickWall, GiSheep, GiWheat, GiOre, GiSwordsEmblem, GiTrophy, GiCardPlay } from 'react-icons/gi';
import Board from './Board';
import './App.css';

// Using relative connection: defaults to the same host/port that served the page.
const socket = io({
  transports: ['websocket', 'polling'],
  reconnectionAttempts: 5
});

function App() {
  const [gameState, setGameState] = useState(null);
  const [playerId, setPlayerId] = useState(null);
  const [buildingMode, setBuildingMode] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('connecting');

  const [playerName, setPlayerName] = useState('');
  const [playerColor, setPlayerColor] = useState('#e63946');
  const [tradeOffer, setTradeOffer] = useState('Wood');
  const [tradeRequest, setTradeRequest] = useState('Brick');

  const [discardSelection, setDiscardSelection] = useState({ Wood: 0, Brick: 0, Sheep: 0, Wheat: 0, Ore: 0 });
  const [robberTargetHex, setRobberTargetHex] = useState(null);
  
  // Dev Card Interactive State
  const [devCardAction, setDevCardAction] = useState(null); // { type, cardId, selection: [] }

  useEffect(() => {
    socket.on('connect', () => {
      setPlayerId(socket.id);
      setConnectionStatus('connected');
    });

    socket.on('connect_error', (err) => {
      setConnectionStatus('error');
    });

    socket.on('gameStateUpdate', (state) => {
      setGameState(state);
    });

    socket.on('error', (msg) => {
      alert(msg);
    });

    return () => {
      socket.off('connect');
      socket.off('connect_error');
      socket.off('gameStateUpdate');
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

  // Dev Card Actions
  const handlePlayCard = (card) => {
    if (!card.canPlay || gameState.hasPlayedDevCard) return;

    if (card.type === 'Knight') {
      socket.emit('play_knight', { cardId: card.id });
    } else if (card.type === 'Year of Plenty') {
      setDevCardAction({ type: 'Year of Plenty', cardId: card.id, selection: [] });
    } else if (card.type === 'Monopoly') {
      setDevCardAction({ type: 'Monopoly', cardId: card.id, selection: [] });
    } else if (card.type === 'Road Building') {
      socket.emit('play_road_building', { cardId: card.id });
    }
  };

  const handleDevCardResourceSelect = (res) => {
    if (devCardAction.type === 'Year of Plenty') {
      const newSelection = [...devCardAction.selection, res];
      if (newSelection.length === 2) {
        socket.emit('play_year_of_plenty', { cardId: devCardAction.cardId, resources: newSelection });
        setDevCardAction(null);
      } else {
        setDevCardAction({ ...devCardAction, selection: newSelection });
      }
    } else if (devCardAction.type === 'Monopoly') {
      socket.emit('play_monopoly', { cardId: devCardAction.cardId, resource: res });
      setDevCardAction(null);
    }
  };

  if (!gameState) {
    return (
      <div className="loading-screen">
        <div className="loader"></div>
        <h2>Loading Catan...</h2>
        <p>Status: {connectionStatus === 'connecting' ? 'Connecting to server...' : 
                   connectionStatus === 'connected' ? 'Connected! Waiting for game state...' : 
                   'Error connecting. Check your network.'}</p>
        {connectionStatus === 'error' && <button onClick={() => window.location.reload()}>Retry</button>}
      </div>
    );
  }

  const player = gameState.players.find(p => p.id === playerId);

  if (gameState.phase === 'LOBBY') {
    return (
      <div className="App">
        <h1>Settlers of Catan - Lobby</h1>
        {!player ? (
          <form onSubmit={handleJoin} className="lobby-form">
            <input type="text" placeholder="Your Name" value={playerName} onChange={e => setPlayerName(e.target.value)} required />
            <input type="color" value={playerColor} onChange={e => setPlayerColor(e.target.value)} title="Choose your color" />
            <button type="submit">Join Game</button>
          </form>
        ) : (
          <div className="lobby-waiting">
            <h2>Welcome, {player.name}!</h2>
            {gameState.players[0].id === playerId ? (
              <button onClick={handleStartGame} disabled={gameState.players.length < 1}>Start Game</button>
            ) : <p>Waiting for host to start...</p>}
          </div>
        )}
        <div className="players-list">
          <h3>Players Joined ({gameState.players.length}/4)</h3>
          <ul>{gameState.players.map(p => <li key={p.id} style={{ color: p.color, fontWeight: 'bold' }}>{p.name}</li>)}</ul>
        </div>
      </div>
    );
  }

  // Turn logic
  let isMyTurn = false;
  let activePlayerName = '';
  if (gameState.phase === 'INITIAL_SETUP') {
    const activeId = gameState.setupTurnQueue[gameState.currentTurnIndex];
    isMyTurn = activeId === playerId;
    activePlayerName = gameState.players.find(p => p.id === activeId)?.name || 'Player';
  } else if (gameState.phase === 'MAIN') {
    const activeId = gameState.turnOrder[gameState.currentTurnIndex];
    isMyTurn = activeId === playerId;
    activePlayerName = gameState.players.find(p => p.id === activeId)?.name || 'Player';
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
      
      {gameState.lastRoll && (
        <div className="dice-result">
          <h3>Roll: {gameState.lastRoll.roll} ({gameState.lastRoll.d1} + {gameState.lastRoll.d2})</h3>
        </div>
      )}

      {player && (
        <div className="player-info" style={{ borderColor: player.color }}>
          <h2>{player.name} {player.vp >= 10 && "(WINNER!)"}</h2>
          <div className="stats-row">
            <span>VP: {player.vp}</span>
            <span>Knights: {player.knightsPlayed}</span>
          </div>
          
          {gameState.phase === 'INITIAL_SETUP' && (
             <div className="setup-info">
               <p className="phase-indicator"><strong>Phase: Initial Setup</strong></p>
               {isMyTurn && (
                 <p className="instruction">
                   {!gameState.setupState.settlementPlaced 
                     ? "Click on an intersection to build your Settlement." 
                     : "Now click on an adjacent edge to build your Road."}
                 </p>
               )}
             </div>
          )}

          {gameState.phase === 'MAIN' && (
            <>
              <div className="resources">
                <span title="Wood"><GiWoodPile /> {player.resources.Wood}</span>
                <span title="Brick"><GiBrickWall /> {player.resources.Brick}</span>
                <span title="Sheep"><GiSheep /> {player.resources.Sheep}</span>
                <span title="Wheat"><GiWheat /> {player.resources.Wheat}</span>
                <span title="Ore"><GiOre /> {player.resources.Ore}</span>
              </div>
              
              <div className="dev-cards-held">
                <h4>Your Dev Cards:</h4>
                <div className="dev-cards-list">
                  {player.devCards.map(card => (
                    <button 
                      key={card.id} 
                      className={`dev-card ${card.canPlay && !gameState.hasPlayedDevCard ? 'playable' : 'unplayable'}`}
                      disabled={!card.canPlay || gameState.hasPlayedDevCard || !isMyTurn}
                      onClick={() => handlePlayCard(card)}
                      title={card.canPlay ? `Click to play ${card.type}` : "Cannot play on the turn you bought it"}
                    >
                      {card.type === 'Knight' && <GiSwordsEmblem />}
                      {card.type === 'Victory Point' && <GiTrophy />}
                      {card.type !== 'Knight' && card.type !== 'Victory Point' && <GiCardPlay />}
                      <span>{card.type}</span>
                    </button>
                  ))}
                  {player.devCards.length === 0 && <p>No cards held</p>}
                </div>
              </div>
            </>
          )}

          <div className="controls">
            {isMyTurn ? (
              <>
                <p><strong>Your Turn</strong></p>
                {gameState.mustMoveRobber && (
                  <p className="build-prompt">You must move the robber! Click a hex on the board.</p>
                )}
                {gameState.phase === 'MAIN' && (
                  <>
                    <div className="main-actions">
                      <button className="action-btn" onClick={handleRollDice} disabled={gameState.hasRolled}>Roll Dice</button>
                      <button className="action-btn" onClick={handleEndTurn} disabled={!gameState.hasRolled || gameState.mustMoveRobber}>End Turn</button>
                    </div>
                    <div className="purchase-actions" style={{ opacity: (!gameState.hasRolled || gameState.mustMoveRobber) ? 0.3 : 1 }}>
                      <button className={getButtonClass(buildingMode === 'ROAD', canAffordRoad)} onClick={() => setBuildingMode(buildingMode === 'ROAD' ? null : 'ROAD')}>Road</button>
                      <button className={getButtonClass(buildingMode === 'SETTLEMENT', canAffordSettlement)} onClick={() => setBuildingMode(buildingMode === 'SETTLEMENT' ? null : 'SETTLEMENT')}>Settlement</button>
                      <button className={getButtonClass(buildingMode === 'CITY', canAffordCity)} onClick={() => setBuildingMode(buildingMode === 'CITY' ? null : 'CITY')}>City</button>
                      <button className={getButtonClass(false, canAffordDevCard)} onClick={handleDrawDevCard}>Dev Card</button>
                    </div>
                    <div className="trade-actions">
                      <select value={tradeOffer} onChange={e => setTradeOffer(e.target.value)}>{['Wood','Brick','Sheep','Wheat','Ore'].map(r => <option key={r} value={r}>{r}</option>)}</select>
                      <span>&rarr;</span>
                      <select value={tradeRequest} onChange={e => setTradeRequest(e.target.value)}>{['Wood','Brick','Sheep','Wheat','Ore'].map(r => <option key={r} value={r}>{r}</option>)}</select>
                      <button disabled={!canAffordTrade || !gameState.hasRolled} onClick={handleBankTrade}>Trade {tradeRate}:1</button>
                    </div>
                  </>
                )}
              </>
            ) : <p>Waiting for {activePlayerName}...</p>}
          </div>
        </div>
      )}

      {/* Interactive Overlays */}
      {devCardAction && (
        <div className="overlay">
          <div className="overlay-content">
            <h3>{devCardAction.type === 'Year of Plenty' ? 'Pick 2 Resources' : 'Pick Resource to Steal'}</h3>
            <p>{devCardAction.type === 'Year of Plenty' && `Selected: ${devCardAction.selection.join(', ')}`}</p>
            <div className="resource-picker">
              {['Wood','Brick','Sheep','Wheat','Ore'].map(res => (
                <button key={res} onClick={() => handleDevCardResourceSelect(res)}>{res}</button>
              ))}
            </div>
            <button onClick={() => setDevCardAction(null)}>Cancel</button>
          </div>
        </div>
      )}

      {gameState.discardingPlayers?.find(dp => dp.id === playerId) && (
        <div className="overlay">
          <div className="overlay-content">
            <h3>Discard {gameState.discardingPlayers.find(dp => dp.id === playerId).count} Cards</h3>
            <div className="discard-selectors">
              {['Wood','Brick','Sheep','Wheat','Ore'].map(res => (
                <div key={res} className="discard-row">
                  <span>{res}: {player.resources[res]}</span>
                  <div className="discard-controls">
                    <button onClick={() => handleDiscardChange(res, -1)} disabled={discardSelection[res] <= 0}>-</button>
                    <span>{discardSelection[res]}</span>
                    <button onClick={() => handleDiscardChange(res, 1)} disabled={discardSelection[res] >= player.resources[res]}>+</button>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={handleDiscardSubmit}>Confirm Discard</button>
          </div>
        </div>
      )}

      {robberTargetHex && (
        <div className="overlay">
          <div className="overlay-content">
            <h3>Rob a player:</h3>
            {robberTargetHex.victims.map(vid => (
              <button key={vid} onClick={() => handleVictimSelect(vid)} style={{ background: gameState.players.find(p => p.id === vid).color }}>{gameState.players.find(p => p.id === vid).name}</button>
            ))}
          </div>
        </div>
      )}

      <Board 
        board={gameState.board} 
        nodes={gameState.nodes} 
        edges={gameState.edges} 
        players={gameState.players}
        robberHexId={gameState.robberHexId}
        onNodeClick={isMyTurn && !gameState.mustMoveRobber ? handleNodeClick : null}
        onEdgeClick={isMyTurn && !gameState.mustMoveRobber ? handleEdgeClick : null}
        onHexClick={isMyTurn && gameState.mustMoveRobber ? handleHexClick : null}
      />
    </div>
  );
}

export default App;