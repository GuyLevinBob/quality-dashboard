/**
 * Server-side KPI bundle matching dashboard-multi-issue.html generateStatsFromBugs
 * so ?action=kpis can return tiles before the full issues JSON finishes loading.
 */

var KPI_PROPS_KEY_ = 'DASHBOARD_KPI_JSON';

function kpiParseDate_(createdDateStr) {
  if (!createdDateStr) return null;
  var s = String(createdDateStr);
  if (s.indexOf('/') !== -1) {
    var parts = s.split('/');
    if (parts.length !== 3) return null;
    var d = new Date(parseInt(parts[2], 10), parseInt(parts[0], 10) - 1, parseInt(parts[1], 10));
    return isNaN(d.getTime()) ? null : d;
  }
  var iso = new Date(s);
  return isNaN(iso.getTime()) ? null : iso;
}

function kpiMonthlyBugsWithTrend_(bugs) {
  var now = new Date();
  var currentMonth = now.getMonth();
  var currentYear = now.getFullYear();
  var monthNameNow = now.toLocaleString('default', { month: 'long' });

  var currentMonthBugs = bugs.filter(function (bug) {
    var createdDateStr = bug.createdDate || bug.created;
    if (!createdDateStr) return false;
    var bugDate = kpiParseDate_(createdDateStr);
    if (!bugDate) return false;
    return bugDate.getMonth() === currentMonth && bugDate.getFullYear() === currentYear;
  });

  var actualCount = currentMonthBugs.length;
  var previousMonths = [1, 2, 3].map(function (offset) {
    var d = new Date(currentYear, currentMonth - offset, 1);
    return { month: d.getMonth(), year: d.getFullYear(), name: d.toLocaleString('default', { month: 'long' }) };
  });

  var previousCounts = previousMonths.map(function (monthInfo) {
    return bugs.filter(function (bug) {
      var createdDateStr = bug.createdDate || bug.created;
      if (!createdDateStr) return false;
      var bugDate = kpiParseDate_(createdDateStr);
      if (!bugDate) return false;
      return bugDate.getMonth() === monthInfo.month && bugDate.getFullYear() === monthInfo.year;
    }).length;
  });

  var previousAverage = previousCounts.reduce(function (sum, c) { return sum + c; }, 0) / previousCounts.length;
  var trendClass = 'trend-neutral';
  var trendText = '→ At average';
  if (actualCount > previousAverage * 1.1) {
    trendClass = 'trend-up';
    trendText = '↗ Above average';
  } else if (actualCount < previousAverage * 0.9) {
    trendClass = 'trend-down';
    trendText = '↘ Below average';
  }

  return {
    count: actualCount,
    trend: trendText,
    trendClass: trendClass,
    previousAverage: Math.round(previousAverage)
  };
}

function kpiInProgressHighPriority_(bugs) {
  return bugs.filter(function (bug) {
    var sev = bug.severity;
    var st = bug.status;
    return (sev === 'High' || sev === 'Critical') &&
      st !== 'Deployed' && st !== 'Rejected' && st !== 'Canceled';
  }).length;
}

function kpiMedianResolution_(bugs) {
  var resolutionDays = [];
  bugs.forEach(function (bug) {
    if (bug.status !== 'Deployed') return;
    var createdDateStr = bug.createdDate || bug.created;
    if (!createdDateStr || !bug.resolutionDate) return;
    var createdDate = kpiParseDate_(createdDateStr);
    var resolutionDate = new Date(bug.resolutionDate);
    if (!createdDate || isNaN(resolutionDate.getTime())) return;
    var diffTime = Math.abs(resolutionDate.getTime() - createdDate.getTime());
    var diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    resolutionDays.push(diffDays);
  });
  if (resolutionDays.length === 0) return 0;
  resolutionDays.sort(function (a, b) { return a - b; });
  var length = resolutionDays.length;
  if (length % 2 === 0) {
    return Math.round((resolutionDays[length / 2 - 1] + resolutionDays[length / 2]) / 2);
  }
  return resolutionDays[Math.floor(length / 2)];
}

function kpiResolvedThisMonth_(bugs) {
  var now = new Date();
  var currentMonth = now.getMonth();
  var currentYear = now.getFullYear();
  // Prefer the real JIRA `resolutiondate` — falling back to `updated` would
  // miscount any Deployed bug that gets touched this month (comment, label,
  // linked issue) as a current-month resolution.
  return bugs.filter(function (bug) {
    if (bug.status !== 'Deployed') return false;
    var dateStr = bug.resolutionDate || bug.updatedDate || bug.updated;
    if (!dateStr) return false;
    var bugDate = kpiParseDate_(dateStr);
    if (!bugDate) return false;
    return bugDate.getMonth() === currentMonth && bugDate.getFullYear() === currentYear;
  }).length;
}

function kpiRegressionRate_(bugs) {
  var validBugs = bugs.filter(function (bug) {
    return bug.status !== 'Canceled' && bug.status !== 'Rejected';
  });
  if (validBugs.length === 0) return 0;
  var regressionBugs = validBugs.filter(function (bug) { return bug.regression === 'Yes'; });
  return Math.round((regressionBugs.length / validBugs.length) * 100);
}

function kpiSLACompliance_(bugs) {
  var criticalHighDeployedBugs = bugs.filter(function (bug) {
    return bug.status === 'Deployed' && (bug.severity === 'Critical' || bug.severity === 'High');
  });
  var slaCompliantBugs = 0;
  criticalHighDeployedBugs.forEach(function (bug) {
    var createdDateStr = bug.createdDate || bug.created;
    if (!createdDateStr || !bug.resolutionDate) return;
    var createdDate = kpiParseDate_(createdDateStr);
    var resolutionDate = new Date(bug.resolutionDate);
    if (!createdDate || isNaN(resolutionDate.getTime())) return;
    var diffTime = Math.abs(resolutionDate.getTime() - createdDate.getTime());
    var diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    var slaThreshold = bug.severity === 'Critical' ? 1 : 3;
    if (diffDays <= slaThreshold) slaCompliantBugs++;
  });
  if (criticalHighDeployedBugs.length === 0) return 0;
  return Math.round((slaCompliantBugs / criticalHighDeployedBugs.length) * 100);
}

function kpiBugVelocity_(bugs) {
  var resolvedBugs = bugs.filter(function (bug) { return bug.status === 'Deployed'; });
  var monthlyResolutions = {};
  // Bucket by real `resolutiondate`, not `updated` — see note on
  // kpiResolvedThisMonth_ for why.
  resolvedBugs.forEach(function (bug) {
    var dateStr = bug.resolutionDate || bug.updatedDate || bug.updated;
    if (!dateStr) return;
    var bugDate = kpiParseDate_(dateStr);
    if (!bugDate) return;
    var monthKey = bugDate.getFullYear() + '-' + (bugDate.getMonth() + 1);
    monthlyResolutions[monthKey] = (monthlyResolutions[monthKey] || 0) + 1;
  });

  var now = new Date();
  var currentMonthDate = new Date(now.getFullYear(), now.getMonth(), 1);
  var previousMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  var currentMonthKey = currentMonthDate.getFullYear() + '-' + (currentMonthDate.getMonth() + 1);
  var previousMonthKey = previousMonthDate.getFullYear() + '-' + (previousMonthDate.getMonth() + 1);
  var currentMonthName = currentMonthDate.toLocaleString('default', { month: 'long' });
  var previousMonthName = previousMonthDate.toLocaleString('default', { month: 'long' });
  var currentMonthCount = monthlyResolutions[currentMonthKey] || 0;
  var previousMonthCount = monthlyResolutions[previousMonthKey] || 0;

  var diffPercentRaw = null;
  var diffLabel = 'N/A';
  var trendClass = 'trend-neutral';
  if (previousMonthCount > 0) {
    diffPercentRaw = Math.round(((currentMonthCount - previousMonthCount) / previousMonthCount) * 100);
    if (diffPercentRaw > 5) {
      diffLabel = '+' + diffPercentRaw + '%';
      trendClass = 'trend-up';
    } else if (diffPercentRaw < -5) {
      diffLabel = diffPercentRaw + '%';
      trendClass = 'trend-down';
    } else {
      diffLabel = diffPercentRaw > 0 ? ('+' + diffPercentRaw + '%') : (diffPercentRaw + '%');
      trendClass = 'trend-neutral';
    }
  } else if (currentMonthCount > 0) {
    diffLabel = 'New';
    trendClass = 'trend-up';
  }

  return {
    diffLabel: diffLabel,
    diffPercentRaw: diffPercentRaw,
    currentMonthCount: currentMonthCount,
    previousMonthCount: previousMonthCount,
    currentMonthName: currentMonthName,
    previousMonthName: previousMonthName,
    trendClass: trendClass
  };
}

/**
 * @param {Array} bugs  issues with issueType === 'Bug'
 * @param {string} lastSync  ISO timestamp from cache
 */
function computeDashboardKpisPayload_(bugs, lastSync) {
  var stats = {
    monthlyBugsWithTrend: kpiMonthlyBugsWithTrend_(bugs || []),
    inProgressHighPriority: kpiInProgressHighPriority_(bugs || []),
    resolvedThisMonth: kpiResolvedThisMonth_(bugs || []),
    averageResolutionDays: kpiMedianResolution_(bugs || []),
    regressionRate: kpiRegressionRate_(bugs || []),
    slaCompliance: kpiSLACompliance_(bugs || []),
    bugVelocity: kpiBugVelocity_(bugs || [])
  };
  return {
    lastSync: lastSync || null,
    stats: stats
  };
}

function persistDashboardKpis_(bugs, lastSync) {
  var payload = computeDashboardKpisPayload_(bugs, lastSync);
  try {
    PropertiesService.getScriptProperties().setProperty(
      KPI_PROPS_KEY_,
      JSON.stringify(payload)
    );
  } catch (e) {
    Logger.log('persistDashboardKpis_ failed: ' + e.message);
  }
}

function loadPersistedKpis_() {
  var raw = PropertiesService.getScriptProperties().getProperty(KPI_PROPS_KEY_);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}
