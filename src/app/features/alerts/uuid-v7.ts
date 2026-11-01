/** Canonical RFC 9562 UUIDv7; random bits stay in memory, never a recipient identity. */
export function uuidV7(at = Date.now()): string {
  if (!Number.isSafeInteger(at) || at < 0 || at > 0xffffffffffff)
    throw new Error('Device clock cannot create an alert command key.');
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let time = at;
  for (let index = 5; index >= 0; index--) {
    bytes[index] = time % 256;
    time = Math.floor(time / 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
