const { generateBoard } = require('./boardGenerator');
const { RESOURCES } = require('./gameConstants');

console.log("Running board generator test...");

const board = generateBoard();

if (board.length !== 19) {
  console.error("Test Failed: Board does not have 19 hexes. Found:", board.length);
  process.exit(1);
}

const desertHexes = board.filter(h => h.resource === RESOURCES.DESERT);
if (desertHexes.length !== 1) {
  console.error("Test Failed: Board must have exactly 1 Desert. Found:", desertHexes.length);
  process.exit(1);
}

if (desertHexes[0].numberToken !== null) {
  console.error("Test Failed: Desert hex must not have a number token.");
  process.exit(1);
}

console.log("Test Passed: Board generation is valid.");