// GHL OAuth helper - handles Company→Location token exchange with auto-persistence
import { getSupabase } from './supabase'

const GHL_API_BASE = 'https://services.leadconnectorhq.com';

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
  companyId?: string;
  locationId?: string;
}

interface LocationTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
  companyId: string;
  locationId: string;
}

// Company (Agency) configs
interface CompanyConfig {
  companyId: string;
  locations: string[]; // locationIds this company covers
}

const COMPANY_CONFIGS: Record<string, CompanyConfig> = {
  vegas: {
    companyId: 'wX6xVVyBQwLwMugrEdvR',
    locations: ['1isaYfEkvNkyLH3XepI5'], // TR04 Las Vegas
  },
  salesjet: {
    companyId: 'VVkTNsveI02sHUrJ0gOM',
    locations: ['cl9YH8PZgv32HEz5pIXT', 'DJfIuAH1tTxRRBEufitL'], // TR01 SG, TR02 Irvine
  },
};

// Location to company mapping
const LOCATION_TO_COMPANY: Record<string, keyof typeof COMPANY_CONFIGS> = {
  '1isaYfEkvNkyLH3XepI5': 'vegas',      // TR04 Las Vegas
  'cl9YH8PZgv32HEz5pIXT': 'salesjet',   // TR01 San Gabriel
  'DJfIuAH1tTxRRBEufitL': 'salesjet',   // TR02 Irvine
};

// In-memory cache for tokens (per-request in serverless)
const companyTokenCache: Record<string, { token: string; expiresAt: number }> = {};
const locationTokenCache: Record<string, { token: string; expiresAt: number }> = {};

function getClientCredentials() {
  const clientId = process.env.GHL_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GHL_OAUTH_CLIENT_SECRET;
  
  if (!clientId || !clientSecret) {
    throw new Error('Missing GHL OAuth client credentials');
  }
  
  return { clientId, clientSecret };
}

// Get refresh token from Supabase (with fallback to env vars for initial setup)
async function getRefreshToken(companyKey: string): Promise<string | null> {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('ghl_tokens')
      .select('refresh_token')
      .eq('id', companyKey)
      .single();
    
    if (data?.refresh_token) {
      return data.refresh_token;
    }
  } catch (err) {
    console.log(`Token lookup failed for ${companyKey}, trying env var fallback`);
  }
  
  // Fallback to env vars (for initial setup or if DB fails)
  const envVarName = companyKey === 'vegas' ? 'GHL_OAUTH_VEGAS_REFRESH' : 'GHL_OAUTH_SALESJET_REFRESH';
  return process.env[envVarName] || null;
}

// Save new tokens to Supabase after refresh
async function saveTokens(
  companyKey: string, 
  companyId: string,
  refreshToken: string, 
  accessToken: string, 
  expiresIn: number
): Promise<void> {
  try {
    const supabase = getSupabase();
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
    
    await supabase
      .from('ghl_tokens')
      .upsert({
        id: companyKey,
        company_id: companyId,
        refresh_token: refreshToken,
        access_token: accessToken,
        access_token_expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      });
    
    console.log(`✓ Saved new tokens for ${companyKey}`);
  } catch (err) {
    console.error(`Failed to save tokens for ${companyKey}:`, err);
    // Don't throw - we can still use the token even if save fails
  }
}

// Step 1: Get Company-level access token using refresh token
async function getCompanyAccessToken(companyKey: keyof typeof COMPANY_CONFIGS): Promise<string> {
  const config = COMPANY_CONFIGS[companyKey];
  const cacheKey = companyKey;
  
  // Check memory cache (with 5 min buffer)
  const cached = companyTokenCache[cacheKey];
  if (cached && cached.expiresAt > Date.now() + 5 * 60 * 1000) {
    return cached.token;
  }
  
  // Get refresh token from DB or env
  const refreshToken = await getRefreshToken(companyKey);
  if (!refreshToken) {
    throw new Error(`No refresh token available for ${companyKey}`);
  }
  
  const { clientId, clientSecret } = getClientCredentials();
  
  const response = await fetch(`${GHL_API_BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    console.error(`Company token refresh failed for ${companyKey}:`, error);
    throw new Error(`Failed to refresh company token: ${error}`);
  }
  
  const data: TokenResponse = await response.json();
  
  // CRITICAL: Save the new refresh token (GHL rotates them!)
  await saveTokens(companyKey, config.companyId, data.refresh_token, data.access_token, data.expires_in);
  
  // Update memory cache
  companyTokenCache[cacheKey] = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  
  console.log(`✓ Company token refreshed for ${companyKey}`);
  return data.access_token;
}

// Step 2: Exchange Company token for Location-level token
async function getLocationAccessToken(locationId: string): Promise<string> {
  const cacheKey = locationId;
  
  // Check memory cache (with 5 min buffer)
  const cached = locationTokenCache[cacheKey];
  if (cached && cached.expiresAt > Date.now() + 5 * 60 * 1000) {
    return cached.token;
  }
  
  const companyKey = LOCATION_TO_COMPANY[locationId];
  if (!companyKey) {
    throw new Error(`Unknown location: ${locationId}`);
  }
  
  const config = COMPANY_CONFIGS[companyKey];
  const companyToken = await getCompanyAccessToken(companyKey);
  
  const response = await fetch(`${GHL_API_BASE}/oauth/locationToken`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${companyToken}`,
      'Content-Type': 'application/json',
      'Version': '2021-07-28',
    },
    body: JSON.stringify({
      companyId: config.companyId,
      locationId: locationId,
    }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    console.error(`Location token failed for ${locationId}:`, error);
    throw new Error(`Failed to get location token: ${error}`);
  }
  
  const data: LocationTokenResponse = await response.json();
  
  locationTokenCache[cacheKey] = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  
  console.log(`✓ Location token acquired for ${locationId}`);
  return data.access_token;
}

export async function updateOpportunity(
  locationId: string,
  opportunityId: string,
  updates: { monetaryValue?: number; pipelineStageId?: string; [key: string]: unknown }
): Promise<{ success: boolean; error?: string }> {
  try {
    const accessToken = await getLocationAccessToken(locationId);
    
    const response = await fetch(
      `${GHL_API_BASE}/opportunities/${opportunityId}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Version': '2021-07-28',
        },
        body: JSON.stringify(updates),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error(`GHL update failed for ${opportunityId}:`, {
        status: response.status,
        error,
        locationId,
      });
      return { success: false, error: `GHL API error: ${response.status} - ${error}` };
    }

    console.log(`✓ GHL update success for ${opportunityId}`);
    return { success: true };
  } catch (error) {
    console.error(`GHL update exception for ${opportunityId}:`, error);
    return { success: false, error: String(error) };
  }
}

export async function updateOpportunityValue(
  locationId: string,
  opportunityId: string,
  monetaryValue: number
): Promise<{ success: boolean; error?: string }> {
  return updateOpportunity(locationId, opportunityId, { monetaryValue });
}

// Export location token getter for direct API access
export async function getLocationToken(
  companyId: string,
  locationId: string
): Promise<{ success: boolean; accessToken?: string; error?: string }> {
  try {
    const accessToken = await getLocationAccessToken(locationId);
    return { success: true, accessToken };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// Seed initial tokens from env vars to Supabase (run once during setup)
export async function seedTokensFromEnv(): Promise<{ success: boolean; seeded: string[] }> {
  const seeded: string[] = [];
  
  for (const [companyKey, config] of Object.entries(COMPANY_CONFIGS)) {
    const envVarName = companyKey === 'vegas' ? 'GHL_OAUTH_VEGAS_REFRESH' : 'GHL_OAUTH_SALESJET_REFRESH';
    const refreshToken = process.env[envVarName];
    
    if (refreshToken) {
      try {
        const supabase = getSupabase();
        await supabase
          .from('ghl_tokens')
          .upsert({
            id: companyKey,
            company_id: config.companyId,
            refresh_token: refreshToken,
            updated_at: new Date().toISOString(),
          });
        seeded.push(companyKey);
      } catch (err) {
        console.error(`Failed to seed ${companyKey}:`, err);
      }
    }
  }
  
  return { success: true, seeded };
}
