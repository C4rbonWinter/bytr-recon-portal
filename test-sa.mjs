import { SignJWT, importPKCS8 } from 'jose';
import fs from 'fs';

const sa = JSON.parse(fs.readFileSync('../downloads/service-account.json', 'utf8'));

async function test() {
  try {
    const privateKey = await importPKCS8(sa.private_key, 'RS256');
    console.log('Key imported OK');
    
    const now = Math.floor(Date.now() / 1000);
    const jwt = await new SignJWT({
      scope: 'https://www.googleapis.com/auth/drive.readonly',
    })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .setIssuer(sa.client_email)
      .setSubject(sa.client_email)
      .setAudience('https://oauth2.googleapis.com/token')
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(privateKey);
    
    console.log('JWT created OK');
    
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    });
    
    const data = await res.json();
    console.log('Token response:', res.status, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Error:', e.message);
  }
}

test();
