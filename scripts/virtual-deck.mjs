import { startVirtualDeck } from '../tests/e2e/virtual-host/server.ts';
const preview = await startVirtualDeck();
process.stdout.write('DeckShep virtual deck: ' + preview.origin + '\n');
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await preview.close();
}
process.once('SIGINT', () => {
  void close();
});
process.once('SIGTERM', () => {
  void close();
});
