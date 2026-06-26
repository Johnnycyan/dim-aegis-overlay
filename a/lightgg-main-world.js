function extractGradesFromJson(data) {
  if (!data || typeof data !== "object") return null;
  const result = {};
  if (Array.isArray(data)) {
    for (const item of data) {
      if (!item || typeof item !== "object") continue;
      const id = String(
        item.instanceId || item.instance_id || item.id || item.itemInstanceId || ""
      );
      const grade = item.grade || item.quality || item.rank || item.rating || item.letter || item.rollGrade || item.rollQuality;
      if (id && id.length >= 10 && grade && typeof grade === "string") {
        const match = grade.match(/[SABCDF][+-]?/i);
        if (match) {
          result[id.replace(/^[^0-9]+/, "")] = match[0].toUpperCase();
        }
      }
    }
    if (Object.keys(result).length > 0) return result;
  }
  for (const [key, val] of Object.entries(data)) {
    if (typeof key === "string" && /^\d{10,20}$/.test(key) && typeof val === "string") {
      const match = val.match(/[SABCDF][+-]?/i);
      if (match) {
        result[key] = match[0].toUpperCase();
      }
    }
    if (typeof val === "object" && val !== null && !Array.isArray(val)) {
      const inner = val;
      const id = String(inner.instanceId || inner.instance_id || inner.id || key || "");
      const grade = inner.grade || inner.quality || inner.rank || inner.rating;
      if (id && /^\d{10,20}$/.test(id) && grade && typeof grade === "string") {
        const match = grade.match(/[SABCDF][+-]?/i);
        if (match) {
          result[id.replace(/^[^0-9]+/, "")] = match[0].toUpperCase();
        }
      }
    }
  }
  if (Object.keys(result).length > 0) return result;
  const wrapperKeys = ["items", "weapons", "rolls", "data", "results", "inventory"];
  for (const wkey of wrapperKeys) {
    if (Array.isArray(data[wkey])) {
      const nested = extractGradesFromJson(data[wkey]);
      if (nested) return nested;
    }
  }
  return null;
}
function dispatchGrades(grades, source) {
  if (Object.keys(grades).length === 0) return;
  console.log(`[DIM Aegis Overlay LGG-MAIN] Intercepted ${Object.keys(grades).length} grades from ${source}`);
  document.dispatchEvent(
    new CustomEvent("__aegis_lgg_grades__", {
      detail: { grades, source }
    })
  );
}
function isLightGGApiUrl(url) {
  try {
    const u = new URL(url, window.location.href);
    if (!u.hostname.includes("light.gg")) return false;
    if (/\.(js|css|png|jpg|svg|ico|woff|woff2)(\?|$)/i.test(u.pathname)) return false;
    if (u.pathname.includes("/manifest/")) return false;
    return true;
  } catch {
    return false;
  }
}
const _originalFetch = window.fetch.bind(window);
window.fetch = async function(input, init) {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const response = await _originalFetch(input, init);
  if (isLightGGApiUrl(url)) {
    try {
      const clone = response.clone();
      const text = await clone.text();
      if (/[SABCDF][+-]?/i.test(text) && (text.includes('"instanceId"') || text.includes('"id"') || text.includes("instance"))) {
        try {
          const json = JSON.parse(text);
          const grades = extractGradesFromJson(json);
          if (grades) {
            dispatchGrades(grades, `fetch:${url}`);
          }
        } catch {
        }
      }
    } catch (e) {
    }
  }
  return response;
};
const _XHROpen = XMLHttpRequest.prototype.open;
const _XHRSend = XMLHttpRequest.prototype.send;
XMLHttpRequest.prototype.open = function(method, url, ...args) {
  this._aegisUrl = url;
  return _XHROpen.call(this, method, url, ...args);
};
XMLHttpRequest.prototype.send = function(...args) {
  const url = this._aegisUrl || "";
  if (isLightGGApiUrl(url)) {
    this.addEventListener("load", function() {
      try {
        const text = this.responseText;
        if (/[SABCDF][+-]?/i.test(text) && (text.includes('"instanceId"') || text.includes('"id"') || text.includes("instance"))) {
          try {
            const json = JSON.parse(text);
            const grades = extractGradesFromJson(json);
            if (grades) {
              dispatchGrades(grades, `xhr:${url}`);
            }
          } catch {
          }
        }
      } catch (e) {
      }
    });
  }
  return _XHRSend.call(this, ...args);
};
console.log("[DIM Aegis Overlay] Light.gg API interceptor initialized in MAIN world.");
