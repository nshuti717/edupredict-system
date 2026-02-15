/**
 * EduPredict — Student Performance Prediction System
 * script.js
 *
 * HOW FRONTEND ↔ BACKEND COMMUNICATION WORKS:
 * ─────────────────────────────────────────────
 * 1. The teacher fills in the form and clicks "Predict Performance".
 * 2. collectFormData() gathers all field values into a plain JS object.
 * 3. The object is JSON-serialised and sent via fetch() as a POST request
 *    to the backend endpoint defined in API_ENDPOINT (default: /api/predict).
 * 4. The server runs its ML model and returns a JSON response containing:
 *       { prediction, grade, riskLevel, confidence, scores, recommendations }
 * 5. displayResults() parses that response and updates the UI.
 * 6. If the real backend is unavailable, mockApiCall() simulates the ML
 *    logic client-side so the UI remains fully testable without a server.
 *
 * To connect to a real backend, set USE_MOCK_API = false and update API_ENDPOINT.
 */

'use strict';

/* ── CONFIGURATION ──────────────────────────────── */
const API_ENDPOINT  = '/api/predict';    // Change to your real backend URL
const USE_MOCK_API  = true;              // Set to false when backend is ready
const API_TIMEOUT_MS = 8000;             // Max wait time for server response

/* ── STATE ──────────────────────────────────────── */
let studentHistory  = [];                // Array of all prediction results
let studentsAnalyzed = 0;               // Counter for hero stat

/* ── DOM REFERENCES ─────────────────────────────── */
const form              = document.getElementById('predictionForm');
const submitBtn         = document.getElementById('submitBtn');
const resetBtn          = document.getElementById('resetBtn');
const spinner           = document.getElementById('spinner');
const btnText           = submitBtn.querySelector('.btn-text');

const resultsPlaceholder = document.getElementById('resultsPlaceholder');
const resultsContent     = document.getElementById('resultsContent');

const statAnalyzed       = document.getElementById('stat-analyzed');
const tableBody          = document.getElementById('studentsTableBody');
const tableSearch        = document.getElementById('tableSearch');
const exportBtn          = document.getElementById('exportBtn');

/* ── SLIDER LIVE FEEDBACK ───────────────────────── */
function initSliders() {
  const sliders = [
    { id: 'attendance',      display: 'attendanceVal',     suffix: '%' },
    { id: 'testScore',       display: 'testScoreVal',      suffix: '/100' },
    { id: 'assignmentScore', display: 'assignmentScoreVal', suffix: '/100' },
  ];

  sliders.forEach(({ id, display, suffix }) => {
    const input = document.getElementById(id);
    const label = document.getElementById(display);

    const updateSliderStyle = (el) => {
      const pct = ((el.value - el.min) / (el.max - el.min)) * 100;
      el.style.background = `linear-gradient(to right, var(--navy-500) 0%, var(--navy-500) ${pct}%, var(--gray-200) ${pct}%)`;
    };

    const updateDisplay = () => {
      label.textContent = input.value + suffix;
      updateSliderStyle(input);
    };

    input.addEventListener('input', updateDisplay);
    updateDisplay(); // Initialise on load
  });
}

/* ── COLLECT FORM DATA ──────────────────────────── */
function collectFormData() {
  const engagement = form.querySelector('input[name="engagement"]:checked');

  return {
    studentName:     document.getElementById('studentName').value.trim(),
    studentId:       document.getElementById('studentId').value.trim(),
    gradeLevel:      document.getElementById('gradeLevel').value,
    subject:         document.getElementById('subject').value,
    attendance:      parseFloat(document.getElementById('attendance').value),
    testScore:       parseFloat(document.getElementById('testScore').value),
    assignmentScore: parseFloat(document.getElementById('assignmentScore').value),
    engagement:      engagement ? parseInt(engagement.value, 10) : 3,
    missedDeadlines: parseInt(document.getElementById('missedDeadlines').value, 10) || 0,
    studyHours:      parseFloat(document.getElementById('studyHours').value) || 0,
    notes:           document.getElementById('notes').value.trim(),
  };
}

/* ── FORM VALIDATION ────────────────────────────── */
function validateForm(data) {
  const errors = [];
  if (!data.studentName)  errors.push('Student name is required.');
  if (!data.studentId)    errors.push('Student ID is required.');
  if (!data.gradeLevel)   errors.push('Please select a grade / year.');
  if (!data.subject)      errors.push('Please select a subject.');
  return errors;
}

/* ── FETCH API CALL (real backend) ──────────────── */
async function callApi(payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const response = await fetch(API_ENDPOINT, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept':        'application/json',
      },
      body:   JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      throw new Error(errBody.message || `Server responded with status ${response.status}`);
    }

    return await response.json();

  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') throw new Error('Request timed out. Please check your connection.');
    throw err;
  }
}

/* ── MOCK ML LOGIC (runs client-side when backend unavailable) ── */
async function mockApiCall(data) {
  // Simulate network latency
  await new Promise(res => setTimeout(res, 1400 + Math.random() * 600));

  // Weighted composite score calculation
  const engagementNorm   = (data.engagement / 4) * 100;
  const deadlinePenalty  = Math.min(data.missedDeadlines * 4, 25);
  const studyBonus       = Math.min(data.studyHours * 0.8, 10);

  const compositeScore = (
    data.attendance      * 0.25 +
    data.testScore       * 0.35 +
    data.assignmentScore * 0.25 +
    engagementNorm       * 0.15
  ) - deadlinePenalty + studyBonus;

  const clamped = Math.max(0, Math.min(100, compositeScore));

  // Grade assignment
  let grade, prediction, riskLevel;
  if      (clamped >= 85) { grade = 'A'; prediction = 'Pass';    riskLevel = 'Low'; }
  else if (clamped >= 70) { grade = 'B'; prediction = 'Pass';    riskLevel = 'Low'; }
  else if (clamped >= 58) { grade = 'C'; prediction = 'Pass';    riskLevel = 'Medium'; }
  else if (clamped >= 45) { grade = 'D'; prediction = 'At Risk'; riskLevel = 'High'; }
  else                    { grade = 'F'; prediction = 'Fail';    riskLevel = 'High'; }

  // Dynamic recommendations
  const recs = [];
  if (data.attendance < 70)      recs.push('Attendance is critically low. Recommend an immediate counselling session to identify barriers.');
  if (data.testScore < 50)       recs.push('Test scores are below the passing threshold. Enrol the student in after-school tutoring or remedial classes.');
  if (data.assignmentScore < 60) recs.push('Assignment completion rate is poor. Set up a structured homework accountability plan.');
  if (data.engagement <= 2)      recs.push('Low engagement detected. Consider differentiated learning activities to re-motivate the student.');
  if (data.missedDeadlines >= 4) recs.push('Multiple missed deadlines observed. A meeting with a school counsellor is recommended.');
  if (data.studyHours < 5)       recs.push('Self-reported study hours are very low. Discuss time-management strategies with the student.');
  if (recs.length === 0)         recs.push('Student performance metrics are strong. Continue current support and consider enrichment opportunities.');

  const confidence = 72 + Math.floor(Math.random() * 22);

  return {
    prediction,
    grade,
    riskLevel,
    confidence,
    overallScore: Math.round(clamped),
    scores: {
      attendance:      data.attendance,
      testScore:       data.testScore,
      assignmentScore: data.assignmentScore,
      engagement:      Math.round(engagementNorm),
    },
    recommendations: recs,
    modelVersion: 'EduPredict-v2.4 (Mock)',
    timestamp: new Date().toISOString(),
  };
}

/* ── DISPLAY RESULTS ────────────────────────────── */
function displayResults(data, formData, rawJson) {
  // Student identity
  document.getElementById('resultName').textContent = formData.studentName;
  document.getElementById('resultMeta').textContent =
    `${formData.subject} · Year ${formData.gradeLevel} · ${formData.studentId}`;

  // Prediction badge
  const predBadge = document.getElementById('predictionBadge');
  predBadge.textContent = data.prediction;
  predBadge.style.color = data.prediction === 'Pass'
    ? 'var(--green-500)'
    : data.prediction === 'At Risk'
      ? 'var(--orange-500)'
      : 'var(--red-500)';

  // Grade badge
  document.getElementById('gradeBadge').textContent = data.grade;

  // Risk indicator
  const riskCard = document.getElementById('riskIndicator').closest('.risk-card');
  riskCard.setAttribute('data-risk', data.riskLevel);
  document.getElementById('riskText').textContent = data.riskLevel;

  // Animate bars
  setTimeout(() => {
    setBar('attendance', data.scores.attendance, data.scores.attendance + '%');
    setBar('test',       data.scores.testScore,   data.scores.testScore);
    setBar('assignment', data.scores.assignmentScore, data.scores.assignmentScore);
    setBar('engagement', data.scores.engagement,  data.scores.engagement + '%');
    setBar('overall',    data.overallScore,        data.overallScore);
  }, 80);

  // Recommendations
  const recList = document.getElementById('recList');
  recList.innerHTML = data.recommendations
    .map(r => `<li>${r}</li>`)
    .join('');

  // Confidence bar
  setTimeout(() => {
    document.getElementById('confBar').style.width = data.confidence + '%';
    document.getElementById('confPct').textContent = data.confidence + '%';
  }, 100);

  // Raw JSON debug
  document.getElementById('apiRaw').textContent = JSON.stringify(rawJson, null, 2);

  // Reveal results
  resultsPlaceholder.classList.add('hidden');
  resultsContent.classList.remove('hidden');
  resultsContent.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function setBar(key, pct, label) {
  document.getElementById(`bar-${key}`).style.width   = pct + '%';
  document.getElementById(`pct-${key}`).textContent   = label;
}

/* ── ADD ROW TO HISTORY TABLE ───────────────────── */
function addTableRow(data, formData) {
  const timestamp = new Date().toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const record = { ...data, ...formData, timestamp };
  studentHistory.unshift(record);

  // Update stat counter
  studentsAnalyzed++;
  animateCount(statAnalyzed, studentsAnalyzed);

  renderTable(studentHistory);
}

function renderTable(rows) {
  const emptyRow = `<tr class="empty-row"><td colspan="10">No predictions yet. Submit a student's data above to begin.</td></tr>`;

  if (!rows.length) {
    tableBody.innerHTML = emptyRow;
    return;
  }

  tableBody.innerHTML = rows.map(r => `
    <tr>
      <td><strong>${escapeHtml(r.studentName)}</strong></td>
      <td>${escapeHtml(r.studentId)}</td>
      <td>${escapeHtml(r.subject)}</td>
      <td>${r.attendance}%</td>
      <td>${r.testScore}/100</td>
      <td>${r.assignmentScore}/100</td>
      <td>
        <span class="pill ${r.prediction === 'Pass' ? 'pill-pass' : r.prediction === 'At Risk' ? 'pill-medium' : 'pill-fail'}">
          ${r.prediction}
        </span>
      </td>
      <td><strong>${r.grade}</strong></td>
      <td>
        <span class="pill pill-${r.riskLevel.toLowerCase()}">
          ${r.riskLevel}
        </span>
      </td>
      <td style="color:var(--gray-400);font-size:.78rem">${r.timestamp}</td>
    </tr>
  `).join('');
}

/* ── EXPORT CSV ─────────────────────────────────── */
function exportCsv() {
  if (!studentHistory.length) {
    alert('No data to export yet. Run at least one prediction first.');
    return;
  }

  const headers = [
    'Name', 'ID', 'Subject', 'Year', 'Attendance%',
    'TestScore', 'AssignmentScore', 'EngagementLevel',
    'MissedDeadlines', 'StudyHours', 'OverallScore',
    'Prediction', 'Grade', 'RiskLevel', 'Confidence%', 'Timestamp'
  ];

  const rows = studentHistory.map(r => [
    r.studentName, r.studentId, r.subject, r.gradeLevel,
    r.attendance, r.testScore, r.assignmentScore, r.engagement,
    r.missedDeadlines, r.studyHours, r.overallScore,
    r.prediction, r.grade, r.riskLevel, r.confidence, r.timestamp
  ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));

  const csv    = [headers.join(','), ...rows].join('\n');
  const blob   = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url    = URL.createObjectURL(blob);
  const link   = document.createElement('a');
  link.href    = url;
  link.download = `EduPredict_Results_${new Date().toISOString().slice(0,10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

/* ── TABLE SEARCH ───────────────────────────────── */
function filterTable(query) {
  const q = query.toLowerCase().trim();
  if (!q) { renderTable(studentHistory); return; }
  const filtered = studentHistory.filter(r =>
    r.studentName.toLowerCase().includes(q) ||
    r.studentId.toLowerCase().includes(q)   ||
    r.subject.toLowerCase().includes(q)
  );
  renderTable(filtered);
}

/* ── UI HELPERS ─────────────────────────────────── */
function setLoading(loading) {
  submitBtn.classList.toggle('loading', loading);
  spinner.classList.toggle('hidden', !loading);
  btnText.textContent = loading ? 'Analysing…' : 'Predict Performance';
  submitBtn.disabled = loading;
}

function animateCount(el, target) {
  const start    = parseInt(el.textContent, 10) || 0;
  const duration = 600;
  const startTime = performance.now();

  function step(now) {
    const elapsed  = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    el.textContent = Math.round(start + (target - start) * progress);
    if (progress < 1) requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showError(message) {
  // Remove existing error if any
  const existing = document.querySelector('.form-error');
  if (existing) existing.remove();

  const div = document.createElement('div');
  div.className = 'form-error';
  div.style.cssText = `
    background: #fee2e2; border: 1.5px solid #ef4444; color: #991b1b;
    font-family: var(--font-display); font-size: .85rem; font-weight: 600;
    padding: .85rem 1.1rem; border-radius: 8px; margin-bottom: 1rem;
    animation: fadeSlideUp .25s ease both;
  `;
  div.textContent = '⚠ ' + message;

  form.insertBefore(div, form.querySelector('.form-actions'));
  div.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  setTimeout(() => div.remove(), 6000);
}

/* ── FORM SUBMIT ────────────────────────────────── */
form.addEventListener('submit', async (e) => {
  e.preventDefault();

  // Remove any previous error message
  document.querySelector('.form-error')?.remove();

  const formData = collectFormData();
  const errors   = validateForm(formData);

  if (errors.length) {
    showError(errors[0]);
    return;
  }

  setLoading(true);

  try {
    let responseData;

    if (USE_MOCK_API) {
      // ── MOCK PATH (no backend needed) ────────
      responseData = await mockApiCall(formData);
    } else {
      // ── REAL BACKEND PATH ────────────────────
      // Sends: POST /api/predict
      // Body (JSON): { studentName, studentId, gradeLevel, subject,
      //               attendance, testScore, assignmentScore, engagement,
      //               missedDeadlines, studyHours, notes }
      //
      // Expects response (JSON): {
      //   prediction:      "Pass" | "At Risk" | "Fail",
      //   grade:           "A" | "B" | "C" | "D" | "F",
      //   riskLevel:       "Low" | "Medium" | "High",
      //   confidence:      0-100,
      //   overallScore:    0-100,
      //   scores:          { attendance, testScore, assignmentScore, engagement },
      //   recommendations: string[],
      //   modelVersion:    string,
      //   timestamp:       ISO string
      // }
      responseData = await callApi(formData);
    }

    displayResults(responseData, formData, responseData);
    addTableRow(responseData, formData);

    // Scroll results into view on mobile
    if (window.innerWidth <= 1100) {
      document.getElementById('results').scrollIntoView({ behavior: 'smooth' });
    }

  } catch (err) {
    showError(`Prediction failed: ${err.message}`);
    console.error('[EduPredict] API error:', err);
  } finally {
    setLoading(false);
  }
});

/* ── RESET FORM ─────────────────────────────────── */
resetBtn.addEventListener('click', () => {
  form.reset();

  // Reset slider displays
  document.getElementById('attendanceVal').textContent     = '75%';
  document.getElementById('testScoreVal').textContent      = '65/100';
  document.getElementById('assignmentScoreVal').textContent = '70/100';

  // Reset slider track fills
  ['attendance', 'testScore', 'assignmentScore'].forEach(id => {
    const el  = document.getElementById(id);
    const pct = ((el.value - el.min) / (el.max - el.min)) * 100;
    el.style.background = `linear-gradient(to right, var(--navy-500) 0%, var(--navy-500) ${pct}%, var(--gray-200) ${pct}%)`;
  });

  // Default engagement selection
  form.querySelector('input[name="engagement"][value="3"]').checked = true;

  document.querySelector('.form-error')?.remove();
});

/* ── TABLE SEARCH ───────────────────────────────── */
tableSearch.addEventListener('input', () => filterTable(tableSearch.value));

/* ── EXPORT ─────────────────────────────────────── */
exportBtn.addEventListener('click', exportCsv);

/* ── INIT ───────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  initSliders();

  // Show API endpoint in footer
  document.getElementById('apiEndpointDisplay').textContent = API_ENDPOINT;

  // Indicate mock mode visually
  if (USE_MOCK_API) {
    const badge = document.querySelector('.header-badge');
    badge.innerHTML = '<span class="badge-dot"></span> Mock ML Mode Active';
    badge.style.color = 'var(--amber-400)';
    badge.style.background = 'rgba(245, 158, 11, .12)';
    badge.style.borderColor = 'rgba(245, 158, 11, .25)';
  }
});
