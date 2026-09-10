(function(){
"use strict";

/* State */
const state = {
  income: [],
  expenses: [],
  budgets: {},
  goals: [],
  deposits: [],
  investments: [],
  protection: []
};

let uid = 1;
function nextId(){ return uid++; }

const PESO = new Intl.NumberFormat("en-PH", { style:"currency", currency:"PHP", maximumFractionDigits:0 });
function money(n){ return PESO.format(Math.round((n||0)*100)/100); }
function todayISO(){ return new Date().toISOString().slice(0,10); }

/* Navigation */
const titles = {
  dashboard:["Dashboard","Income, spending, savings, investments, and protection, in one place."],
  reports:["Weekly / Monthly Report","Income vs. spending broken down by period."],
  income:["Pillar 1 · Income","Log every peso coming in."],
  expenses:["Pillar 2 · Spending","Log expenses and compare them to your budget."],
  savings:["Pillar 3 · Savings & Goals","Set targets and track deposits toward them."],
  investments:["Pillar 4 · Investment","Track what you've invested and what it's worth now."],
  protection:["Pillar 5 · Protection","Track insurance and coverage that protect you financially."]
};

document.querySelectorAll(".navbtn").forEach(btn=>{
  btn.addEventListener("click", ()=> showView(btn.dataset.view));
});

function showView(name){
  document.querySelectorAll(".navbtn").forEach(b=> b.classList.toggle("active", b.dataset.view===name));
  document.querySelectorAll(".view").forEach(v=> v.classList.toggle("active", v.id === "view-"+name));
  const t = titles[name];
  if(t){
    document.getElementById("page-title").textContent = t[0];
    document.getElementById("page-sub").textContent = t[1];
  }
  if(name==="reports") renderReport();
}

/* Toast */
let toastTimer = null;
function toast(msg){
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=> el.classList.remove("show"), 2200);
}

/* Date / period helpers */
function parseDate(s){ const d = new Date(s+"T00:00:00"); return isNaN(d) ? new Date() : d; }
function isThisMonth(dateStr){
  const d = parseDate(dateStr), now = new Date();
  return d.getFullYear()===now.getFullYear() && d.getMonth()===now.getMonth();
}
function monthKey(dateStr){
  const d = parseDate(dateStr);
  return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0");
}
function monthLabel(key){
  const [y,m] = key.split("-").map(Number);
  return new Date(y, m-1, 1).toLocaleDateString("en-US",{month:"short", year:"numeric"});
}
function weekLabel(dateStr){
  const d = parseDate(dateStr);
  const dayNr = (d.getDay()+6)%7;
  const monday = new Date(d); monday.setDate(d.getDate()-dayNr);
  return "Wk of "+monday.toLocaleDateString("en-US",{month:"short", day:"numeric"});
}
function weekKeyForLabel(dateStr){
  const d = parseDate(dateStr);
  const dayNr = (d.getDay()+6)%7;
  const monday = new Date(d); monday.setDate(d.getDate()-dayNr);
  return monday.toISOString().slice(0,10);
}

function buildPeriodSeries(period, limit){
  const keyFn = period==="week" ? weekKeyForLabel : monthKey;
  const buckets = {};
  function add(list, field){
    list.forEach(item=>{
      const k = keyFn(item.date);
      if(!buckets[k]) buckets[k] = {income:0, expense:0, sortDate:item.date};
      buckets[k][field] += item.amount;
      if(item.date < buckets[k].sortDate) buckets[k].sortDate = item.date;
    });
  }
  add(state.income, "income");
  add(state.expenses, "expense");
  let keys = Object.keys(buckets).sort();
  if(limit) keys = keys.slice(-limit);
  const labels = keys.map(k=> period==="week" ? weekLabel(buckets[k].sortDate) : monthLabel(k));
  const incomeVals = keys.map(k=> buckets[k].income);
  const expenseVals = keys.map(k=> buckets[k].expense);
  return {keys, labels, incomeVals, expenseVals};
}

/* Chart instances */
try{
  Chart.defaults.font.family = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
  Chart.defaults.color = "#726B5A";
  Chart.defaults.plugins.legend.labels.usePointStyle = true;
  Chart.defaults.plugins.legend.labels.boxWidth = 8;
}catch(err){ console.warn("Chart.js failed to initialize — charts will be skipped, but forms and tables still work.", err); }

const palette = {
  green:"#2F6B4E", red:"#9B3A2C", navy:"#2C3D50", brass:"#A07A26", ink:"#211E17", rule:"#E9E0C6"
};
const catColors = ["#2F6B4E","#A07A26","#9B3A2C","#2C3D50","#7C8F6E","#C7A34B","#5E4B32","#8B6F8A","#4C7A7E"];

let dashPeriod = "week";
let reportPeriod = "week";

const charts = {};

function ensureChart(key, ctxId, config){
  try{
    if(typeof Chart === "undefined") return null;
    if(charts[key]){ charts[key].destroy(); }
    const el = document.getElementById(ctxId);
    if(!el) return null;
    charts[key] = new Chart(el.getContext("2d"), config);
    return charts[key];
  }catch(err){
    console.warn("Could not render chart '"+key+"' — rest of the app is unaffected.", err);
    return null;
  }
}

function renderFlowChart(){
  const s = buildPeriodSeries(dashPeriod, 8);
  ensureChart("flow","chart-flow",{
    type:"bar",
    data:{
      labels: s.labels.length ? s.labels : ["No data yet"],
      datasets:[
        {label:"Income", data:s.incomeVals.length?s.incomeVals:[0], backgroundColor:palette.green, borderRadius:3, maxBarThickness:34},
        {label:"Spending", data:s.expenseVals.length?s.expenseVals:[0], backgroundColor:palette.red, borderRadius:3, maxBarThickness:34}
      ]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      scales:{ y:{ beginAtZero:true, ticks:{ callback:v=>money(v) }, grid:{color:palette.rule} }, x:{grid:{display:false}} },
      plugins:{ legend:{position:"bottom"}, tooltip:{ callbacks:{ label:c=> c.dataset.label+": "+money(c.raw) } } }
    }
  });
}

function renderExpenseCatChart(){
  const totals = {};
  state.expenses.filter(e=> isThisMonth(e.date)).forEach(e=>{
    totals[e.category] = (totals[e.category]||0) + e.amount;
  });
  const labels = Object.keys(totals);
  const values = labels.map(l=> totals[l]);
  ensureChart("expcat","chart-expense-cat",{
    type:"doughnut",
    data:{
      labels: labels.length?labels:["No spending logged yet"],
      datasets:[{ data:values.length?values:[1], backgroundColor: labels.length? catColors : ["#E9E0C6"], borderWidth:2, borderColor:"#F7F2E4" }]
    },
    options:{
      responsive:true, maintainAspectRatio:false, cutout:"62%",
      plugins:{ legend:{position:"bottom"}, tooltip:{ callbacks:{ label:c=> labels.length ? (c.label+": "+money(c.raw)) : "No data yet" } } }
    }
  });
}

function renderNetWorthChart(){
  const s = buildPeriodSeries("month", 6);
  const totalSavingsNow = state.goals.reduce((a,g)=>a+g.current,0);
  const totalInvestNow = state.investments.reduce((a,i)=>a+i.current,0);
  const netFlows = s.keys.map((k,i)=> s.incomeVals[i]-s.expenseVals[i]);
  const endValue = totalSavingsNow + totalInvestNow;
  let running = endValue;
  const trail = netFlows.slice().reverse().map(nf=>{ const v=running; running -= nf; return v; }).reverse();
  const values = s.keys.length ? trail : [endValue];
  const labels = s.labels.length ? s.labels : ["Now"];
  ensureChart("networth","chart-networth",{
    type:"line",
    data:{ labels, datasets:[{ label:"Savings + Investments", data:values, borderColor:palette.navy, backgroundColor:"rgba(44,61,80,.12)", fill:true, tension:.35, pointRadius:3, pointBackgroundColor:palette.navy }] },
    options:{
      responsive:true, maintainAspectRatio:false,
      scales:{ y:{ beginAtZero:true, ticks:{callback:v=>money(v)}, grid:{color:palette.rule} }, x:{grid:{display:false}} },
      plugins:{ legend:{display:false}, tooltip:{ callbacks:{ label:c=> money(c.raw) } } }
    }
  });
}

function renderPillarsChart(){
  const income = state.income.filter(i=>isThisMonth(i.date)).reduce((a,b)=>a+b.amount,0);
  const expense = state.expenses.filter(i=>isThisMonth(i.date)).reduce((a,b)=>a+b.amount,0);
  const savings = state.goals.reduce((a,g)=>a+g.current,0);
  const invest = state.investments.reduce((a,i)=>a+i.current,0);
  const protect = state.protection.reduce((a,p)=>a+p.coverage,0);
  const raw = [income, expense, savings, invest, protect];
  const hasData = raw.some(v=>v>0);
  ensureChart("pillars","chart-pillars",{
    type:"radar",
    data:{
      labels:["Income","Spending","Savings","Investment","Protection"],
      datasets:[{ label:"This period", data: hasData? raw : [0,0,0,0,0],
        backgroundColor:"rgba(160,122,38,.18)", borderColor:palette.brass, pointBackgroundColor:palette.brass }]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      scales:{ r:{ beginAtZero:true, ticks:{ display:false }, grid:{color:palette.rule}, angleLines:{color:palette.rule} } },
      plugins:{ legend:{display:false}, tooltip:{ callbacks:{ label:c=> c.label+": "+money(c.raw) } } }
    }
  });
}

function renderBudgetChart(){
  const cats = Object.keys(state.budgets);
  const actual = {};
  state.expenses.filter(e=>isThisMonth(e.date)).forEach(e=>{ actual[e.category]=(actual[e.category]||0)+e.amount; });
  const allCats = Array.from(new Set([...cats, ...Object.keys(actual)]));
  const budgetVals = allCats.map(c=> state.budgets[c]||0);
  const actualVals = allCats.map(c=> actual[c]||0);
  ensureChart("budget","chart-budget",{
    type:"bar",
    data:{
      labels: allCats.length?allCats:["No budgets set"],
      datasets:[
        {label:"Budget", data:budgetVals.length?budgetVals:[0], backgroundColor:palette.rule, borderRadius:3},
        {label:"Actual", data:actualVals.length?actualVals:[0], backgroundColor:palette.ink, borderRadius:3}
      ]
    },
    options:{
      indexAxis:"y", responsive:true, maintainAspectRatio:false,
      scales:{ x:{ beginAtZero:true, ticks:{callback:v=>money(v)}, grid:{color:palette.rule} }, y:{grid:{display:false}} },
      plugins:{ legend:{position:"bottom"}, tooltip:{ callbacks:{ label:c=> c.dataset.label+": "+money(c.raw) } } }
    }
  });
}

function renderInvestAllocChart(){
  const totals = {};
  state.investments.forEach(i=>{ totals[i.type]=(totals[i.type]||0)+i.current; });
  const labels = Object.keys(totals);
  const values = labels.map(l=>totals[l]);
  ensureChart("investalloc","chart-invest-alloc",{
    type:"pie",
    data:{ labels: labels.length?labels:["No investments yet"], datasets:[{ data: values.length?values:[1], backgroundColor: labels.length?catColors:["#E9E0C6"], borderWidth:2, borderColor:"#F7F2E4" }] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{position:"bottom"}, tooltip:{ callbacks:{ label:c=> labels.length ? (c.label+": "+money(c.raw)) : "No data yet" } } } }
  });
}

function renderInvestReturnChart(){
  const labels = state.investments.map(i=>i.name);
  const invested = state.investments.map(i=>i.invested);
  const current = state.investments.map(i=>i.current);
  ensureChart("investreturn","chart-invest-return",{
    type:"bar",
    data:{ labels: labels.length?labels:["No investments yet"], datasets:[
      {label:"Invested", data:invested.length?invested:[0], backgroundColor:palette.rule, borderRadius:3},
      {label:"Current value", data:current.length?current:[0], backgroundColor:palette.brass, borderRadius:3}
    ]},
    options:{ responsive:true, maintainAspectRatio:false,
      scales:{ y:{ beginAtZero:true, ticks:{callback:v=>money(v)}, grid:{color:palette.rule} }, x:{grid:{display:false}} },
      plugins:{ legend:{position:"bottom"}, tooltip:{ callbacks:{ label:c=> c.dataset.label+": "+money(c.raw) } } }
    }
  });
}

function renderReportChart(){
  const s = buildPeriodSeries(reportPeriod, 12);
  ensureChart("report","chart-report",{
    type:"bar",
    data:{ labels:s.labels.length?s.labels:["No data yet"], datasets:[
      {label:"Income", data:s.incomeVals.length?s.incomeVals:[0], backgroundColor:palette.green, borderRadius:3},
      {label:"Spending", data:s.expenseVals.length?s.expenseVals:[0], backgroundColor:palette.red, borderRadius:3}
    ]},
    options:{ responsive:true, maintainAspectRatio:false,
      scales:{ y:{ beginAtZero:true, ticks:{callback:v=>money(v)}, grid:{color:palette.rule} }, x:{grid:{display:false}} },
      plugins:{ legend:{position:"bottom"}, tooltip:{ callbacks:{ label:c=> c.dataset.label+": "+money(c.raw) } } }
    }
  });
  return s;
}

/* Dashboard stats */
function renderDashboardStats(){
  const income = state.income.filter(i=>isThisMonth(i.date)).reduce((a,b)=>a+b.amount,0);
  const expense = state.expenses.filter(i=>isThisMonth(i.date)).reduce((a,b)=>a+b.amount,0);
  const net = income - expense;
  const rate = income>0 ? (net/income*100) : 0;
  const savings = state.goals.reduce((a,g)=>a+g.current,0);
  const investInvested = state.investments.reduce((a,i)=>a+i.invested,0);
  const investCurrent = state.investments.reduce((a,i)=>a+i.current,0);
  const protect = state.protection.reduce((a,p)=>a+p.coverage,0);

  document.getElementById("stat-income").textContent = money(income);
  document.getElementById("stat-income-d").textContent = state.income.length + " entr" + (state.income.length===1?"y":"ies") + " logged total";
  document.getElementById("stat-expense").textContent = money(expense);
  document.getElementById("stat-expense-d").textContent = state.expenses.length + " entr" + (state.expenses.length===1?"y":"ies") + " logged total";
  document.getElementById("stat-net").textContent = money(net);
  const netEl = document.getElementById("stat-net");
  netEl.style.color = net>=0 ? "var(--green)" : "var(--red)";
  document.getElementById("stat-rate").textContent = (income>0? rate.toFixed(0) : "0") + "%";
  document.getElementById("stat-savings").textContent = money(savings);
  document.getElementById("stat-savings-d").textContent = state.goals.length + " active goal" + (state.goals.length===1?"":"s");
  document.getElementById("stat-invest").textContent = money(investCurrent);
  const gain = investCurrent - investInvested;
  const investD = document.getElementById("stat-invest-d");
  investD.textContent = (gain>=0?"▲ ":"▼ ") + money(Math.abs(gain)) + " vs. invested";
  investD.className = "delta " + (gain>=0?"up":"down");
  document.getElementById("stat-protect").textContent = money(protect);
}

/* Tables */
function fmtDate(s){ return parseDate(s).toLocaleDateString("en-US",{month:"short", day:"numeric", year:"numeric"}); }

function renderIncomeTable(){
  const body = document.getElementById("income-table");
  const rows = state.income.slice().sort((a,b)=> b.date.localeCompare(a.date));
  body.innerHTML = rows.length ? rows.map(r=>`
    <tr>
      <td>${fmtDate(r.date)}</td>
      <td>${escapeHtml(r.source)}</td>
      <td><span class="tag">${escapeHtml(r.category)}</span></td>
      <td class="num">${money(r.amount)}</td>
      <td><button class="row-del" data-kind="income" data-id="${r.id}">Remove</button></td>
    </tr>`).join("") : `<tr class="empty-row"><td colspan="5">No income yet. Add your first entry above.</td></tr>`;
  const total = state.income.reduce((a,b)=>a+b.amount,0);
  document.getElementById("income-total-tag").textContent = "Total " + money(total);
}

function renderExpenseTable(){
  const body = document.getElementById("expense-table");
  const rows = state.expenses.slice().sort((a,b)=> b.date.localeCompare(a.date));
  body.innerHTML = rows.length ? rows.map(r=>`
    <tr>
      <td>${fmtDate(r.date)}</td>
      <td>${escapeHtml(r.description)}</td>
      <td><span class="tag">${escapeHtml(r.category)}</span></td>
      <td class="num">${money(r.amount)}</td>
      <td><button class="row-del" data-kind="expense" data-id="${r.id}">Remove</button></td>
    </tr>`).join("") : `<tr class="empty-row"><td colspan="5">No expenses yet. Add your first entry above.</td></tr>`;
  const total = state.expenses.reduce((a,b)=>a+b.amount,0);
  document.getElementById("expense-total-tag").textContent = "Total " + money(total);
}

function renderBudgetList(){
  const cats = Object.keys(state.budgets);
  const actual = {};
  state.expenses.filter(e=>isThisMonth(e.date)).forEach(e=>{ actual[e.category]=(actual[e.category]||0)+e.amount; });
  const el = document.getElementById("budget-list");
  if(!cats.length){ el.innerHTML = `<p style="font-size:12.5px;color:var(--ink-soft);">No budgets set yet. Use the form above to set one per category.</p>`; return; }
  el.innerHTML = cats.map(c=>{
    const spent = actual[c]||0;
    const budget = state.budgets[c];
    const pct = budget>0 ? Math.min(100,(spent/budget)*100) : 0;
    const over = spent>budget;
    return `<div class="list-card">
      <div class="top"><h4 style="font-size:13px;">${escapeHtml(c)}</h4><span style="font-size:12px; font-weight:700; color:${over?'var(--red)':'var(--ink-soft)'}">${money(spent)} / ${money(budget)}</span></div>
      <div class="progress-track"><div class="progress-fill ${over?'over':'good'}" style="width:${pct}%"></div></div>
      <div class="meta">${over ? "Over budget by " + money(spent-budget) : money(budget-spent) + " remaining this month"}</div>
    </div>`;
  }).join("");
}

function renderGoalsList(){
  const el = document.getElementById("goals-list");
  if(!state.goals.length){ el.innerHTML = `<p style="font-size:12.5px;color:var(--ink-soft);">No goals yet. Create one above.</p>`; return; }
  el.innerHTML = state.goals.map(g=>{
    const pct = g.target>0 ? Math.min(100,(g.current/g.target)*100) : 0;
    const daysLeft = Math.ceil((parseDate(g.deadline) - new Date())/(1000*3600*24));
    return `<div class="goal-card">
      <div class="top">
        <h4>${escapeHtml(g.name)}</h4>
        <span style="font-size:12.5px; font-weight:700; color:var(--navy);">${pct.toFixed(0)}%</span>
      </div>
      <div class="meta">${money(g.current)} of ${money(g.target)} · ${daysLeft>=0 ? daysLeft+" days left" : "deadline passed"} (${fmtDate(g.deadline)})</div>
      <div class="progress-track"><div class="progress-fill good" style="width:${pct}%"></div></div>
    </div>`;
  }).join("");
}

function renderDepositTable(){
  const body = document.getElementById("deposit-table");
  const rows = state.deposits.slice().sort((a,b)=> b.date.localeCompare(a.date));
  body.innerHTML = rows.length ? rows.map(r=>{
    const g = state.goals.find(g=>g.id===r.goalId);
    return `<tr>
      <td>${fmtDate(r.date)}</td>
      <td>${g? escapeHtml(g.name) : "(deleted goal)"}</td>
      <td class="num">${money(r.amount)}</td>
      <td><button class="row-del" data-kind="deposit" data-id="${r.id}">Remove</button></td>
    </tr>`;
  }).join("") : `<tr class="empty-row"><td colspan="4">No deposits yet.</td></tr>`;
}

function renderGoalSelect(){
  const sel = document.getElementById("dep-goal");
  sel.innerHTML = state.goals.map(g=>`<option value="${g.id}">${escapeHtml(g.name)}</option>`).join("") || `<option value="">No goals yet — create one first</option>`;
}

function renderInvestTable(){
  const body = document.getElementById("invest-table");
  const rows = state.investments.slice().sort((a,b)=> b.date.localeCompare(a.date));
  body.innerHTML = rows.length ? rows.map(r=>{
    const ret = r.invested>0 ? ((r.current-r.invested)/r.invested*100) : 0;
    return `<tr>
      <td>${escapeHtml(r.name)}</td>
      <td><span class="tag">${escapeHtml(r.type)}</span></td>
      <td class="num">${money(r.invested)}</td>
      <td class="num">${money(r.current)}</td>
      <td class="num" style="color:${ret>=0?'var(--green)':'var(--red)'}; font-weight:700;">${ret>=0?"+":""}${ret.toFixed(1)}%</td>
      <td><button class="row-del" data-kind="invest" data-id="${r.id}">Remove</button></td>
    </tr>`;
  }).join("") : `<tr class="empty-row"><td colspan="6">No investments yet. Use the form above.</td></tr>`;
  const total = state.investments.reduce((a,b)=>a+b.current,0);
  document.getElementById("invest-total-tag").textContent = "Value " + money(total);
}

function renderProtectTable(){
  const body = document.getElementById("protect-table");
  const rows = state.protection.slice().sort((a,b)=> a.renewal.localeCompare(b.renewal));
  body.innerHTML = rows.length ? rows.map(r=>`
    <tr>
      <td><span class="tag">${escapeHtml(r.type)}</span></td>
      <td>${escapeHtml(r.provider)}</td>
      <td class="num">${money(r.coverage)}</td>
      <td class="num">${money(r.premium)}</td>
      <td>${fmtDate(r.renewal)}</td>
      <td><button class="row-del" data-kind="protect" data-id="${r.id}">Remove</button></td>
    </tr>`).join("") : `<tr class="empty-row"><td colspan="6">No protection plans yet. Use the form above.</td></tr>`;
  const total = state.protection.reduce((a,b)=>a+b.coverage,0);
  document.getElementById("protect-total-tag").textContent = "Coverage " + money(total);
}

function renderReport(){
  const s = renderReportChart();
  const body = document.getElementById("report-table");
  if(!s.keys.length){
    body.innerHTML = `<tr class="empty-row"><td colspan="4">No entries yet. Add income or expenses to see a breakdown here.</td></tr>`;
    return;
  }
  const rowsHtml = s.keys.map((k,i)=>{
    const inc = s.incomeVals[i], exp = s.expenseVals[i], bal = inc-exp;
    return `<tr><td>${s.labels[i]}</td><td class="num">${money(inc)}</td><td class="num">${money(exp)}</td><td class="num" style="color:${bal>=0?'var(--green)':'var(--red)'}; font-weight:700;">${money(bal)}</td></tr>`;
  }).reverse().join("");
  body.innerHTML = rowsHtml;
}

function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
}

/* Local persistence (this browser tab only — export for a portable backup) */
const STORAGE_KEY = "ledgerloop_state_v1";
let storageAvailable = true;
try{
  const testKey = "__ledgerloop_test__";
  localStorage.setItem(testKey, "1");
  localStorage.removeItem(testKey);
}catch(err){
  storageAvailable = false;
}

function saveToStorage(){
  if(!storageAvailable) return;
  try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }catch(err){}
}

function loadFromStorage(){
  if(!storageAvailable) return false;
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return false;
    const data = JSON.parse(raw);
    state.income = Array.isArray(data.income) ? data.income : [];
    state.expenses = Array.isArray(data.expenses) ? data.expenses : [];
    state.budgets = data.budgets && typeof data.budgets==="object" ? data.budgets : {};
    state.goals = Array.isArray(data.goals) ? data.goals : [];
    state.deposits = Array.isArray(data.deposits) ? data.deposits : [];
    state.investments = Array.isArray(data.investments) ? data.investments : [];
    state.protection = Array.isArray(data.protection) ? data.protection : [];
    const allIds = [].concat(state.income,state.expenses,state.goals,state.deposits,state.investments,state.protection).map(x=>x.id||0);
    uid = (allIds.length ? Math.max(...allIds) : 0) + 1;
    return true;
  }catch(err){
    return false;
  }
}

/* Master render */
function safe(fn){
  try{ fn(); }catch(err){ console.warn("Render step failed (non-fatal):", fn.name, err); }
}

function renderAll(){
  safe(renderDashboardStats);
  safe(renderFlowChart);
  safe(renderExpenseCatChart);
  safe(renderNetWorthChart);
  safe(renderPillarsChart);

  safe(renderIncomeTable);

  safe(renderBudgetChart);
  safe(renderBudgetList);
  safe(renderExpenseTable);

  safe(renderGoalSelect);
  safe(renderGoalsList);
  safe(renderDepositTable);

  safe(renderInvestAllocChart);
  safe(renderInvestReturnChart);
  safe(renderInvestTable);

  safe(renderProtectTable);

  if(document.getElementById("view-reports").classList.contains("active")) safe(renderReport);

  saveToStorage();
}

/* Form events */
document.getElementById("form-income").addEventListener("submit", e=>{
  e.preventDefault();
  const date = document.getElementById("inc-date").value || todayISO();
  const source = document.getElementById("inc-source").value.trim();
  const category = document.getElementById("inc-category").value;
  const amount = parseFloat(document.getElementById("inc-amount").value);
  if(!source || !(amount>0)) return;
  state.income.push({id:nextId(), date, source, category, amount});
  e.target.reset();
  document.getElementById("inc-date").value = date;
  toast("Income added");
  renderAll();
});

document.getElementById("form-budget").addEventListener("submit", e=>{
  e.preventDefault();
  const category = document.getElementById("bud-category").value;
  const amount = parseFloat(document.getElementById("bud-amount").value);
  if(!(amount>=0)) return;
  state.budgets[category] = amount;
  e.target.reset();
  toast("Budget saved for " + category);
  renderAll();
});

document.getElementById("form-expense").addEventListener("submit", e=>{
  e.preventDefault();
  const date = document.getElementById("exp-date").value || todayISO();
  const description = document.getElementById("exp-desc").value.trim();
  const category = document.getElementById("exp-category").value;
  const amount = parseFloat(document.getElementById("exp-amount").value);
  if(!description || !(amount>0)) return;
  state.expenses.push({id:nextId(), date, description, category, amount});
  e.target.reset();
  document.getElementById("exp-date").value = date;
  toast("Expense added");
  renderAll();
});

document.getElementById("form-goal").addEventListener("submit", e=>{
  e.preventDefault();
  const name = document.getElementById("goal-name").value.trim();
  const target = parseFloat(document.getElementById("goal-target").value);
  const deadline = document.getElementById("goal-deadline").value;
  const start = parseFloat(document.getElementById("goal-start").value) || 0;
  if(!name || !(target>0) || !deadline) return;
  state.goals.push({id:nextId(), name, target, deadline, current:start});
  e.target.reset();
  toast("Goal created");
  renderAll();
});

document.getElementById("form-deposit").addEventListener("submit", e=>{
  e.preventDefault();
  const goalId = parseInt(document.getElementById("dep-goal").value,10);
  const amount = parseFloat(document.getElementById("dep-amount").value);
  const date = document.getElementById("dep-date").value || todayISO();
  const goal = state.goals.find(g=>g.id===goalId);
  if(!goal || !(amount>0)) return;
  goal.current += amount;
  state.deposits.push({id:nextId(), goalId, amount, date});
  e.target.reset();
  document.getElementById("dep-date").value = date;
  toast("Deposit added to " + goal.name);
  renderAll();
});

document.getElementById("form-invest").addEventListener("submit", e=>{
  e.preventDefault();
  const name = document.getElementById("inv-name").value.trim();
  const type = document.getElementById("inv-type").value;
  const invested = parseFloat(document.getElementById("inv-invested").value);
  const current = parseFloat(document.getElementById("inv-current").value);
  const date = document.getElementById("inv-date").value || todayISO();
  if(!name || !(invested>=0) || !(current>=0)) return;
  state.investments.push({id:nextId(), name, type, invested, current, date});
  e.target.reset();
  document.getElementById("inv-date").value = date;
  toast("Investment added");
  renderAll();
});

document.getElementById("form-protect").addEventListener("submit", e=>{
  e.preventDefault();
  const type = document.getElementById("prot-type").value;
  const provider = document.getElementById("prot-provider").value.trim();
  const coverage = parseFloat(document.getElementById("prot-coverage").value);
  const premium = parseFloat(document.getElementById("prot-premium").value);
  const renewal = document.getElementById("prot-renewal").value;
  if(!provider || !(coverage>0) || !renewal) return;
  state.protection.push({id:nextId(), type, provider, coverage, premium, renewal});
  e.target.reset();
  toast("Protection plan added");
  renderAll();
});

/* Delete row handlers (event delegation) */
document.body.addEventListener("click", e=>{
  const btn = e.target.closest(".row-del");
  if(!btn) return;
  const id = parseInt(btn.dataset.id,10);
  const kind = btn.dataset.kind;
  if(kind==="income") state.income = state.income.filter(r=>r.id!==id);
  if(kind==="expense") state.expenses = state.expenses.filter(r=>r.id!==id);
  if(kind==="deposit"){
    const dep = state.deposits.find(d=>d.id===id);
    if(dep){ const g = state.goals.find(g=>g.id===dep.goalId); if(g) g.current = Math.max(0, g.current-dep.amount); }
    state.deposits = state.deposits.filter(r=>r.id!==id);
  }
  if(kind==="invest") state.investments = state.investments.filter(r=>r.id!==id);
  if(kind==="protect") state.protection = state.protection.filter(r=>r.id!==id);
  toast("Entry removed");
  renderAll();
});

/* Period toggles */
function wireToggle(containerId, applyFn){
  const container = document.getElementById(containerId);
  container.querySelectorAll("button").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      container.querySelectorAll("button").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      applyFn(btn.dataset.period);
    });
  });
}
wireToggle("dash-period-toggle", p=>{ dashPeriod = p; renderFlowChart(); });
wireToggle("report-period-toggle", p=>{ reportPeriod = p; renderReport(); });

/* Toolbar: export / import / clear */
document.getElementById("btn-clear").addEventListener("click", ()=>{
  if(!confirm("Clear all data in this tracker? This cannot be undone (export first if you want a backup).")) return;
  state.income = []; state.expenses = []; state.budgets = {};
  state.goals = []; state.deposits = []; state.investments = []; state.protection = [];
  toast("All data cleared");
  renderAll();
});

document.getElementById("btn-export").addEventListener("click", ()=>{
  const blob = new Blob([JSON.stringify(state, null, 2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "ledgerloop-" + todayISO() + ".json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast("Data exported");
});

document.getElementById("file-import").addEventListener("change", e=>{
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = evt=>{
    try{
      const data = JSON.parse(evt.target.result);
      state.income = Array.isArray(data.income) ? data.income : [];
      state.expenses = Array.isArray(data.expenses) ? data.expenses : [];
      state.budgets = data.budgets && typeof data.budgets==="object" ? data.budgets : {};
      state.goals = Array.isArray(data.goals) ? data.goals : [];
      state.deposits = Array.isArray(data.deposits) ? data.deposits : [];
      state.investments = Array.isArray(data.investments) ? data.investments : [];
      state.protection = Array.isArray(data.protection) ? data.protection : [];
      const allIds = [].concat(state.income,state.expenses,state.goals,state.deposits,state.investments,state.protection).map(x=>x.id||0);
      uid = (allIds.length ? Math.max(...allIds) : 0) + 1;
      toast("Data imported");
      renderAll();
    }catch(err){
      alert("Could not read that file — please import a JSON file exported from this tracker.");
    }
  };
  reader.readAsText(file);
  e.target.value = "";
});

/* Init */
(function init(){
  document.getElementById("inc-date").value = todayISO();
  document.getElementById("exp-date").value = todayISO();
  document.getElementById("dep-date").value = todayISO();
  document.getElementById("inv-date").value = todayISO();
  const restored = loadFromStorage();
  if(restored) toast("Welcome back — your saved entries were restored");
  renderAll();
})();

})();

