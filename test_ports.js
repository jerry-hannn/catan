const coords = [];
let q = 0, r = -3;
const directions = [
  [1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]
];
let dirIdx = 0;
for (let i=0; i<18; i++) {
  coords.push({q, r, isPort: i % 2 === 0});
  // move
  let nextQ = q + directions[dirIdx][0];
  let nextR = r + directions[dirIdx][1];
  if (Math.max(Math.abs(nextQ), Math.abs(nextR), Math.abs(-nextQ-nextR)) > 3) {
    dirIdx++;
    nextQ = q + directions[dirIdx][0];
    nextR = r + directions[dirIdx][1];
  }
  q = nextQ;
  r = nextR;
}
console.log(coords.filter(c => c.isPort));
