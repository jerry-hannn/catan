import React from 'react';
import { GiWoodPile, GiBrickWall, GiSheep, GiWheat, GiOre } from 'react-icons/gi';

// Maps resource types to colors
const resourceColors = {
  Wood: '#2d6a4f',
  Brick: '#9c6644',
  Sheep: '#90be6d',
  Wheat: '#f9c74f',
  Ore: '#8d99ae',
  Desert: '#e9c46a'
};

const ResourceIcon = ({ resource, size = 30 }) => {
  switch (resource) {
    case 'Wood': return <GiWoodPile size={size} color="rgba(255, 255, 255, 0.5)" />;
    case 'Brick': return <GiBrickWall size={size} color="rgba(255, 255, 255, 0.5)" />;
    case 'Sheep': return <GiSheep size={size} color="rgba(255, 255, 255, 0.5)" />;
    case 'Wheat': return <GiWheat size={size} color="rgba(255, 255, 255, 0.5)" />;
    case 'Ore': return <GiOre size={size} color="rgba(255, 255, 255, 0.5)" />;
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

const Board = ({ board }) => {
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
          
          return (
            <g key={hex.id}>
              <polygon
                points={getHexPoints(px, py)}
                fill={resourceColors[hex.resource]}
                stroke="#fff"
                strokeWidth="2"
              />
              
              {/* Resource Icon (Moved up to avoid overlapping the number) */}
              <g transform={`translate(${px - 15}, ${py - 30})`}>
                <ResourceIcon resource={hex.resource} />
              </g>

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
            </g>
          );
        })}
      </svg>
    </div>
  );
};

export default Board;