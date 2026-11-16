// The same client is used by the authenticated portal and local synthetic review.
// Never insert edition text as HTML or store a session/calendar token locally.
export async function portalClient(config) {
  const $ = id => document.getElementById(id);
  let state, catalog, session, busy = false;
  let generation = 0;
  const status = message => { $("status").textContent = message; };
  const request = async (path, options = {}) => {
    const current = generation;
    const token = session ? await session.getToken() : null;
    const response = await fetch(config.api + path, { ...options, credentials: "omit", cache: "no-store", headers: {
      ...(token ? { Authorization: "Bearer " + token } : {}), "Content-Type": "application/json", ...options.headers,
    } });
    if (current !== generation) throw new Error("Your sign-in changed. Reload your notebook.");
    if (!response.ok) throw new Error(response.status === 409 ? "Your list changed in another window. Reload before saving." : response.status === 404 ? "This edition is not ready yet." : response.status === 401 ? "Sign in again to open your notebook." : response.status === 403 ? "Your signed-in account does not have active membership access." : "Temporarily unavailable. Please try again.");
    const data = await response.json();
    if (current !== generation) throw new Error("Your sign-in changed. Reload your notebook.");
    return data;
  };
  const text = (tag, value, parent) => { const node = document.createElement(tag); node.textContent = value; parent.append(node); return node; };
  function renderShows() {
    const root = $("shows"); root.replaceChildren();
    for (const show of catalog.series) {
      const card = document.createElement("article"); card.className = "show";
      text("h3", show.title, card);
      const label = document.createElement("label"); const check = document.createElement("input");
      check.type = "checkbox"; check.checked = state.follows.includes(show.id);
      check.onchange = () => { state.follows = check.checked ? [...new Set([...state.follows, show.id])] : state.follows.filter(id => id !== show.id); };
      label.append(check, document.createTextNode(" Follow this show")); card.append(label);
      const episodes = document.createElement("div"); episodes.className = "episodes";
      for (const episode of show.episodes || []) {
        const watched = (state.watched[show.id] || []).includes(episode.number);
        const button = text("button", "EP " + episode.number, episodes); button.type = "button";
        button.setAttribute("aria-pressed", String(watched)); button.setAttribute("aria-label", show.title + ", episode " + episode.number + (watched ? ", watched" : ", not marked"));
        button.onclick = () => {
          const values = state.watched[show.id] || [];
          state.watched[show.id] = values.includes(episode.number) ? values.filter(n => n !== episode.number) : [...values, episode.number].sort((a, b) => a - b);
          renderShows();
        };
      }
      card.append(episodes); root.append(card);
    }
  }
  // The next seven days from the same catalogue as the free Tracker, shown in
  // the member's saved zone. Confirmed, dated rows only; a date-only row keeps
  // its date and is never given a clock time.
  function renderWeek() {
    const root = $("week"); root.replaceChildren();
    const now = Date.now(), end = now + 7 * 86400000;
    const local = options => { try { return new Intl.DateTimeFormat("en-US", { timeZone: state.timezone, ...options }); } catch { return new Intl.DateTimeFormat("en-US", options); } };
    const when = local({ weekday: "long", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
    const dateOnly = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });
    const rows = [];
    for (const show of catalog.series) for (const episode of show.episodes || []) {
      const at = Date.parse(episode.airs_at);
      if (Number.isInteger(episode.number) && Number.isFinite(at) && at >= now && at < end) rows.push({ show, episode, at });
    }
    rows.sort((a, b) => a.at - b.at);
    if (!rows.length) { text("p", "No confirmed episode in the next seven days.", root); return; }
    for (const row of rows) {
      const item = document.createElement("div");
      text("span", row.show.title + ", episode " + row.episode.number, item);
      text("span", row.episode.time_unverified === true
        ? dateOnly.format(new Date(String(row.episode.airs_at).slice(0, 10) + "T12:00:00Z")) + " in Bangkok · time pending"
        : when.format(new Date(row.at)), item);
      root.append(item);
    }
  }
  async function refresh() {
    const current = ++generation;
    status("Loading your viewing notebook…");
    try {
      const result = await Promise.all([request("/api/my-shows"), request("/api/catalog")]);
      if (current !== generation) return;
      [state, catalog] = result; $("timezone").value = state.timezone; $("delivery-zone").checked = state.timezoneConfirmed === true; $("daily-email").checked = state.dailyEmailConsent === true; renderShows(); renderWeek();
      $("workspace").hidden = false; status(config.demo ? "SAMPLE ONLY. No real member data or billing." : "Your notebook is ready.");
    } catch (error) { if (current === generation) { $("workspace").hidden = true; status(error.message); } }
  }
  $("reload").onclick = refresh;
  $("timezone").oninput = () => { $("delivery-zone").checked = false; };
  $("device-zone").onclick = () => {
    $("timezone").value = Intl.DateTimeFormat().resolvedOptions().timeZone;
    $("delivery-zone").checked = false;
    status("Device time zone selected. Confirm it below and save your choices.");
  };
  $("save").onclick = async () => {
    if (busy) return; busy = true; $("save").disabled = true;
    for (const control of $("workspace").querySelectorAll("button,input")) control.disabled = true;
    try { state.timezone = $("timezone").value; state.timezoneConfirmed = $("delivery-zone").checked === true; state.dailyEmailConsent = $("daily-email").checked === true; state = await request("/api/my-shows", { method: "PUT", body: JSON.stringify(state) }); status("Viewing choices saved."); }
    catch (error) { status(error.message); } finally { busy = false; for (const control of $("workspace").querySelectorAll("button,input")) control.disabled = false; }
  };
  $("calendar").onclick = async () => {
    try {
      const { url } = await request("/api/calendar", { method: "POST" });
      const link = new URL(url);
      if (link.origin !== new URL(config.api).origin) throw new Error("Unexpected calendar address");
      $("calendar-url").value = link.href; $("calendar-result").hidden = false;
      status("New private calendar link created. Previous links have stopped working. Copy it into your calendar app; keep it private.");
    } catch (error) { status(error.message); }
  };
  $("revoke").onclick = async () => {
    try { await request("/api/calendar", { method: "DELETE" }); $("calendar-url").value = ""; $("calendar-result").hidden = true; status("Calendar link revoked."); }
    catch (error) { status(error.message); }
  };
  for (const button of document.querySelectorAll("[data-edition]")) button.onclick = async () => {
    const root = $("edition"); root.replaceChildren();
    try {
      const edition = await request("/api/edition/" + button.dataset.edition);
      text("h2", edition.title, root);
      if (edition.date) text("p", edition.date, root);
      for (const section of edition.sections || []) {
        const article = document.createElement("article"); text("h3", section.heading, article); text("p", section.body, article);
        for (const source of section.sources || []) {
          const url = new URL(source.url); if (url.protocol !== "https:") continue;
          const link = text("a", source.label + (source.checked ? " · checked " + source.checked : ""), article);
          link.href = url.href; link.target = "_blank"; link.rel = "noopener noreferrer";
        }
        root.append(article);
      }
      status("Edition loaded.");
    } catch (error) { text("p", error.message, root); }
  };
  if (config.demo) { await refresh(); return; }
  try {
    await window.Clerk.load({ ui: { ClerkUI: window.__internal_ClerkUICtor } });
    let signInMounted = false, userButtonMounted = false, lastSessionIdentity;
    window.Clerk.addListener(async ({ session: next }) => {
      // Clerk also notifies listeners when the same session refreshes a token.
      // Keep in-flight saves, loaded reading and private links intact on refresh.
      const identity = next ? `${next.id}:${next.user?.id || ""}` : null;
      session = next;
      if (identity === lastSessionIdentity) return;
      lastSessionIdentity = identity;
      generation++; session = next;
      $("workspace").hidden = true; $("edition").replaceChildren(); $("shows").replaceChildren();
      $("calendar-url").value = ""; $("calendar-result").hidden = true;
      if (next) {
        if (signInMounted) { window.Clerk.unmountSignIn($("sign-in")); signInMounted = false; }
        $("sign-in").hidden = true; $("user-button").hidden = false;
        if (!userButtonMounted) { window.Clerk.mountUserButton($("user-button")); userButtonMounted = true; }
        await refresh();
      } else {
        if (userButtonMounted) { window.Clerk.unmountUserButton($("user-button")); userButtonMounted = false; }
        $("user-button").hidden = true; status("Sign in to open your notebook."); $("sign-in").hidden = false;
        if (!signInMounted) {
          window.Clerk.mountSignIn($("sign-in"), { forceRedirectUrl: window.location.href, signUpForceRedirectUrl: window.location.href });
          signInMounted = true;
        }
      }
    });
  } catch { status("Sign-in is unavailable. The free Tracker remains available."); }
}
