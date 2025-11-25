export const DEFAULT_GEMINI_MODEL = 'gemini-1.5-flash-latest';

const FALLBACK_MODEL_PRIORITY = [
  DEFAULT_GEMINI_MODEL,
  'gemini-1.5-flash',
  'gemini-1.5-pro-latest',
  'gemini-1.5-pro',
  'gemini-1.0-pro-latest',
  'gemini-1.0-pro',
  'gemini-pro',
];

export function sanitizeModelName(model) {
  if (!model) return DEFAULT_GEMINI_MODEL;
  const trimmed = String(model).trim();
  if (!trimmed) return DEFAULT_GEMINI_MODEL;

  const withoutVersionHint = trimmed.replace(/^(?:v1beta?|beta|ga):/i, '');
  const segments = withoutVersionHint.split('/');
  const lastSegment = segments[segments.length - 1] || segments[0];
  const cleaned = lastSegment.replace(/[^a-z0-9._-]/gi, '').toLowerCase();
  return cleaned || DEFAULT_GEMINI_MODEL;
}

function addModelVariants(targetSet, value) {
  const name = sanitizeModelName(value);
  if (!name) return;
  targetSet.add(name);
  if (name.endsWith('-latest')) {
    targetSet.add(name.replace(/-latest$/i, ''));
  } else {
    targetSet.add(`${name}-latest`);
  }
}

function expandModelCandidates(requested) {
  const unique = new Set();
  addModelVariants(unique, requested);
  for (const fallback of FALLBACK_MODEL_PRIORITY) {
    addModelVariants(unique, fallback);
  }
  return Array.from(unique);
}

function preferredVersions(modelName) {
  if (/1\.5|flash|preview|experimental/i.test(modelName)) {
    return [true, false]; // try v1beta first for preview models
  }
  return [false, true];
}

const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);
const MAX_RETRIES_PER_ENDPOINT = 3;
const BASE_RETRY_DELAY_MS = 600;

function buildEndpoint(model, useV1Beta = false) {
  const safeModel = sanitizeModelName(model);
  const version = useV1Beta ? 'v1beta' : 'v1';
  return `https://generativelanguage.googleapis.com/${version}/models/${encodeURIComponent(safeModel)}:generateContent`;
}

function resolveApiKey(explicitKey) {
  const key = explicitKey || process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error('Gemini API anahtarı bulunamadı. GEMINI_API_KEY tanımlayın veya AI ayarlarından ekleyin.');
  }
  return key;
}

export async function generateGeminiContent({
  contents,
  systemInstruction,
  apiKey: overrideKey,
  model,
  tools,
  responseMimeType,
}) {
  const apiKey = resolveApiKey(overrideKey);
  
  // Extract system instruction text
  let systemText = null;
  if (systemInstruction) {
    if (systemInstruction.role && systemInstruction.parts && systemInstruction.parts.length > 0) {
      systemText = systemInstruction.parts[0]?.text || null;
    } else if (systemInstruction.parts && systemInstruction.parts.length > 0) {
      systemText = systemInstruction.parts[0]?.text || null;
    } else if (typeof systemInstruction === 'string') {
      systemText = systemInstruction;
    }
  }

  // Build contents array - prepend system instruction if present
  let finalContents = Array.isArray(contents) ? [...contents] : [];
  if (systemText && finalContents.length > 0) {
    // Prepend system instruction to the first user message
    const firstMessage = finalContents[0];
    if (firstMessage && firstMessage.parts && firstMessage.parts.length > 0) {
      const originalText = firstMessage.parts[0].text || '';
      firstMessage.parts[0].text = `${systemText}\n\n${originalText}`;
    } else {
      // Create new first message if structure is different
      finalContents.unshift({
        role: 'user',
        parts: [{ text: systemText }],
      });
    }
  } else if (systemText) {
    // No existing contents, create first message with system instruction
    finalContents = [{
      role: 'user',
      parts: [{ text: systemText }],
    }];
  }

  const body = {
    contents: finalContents,
  };

  if (Array.isArray(tools) && tools.length) {
    body.tools = tools;
  }
  if (responseMimeType) {
    body.responseMimeType = responseMimeType;
  }

  const tried = [];
  const candidateModels = expandModelCandidates(model);

  let data = null;
  let lastError = null;

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  const computeDelay = (attempt, retryAfterHeader, retryAfterMs) => {
    if (Number.isFinite(retryAfterMs) && retryAfterMs > 0) {
      return retryAfterMs;
    }
    if (retryAfterHeader) {
      const retryAfterSeconds = Number(retryAfterHeader);
      if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
        return retryAfterSeconds * 1000;
      }
      const retryAfterDate = Date.parse(retryAfterHeader);
      if (!Number.isNaN(retryAfterDate)) {
        const diff = retryAfterDate - Date.now();
        if (diff > 0) {
          return diff;
        }
      }
    }
    const backoff = BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
    return Math.min(backoff, 8000);
  };

  const parseRetryAfterFromBody = bodyText => {
    if (!bodyText) return null;
    try {
      const parsed = JSON.parse(bodyText);
      const details = parsed?.error?.details;
      if (!Array.isArray(details)) return null;
      for (const detail of details) {
        if (detail?.retryDelay) {
          const value = String(detail.retryDelay).trim();
          if (!value) continue;
          if (/^\d+(\.\d+)?s$/i.test(value)) {
            const seconds = parseFloat(value.replace(/s$/i, ''));
            if (Number.isFinite(seconds)) return seconds * 1000;
          }
          const millis = Number(value);
          if (Number.isFinite(millis)) return millis;
        }
      }
      return null;
    } catch {
      return null;
    }
  };

  for (const candidate of candidateModels) {
    const versionOrder = preferredVersions(candidate);
    for (const useV1Beta of versionOrder) {
      const endpoint = buildEndpoint(candidate, useV1Beta);
      const url = `${endpoint}?key=${encodeURIComponent(apiKey)}`;
      let attempt = 0;
      let shouldTryNextVersion = false;

      while (attempt < MAX_RETRIES_PER_ENDPOINT) {
        attempt += 1;
        const attemptLabel = `${useV1Beta ? 'v1beta' : 'v1'}:${candidate}${attempt > 1 ? `#${attempt}` : ''}`;
        tried.push(attemptLabel);

        let response;
        try {
          response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
          });
        } catch (fetchErr) {
          lastError = new Error(`Gemini API request failed: ${fetchErr.message}`);
          lastError.cause = fetchErr;
          lastError.triedModels = [...tried];
          if (attempt < MAX_RETRIES_PER_ENDPOINT) {
            await sleep(computeDelay(attempt, null));
            continue;
          }
          throw lastError;
        }

        if (response.ok) {
          data = await response.json();
          lastError = null;
          break;
        }

        const text = await response.text();
        lastError = new Error(`Gemini API request failed: ${response.status} ${response.statusText} - ${text}`);
        lastError.triedModels = [...tried];

        if (response.status === 404) {
          shouldTryNextVersion = true;
          break;
        }

        if (RETRYABLE_STATUS.has(response.status) && attempt < MAX_RETRIES_PER_ENDPOINT) {
          const retryAfter = response.headers?.get?.('retry-after');
          const retryHintMs = parseRetryAfterFromBody(text);
          await sleep(computeDelay(attempt, retryAfter, retryHintMs));
          continue;
        }

        throw lastError;
      }

      if (data) {
        break;
      }

      if (shouldTryNextVersion) {
        continue;
      }
    }
    if (data) break;
  }

  if (!data) {
    const error = lastError || new Error('Gemini API request failed: Model bulunamadı');
    error.triedModels = [...tried];
    throw error;
  }

  const candidates = data?.candidates || [];
  if (!candidates.length) {
    throw new Error('Gemini API returned no candidates.');
  }

  const parts = candidates[0]?.content?.parts || [];
  const textPart = parts.find(part => typeof part.text === 'string');
  if (!textPart) {
    throw new Error('Gemini API response did not include text output.');
  }

  return textPart.text.trim();
}
