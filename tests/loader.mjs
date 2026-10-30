export async function resolve(specifier, context, next) {
  if (specifier === 'sdk') {
    return { url: new URL('./stub-sdk.mjs', import.meta.url).href, shortCircuit: true };
  }
  if (specifier === 'sdk/db') {
    return { url: new URL('./stub-db.mjs', import.meta.url).href, shortCircuit: true };
  }
  if (specifier.endsWith('secret.js')) {
    return { url: new URL('./stub-secret.mjs', import.meta.url).href, shortCircuit: true };
  }
  return next(specifier, context);
}
