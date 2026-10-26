const $ = (id) => document.getElementById(id);
let current = "overview";
let vendorIndex = [];

function isoDate(d) {
  const z = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate());
}
function defaultRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 6);
  $("start").value = isoDate(start);
  $("end").value = isoDate(end);
}
function esc(v) {
  return String(v == null ? "" : v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function fmtNum(n) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  n = Number(n);
  if (Math.abs(n) >= 10000) return Math.round(n).toLocaleString("zh-CN");
  if (Number.isInteger(n)) return n.toLocaleString("zh-CN");
  return n.toFixed(n < 10 ? 2 : 1);
}
// Subscription facts are never usage/capacity, including older server payloads.
function isSubscription(d) {
  return d.panel_kind === "subscription" || d.usage_source === "manual" || d.adapter === "chatgpt";
}
function pctOf(w) {
  if (!w || w.metric_kind === "subscription_info" || ["plan", "renew", "price_local", "price_usd"].includes(w.key)) return null;
  if (w.percent != null && Number.isFinite(Number(w.percent))) return Number(w.percent);
  if (w.used != null && Number.isFinite(Number(w.used)) && Number(w.quota) > 0 && Number.isFinite(Number(w.quota))) {
    return Number(w.used) / Number(w.quota) * 100;
  }
  return null;
}
function primaryPct(windows, panel = {}) {
  if (isSubscription(panel)) return null;
  const order = ["monthly", "weekly", "daily", "five_hour", "range"];
  for (const key of order) {
    const p = pctOf((windows || []).find((x) => x.key === key));
    if (p != null) return p;
  }
  for (const w of windows || []) {
    const p = pctOf(w);
    if (p != null) return p;
  }
  return null;
}
function panelStatus(d) {
  if (d.enabled === false) return "未启用";
  if (d.demo || d.usage_source === "mock") return "示例数据（非真实）";
  if (d.ok === false) return d.status_label || "未取到用量";
  if (isSubscription(d)) return "已配置未验证";
  if (d.ok) return "用量读取成功";
  return d.status_label || "未取到用量";
}
function sourceLabel(d) {
  if (d.demo || d.usage_source === "mock") return "用量来源：模拟数据";
  if (isSubscription(d)) return "用量来源：手工填写 · 额度未知";
  return d.usage_source === "observed" ? "用量来源：接口读取" : "用量来源：未知";
}
function executionLabel(d) {
  if (d.demo || d.usage_source === "mock" || d.enabled === false || d.execution_readiness === "disabled") return "执行：禁用";
  // This dashboard has no execution verifier. Never infer readiness from ok/configured.
  return "执行：未验证";
}
function billingLabel(d) {
  return "执行计费：未知";
}
function windowLine(w, subscription = false) {
  if (w.display_value != null) return String(w.display_value);
  if (subscription && w.key === "plan") return w.unit || "未知";
  if (w.used != null) {
    if (!subscription && w.metric_kind !== "subscription_info" && w.quota != null) return fmtNum(w.used) + " / " + fmtNum(w.quota) + " " + (w.unit || "");
    return fmtNum(w.used) + " " + (w.unit || "");
  }
  const p = subscription ? null : pctOf(w);
  return p != null ? "已用 " + p.toFixed(1) + "%" : "未知";
}
function progressHtml(pct, cls = "") {
  if (pct == null) return "";
  return '<div class="bar ' + cls + '"><i style="width:' + Math.max(0, Math.min(pct, 100)) + '%"></i></div>';
}
function addPill(el, text, cls) {
  const s = document.createElement("span");
  s.className = "pill " + (cls || "");
  s.textContent = text;
  el.appendChild(s);
}
function qRange() {
  return new URLSearchParams({ start: $("start").value, end: $("end").value });
}

function renderNav(overview) {
  const byId = Object.fromEntries((overview.vendors || []).map((v) => [v.id, v]));
  const enabled = vendorIndex.filter((v) => v.enabled);
  const disabled = vendorIndex.filter((v) => !v.enabled);
  const parts = [];
  const row = (v, dim) => {
    const ov = byId[v.id] || {};
    const pct = primaryPct(ov.windows, { ...v, ...ov });
    const st = panelStatus({ ...v, ...ov });
    const color = (v.panel && v.panel.color) || "#5b8cff";
    const icon = (v.panel && v.panel.icon) || "●";
    return (
      '<button type="button" class="nav-item' +
      (current === v.id ? " active" : "") +
      (dim ? " dim" : "") +
      '" data-id="' +
      esc(v.id) +
      '"><span class="nav-ico" style="background:' +
      esc(color) +
      '22">' +
      esc(icon) +
      '</span><span class="nav-meta"><div class="nav-name">' +
      esc(v.display_name) +
      '</div><div class="nav-sub">' +
      esc(st) +
      "</div></span>" +
      (pct != null ? '<span class="nav-pct">' + pct.toFixed(0) + "%</span>" : "") +
      "</button>"
    );
  };
  parts.push(
    '<button type="button" class="nav-item' +
      (current === "overview" ? " active" : "") +
      '" data-id="overview"><span class="nav-ico">▦</span><span class="nav-meta"><div class="nav-name">概览</div><div class="nav-sub">全部订阅</div></span></button>'
  );
  enabled.forEach((v) => parts.push(row(v, false)));
  if (disabled.length) {
    parts.push('<div class="nav-label">待接入</div>');
    disabled.forEach((v) => parts.push(row(v, true)));
  }
  $("nav").innerHTML = parts.join("");
  $("nav").querySelectorAll("[data-id]").forEach((btn) => {
    btn.onclick = () => {
      current = btn.getAttribute("data-id");
      load();
    };
  });
}

function quotaCard(w, subscription = false) {
  if (!w) return '<div class="card qcard"><div class="val">未知</div><div class="qmeta">无数据</div></div>';
  const pct = subscription ? null : pctOf(w);
  const barCls = pct >= 90 ? "danger" : pct >= 70 ? "warn" : "";
  const reset = w.reset_at ? (subscription ? "续费：" : "重置：") + esc(w.reset_at) : "";
  return '<div class="card qcard"><div class="label">' + esc(w.label || w.key) +
    '</div><div class="val">' + esc(windowLine(w, subscription)) + '</div>' +
    progressHtml(pct, barCls) + '<div class="qmeta">' + (reset || esc(w.unit || "") || " ") + "</div></div>";
}

function renderQuotas(windows, panel = {}) {
  const list = windows || [];
  if (!list.length) {
    $("quotas").innerHTML = '<div class="card empty">额度未知 · 暂无额度窗口</div>';
    return;
  }
  $("quotas").innerHTML = list.map((w) => quotaCard(w, isSubscription(panel))).join("");
}

function barsHtml(items) {
  if (!items.length) return '<div class="empty">暂无数据</div>';
  const mx = Math.max(...items.map((x) => x[1]), 1);
  return items
    .map(([name, val]) => {
      const w = Math.max(2, Math.min(100, (val / mx) * 100));
      return (
        '<div class="bar-row"><div class="qmeta">' +
        esc(name) +
        " · " +
        fmtNum(val) +
        '</div><div class="bar"><i style="width:' +
        w.toFixed(1) +
        '%"></i></div></div>'
      );
    })
    .join("");
}

function renderCharts(series) {
  const byDay = {};
  const byModel = {};
  (series || []).forEach((r) => {
    const day = (r.time || "").slice(0, 10) || "未知";
    if (r.usage == null || !Number.isFinite(Number(r.usage))) return;
    const q = Number(r.usage);
    byDay[day] = (byDay[day] || 0) + q;
    const m = r.model || "未知";
    byModel[m] = (byModel[m] || 0) + q;
  });
  const days = Object.keys(byDay)
    .sort()
    .map((k) => [k, byDay[k]]);
  const models = Object.entries(byModel).sort((a, b) => b[1] - a[1]);
  $("chartTime").innerHTML = barsHtml(days);
  $("chartModel").innerHTML = barsHtml(models);
}

function extrasText(ex) {
  if (!ex || !Object.keys(ex).length) return "—";
  return Object.entries(ex)
    .filter(([, v]) => v !== true)
    .map(([k, v]) => k + ": " + v)
    .join(" · ") || "—";
}

function renderTable(series, kind) {
  $("tableHint").textContent =
    kind === "subscription"
      ? "订阅面板没有调用明细。"
      : kind === "stub"
        ? "用量 API 待接入。"
        : "明细来自各厂商适配器（series）。";
  const tb = $("tbody");
  if (!series || !series.length) {
    tb.innerHTML = '<tr><td colspan="6" class="empty">此时间范围内没有明细</td></tr>';
    return;
  }
  tb.innerHTML = series
    .map((r) => {
      let tag = "—";
      if (r.billing === "套餐内") tag = '<span class="tag in">套餐内</span>';
      else if (r.billing === "套餐外") tag = '<span class="tag out">套餐外</span>';
      else if (r.billing) tag = esc(r.billing);
      const qty = r.usage != null ? fmtNum(r.usage) + " " + esc(r.unit || "") : "—";
      return (
        "<tr><td>" +
        esc(r.time || "—") +
        "</td><td>" +
        esc(r.model || "—") +
        "</td><td>" +
        tag +
        "</td><td>" +
        qty +
        '</td><td class="sub">' +
        esc(extrasText(r.extra)) +
        '</td><td class="sub">' +
        esc(r.source || "") +
        "</td></tr>"
      );
    })
    .join("");
}

function renderFlags(flags) {
  const el = $("flags");
  if (!flags || !flags.length) {
    el.innerHTML = '<div class="flag muted">暂无提示。</div>';
    return;
  }
  el.innerHTML = flags
    .map((f) => {
      if (typeof f === "string") return '<div class="flag info">' + esc(f) + "</div>";
      return '<div class="flag ' + esc(f.level || "") + '"><b>' + esc(f.title || "") + "</b>" + esc(f.text || "") + "</div>";
    })
    .join("");
}

function renderChecklist(items) {
  const wrap = $("checklistWrap");
  if (!items || !items.length) {
    wrap.hidden = true;
    return;
  }
  wrap.hidden = false;
  $("checklist").innerHTML = items
    .map((c) => {
      const ok = c.done;
      return (
        '<li class="' +
        (ok ? "yes" : "no") +
        '">' +
        (ok ? "✓ " : "○ ") +
        esc(c.text) +
        "</li>"
      );
    })
    .join("");
}

function renderSetup(d) {
  const steps = d.setup_steps || [];
  const show = d.demo || d.setup_needed || steps.length;
  $("setup").hidden = !show;
  if (!show) return;
  $("setupTitle").textContent = d.demo ? "尚未配置 · 正在展示示例数据" : "如何配置此订阅";
  $("setupSteps").innerHTML = steps.map((s) => "<li>" + esc(s) + "</li>").join("");
}

function renderPills(d) {
  const el = $("pills");
  el.innerHTML = "";
  if (d.demo) addPill(el, "示例数据", "demo");
  addPill(el, panelStatus(d), d.ok && !d.demo && !isSubscription(d) ? "ok" : "warn");
  addPill(el, sourceLabel(d));
  addPill(el, executionLabel(d));
  addPill(el, billingLabel(d));
  if (d.plan_label) addPill(el, d.plan_label);
  addPill(el, "刷新 " + (d.refreshed_at || "—"));
  if (d.supports_timerange === false) addPill(el, "日期范围不适用");
}

function renderOverview(ov) {
  $("title").textContent = "概览";
  $("subtitle").textContent = "时间 " + (ov.range && ov.range.start) + " ~ " + (ov.range && ov.range.end) + " · " + (ov.tz || "Asia/Shanghai");
  $("pills").innerHTML = "";
  addPill($("pills"), "刷新 " + (ov.refreshed_at || "—"));
  $("setup").hidden = true;
  $("error").hidden = true;
  $("panel").hidden = true;
  $("overview").hidden = false;
  $("overview").innerHTML = (ov.vendors || [])
    .map((v) => {
      const color = (v.panel && v.panel.color) || "#5b8cff";
      const icon = (v.panel && v.panel.icon) || "●";
      const wins = (v.windows || []).slice(0, 4);
      const body = wins.length
        ? '<div class="mini">' +
          wins
            .map((w) => {
              const pct = isSubscription(v) ? null : pctOf(w);
              return '<div><div class="qmeta">' + esc(w.label) + " · " +
                esc(windowLine(w, isSubscription(v))) + '</div>' + progressHtml(pct) + '</div>';
            })
            .join("") +
          "</div>"
        : '<div class="qmeta" style="margin-top:10px">' + esc(v.status_label || "无窗口") + "</div>";
      return (
        '<div class="card ov-card" style="border-top:3px solid ' +
        esc(color) +
        '"><div class="hrow"><h3>' +
        esc(icon + " " + v.display_name) +
        "</h3>" +
        (v.demo ? '<span class="pill demo">示例数据</span>' : v.enabled ? "" : '<span class="pill">未启用</span>') +
        '</div><div class="sub">' +
        esc(v.plan_label || v.status_label || "") +
        "</div>" +
        '<div class="qmeta">' + esc(panelStatus(v) + " · " + sourceLabel(v) + " · " + executionLabel(v) + " · " + billingLabel(v)) + "</div>" +
        body +
        "</div>"
      );
    })
    .join("");
}

function renderPanel(d) {
  $("overview").hidden = true;
  $("panel").hidden = false;
  $("title").textContent = d.display_name || "订阅";
  $("subtitle").textContent = d.plan_label || d.status_label || "";
  renderPills(d);
  renderSetup(d);
  if (d.errors && d.errors.length && !d.ok) {
    $("error").hidden = false;
    $("error").textContent = d.errors.join(" · ") + (d.hint ? " " + d.hint : "");
  } else {
    $("error").hidden = true;
  }
  renderQuotas(d.windows || [], d);
  renderChecklist(d.checklist || []);
  renderFlags(d.security || []);
  const hasSeries = (d.series || []).length > 0;
  const hideCharts = d.panel_kind === "subscription" || d.panel_kind === "stub" || !hasSeries;
  $("chartsWrap").hidden = hideCharts;
  $("tableWrap").hidden = d.panel_kind === "subscription" || d.panel_kind === "stub";
  if (!hideCharts) renderCharts(d.series || []);
  if (!$("tableWrap").hidden) renderTable(d.series || [], d.panel_kind);
  const notes = [].concat(d.notes || []).concat((d.errors || []).map((e) => "接口： " + e));
  $("notes").innerHTML = notes.map((n) => "· " + esc(n)).join("<br/>");
}

async function load() {
  const qs = qRange();
  let vendorsResp;
  try {
    vendorsResp = await fetch("/api/vendors").then((r) => r.json());
  } catch (e) {
    $("error").hidden = false;
    $("error").textContent = "无法连接本地服务";
    return;
  }
  vendorIndex = vendorsResp.vendors || [];
  let overview = { vendors: [] };
  try {
    overview = await fetch("/api/overview?" + qs.toString()).then((r) => r.json());
  } catch (e) {
    overview = { vendors: [] };
  }
  renderNav(overview);
  if (current === "overview") {
    renderOverview(overview);
    return;
  }
  try {
    const res = await fetch("/api/vendors/" + encodeURIComponent(current) + "/dashboard?" + qs.toString());
    const d = await res.json();
    renderPanel(d);
  } catch (e) {
    $("error").hidden = false;
    $("error").textContent = "无法加载此订阅";
  }
}

$("refresh").onclick = load;
$("preset7").onclick = () => {
  defaultRange();
  load();
};
defaultRange();
load();
