// Hooks de resolution ESM : traduit les specificateurs Deno des fonctions
// backend vers les substituts locaux. Sans cela, Node echoue sur
// `npm:@base44/sdk@0.8.44` et `base44:runtime`.

import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

const SDK = pathToFileURL(join(import.meta.dirname, 'shims', 'base44-sdk.mjs')).href;
const RUNTIME = pathToFileURL(join(import.meta.dirname, 'shims', 'base44-runtime.mjs')).href;

export async function resolve(specifier, context, next) {
  if (/^npm:@base44\/sdk(@|$)/.test(specifier)) {
    return { url: SDK, shortCircuit: true };
  }
  if (specifier === 'base44:runtime') {
    return { url: RUNTIME, shortCircuit: true };
  }
  return next(specifier, context);
}
