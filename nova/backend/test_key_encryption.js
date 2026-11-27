import axios from 'axios';
import { get, run } from './database/db.js';
import { decryptData } from './security/cryptoUtils.js';

async function test() {
  console.log('--- TEST: KEY ENCRYPTION AT REST ---');
  const rawKey = 'gsk_testGroqKey1234567890SecretAlpha';
  
  const saveRes = await axios.post('http://localhost:5000/api/settings', {
    groq_api_key: rawKey,
    primary_provider: 'groq',
    fallback_provider: 'openrouter'
  });
  console.log('1. Save response:', saveRes.data);

  const getRes = await axios.get('http://localhost:5000/api/settings');
  console.log('2. Masked key returned to client:', getRes.data.settings.groq_api_key);
  console.log('3. Has key flag:', getRes.data.settings.has_groq_api_key);

  const dbRow = await get("SELECT value FROM settings WHERE key = 'groq_api_key'");
  console.log('4. Stored in SQLite (Ciphertext bundle):', dbRow.value);
  const colonCount = (dbRow.value.match(/:/g) || []).length;
  console.log('5. Is AES-256-GCM bundle (2 colons iv:authTag:cipher):', colonCount === 2);
  
  const decrypted = decryptData(dbRow.value);
  console.log('6. Decrypts cleanly with master key:', decrypted === rawKey);

  // Clean up
  await run("DELETE FROM settings WHERE key = 'groq_api_key'");
  console.log('7. Cleanup done.');
  process.exit(0);
}

test().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
