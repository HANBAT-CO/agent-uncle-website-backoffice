// Prints the master's last frame (the poster frame) from src/timeline.ts (Node type stripping).
//   node scripts/total.mjs
process.removeAllListeners('warning');
const t = await import('../src/timeline.ts');
console.log(t.MASTER.total - 1);
