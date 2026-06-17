import { generateApiKey, sha256Hex } from '../src/utils/crypto.js';

const apiKey = generateApiKey();
console.log(`Plain API key: ${apiKey}`);
console.log(`Hash for config: ${sha256Hex(apiKey)}`);
