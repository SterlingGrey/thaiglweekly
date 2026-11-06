// Both layouts use the same reviewed catalog record and standard episode clock.
export function trackerExtrasData(catalog) {
  const entries = catalog.series.flatMap(series => {
    const access = series.early_access;
    const standard = series.episodes?.find(ep => ep.number === access?.episode);
    return access && standard ? [{id: series.id, ...access, standardAt: standard.airs_at}] : [];
  });
  return '<script>window.tgwEarlyAccess=' + JSON.stringify(entries).replace(/</g, '\\u003c') + ';</script>';
}
