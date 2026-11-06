/*
 * BLOOD FINDER (Emergency Blood Donor Finder System)
 * Front end for the System Analysis and Design project.
 * Processes follow the Level-1 DFD:
 *   3.1 Nearest donor tracking   3.2 Donor medical condition
 *   4.1 Pickup method            4.2 Transportation aid      4.3 Payment for transportation
 * Data model follows the relational schema (7 relations). Data is kept in the browser (localStorage).
 */
(function () {
  "use strict";

  const STORE_KEY = "bdf-db-v4";
  const GROUPS = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"];
  const SETTINGS = {
    minGapDays: 120,
    minHb: 12.5,
    minWeight: 45,
    fares: {
      "CNG auto-rickshaw": { base: 60, perKm: 25 },
      "Ride-share car": { base: 100, perKm: 38 },
      "Ride-share motorbike": { base: 40, perKm: 18 },
      "Ambulance": { base: 500, perKm: 45 },
      "Private car": { base: 150, perKm: 35 }
    }
  };
  // Which donor groups each recipient group can safely receive (red cells / whole blood)
  const COMPATIBLE = {
    "O-": ["O-"],
    "O+": ["O+", "O-"],
    "A-": ["A-", "O-"],
    "A+": ["A+", "A-", "O+", "O-"],
    "B-": ["B-", "O-"],
    "B+": ["B+", "B-", "O+", "O-"],
    "AB-": ["AB-", "A-", "B-", "O-"],
    "AB+": GROUPS.slice()
  };
  // All 64 districts of Bangladesh, grouped by the 8 divisions
  const DIVISIONS = {
    "Barishal": ["Barguna", "Barishal", "Bhola", "Jhalokati", "Patuakhali", "Pirojpur"],
    "Chattogram": ["Bandarban", "Brahmanbaria", "Chandpur", "Chattogram", "Cox's Bazar", "Cumilla", "Feni",
      "Khagrachhari", "Lakshmipur", "Noakhali", "Rangamati"],
    "Dhaka": ["Dhaka", "Faridpur", "Gazipur", "Gopalganj", "Kishoreganj", "Madaripur", "Manikganj", "Munshiganj",
      "Narayanganj", "Narsingdi", "Rajbari", "Shariatpur", "Tangail"],
    "Khulna": ["Bagerhat", "Chuadanga", "Jashore", "Jhenaidah", "Khulna", "Kushtia", "Magura", "Meherpur", "Narail", "Satkhira"],
    "Mymensingh": ["Jamalpur", "Mymensingh", "Netrokona", "Sherpur"],
    "Rajshahi": ["Bogura", "Chapai Nawabganj", "Joypurhat", "Naogaon", "Natore", "Pabna", "Rajshahi", "Sirajganj"],
    "Rangpur": ["Dinajpur", "Gaibandha", "Kurigram", "Lalmonirhat", "Nilphamari", "Panchagarh", "Rangpur", "Thakurgaon"],
    "Sylhet": ["Habiganj", "Moulvibazar", "Sunamganj", "Sylhet"]
  };
  const DISTRICTS = Object.values(DIVISIONS).flat().sort();
  const PICKUP = ["App-arranged ride", "Seeker picks up donor", "Donor travels by own arrangement"];
  const PAY_METHODS = ["bKash", "Nagad", "Rocket", "Cash", "Card"];
  const ONLINE_PAY = ["bKash", "Nagad", "Rocket", "Card"];
  const VEHICLE_TYPES = Object.keys(SETTINGS.fares);

  /* ---------- data store ---------- */
  let db = load();

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* storage blocked: fall back to seed */ }
    return JSON.parse(JSON.stringify(window.SEED));
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(db)); } catch (e) { /* ignore */ }
  }
  function resetDb() {
    db = JSON.parse(JSON.stringify(window.SEED));
    save();
  }
  function nextId(table, key, prefix) {
    let max = 0;
    db[table].forEach(r => {
      const n = parseInt(String(r[key]).replace(prefix, ""), 10);
      if (n > max) max = n;
    });
    return prefix + String(max + 1).padStart(3, "0");
  }
  const byId = (table, key, id) => db[table].find(r => r[key] === id);
  const donor = id => byId("Donor", "donor_id", id);
  const seeker = id => byId("Blood_Seeker", "seeker_id", id);
  const request = id => byId("Blood_Request", "request_id", id);
  const proposal = id => byId("Donation_Proposal", "proposal_id", id);
  const transport = id => byId("Transportation", "transport_id", id);
  const vehicle = id => byId("Vehicle", "vehicle_id", id);
  const paymentFor = tid => db.Payment.find(x => x.transport_id === tid);

  /* ---------- helpers ---------- */
  const $ = (s, el = document) => el.querySelector(s);
  const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const nowLocal = () => { const d = new Date(); d.setSeconds(0, 0); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function fmtDate(s) {
    if (!s) return "—";
    const [y, m, d] = s.slice(0, 10).split("-");
    return `${d} ${MONTHS[+m - 1]} ${y}`;
  }
  function fmtDT(s) {
    if (!s) return "—";
    return s.length > 10 ? `${fmtDate(s)}, ${s.slice(11, 16)}` : fmtDate(s);
  }
  function taka(n) {
    // South Asian grouping: 1,23,456
    const s = String(Math.round(n || 0));
    if (s.length <= 3) return "Tk " + s;
    const last3 = s.slice(-3);
    const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
    return "Tk " + rest + "," + last3;
  }
  function daysSince(s) {
    if (!s) return Infinity;
    return Math.floor((today() - new Date(s.slice(0, 10) + "T00:00:00")) / 86400000);
  }
  function opts(list, sel, placeholder) {
    return (placeholder ? `<option value="">${esc(placeholder)}</option>` : "") +
      list.map(v => {
        const val = typeof v === "object" ? v.value : v;
        const label = typeof v === "object" ? v.label : v;
        return `<option value="${esc(val)}"${val === sel ? " selected" : ""}>${esc(label)}</option>`;
      }).join("");
  }
  function badge(text, kind) { return `<span class="badge b-${kind}">${esc(text)}</span>`; }
  function statusBadge(s) {
    const map = {
      "Fulfilled": "ok", "Accepted": "ok", "Completed": "ok", "Paid": "ok", "Active": "ok", "Yes": "ok", "Negative": "ok", "Fit": "ok",
      "Pending": "warn", "Partially fulfilled": "warn", "No response": "warn", "Scheduled": "info", "Urgent": "warn",
      "Emergency": "red", "Declined": "red", "Cancelled": "grey", "Withdrawn": "grey", "Inactive": "grey", "No": "red", "Positive": "red",
      "Available": "ok", "On trip": "info", "Refund due": "warn", "Refunded": "grey"
    };
    return badge(s || "—", map[s] || "grey");
  }
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove("show"), 2600);
  }
  // District dropdown: all 64 districts under their division headings
  function districtOpts(sel, placeholder) {
    return (placeholder ? `<option value="">${esc(placeholder)}</option>` : "") +
      Object.entries(DIVISIONS).map(([div, list]) =>
        `<optgroup label="${esc(div)} Division">${list.map(d =>
          `<option value="${esc(d)}"${d === sel ? " selected" : ""}>${esc(d)}</option>`).join("")}</optgroup>`).join("");
  }
  // Upazila dropdown for one district: its upazilas, then city corporation areas where the district has them
  function areaOpts(district, sel, placeholder) {
    const g = (window.GEO || {})[district];
    if (!g) return `<option value="">Select a district first</option>`;
    const list = g.upazilas.concat(g.city || []);
    const extra = sel && !list.includes(sel) ? `<option value="${esc(sel)}" selected>${esc(sel)}</option>` : "";
    const o = l => `<option value="${esc(l)}"${l === sel ? " selected" : ""}>${esc(l)}</option>`;
    return `<option value="">${esc(placeholder)}</option>${extra}` +
      `<optgroup label="Upazilas of ${esc(district)}">${g.upazilas.map(o).join("")}</optgroup>` +
      (g.city ? `<optgroup label="${esc(district)} city areas">${g.city.map(o).join("")}</optgroup>` : "");
  }
  // A district select (data-district) and the upazila select next to it (data-area) inside the same container
  function areaSelect(name, district, sel, placeholder, required) {
    return `<select name="${name}" data-area data-placeholder="${esc(placeholder)}"${required ? " required" : ""}${(window.GEO || {})[district] ? "" : " disabled"}>${areaOpts(district, sel, placeholder)}</select>`;
  }
  function refreshArea(districtSel) {
    const box = districtSel.closest("form, .toolbar");
    const area = box && box.querySelector("select[data-area]");
    if (!area) return;
    area.innerHTML = areaOpts(districtSel.value, "", area.dataset.placeholder);
    area.disabled = !(window.GEO || {})[districtSel.value];
  }
  document.addEventListener("change", e => {
    if (e.target.matches("select[data-district]")) refreshArea(e.target);
  });

  /* ---------- hospital directory ---------- */
  const HOSP_TYPES = { mch: "Medical college hospitals", inst: "Specialised institutes", gov: "District and general hospitals",
    pvt: "Private hospitals", uhc: "Upazila health complexes" };
  const HOSP_SHORT = { mch: "Medical college", inst: "Specialised", gov: "Government", pvt: "Private", uhc: "Upazila health complex" };
  const hospitalsOf = d => (window.HOSPITALS || {})[d] || [];
  const findHospital = (d, name) => hospitalsOf(d).find(h => h.n === name);
  // With no district chosen: every hospital in the country, grouped by district (value "District||Name")
  function allHospitalOpts() {
    const total = Object.values(window.HOSPITALS || {}).reduce((s, l) => s + l.length, 0);
    return `<option value="">Select hospital (all ${total} in Bangladesh)</option>` +
      Object.keys(window.HOSPITALS || {}).sort().map(d => `<optgroup label="${esc(d)} district">${hospitalsOf(d).map(h =>
        `<option value="${esc(d + "||" + h.n)}">${esc(h.n)} (${esc(h.u)})</option>`).join("")}</optgroup>`).join("") +
      `<optgroup label="Not in the list"><option value="__other">Other hospital (type the name)</option></optgroup>`;
  }
  // With no district chosen: every upazila and city area, grouped by district (value "District||Upazila")
  function allAreaOpts() {
    return `<option value="">Select upazila (all districts)</option>` +
      Object.keys(window.GEO || {}).sort().map(d => {
        const g = window.GEO[d];
        return `<optgroup label="${esc(d)} district">${g.upazilas.concat(g.city || []).map(u =>
          `<option value="${esc(d + "||" + u)}">${esc(u)}</option>`).join("")}</optgroup>`;
      }).join("");
  }
  function hospitalOpts(district, upazila, sel) {
    if (!district) return allHospitalOpts();
    const list = hospitalsOf(district);
    const o = h => `<option value="${esc(h.n)}"${h.n === sel ? " selected" : ""}>${esc(h.n)}${upazila ? "" : ` (${esc(h.u)})`}</option>`;
    const group = (label, items) => items.length ? `<optgroup label="${esc(label)}">${items.map(o).join("")}</optgroup>` : "";
    const here = upazila ? list.filter(h => h.u === upazila) : [];
    const rest = upazila ? list.filter(h => h.u !== upazila) : list;
    const byType = Object.keys(HOSP_TYPES).map(t => group(`${HOSP_TYPES[t]}${upazila ? " elsewhere in " + district : ""}`, rest.filter(h => h.t === t))).join("");
    const unlisted = sel && sel !== "__other" && !list.some(h => h.n === sel) ? `<option value="${esc(sel)}" selected>${esc(sel)}</option>` : "";
    return `<option value="">Select hospital (${list.length} in ${esc(district)})</option>${unlisted}` +
      group(`In ${upazila}`, here) + byType +
      `<optgroup label="Not in the list"><option value="__other"${sel === "__other" ? " selected" : ""}>Other hospital (type the name)</option></optgroup>`;
  }

  /* ---------- business rules (DFD 3.2) ---------- */
  function latestCheck(donorId) {
    return db.Medical_Status.filter(m => m.donor_id === donorId)
      .sort((a, b) => (b.check_date || "").localeCompare(a.check_date || ""))[0];
  }
  function checkEligible(m) {
    if (!m) return { ok: false, reasons: ["No medical record"] };
    const reasons = [];
    if (+m.haemoglobin < SETTINGS.minHb) reasons.push(`Haemoglobin ${m.haemoglobin} g/dL is below ${SETTINGS.minHb}`);
    if (+m.weight < SETTINGS.minWeight) reasons.push(`Weight ${m.weight} kg is below ${SETTINGS.minWeight}`);
    if (m.hepatitis_B_screen !== "Negative") reasons.push("Hepatitis B screen positive");
    if (m.health_condition !== "Fit") reasons.push(m.health_condition);
    return { ok: reasons.length === 0, reasons };
  }
  function donorReadiness(d) {
    const reasons = [];
    if (d.status !== "Active") reasons.push("Account inactive");
    const gap = daysSince(d.last_donation_date);
    if (gap < SETTINGS.minGapDays) reasons.push(`Donated ${gap} days ago (needs ${SETTINGS.minGapDays})`);
    const med = checkEligible(latestCheck(d.donor_id));
    reasons.push(...med.reasons);
    return { ready: reasons.length === 0, reasons, gap };
  }
  function fareFor(vehicle, km) {
    const f = SETTINGS.fares[vehicle];
    if (!f) return 0;
    return Math.round(f.base + (+km || 0) * f.perKm);
  }

  /* ---------- modal ---------- */
  const modal = $("#modal");
  let modalSubmit = null;
  function openModal(title, bodyHtml, onSubmit, okLabel = "Save") {
    $("#modalTitle").textContent = title;
    $("#modalBody").innerHTML = bodyHtml;
    $("#modalOk").textContent = okLabel;
    modalSubmit = onSubmit;
    modal.showModal();
    const first = $("#modalBody input, #modalBody select, #modalBody textarea");
    if (first) first.focus();
  }
  $("#modalForm").addEventListener("submit", e => {
    e.preventDefault();
    if (!modalSubmit) return modal.close();
    const fd = Object.fromEntries(new FormData(e.target).entries());
    const result = modalSubmit(fd);
    if (result === true) { modal.close(); render(); }
    else if (typeof result === "string") {
      let box = $("#modalBody .err.form-err");
      if (!box) { box = document.createElement("p"); box.className = "err form-err"; $("#modalBody").appendChild(box); }
      box.textContent = result;
    }
  });
  $("#modalClose").addEventListener("click", () => modal.close());
  $("#modalCancel").addEventListener("click", () => modal.close());
  $("#modalBody").addEventListener("input", () => { const b = $("#modalBody .form-err"); if (b) b.textContent = ""; });

  const field = (label, inner, full) => `<div class="field${full ? " full" : ""}"><label>${esc(label)}</label>${inner}</div>`;

  /* ---------- views ---------- */
  const views = {};

  views.dashboard = () => {
    const ready = db.Donor.filter(d => donorReadiness(d).ready).length;
    const open = db.Blood_Request.filter(r => r.request_status === "Pending" || r.request_status === "Partially fulfilled");
    const props = db.Donation_Proposal.filter(p => p.proposal_status !== "Withdrawn");
    const acc = props.filter(p => p.proposal_status === "Accepted").length;
    const paid = db.Payment.filter(p => p.payment_status === "Paid").reduce((s, p) => s + (+p.amount || 0), 0);
    const maxN = Math.max(1, ...GROUPS.map(g => db.Donor.filter(d => d.blood_group === g).length));
    const bars = GROUPS.map(g => {
      const all = db.Donor.filter(d => d.blood_group === g);
      const rdy = all.filter(d => donorReadiness(d).ready).length;
      return `<div class="bar-row"><span class="bg-pill">${g}</span>
        <div class="bar-track" title="${rdy} ready of ${all.length}">
          <div class="bar-fill" style="width:${rdy / maxN * 100}%"></div>
          <div class="bar-fill soft" style="width:${(all.length - rdy) / maxN * 100}%"></div>
        </div><span class="rank">${rdy} / ${all.length}</span></div>`;
    }).join("");
    const urgent = open.slice().sort((a, b) => (a.urgency === "Emergency" ? -1 : 1) - (b.urgency === "Emergency" ? -1 : 1)).slice(0, 6);
    return `
      <div class="page-head"><div><h1>Dashboard</h1><p>Overview of donors, open blood requests and donation activity.</p></div>
        <a class="btn primary" href="#find">Find a donor</a></div>
      <div class="grid k4" style="margin-bottom:18px">
        <div class="kpi"><span>Registered donors</span><strong>${db.Donor.length}</strong></div>
        <div class="kpi"><span>Ready to donate now</span><strong>${ready}</strong></div>
        <div class="kpi"><span>Open requests</span><strong>${open.length}</strong></div>
        <div class="kpi"><span>Proposal acceptance</span><strong>${props.length ? Math.round(acc / props.length * 100) : 0}%</strong></div>
        <div class="kpi"><span>Blood seekers</span><strong>${db.Blood_Seeker.length}</strong></div>
        <div class="kpi"><span>Transport payments received</span><strong>${taka(paid)}</strong></div>
        <div class="kpi"><span>Vehicles available now</span><strong>${db.Vehicle.filter(v => v.status === "Available").length} / ${db.Vehicle.length}</strong></div>
      </div>
      <div class="grid k2">
        <div class="card"><h2>Donors by blood group</h2>
          <div class="legend"><span><i style="background:var(--red)"></i>Ready now</span><span><i style="background:#e9a29d"></i>Not ready</span></div>
          <div class="bars">${bars}</div></div>
        <div class="card"><h2>Open requests</h2>
          ${urgent.length ? `<div class="table-wrap"><table><thead><tr><th>Request</th><th>Group</th><th>Hospital</th><th>Urgency</th><th></th></tr></thead><tbody>
          ${urgent.map(r => `<tr><td class="mono">${r.request_id}</td><td><span class="bg-pill">${r.blood_group}</span></td>
            <td>${esc(r.hospital_name)}</td><td>${statusBadge(r.urgency)}</td>
            <td><a class="btn sm" href="#find?req=${r.request_id}">Find</a></td></tr>`).join("")}
          </tbody></table></div>` : `<p class="empty">No open requests.</p>`}
        </div>
      </div>`;
  };

  /* DFD 3.1 + 3.2 */
  views.find = params => {
    const req = params.req ? request(params.req) : null;
    const bg = params.bg || (req && req.blood_group) || "";
    const dist = params.district || (req && req.hospital_district) || "";
    const fromReq = req && !params.district;
    const area = params.area || (fromReq && req.hospital_upazila) || "";
    const onlyReady = params.ready !== "0";
    let results = "";
    if (bg) {
      const allowed = COMPATIBLE[bg] || [];
      const list = db.Donor.filter(d => allowed.includes(d.blood_group)).map(d => {
        const r = donorReadiness(d);
        const sameDistrict = dist && d.district === dist;
        const proximity = sameDistrict && area && d.current_location === area ? 0 : (sameDistrict ? 1 : 2);
        return { d, r, proximity, exact: d.blood_group === bg ? 0 : 1 };
      }).filter(x => !onlyReady || x.r.ready)
        .sort((a, b) => (b.r.ready - a.r.ready) || (a.proximity - b.proximity) || (a.exact - b.exact) || (b.r.gap - a.r.gap));
      const where = ["Same upazila", "Same district", "Other district"];
      results = `<h2 style="margin-top:6px">${list.length} matching donor${list.length === 1 ? "" : "s"} for ${esc(bg)}</h2>
        <p class="rank">Accepts ${allowed.join(", ")}. Ranked by readiness, distance, then exact group match.</p>
        <div class="donor-list">${list.map(x => {
          const m = latestCheck(x.d.donor_id);
          return `<div class="donor-card${x.r.ready ? "" : " dim"}">
            <span class="bg-pill">${x.d.blood_group}</span>
            <div><h3>${esc(x.d.name)} <span class="rank mono">${x.d.donor_id}</span></h3>
              <div class="meta">${esc(x.d.current_location)}, ${esc(x.d.district)} · ${esc(x.d.phone)} · last donated ${fmtDate(x.d.last_donation_date)} · ${x.d.total_donations} donations</div>
              <div class="tags">${badge(where[x.proximity], x.proximity === 0 ? "ok" : x.proximity === 1 ? "info" : "grey")}
                ${x.r.ready ? badge("Ready to donate", "ok") : x.r.reasons.map(t => badge(t, "red")).join("")}
                ${m ? badge(`Hb ${m.haemoglobin} · ${m.weight} kg · checked ${fmtDate(m.check_date)}`, "grey") : ""}</div></div>
            <div class="btn-row">${x.r.ready ? `<button class="btn primary sm" data-act="propose" data-id="${x.d.donor_id}" data-req="${req ? req.request_id : ""}">Send proposal</button>` : ""}
              <button class="btn sm" data-act="med-check" data-id="${x.d.donor_id}">Medical check</button></div>
          </div>`;
        }).join("") || `<p class="empty card">No donors match. Try turning off "Ready donors only" or widening the search.</p>`}</div>`;
    }
    return `
      <div class="page-head"><div><span class="step">Process 3.1 and 3.2</span><h1>Find nearest donor</h1>
        <p>Enter the blood group and where the blood is needed. The system checks compatibility, the 120-day donation gap and the latest medical status before listing donors.</p></div></div>
      ${req ? `<div class="note">Searching for request <b>${req.request_id}</b>: ${req.units_needed} unit(s) of ${esc(req.blood_group)} ${esc(req.component).toLowerCase()} at ${esc(req.hospital_name)}, ${esc(req.hospital_upazila ? req.hospital_upazila + ", " : "")}${esc(req.hospital_district)} (${esc(req.reason)}).</div>` : ""}
      <form class="card form" id="findForm">
        ${field("Blood group needed", `<select name="bg" required>${opts(GROUPS, bg, "Select group")}</select>`)}
        ${field("District", `<select name="district" data-district>${districtOpts(dist, "Any district")}</select>`)}
        ${field("Upazila / city area", areaSelect("area", dist, area, "Any upazila"))}
        ${field("Show", `<select name="ready">${opts([{ value: "1", label: "Ready donors only" }, { value: "0", label: "All compatible donors" }], onlyReady ? "1" : "0")}</select>`)}
        <input type="hidden" name="req" value="${req ? req.request_id : ""}">
        <div class="field"><button class="btn primary" type="submit">Search donors</button></div>
        <p class="err field full" id="findErr"></p>
      </form>
      ${results}`;
  };

  views.requests = params => {
    const q = (params.q || "").toLowerCase();
    const st = params.status || "";
    const rows = db.Blood_Request.filter(r => (!st || r.request_status === st) &&
      (!q || [r.request_id, r.hospital_name, r.reason, r.blood_group, (seeker(r.seeker_id) || {}).name].join(" ").toLowerCase().includes(q)))
      .sort((a, b) => (b.request_time || "").localeCompare(a.request_time || ""));
    return `
      <div class="page-head"><div><h1>Blood requests</h1><p>Requests placed by blood seekers. Open a request to search for matching donors.</p></div>
        <button class="btn primary" data-act="new-request">New request</button></div>
      <div class="toolbar" data-filter="requests">
        <input class="grow" name="q" placeholder="Search hospital, reason, seeker" value="${esc(params.q || "")}">
        <select name="status">${opts(["Pending", "Partially fulfilled", "Fulfilled", "Cancelled"], st, "All statuses")}</select>
      </div>
      <div class="table-wrap"><table><thead><tr><th>ID</th><th>Seeker</th><th>Group</th><th>Units</th><th>Component</th><th>Hospital</th><th>Reason</th><th>Urgency</th><th>Requested</th><th>Status</th><th></th></tr></thead><tbody>
      ${rows.map(r => {
        const s = seeker(r.seeker_id) || {};
        const open = r.request_status === "Pending" || r.request_status === "Partially fulfilled";
        return `<tr><td class="mono">${r.request_id}</td><td>${esc(s.name)}<div class="rank">${esc(s.phone)}</div></td>
          <td><span class="bg-pill">${r.blood_group}</span></td><td>${r.units_needed}</td><td>${esc(r.component)}</td>
          <td>${esc(r.hospital_name)}<div class="rank">${esc(r.hospital_upazila ? r.hospital_upazila + ", " : "")}${esc(r.hospital_district)}</div></td><td>${esc(r.reason)}</td>
          <td>${statusBadge(r.urgency)}</td><td>${fmtDT(r.request_time)}</td><td>${statusBadge(r.request_status)}</td>
          <td><div class="btn-row">${open ? `<a class="btn sm primary" href="#find?req=${r.request_id}">Find donors</a>
            <button class="btn sm" data-act="req-status" data-id="${r.request_id}" data-v="Fulfilled">Fulfilled</button>
            <button class="btn sm" data-act="req-status" data-id="${r.request_id}" data-v="Cancelled">Cancel</button>` : ""}</div></td></tr>`;
      }).join("") || `<tr><td colspan="11" class="empty">No requests found.</td></tr>`}
      </tbody></table></div>`;
  };

  /* DFD 4.1 */
  views.proposals = params => {
    const st = params.status || "";
    const rows = db.Donation_Proposal.filter(p => !st || p.proposal_status === st)
      .sort((a, b) => (b.proposal_time || "").localeCompare(a.proposal_time || ""));
    return `
      <div class="page-head"><div><span class="step">Process 4.1</span><h1>Proposals and pickup</h1>
        <p>Each proposal links a blood request to a donor and records the agreed pickup method. When the donor accepts an app-arranged ride, book a registered vehicle and pay for it in the same step.</p></div></div>
      <div class="flow"><span class="on">Proposal sent</span><b>→</b><span>Donor confirms</span><b>→</b><span>App vehicle booked</span><b>→</b><span>Payment</span></div>
      <div class="toolbar" data-filter="proposals"><select name="status">${opts(["Pending", "Accepted", "Declined", "No response", "Withdrawn"], st, "All statuses")}</select></div>
      <div class="table-wrap"><table><thead><tr><th>ID</th><th>Request</th><th>Donor</th><th>Group</th><th>Sent</th><th>Pickup method</th><th>Status</th><th>Responded</th><th></th></tr></thead><tbody>
      ${rows.map(p => {
        const d = donor(p.donor_id) || {};
        const r = request(p.request_id) || {};
        const hasT = db.Transportation.some(t => t.proposal_id === p.proposal_id && t.trip_status !== "Cancelled");
        const waiting = p.proposal_status === "Pending" || p.proposal_status === "No response";
        const needsRide = p.proposal_status === "Accepted" && p.pickup_method === "App-arranged ride" && !hasT;
        const ownWay = p.proposal_status === "Accepted" && p.pickup_method !== "App-arranged ride";
        return `<tr><td class="mono">${p.proposal_id}</td><td class="mono">${p.request_id}<div class="rank">${esc(r.hospital_name || "")}</div></td>
          <td>${esc(d.name)}<div class="rank mono">${p.donor_id} · ${esc(d.phone || "")}</div></td><td><span class="bg-pill">${esc(d.blood_group || "")}</span></td>
          <td>${fmtDT(p.proposal_time)}</td><td>${esc(p.pickup_method)}</td><td>${statusBadge(p.proposal_status)}</td><td>${fmtDT(p.response_time)}</td>
          <td><div class="btn-row">
            ${waiting ? `<button class="btn sm primary" data-act="prop-status" data-id="${p.proposal_id}" data-v="Accepted">Donor accepts</button>
              <button class="btn sm" data-act="prop-status" data-id="${p.proposal_id}" data-v="Declined">Declines</button>` : ""}
            ${needsRide ? `<button class="btn sm primary" data-act="arrange" data-id="${p.proposal_id}">Book app vehicle</button>` : ""}
            ${hasT ? badge("App vehicle booked", "info") : ""}
            ${ownWay ? badge(p.pickup_method === "Seeker picks up donor" ? "Seeker brings donor" : "Donor comes on own", "grey") : ""}</div></td></tr>`;
      }).join("") || `<tr><td colspan="9" class="empty">No proposals yet.</td></tr>`}
      </tbody></table></div>`;
  };

  /* DFD 4.2 */
  views.transport = () => {
    const rows = db.Transportation.slice().sort((a, b) => (b.pickup_time || "").localeCompare(a.pickup_time || ""));
    return `
      <div class="page-head"><div><span class="step">Process 4.2</span><h1>Transportation aid</h1>
        <p>App-arranged rides that bring donors to the hospital in a registered vehicle. Fare = base fare + rate per km for the vehicle type.</p></div>
        <a class="btn" href="#vehicles">Registered vehicles</a></div>
      <div class="card"><h2>Fare rates</h2><div class="table-wrap"><table><thead><tr><th>Vehicle</th><th>Base fare</th><th>Per km</th><th>10 km trip</th></tr></thead><tbody>
        ${Object.entries(SETTINGS.fares).map(([v, f]) => `<tr><td>${v}</td><td>${taka(f.base)}</td><td>${taka(f.perKm)}</td><td>${taka(fareFor(v, 10))}</td></tr>`).join("")}
      </tbody></table></div></div>
      <div class="table-wrap"><table><thead><tr><th>ID</th><th>Proposal</th><th>Donor</th><th>Vehicle</th><th>Pickup</th><th>Drop</th><th>Time</th><th>Km</th><th>Fare</th><th>Payment</th><th>Status</th><th></th></tr></thead><tbody>
      ${rows.map(t => {
        const p = proposal(t.proposal_id) || {};
        const d = donor(p.donor_id) || {};
        const v = vehicle(t.vehicle_id);
        const pay = paymentFor(t.transport_id);
        const paid = !!pay;
        return `<tr><td class="mono">${t.transport_id}</td><td class="mono">${t.proposal_id}</td><td>${esc(d.name)}</td>
          <td>${esc(t.vehicle_type)}${v ? `<div class="rank mono">${esc(v.registration_no)}</div><div class="rank">${esc(v.driver_name)} · ${esc(v.driver_phone)}</div>` : ""}</td>
          <td>${esc(t.pickup_point)}</td><td>${esc(t.drop_point)}</td><td>${fmtDT(t.pickup_time)}</td><td>${t.distance_km}</td>
          <td><b>${taka(fareFor(t.vehicle_type, t.distance_km))}</b></td>
          <td>${pay ? `${esc(pay.payment_method === "Cash" ? "Cash to driver" : pay.payment_method)}<div>${statusBadge(pay.payment_status)}</div>` : "—"}</td><td>${statusBadge(t.trip_status)}</td>
          <td><div class="btn-row">
            ${t.trip_status === "Scheduled" ? `<button class="btn sm primary" data-act="trip" data-id="${t.transport_id}" data-v="Completed">Complete</button>
              <button class="btn sm" data-act="trip" data-id="${t.transport_id}" data-v="Cancelled">Cancel</button>` : ""}
            ${t.trip_status === "Completed" && !paid ? `<button class="btn sm primary" data-act="pay" data-id="${t.transport_id}">Record payment</button>` : ""}
            ${pay && pay.payment_status === "Pending" && t.trip_status === "Completed" ? `<button class="btn sm primary" data-act="mark-paid" data-id="${pay.payment_id}">Cash received</button>` : ""}</div></td></tr>`;
      }).join("") || `<tr><td colspan="12" class="empty">No trips yet.</td></tr>`}
      </tbody></table></div>`;
  };

  /* DFD 4.3 */
  views.payments = () => {
    const rows = db.Payment.slice().sort((a, b) => (b.payment_time || "").localeCompare(a.payment_time || ""));
    const paid = rows.filter(p => p.payment_status === "Paid").reduce((s, p) => s + (+p.amount || 0), 0);
    const pend = rows.filter(p => p.payment_status === "Pending").reduce((s, p) => s + (+p.amount || 0), 0);
    const refund = rows.filter(p => p.payment_status === "Refund due").reduce((s, p) => s + (+p.amount || 0), 0);
    return `
      <div class="page-head"><div><span class="step">Process 4.3</span><h1>Payment for transportation</h1>
        <p>The blood seeker pays the fare when booking an app vehicle: online now (bKash, Nagad, Rocket or card) or in cash to the driver after the trip. Paid fares for cancelled trips become refunds.</p></div></div>
      <div class="grid k4" style="margin-bottom:18px">
        <div class="kpi"><span>Received</span><strong>${taka(paid)}</strong></div>
        <div class="kpi"><span>Cash to collect</span><strong>${taka(pend)}</strong></div>
        <div class="kpi"><span>Refunds due</span><strong>${taka(refund)}</strong></div>
        <div class="kpi"><span>Transactions</span><strong>${rows.length}</strong></div>
      </div>
      <div class="table-wrap"><table><thead><tr><th>ID</th><th>Trip</th><th>Seeker</th><th>Amount</th><th>Method</th><th>Transaction ref</th><th>Time</th><th>Status</th><th></th></tr></thead><tbody>
      ${rows.map(p => {
        const s = seeker(p.seeker_id) || {};
        return `<tr><td class="mono">${p.payment_id}</td><td class="mono">${p.transport_id}</td><td>${esc(s.name)}</td><td><b>${taka(p.amount)}</b></td>
          <td>${esc(p.payment_method === "Cash" ? "Cash to driver" : p.payment_method)}</td><td class="mono">${esc(p.transaction_ref)}</td><td>${fmtDT(p.payment_time)}</td><td>${statusBadge(p.payment_status)}</td>
          <td>${p.payment_status === "Pending" ? `<button class="btn sm primary" data-act="mark-paid" data-id="${p.payment_id}">${p.payment_method === "Cash" ? "Cash received" : "Mark paid"}</button>` : ""}
            ${p.payment_status === "Refund due" ? `<button class="btn sm" data-act="refunded" data-id="${p.payment_id}">Mark refunded</button>` : ""}</td></tr>`;
      }).join("") || `<tr><td colspan="9" class="empty">No payments yet.</td></tr>`}
      </tbody></table></div>`;
  };

  views.vehicles = params => {
    const ty = params.type || "", di = params.district || "", ar = params.area || "", st = params.status || "";
    const q = (params.q || "").toLowerCase();
    const rows = db.Vehicle.filter(v => (!ty || v.vehicle_type === ty) && (!di || v.district === di) && (!ar || v.upazila === ar) &&
      (!st || v.status === st) && (!q || [v.vehicle_id, v.driver_name, v.driver_phone, v.registration_no].join(" ").toLowerCase().includes(q)));
    const avail = db.Vehicle.filter(v => v.status === "Available").length;
    return `
      <div class="page-head"><div><span class="step">Process 4.2</span><h1>Registered vehicles</h1>
        <p>Drivers register their CNG, car, motorbike, ambulance or private car here. Only active, available vehicles are offered when an app-arranged ride is booked.</p></div>
        <button class="btn primary" data-act="new-vehicle">Register vehicle</button></div>
      <div class="grid k4" style="margin-bottom:18px">
        <div class="kpi"><span>Registered</span><strong>${db.Vehicle.length}</strong></div>
        <div class="kpi"><span>Available now</span><strong>${avail}</strong></div>
        <div class="kpi"><span>On a trip</span><strong>${db.Vehicle.filter(v => v.status === "On trip").length}</strong></div>
      </div>
      <div class="toolbar" data-filter="vehicles">
        <input class="grow" name="q" placeholder="Search driver, phone, number plate" value="${esc(params.q || "")}">
        <select name="type">${opts(VEHICLE_TYPES, ty, "All types")}</select>
        <select name="district" data-district>${districtOpts(di, "All districts")}</select>
        ${areaSelect("area", di, ar, "All upazilas")}
        <select name="status">${opts(["Available", "On trip", "Inactive"], st, "All statuses")}</select>
      </div>
      <div class="table-wrap"><table><thead><tr><th>ID</th><th>Driver</th><th>Vehicle</th><th>Registration no.</th><th>Driving licence</th><th>Based at</th><th>Trips</th><th>Status</th><th></th></tr></thead><tbody>
      ${rows.map(v => `<tr><td class="mono">${v.vehicle_id}</td><td>${esc(v.driver_name)}<div class="rank">${esc(v.driver_phone)}</div></td>
        <td>${esc(v.vehicle_type)}</td><td class="mono">${esc(v.registration_no)}</td><td class="mono">${esc(v.driving_licence_no)}</td>
        <td>${esc(v.upazila)}<div class="rank">${esc(v.district)}</div></td><td>${v.total_trips}</td><td>${statusBadge(v.status)}</td>
        <td>${v.status !== "On trip" ? `<button class="btn sm" data-act="toggle-vehicle" data-id="${v.vehicle_id}">${v.status === "Inactive" ? "Activate" : "Deactivate"}</button>` : ""}</td></tr>`).join("")
        || `<tr><td colspan="9" class="empty">No vehicles match.</td></tr>`}
      </tbody></table></div>`;
  };

  views.donors = params => {
    const q = (params.q || "").toLowerCase();
    const g = params.bg || "";
    const di = params.district || "";
    const ar = params.area || "";
    const rows = db.Donor.filter(d => (!g || d.blood_group === g) && (!di || d.district === di) && (!ar || d.current_location === ar) &&
      (!q || [d.donor_id, d.name, d.phone, d.current_location].join(" ").toLowerCase().includes(q)));
    return `
      <div class="page-head"><div><h1>Donors</h1><p>Registered blood donors (data store D1). Readiness combines the 120-day gap, account status and the latest medical check.</p></div>
        <button class="btn primary" data-act="new-donor">Register donor</button></div>
      <div class="toolbar" data-filter="donors">
        <input class="grow" name="q" placeholder="Search name, phone, area" value="${esc(params.q || "")}">
        <select name="bg">${opts(GROUPS, g, "All groups")}</select>
        <select name="district" data-district>${districtOpts(di, "All districts")}</select>
        ${areaSelect("area", di, ar, "All upazilas")}
      </div>
      <div class="table-wrap"><table><thead><tr><th>ID</th><th>Name</th><th>Group</th><th>Gender</th><th>Phone</th><th>Location</th><th>Last donation</th><th>Days since</th><th>Donations</th><th>Status</th><th>Ready</th><th></th></tr></thead><tbody>
      ${rows.map(d => {
        const r = donorReadiness(d);
        return `<tr><td class="mono">${d.donor_id}</td><td>${esc(d.name)}</td><td><span class="bg-pill">${d.blood_group}</span></td><td>${esc(d.gender)}</td>
          <td>${esc(d.phone)}</td><td>${esc(d.current_location)}<div class="rank">${esc(d.district)}</div></td><td>${fmtDate(d.last_donation_date)}</td>
          <td>${isFinite(r.gap) ? r.gap : "—"}</td><td>${d.total_donations}</td><td>${statusBadge(d.status)}</td>
          <td title="${esc(r.reasons.join("; "))}">${r.ready ? badge("Yes", "ok") : badge("No", "red")}</td>
          <td><div class="btn-row"><button class="btn sm" data-act="med-check" data-id="${d.donor_id}">Medical check</button>
            <button class="btn sm" data-act="donated" data-id="${d.donor_id}">Log donation</button>
            <button class="btn sm" data-act="toggle-donor" data-id="${d.donor_id}">${d.status === "Active" ? "Deactivate" : "Activate"}</button></div></td></tr>`;
      }).join("") || `<tr><td colspan="12" class="empty">No donors found.</td></tr>`}
      </tbody></table></div>`;
  };

  views.medical = params => {
    const show = params.show || "";
    const rows = db.Medical_Status.filter(m => !show || (checkEligible(m).ok ? "Yes" : "No") === show)
      .sort((a, b) => (b.check_date || "").localeCompare(a.check_date || ""));
    return `
      <div class="page-head"><div><span class="step">Process 3.2</span><h1>Medical status</h1>
        <p>Health checks recorded for each donor. A donor is eligible when haemoglobin is at least ${SETTINGS.minHb} g/dL, weight at least ${SETTINGS.minWeight} kg, Hepatitis B is negative and the condition is Fit.</p></div></div>
      <div class="toolbar" data-filter="medical"><select name="show">${opts([{ value: "Yes", label: "Eligible only" }, { value: "No", label: "Not eligible only" }], show, "All checks")}</select></div>
      <div class="table-wrap"><table><thead><tr><th>ID</th><th>Donor</th><th>Check date</th><th>Hb (g/dL)</th><th>Weight</th><th>BP</th><th>Hepatitis B</th><th>Condition</th><th>Eligible</th></tr></thead><tbody>
      ${rows.map(m => {
        const d = donor(m.donor_id) || {};
        const e = checkEligible(m);
        return `<tr><td class="mono">${m.status_id}</td><td>${esc(d.name)}<div class="rank mono">${m.donor_id} · ${esc(d.blood_group || "")}</div></td>
          <td>${fmtDate(m.check_date)}</td><td>${m.haemoglobin}</td><td>${m.weight} kg</td><td>${esc(m.blood_pressure)}</td>
          <td>${statusBadge(m.hepatitis_B_screen)}</td><td>${statusBadge(m.health_condition)}</td>
          <td title="${esc(e.reasons.join("; "))}">${e.ok ? badge("Yes", "ok") : badge("No", "red")}</td></tr>`;
      }).join("") || `<tr><td colspan="9" class="empty">No records.</td></tr>`}
      </tbody></table></div>`;
  };

  views.hospitals = params => {
    const di = params.district || "";
    const ar = params.area || "";
    const ty = params.type || "";
    const q = (params.q || "").toLowerCase();
    const rows = [];
    Object.entries(window.HOSPITALS || {}).forEach(([d, list]) => list.forEach(h => {
      if (di && d !== di) return;
      if (ar && h.u !== ar) return;
      if (ty && h.t !== ty) return;
      if (q && !(h.n + " " + h.u + " " + d).toLowerCase().includes(q)) return;
      rows.push({ d, h });
    }));
    const total = Object.values(window.HOSPITALS || {}).reduce((s, l) => s + l.length, 0);
    const kinds = { mch: "red", inst: "info", gov: "ok", pvt: "warn", uhc: "grey" };
    return `
      <div class="page-head"><div><h1>Hospitals</h1><p>${total} hospitals across all 64 districts: medical college hospitals, specialised institutes, district hospitals, major private hospitals and the Upazila Health Complex of every upazila.</p></div></div>
      <div class="toolbar" data-filter="hospitals">
        <input class="grow" name="q" placeholder="Search hospital name" value="${esc(params.q || "")}">
        <select name="district" data-district>${districtOpts(di, "All districts")}</select>
        ${areaSelect("area", di, ar, "All upazilas")}
        <select name="type">${opts(Object.entries(HOSP_TYPES).map(([value, label]) => ({ value, label })), ty, "All types")}</select>
      </div>
      <p class="rank">${rows.length} shown</p>
      <div class="table-wrap"><table><thead><tr><th>Hospital</th><th>Type</th><th>Upazila / city area</th><th>District</th><th>Requests</th></tr></thead><tbody>
      ${rows.map(({ d, h }) => {
        const n = db.Blood_Request.filter(r => r.hospital_name === h.n && r.hospital_district === d).length;
        return `<tr><td>${esc(h.n)}</td><td>${badge(HOSP_SHORT[h.t], kinds[h.t])}</td><td>${esc(h.u)}</td><td>${esc(d)}</td><td>${n || "—"}</td></tr>`;
      }).join("") || `<tr><td colspan="5" class="empty">No hospitals match.</td></tr>`}
      </tbody></table></div>`;
  };

  views.seekers = () => `
      <div class="page-head"><div><h1>Blood seekers</h1><p>People who search for blood on behalf of a patient.</p></div>
        <button class="btn primary" data-act="new-seeker">Register seeker</button></div>
      <div class="table-wrap"><table><thead><tr><th>ID</th><th>Name</th><th>Gender</th><th>Phone</th><th>Location</th><th>Relation to patient</th><th>Registered</th><th>Requests</th></tr></thead><tbody>
      ${db.Blood_Seeker.map(s => `<tr><td class="mono">${s.seeker_id}</td><td>${esc(s.name)}</td><td>${esc(s.gender)}</td><td>${esc(s.phone)}</td>
        <td>${esc(s.location)}<div class="rank">${esc(s.district)}</div></td><td>${esc(s.relation_to_patient)}</td><td>${fmtDate(s.registration_date)}</td>
        <td>${db.Blood_Request.filter(r => r.seeker_id === s.seeker_id).length}</td></tr>`).join("")}
      </tbody></table></div>`;

  const SCHEMA = {
    Blood_Seeker: { pk: "seeker_id", fk: {} },
    Blood_Request: { pk: "request_id", fk: { seeker_id: "Blood_Seeker" } },
    Donor: { pk: "donor_id", fk: {} },
    Medical_Status: { pk: "status_id", fk: { donor_id: "Donor" } },
    Donation_Proposal: { pk: "proposal_id", fk: { request_id: "Blood_Request", donor_id: "Donor" } },
    Vehicle: { pk: "vehicle_id", fk: {} },
    Transportation: { pk: "transport_id", fk: { proposal_id: "Donation_Proposal", vehicle_id: "Vehicle" } },
    Payment: { pk: "payment_id", fk: { transport_id: "Transportation", seeker_id: "Blood_Seeker" } }
  };
  views.tables = params => {
    const t = SCHEMA[params.t] ? params.t : "Donor";
    const rows = db[t];
    const cols = rows.length ? Object.keys(rows[0]) : [];
    const s = SCHEMA[t];
    return `
      <div class="page-head"><div><h1>Database tables</h1><p>The seven relations of the relational model, exactly as stored. PK = primary key, FK = foreign key.</p></div>
        <div class="btn-row"><button class="btn" data-act="csv" data-t="${t}">Download CSV</button>
          <button class="btn" data-act="reset">Reset sample data</button></div></div>
      <div class="toolbar" data-filter="tables"><select name="t">${opts(Object.keys(SCHEMA).map(k => ({ value: k, label: `${k.toUpperCase()} (${db[k].length})` })), t)}</select>
        <span class="rank">${Object.entries(s.fk).map(([k, v]) => `${k} → ${v.toUpperCase()}`).join(" · ") || "No foreign keys"}</span></div>
      <div class="table-wrap"><table><thead><tr>${cols.map(c => `<th>${esc(c)}${c === s.pk ? " " + badge("PK", "red") : ""}${s.fk[c] ? " " + badge("FK", "info") : ""}</th>`).join("")}</tr></thead><tbody>
      ${rows.map(r => `<tr>${cols.map(c => `<td class="${c === s.pk || s.fk[c] ? "mono" : ""}">${esc(r[c] == null ? "" : r[c])}</td>`).join("")}</tr>`).join("")}
      </tbody></table></div>`;
  };

  /* ---------- install as a phone app ---------- */
  const APK_URL = "https://github.com/abusaadniloy-coder/blood-finder/releases/latest/download/blood-finder.apk";
  const isNativeApp = !!window.Capacitor;
  const isInstalled = () => isNativeApp || matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  let installPrompt = null;
  window.addEventListener("beforeinstallprompt", e => {
    e.preventDefault();
    installPrompt = e;
    $("#installBtn").hidden = false;
    if (parseHash().view === "install") render();
  });
  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    $("#installBtn").hidden = true;
    toast("BLOOD FINDER installed. Open it from your home screen.");
  });
  function runInstall() {
    if (!installPrompt) { location.hash = "#install"; return; }
    installPrompt.prompt();
    installPrompt.userChoice.finally(() => { installPrompt = null; $("#installBtn").hidden = true; render(); });
  }
  $("#installBtn").addEventListener("click", runInstall);
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost") && !isNativeApp) {
    navigator.serviceWorker.register("sw.js").catch(() => { /* offline mode unavailable */ });
  }

  views.install = () => {
    if (isInstalled()) {
      return `<div class="page-head"><div><h1>Install on phone</h1></div></div>
        <div class="card"><h2>You're using the app</h2><p>BLOOD FINDER is installed on this device${isNativeApp ? " as an Android app" : ""}. It works without internet, and your changes are kept on this phone.</p></div>`;
    }
    return `
      <div class="page-head"><div><h1>Install on phone</h1><p>Use BLOOD FINDER like a normal app: its own icon on the home screen, full screen, and it works without internet.</p></div></div>
      ${installPrompt ? `<div class="card"><h2>Install now</h2><p>Your browser can install BLOOD FINDER straight away.</p><button class="btn primary" data-act="install">Install app</button></div>` : ""}
      <div class="grid k2">
        <div class="card"><h2>Android: Chrome</h2><ol class="steps">
          <li>Open this site in <b>Chrome</b>.</li>
          <li>Tap the <b>⋮</b> menu at the top right.</li>
          <li>Tap <b>Add to Home screen</b> (or <b>Install app</b>), then <b>Install</b>.</li>
          <li>Open <b>Blood Finder</b> from your home screen.</li></ol></div>
        <div class="card"><h2>iPhone: Safari</h2><ol class="steps">
          <li>Open this site in <b>Safari</b>.</li>
          <li>Tap the <b>Share</b> button (square with an arrow).</li>
          <li>Tap <b>Add to Home Screen</b>, then <b>Add</b>.</li>
          <li>Open <b>Blood Finder</b> from your home screen.</li></ol></div>
        <div class="card"><h2>Android: APK file</h2><p>A demo Android app you install from a file instead of the browser.</p><ol class="steps">
          <li>On your Android phone, <a href="${APK_URL}">download blood-finder.apk</a>.</li>
          <li>Open the downloaded file. If Android asks, allow <b>Install unknown apps</b> for your browser or file manager.</li>
          <li>Tap <b>Install</b>. If Play Protect warns that the app is unrecognised, tap <b>More details → Install anyway</b>. This happens because the demo is not on the Play Store.</li></ol></div>
      </div>`;
  };

  /* ---------- actions ---------- */
  const actions = {
    install() { runInstall(); },
    propose(btn) {
      const d = donor(btn.dataset.id);
      const open = db.Blood_Request.filter(r => (r.request_status === "Pending" || r.request_status === "Partially fulfilled") &&
        (COMPATIBLE[r.blood_group] || []).includes(d.blood_group));
      if (!open.length) {
        toast("No open request can take this donor's blood group. Create a request first.");
        return;
      }
      const pre = btn.dataset.req;
      openModal(`Send proposal to ${d.name}`, `<div class="form">
        ${field("Blood request", `<select name="request_id" required>${opts(open.map(r => ({ value: r.request_id, label: `${r.request_id} · ${r.blood_group} · ${r.hospital_name}` })), pre, "Select request")}</select>`, true)}
        ${field("Pickup method", `<select name="pickup_method" required>${opts(PICKUP, "App-arranged ride")}</select>`, true)}
      </div><p class="rank">The donor is contacted on ${esc(d.phone)}. Their reply is recorded on the Proposals page. With an app-arranged ride, a registered vehicle is booked and paid for once the donor accepts.</p>`, f => {
        if (!f.request_id) return "Select a blood request.";
        if (db.Donation_Proposal.some(p => p.request_id === f.request_id && p.donor_id === d.donor_id && p.proposal_status !== "Declined" && p.proposal_status !== "Withdrawn"))
          return "This donor already has an active proposal for that request.";
        db.Donation_Proposal.push({ proposal_id: nextId("Donation_Proposal", "proposal_id", "P"), request_id: f.request_id, donor_id: d.donor_id,
          proposal_time: nowLocal(), pickup_method: f.pickup_method, proposal_status: "Pending", response_time: null });
        save(); toast("Proposal sent"); location.hash = "#proposals"; return true;
      }, "Send proposal");
    },
    "prop-status"(btn) {
      const p = proposal(btn.dataset.id);
      p.proposal_status = btn.dataset.v;
      p.response_time = nowLocal();
      save(); render(); toast(`Proposal ${p.proposal_id} marked ${btn.dataset.v.toLowerCase()}`);
    },
    arrange(btn) {
      const p = proposal(btn.dataset.id);
      const d = donor(p.donor_id);
      const r = request(p.request_id);
      const sk = seeker(r.seeker_id) || {};
      // available vehicles, nearest to the donor first
      const nearby = type => db.Vehicle.filter(v => v.status === "Available" && (!type || v.vehicle_type === type)).map(v => ({
        v, rank: v.district === d.district && v.upazila === d.current_location ? 0 : v.district === d.district ? 1 : 2
      })).sort((a, b) => a.rank - b.rank || b.v.total_trips - a.v.total_trips);
      const where = ["same upazila", "same district", "other district"];
      const vehicleOpts = type => {
        const list = nearby(type);
        if (!list.length) return `<option value="">No available ${type ? type.toLowerCase() : "vehicle"} right now</option>`;
        const o = x => `<option value="${x.v.vehicle_id}">${esc(x.v.vehicle_type)} · ${esc(x.v.registration_no)} · ${esc(x.v.driver_name)} · ${esc(x.v.upazila)}${x.rank === 2 ? ", " + esc(x.v.district) : ""} (${where[x.rank]})</option>`;
        const near = list.filter(x => x.rank < 2), far = list.filter(x => x.rank === 2);
        return `<option value="">Select vehicle (${near.length} near the donor, ${far.length} elsewhere)</option>` +
          (near.length ? `<optgroup label="Near the donor in ${esc(d.district)}">${near.map(o).join("")}</optgroup>` : "") +
          (far.length ? `<optgroup label="Other districts${near.length ? "" : " (none available in " + esc(d.district) + ")"}">${far.map(o).join("")}</optgroup>` : "");
      };
      openModal("Book app vehicle", `<p class="rank">Donor ${esc(d.name)} (${esc(d.phone)}) at ${esc(d.current_location)}, ${esc(d.district)} → ${esc(r.hospital_name)}</p>
        <div class="form">
        ${field("Vehicle type", `<select id="fVeh">${opts(VEHICLE_TYPES, "", "Any type")}</select>`)}
        ${field("Distance (km)", `<input name="distance_km" id="fKm" type="number" min="0.5" max="500" step="0.1" value="8" required>`)}
        ${field("Registered vehicle", `<select name="vehicle_id" id="fVid" required>${vehicleOpts("")}</select>`, true)}
        ${field("Pickup point", `<input name="pickup_point" value="${esc(d.current_location + ", " + d.district)}" required>`, true)}
        ${field("Drop point", `<input name="drop_point" value="${esc(r.hospital_name)}" required>`, true)}
        ${field("Pickup time", `<input name="pickup_time" type="datetime-local" value="${nowLocal()}" required>`)}
        </div>
        <div class="pay-box" id="paySection" hidden>
          <h3>Payment</h3>
          <dl class="kv"><dt>Driver</dt><dd id="payDriver"></dd><dt>Fare</dt><dd><b id="fFare"></b></dd><dt>Paid by</dt><dd>${esc(sk.name || "Blood seeker")}</dd></dl>
          <div class="pay-opts">
            <label class="radio"><input type="radio" name="pay_when" value="now" checked> Pay now online (bKash, Nagad, Rocket or card)</label>
            <label class="radio"><input type="radio" name="pay_when" value="cash"> Pay cash to the driver after the trip</label>
          </div>
          <div class="form" id="payNow">
            ${field("Payment method", `<select name="payment_method" id="fPm">${opts(ONLINE_PAY, "bKash")}</select>`)}
            ${field("Transaction ID", `<input name="transaction_ref" id="fRef" placeholder="8N7A5K2Q1X" autocomplete="off">`)}
          </div>
          <p class="rank" id="payHint"></p>
        </div>`, f => {
        const v = vehicle(f.vehicle_id);
        if (!v) return "Select a registered vehicle.";
        if (v.status !== "Available") return "That vehicle is no longer available. Pick another.";
        if (!(+f.distance_km > 0)) return "Enter a distance greater than 0.";
        const amount = fareFor(v.vehicle_type, f.distance_km);
        const now = f.pay_when !== "cash";
        const ref = (f.transaction_ref || "").trim().toUpperCase();
        if (now && !/^[A-Z0-9]{6,}$/.test(ref)) return "Enter the transaction ID from the payment SMS (at least 6 letters or numbers).";
        const tid = nextId("Transportation", "transport_id", "T");
        db.Transportation.push({ transport_id: tid, proposal_id: p.proposal_id, vehicle_type: v.vehicle_type, pickup_point: f.pickup_point,
          drop_point: f.drop_point, pickup_time: f.pickup_time, distance_km: Math.round(+f.distance_km * 10) / 10, trip_status: "Scheduled", vehicle_id: v.vehicle_id });
        v.status = "On trip";
        db.Payment.push({ payment_id: nextId("Payment", "payment_id", "PAY"), transport_id: tid, seeker_id: r.seeker_id, amount,
          payment_method: now ? f.payment_method : "Cash", transaction_ref: now ? ref : "CASH", payment_time: nowLocal(), payment_status: now ? "Paid" : "Pending" });
        save();
        toast(now ? `${taka(amount)} paid by ${f.payment_method}. ${v.driver_name} is on the way.` : `Booked. Pay ${taka(amount)} cash to ${v.driver_name} after the trip.`);
        location.hash = "#transport"; return true;
      }, "Book vehicle");
      const veh = $("#fVeh"), vid = $("#fVid"), km = $("#fKm"), box = $("#paySection");
      const update = () => {
        const v = vehicle(vid.value);
        box.hidden = !v;
        if (!v) { $("#modalOk").textContent = "Book vehicle"; return; }
        const amount = fareFor(v.vehicle_type, km.value);
        const now = $("#modal input[name=pay_when]:checked").value === "now";
        $("#fFare").textContent = taka(amount);
        $("#payDriver").textContent = `${v.driver_name} · ${v.driver_phone} · ${v.registration_no}`;
        $("#payNow").hidden = !now;
        $("#fRef").required = now;
        $("#payHint").textContent = now
          ? `Send ${taka(amount)} with ${$("#fPm").value === "Card" ? "your card" : $("#fPm").value}, then type the transaction ID from the confirmation message. This is a demo: no real money is sent.`
          : `The driver collects ${taka(amount)} in cash after dropping the donor at the hospital.`;
        $("#modalOk").textContent = now ? `Book and pay ${taka(amount)}` : "Book, pay cash later";
      };
      veh.addEventListener("change", () => { vid.innerHTML = vehicleOpts(veh.value); update(); });
      vid.addEventListener("change", update);
      km.addEventListener("input", update);
      $("#fPm").addEventListener("change", update);
      document.querySelectorAll("#modal input[name=pay_when]").forEach(x => x.addEventListener("change", update));
    },
    trip(btn) {
      const t = transport(btn.dataset.id);
      const v = vehicle(t.vehicle_id);
      const pay = paymentFor(t.transport_id);
      t.trip_status = btn.dataset.v;
      if (v) {
        v.status = v.status === "On trip" ? "Available" : v.status;
        if (btn.dataset.v === "Completed") v.total_trips = (+v.total_trips || 0) + 1;
      }
      let msg = `Trip ${t.transport_id} ${btn.dataset.v.toLowerCase()}`;
      if (pay && btn.dataset.v === "Cancelled") {
        if (pay.payment_status === "Paid") { pay.payment_status = "Refund due"; msg += `. ${taka(pay.amount)} to refund to the seeker`; }
        else if (pay.payment_status === "Pending") pay.payment_status = "Cancelled";
      }
      if (pay && btn.dataset.v === "Completed" && pay.payment_status === "Pending") msg += `. Driver to collect ${taka(pay.amount)} cash`;
      save(); render(); toast(msg);
    },
    pay(btn) {
      const t = transport(btn.dataset.id);
      const r = request(proposal(t.proposal_id).request_id);
      const amount = fareFor(t.vehicle_type, t.distance_km);
      openModal(`Payment for ${t.transport_id}`, `<dl class="kv"><dt>Seeker</dt><dd>${esc(seeker(r.seeker_id).name)}</dd>
        <dt>Trip</dt><dd>${esc(t.pickup_point)} → ${esc(t.drop_point)}</dd><dt>Amount</dt><dd><b>${taka(amount)}</b></dd></dl>
        <div class="form" style="margin-top:12px">
        ${field("Payment method", `<select name="payment_method">${opts(PAY_METHODS, "bKash")}</select>`)}
        ${field("Transaction ref", `<input name="transaction_ref" placeholder="TXN8K2F91AB">`)}
        </div>`, f => {
        const ref = (f.transaction_ref || "").trim();
        if (f.payment_method !== "Cash" && ref.length < 6) return "Enter the transaction reference (at least 6 characters).";
        db.Payment.push({ payment_id: nextId("Payment", "payment_id", "PAY"), transport_id: t.transport_id, seeker_id: r.seeker_id,
          amount, payment_method: f.payment_method, transaction_ref: ref || "CASH", payment_time: nowLocal(), payment_status: "Paid" });
        save(); toast("Payment recorded"); location.hash = "#payments"; return true;
      }, "Confirm payment");
    },
    refunded(btn) {
      const p = db.Payment.find(x => x.payment_id === btn.dataset.id);
      p.payment_status = "Refunded";
      save(); render(); toast("Refund recorded");
    },
    "new-vehicle"() {
      openModal("Register vehicle", `<p class="rank">For drivers who want to carry blood donors to hospitals. Fares follow the app's rates for each vehicle type.</p><div class="form">
        ${field("Driver's full name", `<input name="driver_name" required placeholder="Md. Jamal Uddin">`, true)}
        ${field("Driver's mobile", `<input name="driver_phone" required placeholder="01712345678" inputmode="numeric">`)}
        ${field("Vehicle type", `<select name="vehicle_type" required>${opts(VEHICLE_TYPES, "", "Select")}</select>`)}
        ${field("Registration (number plate)", `<input name="registration_no" required placeholder="Dhaka Metro-Tha 11-2345">`)}
        ${field("Driving licence no.", `<input name="driving_licence_no" required placeholder="DK0412345678">`)}
        ${field("District", `<select name="district" data-district required>${districtOpts("", "Select")}</select>`)}
        ${field("Upazila / city area", areaSelect("upazila", "", "", "Select upazila", true))}
      </div>`, f => {
        if ((f.driver_name || "").trim().length < 3) return "Enter the driver's full name.";
        if (!/^01[3-9]\d{8}$/.test((f.driver_phone || "").trim())) return "Enter a valid 11-digit Bangladeshi mobile number (01XXXXXXXXX).";
        if (!f.vehicle_type) return "Select the vehicle type.";
        const plateNo = (f.registration_no || "").trim().replace(/\s+/g, " ");
        if (!/^[A-Za-z' ]+-[A-Za-z]+ \d{2}-\d{4}$/.test(plateNo)) return "Enter the number plate like Dhaka Metro-Tha 11-2345 or Kushtia-La 12-3456.";
        if (db.Vehicle.some(v => v.registration_no.toLowerCase() === plateNo.toLowerCase())) return "A vehicle with this number plate is already registered.";
        const lic = (f.driving_licence_no || "").trim().toUpperCase();
        if (!/^[A-Z0-9]{8,}$/.test(lic)) return "Enter the driving licence number (at least 8 letters or numbers).";
        if (!f.district || !f.upazila) return "Select the district and upazila where the vehicle is based.";
        const id = nextId("Vehicle", "vehicle_id", "V");
        db.Vehicle.push({ vehicle_id: id, driver_name: f.driver_name.trim(), driver_phone: f.driver_phone.trim(), vehicle_type: f.vehicle_type,
          registration_no: plateNo, driving_licence_no: lic, district: f.district, upazila: f.upazila, status: "Available",
          total_trips: 0, registration_date: nowLocal().slice(0, 10) });
        save(); toast(`Vehicle ${id} registered and available for rides`); return true;
      }, "Register");
    },
    "toggle-vehicle"(btn) {
      const v = vehicle(btn.dataset.id);
      v.status = v.status === "Inactive" ? "Available" : "Inactive";
      save(); render();
    },
    "mark-paid"(btn) {
      const p = db.Payment.find(x => x.payment_id === btn.dataset.id);
      p.payment_status = "Paid";
      save(); render(); toast("Payment marked as paid");
    },
    "req-status"(btn) {
      const r = request(btn.dataset.id);
      r.request_status = btn.dataset.v;
      if (btn.dataset.v === "Cancelled") db.Donation_Proposal.forEach(p => { if (p.request_id === r.request_id && p.proposal_status !== "Accepted") p.proposal_status = "Withdrawn"; });
      save(); render(); toast(`Request ${r.request_id} marked ${btn.dataset.v.toLowerCase()}`);
    },
    "new-request"() {
      const seekers = db.Blood_Seeker.map(s => ({ value: s.seeker_id, label: `${s.seeker_id} · ${s.name}` }));
      const allHosp = [];
      Object.entries(window.HOSPITALS || {}).forEach(([d, list]) => list.forEach(h => allHosp.push({ label: `${h.n} — ${d}`, d, h })));
      openModal("New blood request", `<div class="form">
        ${field("Blood seeker", `<select name="seeker_id" required>${opts(seekers, "", "Select seeker")}</select>`, true)}
        ${field("Blood group", `<select name="blood_group" required>${opts(GROUPS, "", "Select")}</select>`)}
        ${field("Units needed", `<input name="units_needed" type="number" min="1" max="10" value="1" required>`)}
        ${field("Component", `<select name="component">${opts(["Whole blood", "Packed RBC", "Platelets", "Plasma"], "Whole blood")}</select>`)}
        ${field("Urgency", `<select name="urgency">${opts(["Emergency", "Urgent", "Scheduled"], "Emergency")}</select>`)}
        ${field("Search hospital by name (optional)", `<input id="hospSearch" list="hospAll" placeholder="Type a hospital name, for example Mitford" autocomplete="off"><datalist id="hospAll">${allHosp.map(x => `<option value="${esc(x.label)}">`).join("")}</datalist>`, true)}
        ${field("Hospital district", `<select name="hospital_district" data-district required>${districtOpts("", "Select")}</select>`)}
        ${field("Hospital upazila / city area", `<select name="hospital_upazila" data-area data-placeholder="Select upazila" required>${allAreaOpts()}</select>`)}
        ${field("Hospital", `<select name="hospital_pick" id="hospPick" required>${allHospitalOpts()}</select>`, true)}
        <div class="field full" id="hospOtherBox" hidden><label>Hospital name</label><input name="hospital_name" placeholder="Name of the hospital or clinic"></div>
        ${field("Patient reference", `<input name="patient_ref" placeholder="Bed 12, Ward 5">`)}
        ${field("Reason", `<input name="reason" required placeholder="Road accident">`, true)}
      </div><p class="rank">The hospital and upazila lists show the whole country, grouped by district. Picking a hospital fills in its district and upazila. Picking a district or upazila first narrows the hospital list. If the hospital is not listed, choose "Other hospital" and type its name. Seeker not listed? Register them on the Blood seekers page first.</p>`, f => {
        if (!f.seeker_id || !f.blood_group || !f.hospital_district) return "Fill in seeker, blood group and hospital district.";
        if (!f.hospital_upazila) return "Select the hospital's upazila or city area.";
        const hname = f.hospital_pick === "__other" ? (f.hospital_name || "").trim() : (f.hospital_pick || "").split("||").pop();
        if ((f.hospital_upazila || "").includes("||")) return "Select the hospital's upazila again.";
        if (!hname) return f.hospital_pick === "__other" ? "Type the hospital name." : "Select the hospital.";
        if (!(f.reason || "").trim()) return "Fill in the reason.";
        const id = nextId("Blood_Request", "request_id", "R");
        db.Blood_Request.push({ request_id: id, seeker_id: f.seeker_id, patient_ref: f.patient_ref || "—", blood_group: f.blood_group,
          units_needed: +f.units_needed, component: f.component, hospital_name: hname, hospital_district: f.hospital_district,
          reason: f.reason.trim(), urgency: f.urgency, request_time: nowLocal(), request_status: "Pending", hospital_upazila: f.hospital_upazila });
        save(); toast(`Request ${id} created`); location.hash = `#find?req=${id}`; return true;
      }, "Create and find donors");
      const ds = $("#modal select[name=hospital_district]");
      const us = $("#modal select[name=hospital_upazila]");
      const hp = $("#hospPick");
      const other = $("#hospOtherBox");
      const rebuild = (sel) => {
        hp.innerHTML = hospitalOpts(ds.value, us.value, sel || "");
        toggleOther();
      };
      const toggleOther = () => {
        other.hidden = hp.value !== "__other";
        other.querySelector("input").required = !other.hidden;
      };
      // fill district, upazila and hospital together
      const setLocation = (d, u, n) => {
        ds.value = d;
        refreshArea(ds);
        us.value = u || "";
        rebuild(n || "");
      };
      // district change: refreshArea (document listener) resets the upazila; rebuild after it runs
      ds.addEventListener("change", () => setTimeout(() => {
        if (!ds.value) { us.innerHTML = allAreaOpts(); us.disabled = false; }
        rebuild("");
      }, 0));
      us.addEventListener("change", () => {
        if (us.value.includes("||")) { const [d, u] = us.value.split("||"); setLocation(d, u, ""); return; }
        rebuild(hp.value && hp.value !== "__other" ? "" : hp.value);
      });
      hp.addEventListener("change", () => {
        if (hp.value.includes("||")) {
          const [d, n] = hp.value.split("||");
          const h = findHospital(d, n);
          setLocation(d, h ? h.u : "", n);
          return;
        }
        const h = findHospital(ds.value, hp.value);
        if (h && us.value !== h.u) { us.value = h.u; rebuild(h.n); }
        toggleOther();
      });
      $("#hospSearch").addEventListener("input", e => {
        const x = allHosp.find(a => a.label === e.target.value);
        if (x) setLocation(x.d, x.h.u, x.h.n);
      });
    },
    "new-seeker"() {
      openModal("Register blood seeker", personForm(false), f => {
        const err = validatePerson(f); if (err) return err;
        db.Blood_Seeker.push({ seeker_id: nextId("Blood_Seeker", "seeker_id", "S"), name: f.name.trim(), gender: f.gender, phone: f.phone.trim(),
          location: f.location.trim(), district: f.district, relation_to_patient: f.relation_to_patient, registration_date: nowLocal().slice(0, 10) });
        save(); toast("Seeker registered"); return true;
      }, "Register");
    },
    "new-donor"() {
      openModal("Register donor", personForm(true), f => {
        const err = validatePerson(f); if (err) return err;
        if (!f.blood_group) return "Select the blood group.";
        if (!f.date_of_birth) return "Enter the date of birth.";
        const age = (today() - new Date(f.date_of_birth)) / 31557600000;
        if (age < 18 || age > 60) return "Donors must be between 18 and 60 years old.";
        db.Donor.push({ donor_id: nextId("Donor", "donor_id", "D"), name: f.name.trim(), gender: f.gender, date_of_birth: f.date_of_birth,
          blood_group: f.blood_group, phone: f.phone.trim(), current_location: f.location.trim(), district: f.district,
          last_donation_date: f.last_donation_date || null, total_donations: +f.total_donations || 0, status: "Active", registration_date: nowLocal().slice(0, 10) });
        save(); toast("Donor registered. Record a medical check next."); return true;
      }, "Register");
    },
    "med-check"(btn) {
      const d = donor(btn.dataset.id);
      const m = latestCheck(d.donor_id);
      openModal(`Medical check: ${d.name}`, `${m ? `<p class="rank">Last check ${fmtDate(m.check_date)}: Hb ${m.haemoglobin}, ${m.weight} kg, ${esc(m.health_condition)}.</p>` : ""}<div class="form">
        ${field("Check date", `<input name="check_date" type="date" value="${nowLocal().slice(0, 10)}" required>`)}
        ${field("Haemoglobin (g/dL)", `<input name="haemoglobin" type="number" step="0.1" min="5" max="25" required>`)}
        ${field("Weight (kg)", `<input name="weight" type="number" min="30" max="200" required>`)}
        ${field("Blood pressure", `<input name="blood_pressure" placeholder="120/80" required>`)}
        ${field("Hepatitis B screen", `<select name="hepatitis_B_screen">${opts(["Negative", "Positive"], "Negative")}</select>`)}
        ${field("Health condition", `<select name="health_condition">${opts(["Fit", "Recent fever", "On antibiotics", "Recent tattoo", "Pregnant / breastfeeding", "Other illness"], "Fit")}</select>`)}
      </div>`, f => {
        if (!/^\d{2,3}\/\d{2,3}$/.test((f.blood_pressure || "").trim())) return "Enter blood pressure as 120/80.";
        const rec = { status_id: nextId("Medical_Status", "status_id", "M"), donor_id: d.donor_id, check_date: f.check_date,
          haemoglobin: +f.haemoglobin, weight: +f.weight, blood_pressure: f.blood_pressure.trim(), hepatitis_B_screen: f.hepatitis_B_screen, health_condition: f.health_condition };
        db.Medical_Status.push(rec);
        const e = checkEligible(rec);
        save(); toast(e.ok ? "Check saved: donor is medically eligible" : "Check saved: not eligible (" + e.reasons[0] + ")"); return true;
      }, "Save check");
    },
    donated(btn) {
      const d = donor(btn.dataset.id);
      d.last_donation_date = nowLocal().slice(0, 10);
      d.total_donations = (+d.total_donations || 0) + 1;
      save(); render(); toast(`${d.name}: donation logged. Next eligible in ${SETTINGS.minGapDays} days.`);
    },
    "toggle-donor"(btn) {
      const d = donor(btn.dataset.id);
      d.status = d.status === "Active" ? "Inactive" : "Active";
      save(); render();
    },
    csv(btn) {
      const rows = db[btn.dataset.t];
      if (!rows.length) return;
      const cols = Object.keys(rows[0]);
      const q = v => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
      const csv = [cols.join(","), ...rows.map(r => cols.map(c => q(r[c])).join(","))].join("\n");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
      a.download = btn.dataset.t.toLowerCase() + ".csv";
      a.click();
      URL.revokeObjectURL(a.href);
    },
    reset() {
      openModal("Reset sample data", `<p>This removes every change made in this browser and restores the original sample records.</p>`, () => {
        resetDb(); toast("Sample data restored"); return true;
      }, "Reset");
    }
  };

  function personForm(isDonor) {
    return `<div class="form">
      ${field("Full name", `<input name="name" required placeholder="Md. Kamal Hossain">`, true)}
      ${field("Gender", `<select name="gender">${opts(["Male", "Female"], "Male")}</select>`)}
      ${field("Mobile number", `<input name="phone" required placeholder="01712345678" inputmode="numeric">`)}
      ${isDonor ? field("Blood group", `<select name="blood_group" required>${opts(GROUPS, "", "Select")}</select>`) : field("Relation to patient", `<select name="relation_to_patient">${opts(["Self", "Father", "Mother", "Spouse", "Brother", "Sister", "Son", "Daughter", "Friend"], "Self")}</select>`)}
      ${isDonor ? field("Date of birth", `<input name="date_of_birth" type="date" required>`) : ""}
      ${field("District", `<select name="district" data-district required>${districtOpts("", "Select")}</select>`)}
      ${field("Upazila / city area", areaSelect("location", "", "", "Select upazila", true))}
      ${isDonor ? field("Last donation date", `<input name="last_donation_date" type="date">`) + field("Previous donations", `<input name="total_donations" type="number" min="0" value="0">`) : ""}
    </div>`;
  }
  function validatePerson(f) {
    if ((f.name || "").trim().length < 3) return "Enter the full name.";
    if (!/^01[3-9]\d{8}$/.test((f.phone || "").trim())) return "Enter a valid 11-digit Bangladeshi mobile number (01XXXXXXXXX).";
    if (!f.district) return "Select the district.";
    if (!(f.location || "").trim()) return "Select the upazila or city area.";
    return "";
  }

  /* ---------- routing ---------- */
  function parseHash() {
    const h = location.hash.replace(/^#/, "") || "dashboard";
    const [view, qs] = h.split("?");
    return { view: views[view] ? view : "dashboard", params: Object.fromEntries(new URLSearchParams(qs || "")) };
  }
  function render() {
    const { view, params } = parseHash();
    $("#app").innerHTML = views[view](params);
    document.querySelectorAll(".sidenav a").forEach(a => a.classList.toggle("active", a.dataset.view === view));
    $("#sidenav").classList.remove("open");
    $("#menuBtn").setAttribute("aria-expanded", "false");
  }
  window.addEventListener("hashchange", () => { if (modal.open) modal.close(); render(); window.scrollTo(0, 0); });

  document.addEventListener("click", e => {
    const btn = e.target.closest("[data-act]");
    if (btn && actions[btn.dataset.act]) { e.preventDefault(); actions[btn.dataset.act](btn); }
  });
  // filter toolbars rewrite the hash so the view is linkable
  document.addEventListener("input", e => {
    const bar = e.target.closest("[data-filter]");
    if (!bar) return;
    clearTimeout(bar._t);
    bar._t = setTimeout(() => {
      const p = new URLSearchParams();
      // a new district makes the old upazila meaningless, so drop it
      if (e.target.matches("select[data-district]")) { const a = bar.querySelector("select[data-area]"); if (a) a.value = ""; }
      bar.querySelectorAll("input,select").forEach(i => { if (i.value) p.set(i.name, i.value); });
      const active = document.activeElement && document.activeElement.name;
      history.replaceState(null, "", `#${bar.dataset.filter}${p.toString() ? "?" + p : ""}`);
      render();
      if (active) { const el = document.querySelector(`[data-filter] [name="${active}"]`); if (el) { el.focus(); if (el.setSelectionRange && el.type === "text") el.setSelectionRange(el.value.length, el.value.length); } }
    }, e.target.tagName === "INPUT" ? 250 : 0);
  });
  document.addEventListener("submit", e => {
    if (e.target.id !== "findForm") return;
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target).entries());
    if (!f.bg) { $("#findErr").textContent = "Select the blood group needed."; return; }
    const p = new URLSearchParams();
    Object.entries(f).forEach(([k, v]) => { if (v) p.set(k, v); });
    location.hash = "#find?" + p;
  });
  $("#menuBtn").addEventListener("click", () => {
    const open = $("#sidenav").classList.toggle("open");
    $("#menuBtn").setAttribute("aria-expanded", String(open));
  });

  render();
})();
