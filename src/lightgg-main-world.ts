/**
 * DIM Aegis Overlay - Light.gg MAIN World Interceptor
 *
 * Runs in the MAIN world on the Light.gg Roll Appraiser page.
 * Wraps window.fetch to intercept internal API responses that contain
 * weapon grade data (instance IDs + letter grades), then dispatches
 * them to the isolated world content script via a CustomEvent.
 *
 * Also intercepts XMLHttpRequest as a fallback.
 */

const GRADE_PATTERNS = [
  // Letter grades (S+, S, A, B, C, D, F and variants)
  /[SABCDF][+-]?/i,
];

/**
 * Attempts to extract a grade map { instanceId -> grade } from
 * a parsed JSON response body. Tries multiple known Light.gg schemas.
 */
function extractGradesFromJson(data: any): Record<string, string> | null {
  if (!data || typeof data !== 'object') return null;

  const result: Record<string, string> = {};

  // Pattern A: array of weapon objects with instanceId + grade/quality
  if (Array.isArray(data)) {
    for (const item of data) {
      if (!item || typeof item !== 'object') continue;
      // Various field name combinations seen in Light.gg responses
      const id = String(
        item.instanceId || item.instance_id || item.id || item.itemInstanceId || ''
      );
      const grade =
        item.grade ||
        item.quality ||
        item.rank ||
        item.rating ||
        item.letter ||
        item.rollGrade ||
        item.rollQuality;

      if (id && id.length >= 10 && grade && typeof grade === 'string') {
        const match = grade.match(/[SABCDF][+-]?/i);
        if (match) {
          result[id.replace(/^[^0-9]+/, '')] = match[0].toUpperCase();
        }
      }
    }
    if (Object.keys(result).length > 0) return result;
  }

  // Pattern B: object keyed by instanceId
  for (const [key, val] of Object.entries(data)) {
    if (typeof key === 'string' && /^\d{10,20}$/.test(key) && typeof val === 'string') {
      const match = val.match(/[SABCDF][+-]?/i);
      if (match) {
        result[key] = match[0].toUpperCase();
      }
    }
    // Nested object with grade property
    if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
      const inner = val as any;
      const id = String(inner.instanceId || inner.instance_id || inner.id || key || '');
      const grade = inner.grade || inner.quality || inner.rank || inner.rating;
      if (id && /^\d{10,20}$/.test(id) && grade && typeof grade === 'string') {
        const match = grade.match(/[SABCDF][+-]?/i);
        if (match) {
          result[id.replace(/^[^0-9]+/, '')] = match[0].toUpperCase();
        }
      }
    }
  }
  if (Object.keys(result).length > 0) return result;

  // Pattern C: nested under a known wrapper key
  const wrapperKeys = ['items', 'weapons', 'rolls', 'data', 'results', 'inventory'];
  for (const wkey of wrapperKeys) {
    if (Array.isArray(data[wkey])) {
      const nested = extractGradesFromJson(data[wkey]);
      if (nested) return nested;
    }
  }

  return null;
}

/**
 * Dispatches extracted grades to the isolated world content script.
 */
function dispatchGrades(grades: Record<string, string>, source: string) {
  if (Object.keys(grades).length === 0) return;
  console.log(`[DIM Aegis Overlay LGG-MAIN] Intercepted ${Object.keys(grades).length} grades from ${source}`);
  document.dispatchEvent(
    new CustomEvent('__aegis_lgg_grades__', {
      detail: { grades, source },
    })
  );
}

/**
 * Checks if a URL is likely a Light.gg internal API endpoint.
 * We ignore Bungie API calls and CDN requests.
 */
function isLightGGApiUrl(url: string): boolean {
  try {
    const u = new URL(url, window.location.href);
    // Must be on light.gg domain
    if (!u.hostname.includes('light.gg')) return false;
    // Skip static assets and CDN
    if (/\.(js|css|png|jpg|svg|ico|woff|woff2)(\?|$)/i.test(u.pathname)) return false;
    // Skip Bungie API proxied calls that just return manifest data
    if (u.pathname.includes('/manifest/')) return false;
    return true;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Wrap window.fetch
// ─────────────────────────────────────────────────────────────────────────────
const _originalFetch = window.fetch.bind(window);
window.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
  const response = await _originalFetch(input, init);

  if (isLightGGApiUrl(url)) {
    try {
      const clone = response.clone();
      const text = await clone.text();
      // Quick check: must contain a letter grade pattern to bother parsing
      if (/[SABCDF][+-]?/i.test(text) && (text.includes('"instanceId"') || text.includes('"id"') || text.includes('instance'))) {
        try {
          const json = JSON.parse(text);
          const grades = extractGradesFromJson(json);
          if (grades) {
            dispatchGrades(grades, `fetch:${url}`);
          }
        } catch {
          // Not JSON — ignore
        }
      }
    } catch (e) {
      // Never block the original request
    }
  }

  return response;
};

// ─────────────────────────────────────────────────────────────────────────────
// Wrap XMLHttpRequest as fallback
// ─────────────────────────────────────────────────────────────────────────────
const _XHROpen = XMLHttpRequest.prototype.open;
const _XHRSend = XMLHttpRequest.prototype.send;

XMLHttpRequest.prototype.open = function (method: string, url: string, ...args: any[]) {
  (this as any)._aegisUrl = url;
  return (_XHROpen as any).call(this, method, url, ...args);
};

XMLHttpRequest.prototype.send = function (...args: any[]) {
  const url: string = (this as any)._aegisUrl || '';
  if (isLightGGApiUrl(url)) {
    this.addEventListener('load', function () {
      try {
        const text = this.responseText;
        if (/[SABCDF][+-]?/i.test(text) && (text.includes('"instanceId"') || text.includes('"id"') || text.includes('instance'))) {
          try {
            const json = JSON.parse(text);
            const grades = extractGradesFromJson(json);
            if (grades) {
              dispatchGrades(grades, `xhr:${url}`);
            }
          } catch {
            // Not JSON
          }
        }
      } catch (e) {
        // Ignore
      }
    });
  }
  return (_XHRSend as any).call(this, ...args);
};
