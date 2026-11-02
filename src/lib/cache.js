/*
 * Cache pequena em memória para contagens do quadro (evita repetir as mesmas
 * leituras quando várias pessoas abrem o mesmo quadro). Tem tamanho máximo fixo
 * para a memória não crescer.
 */
const MAX_ENTRIES = 40;
const store = new Map();

async function remember(key, ttlSeconds, fn) {
  const hit = store.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  const value = await fn();
  store.set(key, { value, expires: Date.now() + ttlSeconds * 1000 });
  while (store.size > MAX_ENTRIES) store.delete(store.keys().next().value);
  return value;
}

function clear() {
  store.clear();
}

module.exports = { remember, clear };
