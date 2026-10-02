// 24-char hex ids (4-byte timestamp + 8 random bytes), same shape as a MongoDB ObjectId,
// so exported data can be imported into MongoDB without changing ids.
function randomHex(bytes) {
  const arr = new Uint8Array(bytes);
  if (globalThis.crypto && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < bytes; i++) arr[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function newId() {
  const ts = Math.floor(Date.now() / 1000).toString(16).padStart(8, '0');
  return ts + randomHex(8);
}
