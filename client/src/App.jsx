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

  const [pendingSettlement, setPendingSettlement] = useState(null);
  const [pendingRoad, setPendingRoad] = useState(null);
  const [activeModal, setActiveModal] = useState(null); // 'build', 'trade', 'devCards'

  const [playerName, setPlayerName] = useState('');
  const [playerColor, setPlayerColor] = useState('#e63946');
  const [tradeType, setTradeType] = useState('bank'); // 'bank' or 'player'
  const [tradeOffer, setTradeOffer] = useState('Wood'); // bank offer
  const [tradeRequest, setTradeRequest] = useState('Brick'); // bank request
  const [tradeOfferSelection, setTradeOfferSelection] = useState({ Wood: 0, Brick: 0, Sheep: 0, Wheat: 0, Ore: 0 });
  const [tradeRequestSelection, setTradeRequestSelection] = useState({ Wood: 0, Brick: 0, Sheep: 0, Wheat: 0, Ore: 0 });
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
      setPendingSettlement(null);
      setPendingRoad(null);
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
  const handleRestartGame = () => socket.emit('restart_game');
  
  const handleNodeClick = (nodeId) => {
    if (gameState.phase === 'INITIAL_SETUP') {
      if (gameState.setupState.settlementPlaced) return;
      setPendingSettlement(nodeId);
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
      if (!gameState.setupState.settlementPlaced || gameState.setupState.roadPlaced) return;
      
      // Client-side validation to match server
      const edge = gameState.edges.find(e => e.id === edgeId);
      if (edge.v1 !== gameState.setupState.lastSettlementNodeId && edge.v2 !== gameState.setupState.lastSettlementNodeId) {
        alert("Must connect to the settlement just placed!");
        return;
      }
      
      setPendingRoad(edgeId);
    } else if (devCardAction?.type === 'Road Building') {
      const currentSelection = devCardAction.selection || [];
      if (currentSelection.includes(edgeId)) {
        setDevCardAction({ ...devCardAction, selection: currentSelection.filter(id => id !== edgeId) });
      } else if (currentSelection.length < 2) {
        setDevCardAction({ ...devCardAction, selection: [...currentSelection, edgeId] });
      }
    } else if (buildingMode === 'ROAD') {
      socket.emit('build_road', { edgeId });
      setBuildingMode(null);
    }
  };

  const handleConfirmSetup = () => {
    if (pendingSettlement !== null) {
      socket.emit('build_settlement', { nodeId: pendingSettlement });
    } else if (pendingRoad !== null) {
      socket.emit('build_road', { edgeId: pendingRoad });
    }
  };

  const handleConfirmRoadBuilding = () => {
    if (devCardAction?.type === 'Road Building' && devCardAction.selection.length === 2) {
      socket.emit('play_road_building', { cardId: devCardAction.cardId, edgeIds: devCardAction.selection });
      setDevCardAction(null);
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

  // Player-to-Player Trade Handlers
  const handlePlayerTradeChange = (side, res, delta) => {
    const setter = side === 'offer' ? setTradeOfferSelection : setTradeRequestSelection;
    const current = side === 'offer' ? tradeOfferSelection : tradeRequestSelection;
    
    setter(prev => {
      const next = { ...prev };
      next[res] += delta;
      if (next[res] < 0) next[res] = 0;
      if (side === 'offer' && next[res] > player.resources[res]) next[res] = player.resources[res];
      return next;
    });
  };

  const handleProposeTrade = () => {
    socket.emit('propose_trade', { offer: tradeOfferSelection, request: tradeRequestSelection });
  };

  const handleRespondToTrade = (accepted) => {
    socket.emit('respond_to_trade', { accepted });
  };

  const handleConfirmTrade = (responderId) => {
    socket.emit('confirm_trade', { responderId });
  };

  const handleCancelTrade = () => {
    socket.emit('cancel_trade');
  };

  // Dev Card Actions
  const handlePlayCard = (card) => {
    if (!card.canPlay || gameState.hasPlayedDevCard || !gameState.hasRolled) return;

    if (card.type === 'Knight') {
      socket.emit('play_knight', { cardId: card.id });
    } else if (card.type === 'Year of Plenty') {
      setDevCardAction({ type: 'Year of Plenty', cardId: card.id, selection: [] });
    } else if (card.type === 'Monopoly') {
      setDevCardAction({ type: 'Monopoly', cardId: card.id, selection: [] });
    } else if (card.type === 'Road Building') {
      setDevCardAction({ type: 'Road Building', cardId: card.id, selection: [] });
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
  
  const isTradeProposer = gameState.tradeProposal?.proposerId === playerId;
  const canAcceptTrade = gameState.tradeProposal && !isTradeProposer && player && (() => {
    for (const res in gameState.tradeProposal.request) {
      if (player.resources[res] < gameState.tradeProposal.request[res]) return false;
    }
    return true;
  })();

  if (gameState.phase === 'LOBBY') {
    return (
      <div className="App App-lobby">
        <h1>Settlers of Catan - Lobby</h1>
        {!player ? (
          <form onSubmit={handleJoin} className="lobby-form">
            <input type="text" placeholder="Your Name" value={playerName} onChange={e => setPlayerName(e.target.value)} required />
            <div className="color-picker-container">
              <span>Pick a color:</span>
              <input type="color" value={playerColor} onChange={e => setPlayerColor(e.target.value)} title="Choose your color" />
            </div>
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

  if (gameState.phase === 'GAME_OVER') {
    const sortedPlayers = [...gameState.players].sort((a, b) => b.vp - a.vp);
    const winner = sortedPlayers[0];
    const isHost = gameState.turnOrder[0] === playerId;

    return (
      <div className="App App-lobby game-over-screen">
        <h1 className="winner-announcement" style={{ color: winner.color }}>
          {winner.name} Wins!
        </h1>
        <h2>Final Leaderboard</h2>
        <div className="leaderboard-container">
          <table className="vp-breakdown-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Total VP</th>
                <th>Settlements</th>
                <th>Cities</th>
                <th>Awards</th>
                <th>Dev Cards</th>
              </tr>
            </thead>
            <tbody>
              {sortedPlayers.map(p => (
                <tr key={p.id} style={{ borderLeft: `5px solid ${p.color}` }}>
                  <td><strong>{p.name}</strong></td>
                  <td><strong>{p.vp}</strong></td>
                  <td>{p.settlementCount}</td>
                  <td>{p.cityCount}</td>
                  <td>
                    {p.id === gameState.largestArmyPlayer && <div>Largest Army ({p.knightsPlayed} Knights)</div>}
                    {p.id === gameState.longestRoadPlayer && <div>Longest Road ({p.longestRoad} segments)</div>}
                    {p.id !== gameState.largestArmyPlayer && p.id !== gameState.longestRoadPlayer && "-"}
                  </td>
                  <td>{p.vpCardCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {isHost ? (
          <button className="action-btn restart-btn" onClick={handleRestartGame}>Start New Game</button>
        ) : (
          <p>Waiting for host to restart...</p>
        )}
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
      <div className="sidebar">
        {player && (
          <>
            <div className="sidebar-section">
              <h4>Player</h4>
              <div className="player-info" style={{ borderColor: player.color, borderLeftWidth: '10px' }}>
                <div style={{ fontWeight: 'bold', fontSize: '1.2rem' }}>{player.name}</div>
                <div>VP: {player.vp} | Knights: {player.knightsPlayed} | Road: {player.longestRoad}</div>
              </div>
            </div>

            <div className="sidebar-section">
              <h4>Resources</h4>
              <div className="resource-grid">
                <div className="resource-item res-wood" title="Wood"><GiWoodPile /> {player.resources.Wood}</div>
                <div className="resource-item res-brick" title="Brick"><GiBrickWall /> {player.resources.Brick}</div>
                <div className="resource-item res-sheep" title="Sheep"><GiSheep /> {player.resources.Sheep}</div>
                <div className="resource-item res-wheat" title="Wheat"><GiWheat /> {player.resources.Wheat}</div>
                <div className="resource-item res-ore" title="Ore"><GiOre /> {player.resources.Ore}</div>
              </div>
            </div>

            <div className="sidebar-section">
              <h4>Actions</h4>
              <div className="modal-actions">
                {isMyTurn && gameState.phase === 'MAIN' && (
                  <>
                    {!gameState.hasRolled ? (
                      <button className="action-btn" onClick={handleRollDice}>Roll Dice</button>
                    ) : (
                      <>
                        <button className="action-btn" onClick={() => setActiveModal('build')}>Build...</button>
                        <button className="action-btn" onClick={() => setActiveModal('trade')}>Trade...</button>
                        <button className="action-btn" onClick={() => setActiveModal('devCards')}>Dev Cards ({player.devCards.length})</button>
                        <button className="action-btn" onClick={handleEndTurn} disabled={gameState.mustMoveRobber}>End Turn</button>
                      </>
                    )}
                  </>
                )}
                {!isMyTurn && <p>Waiting for {activePlayerName}...</p>}
              </div>
            </div>

            <div className="sidebar-dice">
              <h4>Last Roll</h4>
              <div className="dice-result">
                {gameState.lastRoll ? (
                  <h3>{gameState.lastRoll.roll} ({gameState.lastRoll.d1}+{gameState.lastRoll.d2})</h3>
                ) : (
                  <h3>-</h3>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="main-content">
        <h1>Settlers of Catan</h1>

        {gameState.phase === 'INITIAL_SETUP' && (
          <div className="player-info" style={{ maxWidth: '500px', marginBottom: '20px' }}>
            <p className="phase-indicator"><strong>Phase: Initial Setup</strong></p>
            {isMyTurn && (
              <>
                <p className="instruction">
                  {!gameState.setupState.settlementPlaced 
                    ? "Click on an intersection to build your Settlement." 
                    : "Now click on an adjacent edge to build your Road."}
                </p>
                {(pendingSettlement !== null || pendingRoad !== null) && (
                  <button className="action-btn" onClick={handleConfirmSetup}>Confirm Placement</button>
                )}
              </>
            )}
          </div>
        )}

        {devCardAction?.type === 'Road Building' && (
          <div className="player-info" style={{ maxWidth: '500px', marginBottom: '20px', background: 'rgba(217, 119, 67, 0.1)' }}>
            <p className="build-prompt">Road Building: Click two edges on the board ({devCardAction.selection.length}/2)</p>
            {devCardAction.selection.length === 2 && (
              <button className="action-btn" onClick={handleConfirmRoadBuilding}>Confirm Road Building</button>
            )}
            <button className="purchase-btn" onClick={() => setDevCardAction(null)} style={{ marginLeft: '10px' }}>Cancel</button>
          </div>
        )}

        {isMyTurn && gameState.mustMoveRobber && (
          <p className="build-prompt" style={{ fontSize: '1.5rem' }}>You must move the robber! Click a hex on the board.</p>
        )}

        <Board 
          board={gameState.board} 
          nodes={gameState.nodes} 
          edges={gameState.edges} 
          players={gameState.players}
          robberHexId={gameState.robberHexId}
          pendingSettlementNodeId={pendingSettlement}
          pendingRoadEdgeIds={devCardAction?.type === 'Road Building' ? devCardAction.selection : (pendingRoad !== null ? [pendingRoad] : [])}
          onNodeClick={isMyTurn && !gameState.mustMoveRobber ? handleNodeClick : null}
          onEdgeClick={isMyTurn && !gameState.mustMoveRobber ? handleEdgeClick : null}
          onHexClick={isMyTurn && gameState.mustMoveRobber ? handleHexClick : null}
        />

        {/* MODALS */}
        {activeModal === 'build' && (
          <div className="overlay" onClick={() => setActiveModal(null)}>
            <div className="overlay-content" onClick={e => e.stopPropagation()}>
              <h3>Build Structures</h3>
              <div className="modal-actions">
                <div className="modal-row">
                  <button className={getButtonClass(buildingMode === 'ROAD', canAffordRoad)} onClick={() => { setBuildingMode('ROAD'); setActiveModal(null); }}>Road</button>
                  <span>1 Wood, 1 Brick</span>
                </div>
                <div className="modal-row">
                  <button className={getButtonClass(buildingMode === 'SETTLEMENT', canAffordSettlement)} onClick={() => { setBuildingMode('SETTLEMENT'); setActiveModal(null); }}>Settlement</button>
                  <span>1 Wood, 1 Brick, 1 Sheep, 1 Wheat</span>
                </div>
                <div className="modal-row">
                  <button className={getButtonClass(buildingMode === 'CITY', canAffordCity)} onClick={() => { setBuildingMode('CITY'); setActiveModal(null); }}>City</button>
                  <span>2 Wheat, 3 Ore</span>
                </div>
                <div className="modal-row">
                  <button className={getButtonClass(false, canAffordDevCard)} onClick={() => { handleDrawDevCard(); setActiveModal(null); }}>Dev Card</button>
                  <span>1 Sheep, 1 Wheat, 1 Ore</span>
                </div>
              </div>
              <button className="purchase-btn" style={{ marginTop: '20px' }} onClick={() => setActiveModal(null)}>Close</button>
            </div>
          </div>
        )}

        {activeModal === 'trade' && (
          <div className="overlay" onClick={() => setActiveModal(null)}>
            <div className="overlay-content" style={{ minWidth: '500px' }} onClick={e => e.stopPropagation()}>
              <div className="trade-type-toggle">
                <button className={tradeType === 'bank' ? 'active' : ''} onClick={() => setTradeType('bank')}>Bank Trade</button>
                <button className={tradeType === 'player' ? 'active' : ''} onClick={() => setTradeType('player')}>Player Trade</button>
              </div>

              {tradeType === 'bank' ? (
                <>
                  <h3>Bank Trade ({tradeRate}:1)</h3>
                  <div className="trade-modal-ui">
                    <div>
                      <label>Offer: </label>
                      <select value={tradeOffer} onChange={e => setTradeOffer(e.target.value)}>{['Wood','Brick','Sheep','Wheat','Ore'].map(r => <option key={r} value={r}>{r}</option>)}</select>
                    </div>
                    <div>&darr;</div>
                    <div>
                      <label>Receive: </label>
                      <select value={tradeRequest} onChange={e => setTradeRequest(e.target.value)}>{['Wood','Brick','Sheep','Wheat','Ore'].map(r => <option key={r} value={r}>{r}</option>)}</select>
                    </div>
                    <button className="action-btn" disabled={!canAffordTrade} onClick={() => { handleBankTrade(); setActiveModal(null); }}>Confirm Trade</button>
                  </div>
                </>
              ) : (
                <>
                  <h3>Propose Trade</h3>
                  {!gameState.tradeProposal ? (
                    <div className="player-trade-ui">
                      <div className="trade-grid-container">
                        <div className="trade-column">
                          <h4>You Give:</h4>
                          {['Wood','Brick','Sheep','Wheat','Ore'].map(res => (
                            <div key={res} className="trade-row">
                              <span>{res}: {player.resources[res]}</span>
                              <div className="discard-controls">
                                <button onClick={() => handlePlayerTradeChange('offer', res, -1)}>-</button>
                                <span>{tradeOfferSelection[res]}</span>
                                <button onClick={() => handlePlayerTradeChange('offer', res, 1)}>+</button>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="trade-column">
                          <h4>You Get:</h4>
                          {['Wood','Brick','Sheep','Wheat','Ore'].map(res => (
                            <div key={res} className="trade-row">
                              <span>{res}</span>
                              <div className="discard-controls">
                                <button onClick={() => handlePlayerTradeChange('request', res, -1)}>-</button>
                                <span>{tradeRequestSelection[res]}</span>
                                <button onClick={() => handlePlayerTradeChange('request', res, 1)}>+</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <button className="action-btn" onClick={handleProposeTrade}>Propose to Table</button>
                    </div>
                  ) : (
                    <div className="trade-status">
                      <p><strong>Offer Sent!</strong> Waiting for others to respond...</p>
                      <div className="responders-list">
                        {gameState.tradeProposal.responses.length === 0 ? <p>No one has accepted yet.</p> : (
                          gameState.tradeProposal.responses.map(rid => (
                            <div key={rid} className="responder-item">
                              <span>{gameState.players.find(p => p.id === rid).name} accepted</span>
                              <button className="action-btn" onClick={() => { handleConfirmTrade(rid); setActiveModal(null); }}>Confirm</button>
                            </div>
                          ))
                        )}
                      </div>
                      <button className="purchase-btn" onClick={handleCancelTrade}>Cancel Proposal</button>
                    </div>
                  )}
                </>
              )}
              <button className="purchase-btn" style={{ marginTop: '20px' }} onClick={() => setActiveModal(null)}>Close</button>
            </div>
          </div>
        )}

        {activeModal === 'devCards' && (
          <div className="overlay" onClick={() => setActiveModal(null)}>
            <div className="overlay-content" style={{ minWidth: '400px' }} onClick={e => e.stopPropagation()}>
              <h3>Your Development Cards</h3>
              <div className="dev-card-grid">
                {player.devCards.map(card => (
                  <button 
                    key={card.id} 
                    className={`dev-card ${card.canPlay && !gameState.hasPlayedDevCard && gameState.hasRolled ? 'playable' : 'unplayable'}`}
                    disabled={!card.canPlay || gameState.hasPlayedDevCard || !isMyTurn || !gameState.hasRolled}
                    onClick={() => { handlePlayCard(card); setActiveModal(null); }}
                  >
                    {card.type === 'Knight' && <GiSwordsEmblem />}
                    {card.type === 'Victory Point' && <GiTrophy />}
                    {card.type !== 'Knight' && card.type !== 'Victory Point' && <GiCardPlay />}
                    <span>{card.type}</span>
                  </button>
                ))}
                {player.devCards.length === 0 && <p>No cards held</p>}
              </div>
              <button className="purchase-btn" style={{ marginTop: '20px' }} onClick={() => setActiveModal(null)}>Close</button>
            </div>
          </div>
        )}

        {/* Overlays from previous implementation */}
        {devCardAction && (devCardAction.type === 'Year of Plenty' || devCardAction.type === 'Monopoly') && (
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

        {gameState.tradeProposal && !isTradeProposer && (
          <div className="overlay">
            <div className="overlay-content" style={{ minWidth: '450px' }}>
              <h3>Trade Offer from {gameState.players.find(p => p.id === gameState.tradeProposal.proposerId).name}</h3>
              <div className="trade-proposal-details">
                <div className="trade-side">
                  <h4>You Get:</h4>
                  {Object.entries(gameState.tradeProposal.offer).filter(([_, count]) => count > 0).map(([res, count]) => (
                    <div key={res}>{count} x {res}</div>
                  ))}
                </div>
                <div className="trade-side">
                  <h4>You Give:</h4>
                  {Object.entries(gameState.tradeProposal.request).filter(([_, count]) => count > 0).map(([res, count]) => (
                    <div key={res} style={{ color: player.resources[res] < count ? 'red' : 'inherit' }}>
                      {count} x {res} (You have: {player.resources[res]})
                    </div>
                  ))}
                </div>
              </div>
              <div className="modal-actions" style={{ marginTop: '25px', flexDirection: 'row', justifyContent: 'center' }}>
                <button className="action-btn" disabled={!canAcceptTrade || gameState.tradeProposal.responses.includes(playerId)} onClick={() => handleRespondToTrade(true)}>
                  {gameState.tradeProposal.responses.includes(playerId) ? "Accepted" : "Accept Trade"}
                </button>
                <button className="purchase-btn" onClick={() => handleRespondToTrade(false)}>Decline</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;