/**
 * Cooldown gate for expensive actions (sync). Backed by CacheService —
 * sufficient because the cooldown window is short (default 60 s) and we do
 * not need persistence across cache evictions.
 *
 * Important: CacheService is per-script (shared across all viewers when
 * deployed as "Execute as: Me"), which is exactly what we want for a
 * "stop spam-syncing" gate.
 */

var RATE_LIMIT_DEFAULT_COOLDOWN_S_ = 60;

function getCooldownSeconds_() {
  var raw = PropertiesService.getScriptProperties().getProperty('SYNC_COOLDOWN_SECONDS');
  if (!raw) return RATE_LIMIT_DEFAULT_COOLDOWN_S_;
  var n = parseInt(raw, 10);
  return isNaN(n) || n < 0 ? RATE_LIMIT_DEFAULT_COOLDOWN_S_ : n;
}

/**
 * Returns null when the action is allowed (and arms the cooldown), or an
 * object describing how long until the next attempt is allowed.
 *
 * @param {string} action  cache key suffix
 * @return {null | {retryAfterSeconds:number}}
 */
function checkAndArmCooldown(action) {
  var cooldown = getCooldownSeconds_();
  if (cooldown === 0) return null;

  var cache = CacheService.getScriptCache();
  var key = 'cooldown:' + action;
  var existing = cache.get(key);
  if (existing) {
    var armedAt = parseInt(existing, 10);
    var elapsed = Math.floor((Date.now() - armedAt) / 1000);
    var remaining = Math.max(0, cooldown - elapsed);
    if (remaining > 0) {
      return { retryAfterSeconds: remaining };
    }
  }

  // Arm the cooldown for the next caller.
  cache.put(key, String(Date.now()), cooldown);
  return null;
}
