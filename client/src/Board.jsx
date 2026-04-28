import React from 'react';
import { GiWoodPile, GiBrickWall, GiSheep, GiWheat, GiOre } from 'react-icons/gi';
import { FaQuestion, FaHome, FaCity, FaUserSecret } from 'react-icons/fa';

// Maps resource types to colors
const resourceColors = {
  Wood: '#2d6a4f',
  Brick: '#9c6644',
  Sheep: '#90be6d',
  Wheat: '#f9c74f',
  Ore: '#8d99ae',
  Desert: '#e9c46a',
  Ocean: '#4ea8de'
};

const ResourceIcon = ({ resource, size = 30, color = "rgba(255, 255, 255, 0.5)" }) => {
  switch (resource) {
    case 'Wood': return <GiWoodPile size={size} color={color} />;
    case 'Brick': return <GiBrickWall size={size} color={color} />;
    case 'Sheep': return <GiSheep size={size} color={color} />;
    case 'Wheat': return <GiWheat size={size} color={color} />;
    case 'Ore': return <GiOre size={size} color={color} />;
    case '3:1': return <FaQuestion size={size} color={color} />;
    default: return null;
  }
};

const HEX_SIZE = 50;
const HEX_WIDTH = Math.sqrt(3) * HEX_SIZE;
const HEX_HEIGHT = 2 * HEX_SIZE;

// Converts axial coordinates (q, r) to pixel coordinates (x, y)
const hexToPixel = (q, r) => {
  const x = HEX_SIZE * Math.sqrt(3) * (q + r / 2);
  const y = HEX_SIZE * 3/2 * r;
  return { x, y };
};

// Generates points for SVG polygon
const getHexPoints = (x, y) => {
  const points = [];
  for (let i = 0; i < 6; i++) {
    const angle_deg = 60 * i - 30;
    const angle_rad = Math.PI / 180 * angle_deg;
    points.push(`${x + HEX_SIZE * Math.cos(angle_rad)},${y + HEX_SIZE * Math.sin(angle_rad)}`);
  }
  return points.join(' ');
};

// Generates dots indicating probability of roll
const renderPips = (numberToken, cx, cy) => {
  const pipsCount = 6 - Math.abs(7 - numberToken);
  const color = (numberToken === 6 || numberToken === 8) ? 'red' : 'black';
  const pips = [];
  const pipSpacing = 4;
  const startX = cx - ((pipsCount - 1) * pipSpacing) / 2;
  
  for (let i = 0; i < pipsCount; i++) {
    pips.push(
      <circle key={i} cx={startX + i * pipSpacing} cy={cy} r="1.5" fill={color} />
    );
  }
  return pips;
};

const Board = ({ board, nodes, edges, players, onNodeClick, onEdgeClick, robberHexId, onHexClick, pendingSettlementNodeId, pendingRoadEdgeIds = [] }) => {
  if (!board || board.length === 0) return null;

  // Find bounding box to center the SVG
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  board.forEach(({ coord }) => {
    const { x, y } = hexToPixel(coord.q, coord.r);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  });

  const width = maxX - minX + HEX_WIDTH * 2;
  const height = maxY - minY + HEX_HEIGHT * 2;
  const offsetX = -minX + HEX_WIDTH;
  const offsetY = -minY + HEX_HEIGHT;

  return (
    <div className="board-container">
      <svg width={width} height={height}>
        {board.map((hex) => {
          const { x, y } = hexToPixel(hex.coord.q, hex.coord.r);
          const px = x + offsetX;
          const py = y + offsetY;
          
          const isHoverableHex = onHexClick && hex.resource !== 'Ocean' && hex.id !== robberHexId;

          return (
            <g 
              key={hex.id} 
              onClick={() => isHoverableHex && onHexClick(hex.id)} 
              style={{ cursor: isHoverableHex ? 'pointer' : 'default' }}
            >
              <polygon
                points={getHexPoints(px, py)}
                fill={resourceColors[hex.resource]}
                stroke={hex.resource === 'Ocean' ? '#5eb8e8' : '#fff'}
                strokeWidth={hex.resource === 'Ocean' ? '1' : '2'}
              />
              
              {/* Resource Icon */}
              {hex.resource !== 'Ocean' && (
                <g transform={`translate(${px - 15}, ${py - 30})`}>
                  <ResourceIcon resource={hex.resource} />
                </g>
              )}

              {/* Number Token */}
              {hex.numberToken && (
                <>
                  <circle cx={px} cy={py + 12} r="18" fill="#ffeebb" />
                  <text 
                    x={px} 
                    y={py + 9} 
                    textAnchor="middle" 
                    dominantBaseline="middle"
                    fill={hex.numberToken === 6 || hex.numberToken === 8 ? 'red' : 'black'}
                    fontWeight="bold"
                    fontSize="14"
                  >
                    {hex.numberToken}
                  </text>
                  {renderPips(hex.numberToken, px, py + 20)}
                </>
              )}

              {/* Robber Icon */}
              {hex.id === robberHexId && (
                <g transform={`translate(${px - 18}, ${hex.numberToken ? py - 20 : py - 18})`}>
                  <circle cx="18" cy="18" r="22" fill="rgba(0,0,0,0.6)" />
                  <FaUserSecret size={36} color="#333" />
                </g>
              )}

              {/* Port */}
              {hex.port && (
                <g>
                  {hex.portNodeIds && hex.portNodeIds.map((nId, idx) => {
                    const portNode = nodes && nodes.find(n => n.id === nId);
                    if (!portNode) return null;
                    return (
                      <line 
                        key={idx}
                        x1={px} y1={py} 
                        x2={portNode.x + offsetX} y2={portNode.y + offsetY} 
                        stroke="#d97743" 
                        strokeWidth="3" 
                        strokeDasharray="4 4"
                      />
                    );
                  })}
                  <circle cx={px} cy={py} r="22" fill="#fdf8ef" stroke="#d97743" strokeWidth="2" />
                  <g transform={`translate(${px - 10}, ${py - 14})`}>
                    <ResourceIcon resource={hex.port.replace(' 2:1', '')} size={20} color="#2c2a29" />
                  </g>
                  <text
                    x={px} 
                    y={py + 10} 
                    textAnchor="middle" 
                    dominantBaseline="middle"
                    fill="#d97743"
                    fontWeight="bold"
                    fontSize="10"
                  >
                    {hex.port.includes('2:1') ? '2:1' : '3:1'}
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {/* Render Edges (Roads) */}
        {edges && edges.map(edge => {
          const v1 = nodes.find(n => n.id === edge.v1);
          const v2 = nodes.find(n => n.id === edge.v2);
          if (!v1 || !v2) return null;
          
          const occupantPlayer = edge.occupant && players ? players.find(p => p.id === edge.occupant) : null;
          const isPending = pendingRoadEdgeIds.includes(edge.id);
          const isHoverable = !edge.occupant && !isPending && onEdgeClick;

          return (
            <g key={`edge-${edge.id}`} onClick={() => onEdgeClick && onEdgeClick(edge.id)} style={{ cursor: isHoverable ? 'pointer' : 'default' }}>
              <line 
                x1={v1.x + offsetX} y1={v1.y + offsetY} 
                x2={v2.x + offsetX} y2={v2.y + offsetY} 
                stroke="transparent" 
                strokeWidth="20" 
              />
              <line 
                x1={v1.x + offsetX} y1={v1.y + offsetY} 
                x2={v2.x + offsetX} y2={v2.y + offsetY} 
                stroke={occupantPlayer ? occupantPlayer.color : (isPending ? "rgba(255,255,255,0.5)" : (isHoverable ? "rgba(255,255,255,0.3)" : "transparent"))} 
                strokeWidth={occupantPlayer || isPending ? "8" : "4"} 
                strokeLinecap="round"
                strokeDasharray={isPending ? "5,5" : "none"}
              />
            </g>
          );
        })}

        {/* Render Nodes (Settlements/Cities) */}
        {nodes && nodes.map(node => {
          const px = node.x + offsetX;
          const py = node.y + offsetY;
          const occupantPlayer = node.occupant && players ? players.find(p => p.id === node.occupant) : null;
          const isPending = node.id === pendingSettlementNodeId;
          const isHoverable = !node.occupant && !isPending && onNodeClick;

          return (
            <g key={`node-${node.id}`} onClick={() => onNodeClick && onNodeClick(node.id)} style={{ cursor: isHoverable ? 'pointer' : 'default' }}>
              <circle cx={px} cy={py} r="20" fill="transparent" />
              
              {!occupantPlayer && isHoverable && (
                <circle 
                  cx={px} cy={py} 
                  r="8" 
                  fill="rgba(255,255,255,0.6)" 
                  stroke="transparent"
                />
              )}

              {isPending && (
                <g transform={`translate(${px - 10}, ${py - 10})`} opacity="0.5">
                  <FaHome size={20} color="#fff" />
                </g>
              )}

              {occupantPlayer && node.buildingType === 'Settlement' && (
                <g transform={`translate(${px - 10}, ${py - 10})`}>
                  <FaHome size={20} color={occupantPlayer.color} stroke="#fff" strokeWidth="20" />
                </g>
              )}

              {occupantPlayer && node.buildingType === 'City' && (
                <g transform={`translate(${px - 12}, ${py - 12})`}>
                  <FaCity size={24} color={occupantPlayer.color} stroke="#fff" strokeWidth="20" />
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};

export default Board;