const state = {
  transcripts: [],
  selected: null,
  query: "",
  srtEntries: [],
  selectedSrtText: "",
  loadToken: 0,
};

const els = {
  summary: document.querySelector("#summary"),
  list: document.querySelector("#transcriptList"),
  search: document.querySelector("#search"),
  title: document.querySelector("#title"),
  sourceLabel: document.querySelector("#sourceLabel"),
  sourceLink: document.querySelector("#sourceLink"),
  rawTextLink: document.querySelector("#rawTextLink"),
  downloadTextLink: document.querySelector("#downloadTextLink"),
  stats: document.querySelector("#stats"),
  text: document.querySelector("#transcriptText"),
  backButton: document.querySelector("#backButton"),
  sectionStartMinute: document.querySelector("#sectionStartMinute"),
  sectionLengthMinutes: document.querySelector("#sectionLengthMinutes"),
  copySectionButton: document.querySelector("#copySectionButton"),
  sectionMeta: document.querySelector("#sectionMeta"),
  sectionOutput: document.querySelector("#sectionOutput"),
};

init();

async function init() {
  try {
    const response = await fetch("data/transcripts.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`Manifest request failed: ${response.status}`);
    const manifest = await response.json();
    state.transcripts = manifest.transcripts || [];
    els.summary.textContent = `${state.transcripts.length} transcript${state.transcripts.length === 1 ? "" : "s"}`;
    renderList();
    selectFromHash();
  } catch (error) {
    els.summary.textContent = "Manifest unavailable";
    els.list.innerHTML = `<p class="empty">${escapeHtml(error.message)}</p>`;
  }
}

els.search.addEventListener("input", (event) => {
  state.query = event.target.value.trim().toLowerCase();
  renderList();
});

els.backButton.addEventListener("click", () => {
  els.search.focus();
  if (window.innerWidth <= 760) window.scrollTo({ top: 0, behavior: "smooth" });
});

window.addEventListener("hashchange", selectFromHash);

els.sectionStartMinute.addEventListener("input", renderSelectedSrtSection);
els.sectionLengthMinutes.addEventListener("input", renderSelectedSrtSection);
els.copySectionButton.addEventListener("click", copySelectedSrtSection);

function renderList() {
  const items = filteredTranscripts();
  if (!items.length) {
    els.list.innerHTML = `<p class="empty">No transcripts match this search.</p>`;
    return;
  }

  els.list.innerHTML = items
    .map((item) => {
      const isActive = state.selected?.id === item.id;
      return `
        <div class="transcript-item ${isActive ? "active" : ""}">
          <button class="transcript-select" type="button" data-id="${escapeHtml(item.id)}">
            <strong>${escapeHtml(item.title || item.id)}</strong>
            <span>${formatMeta(item)}</span>
            <em>${escapeHtml(item.excerpt || "")}</em>
          </button>
          <a class="raw-shortcut" href="${escapeAttribute(item.txt_path)}" target="_blank" rel="noreferrer" data-raw-link>TXT</a>
        </div>
      `;
    })
    .join("");

  els.list.querySelectorAll(".transcript-select").forEach((button) => {
    button.addEventListener("click", () => {
      location.hash = encodeURIComponent(button.dataset.id);
    });
  });
}

function filteredTranscripts() {
  if (!state.query) return state.transcripts;
  return state.transcripts.filter((item) => {
    const haystack = [item.id, item.title, item.uploader, item.source_url, item.excerpt].join(" ").toLowerCase();
    return haystack.includes(state.query);
  });
}

function selectFromHash() {
  const id = decodeURIComponent(location.hash.replace(/^#/, ""));
  const item = state.transcripts.find((entry) => entry.id === id) || state.transcripts[0];
  if (item) selectTranscript(item);
}

async function selectTranscript(item) {
  const loadToken = state.loadToken + 1;
  state.loadToken = loadToken;
  state.selected = item;
  state.srtEntries = [];
  state.selectedSrtText = "";
  renderList();

  els.title.textContent = item.title || item.id;
  els.sourceLabel.textContent = item.uploader || item.id;
  els.sourceLink.href = item.source_url || "#";
  els.sourceLink.classList.toggle("hidden", !item.source_url);
  els.rawTextLink.href = item.txt_path;
  els.downloadTextLink.href = item.txt_path;
  els.downloadTextLink.setAttribute("download", rawFilename(item));
  els.stats.innerHTML = renderStats(item);
  els.text.innerHTML = `<p>Loading transcript...</p>`;
  resetSectionPicker(item);

  try {
    const response = await fetch(item.txt_path, { cache: "no-store" });
    if (!response.ok) throw new Error(`Transcript request failed: ${response.status}`);
    const text = await response.text();
    if (state.loadToken !== loadToken) return;
    els.text.innerHTML = formatTranscript(text);
  } catch (error) {
    if (state.loadToken !== loadToken) return;
    els.text.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
  }

  try {
    if (!item.srt_path) throw new Error("This transcript has no SRT file.");
    const response = await fetch(item.srt_path, { cache: "no-store" });
    if (!response.ok) throw new Error(`SRT request failed: ${response.status}`);
    const srt = await response.text();
    if (state.loadToken !== loadToken) return;
    state.srtEntries = parseSrt(srt);
    enableSectionPicker(item);
    renderSelectedSrtSection();
  } catch (error) {
    if (state.loadToken !== loadToken) return;
    state.srtEntries = [];
    state.selectedSrtText = "";
    els.sectionMeta.textContent = error.message;
    els.sectionOutput.textContent = "";
    els.copySectionButton.disabled = true;
  }
}

function resetSectionPicker(item) {
  const durationMinutes = Math.max(1, Math.ceil((item.duration_seconds || 0) / 60));
  els.sectionStartMinute.value = "0";
  els.sectionStartMinute.max = String(Math.max(0, durationMinutes - 1));
  els.sectionLengthMinutes.value = String(Math.min(10, durationMinutes));
  els.sectionLengthMinutes.max = String(durationMinutes);
  els.sectionStartMinute.disabled = true;
  els.sectionLengthMinutes.disabled = true;
  els.copySectionButton.disabled = true;
  els.copySectionButton.textContent = "Copy Section";
  els.sectionMeta.textContent = "Loading SRT...";
  els.sectionOutput.textContent = "";
}

function enableSectionPicker(item) {
  const durationMinutes = Math.max(1, Math.ceil((item.duration_seconds || 0) / 60));
  els.sectionStartMinute.disabled = false;
  els.sectionLengthMinutes.disabled = false;
  els.sectionStartMinute.max = String(Math.max(0, durationMinutes - 1));
  els.sectionLengthMinutes.max = String(durationMinutes);
}

function renderSelectedSrtSection() {
  if (!state.srtEntries.length) {
    state.selectedSrtText = "";
    els.sectionMeta.textContent = "No SRT captions are loaded.";
    els.sectionOutput.textContent = "";
    els.copySectionButton.disabled = true;
    return;
  }

  const durationSeconds = state.selected?.duration_seconds || state.srtEntries.at(-1)?.end || 0;
  const startMinute = clampInteger(els.sectionStartMinute.value, 0, Math.max(0, Math.floor(durationSeconds / 60)));
  const lengthMinutes = clampInteger(els.sectionLengthMinutes.value, 1, Math.max(1, Math.ceil(durationSeconds / 60)));
  const startSeconds = startMinute * 60;
  const endSeconds = Math.min(durationSeconds || Number.POSITIVE_INFINITY, startSeconds + lengthMinutes * 60);
  const selectedEntries = state.srtEntries.filter((entry) => entry.start >= startSeconds && entry.start < endSeconds);

  els.sectionStartMinute.value = String(startMinute);
  els.sectionLengthMinutes.value = String(lengthMinutes);
  state.selectedSrtText = selectedEntries.map((entry) => entry.raw).join("\n\n");
  els.sectionOutput.textContent = state.selectedSrtText;
  els.copySectionButton.disabled = !state.selectedSrtText;
  els.copySectionButton.textContent = "Copy Section";

  const range = `${formatClock(startSeconds)} to ${formatClock(endSeconds)}`;
  const count = `${selectedEntries.length} caption${selectedEntries.length === 1 ? "" : "s"}`;
  els.sectionMeta.textContent = `${count} selected, ${range}.`;
}

async function copySelectedSrtSection() {
  if (!state.selectedSrtText) return;
  try {
    await navigator.clipboard.writeText(state.selectedSrtText);
  } catch (_error) {
    copyWithFallback(state.selectedSrtText);
  }
  els.copySectionButton.textContent = "Copied";
  window.setTimeout(() => {
    els.copySectionButton.textContent = "Copy Section";
  }, 1400);
}

function copyWithFallback(text) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "-999px";
  document.body.append(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function parseSrt(srt) {
  return srt
    .replace(/\r/g, "")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split("\n");
      const timingLine = lines.find((line) => line.includes("-->"));
      if (!timingLine) return null;
      const [startRaw, endRaw] = timingLine.split("-->").map((part) => part.trim().split(/\s+/)[0]);
      const start = parseSrtTimestamp(startRaw);
      const end = parseSrtTimestamp(endRaw);
      if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
      return { start, end, raw: block };
    })
    .filter(Boolean);
}

function parseSrtTimestamp(value) {
  const match = String(value).match(/^(\d{2}):(\d{2}):(\d{2}),(\d{3})$/);
  if (!match) return Number.NaN;
  const [, hours, minutes, seconds, milliseconds] = match.map(Number);
  return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
}

function clampInteger(value, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return min;
  return Math.min(max, Math.max(min, parsed));
}

function formatClock(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  if (hours) return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function renderStats(item) {
  const stats = [
    `${item.word_count || 0} words`,
    `${item.segment_count || 0} segments`,
  ];
  if (item.duration_label) stats.push(item.duration_label);
  return stats.map((stat) => `<span class="stat">${escapeHtml(stat)}</span>`).join("");
}

function formatMeta(item) {
  const parts = [];
  if (item.word_count) parts.push(`${item.word_count} words`);
  if (item.duration_label) parts.push(item.duration_label);
  return parts.join(" · ") || item.id;
}

function formatTranscript(text) {
  const normalized = text.trim();
  if (!normalized) return "<p>This transcript is empty.</p>";
  return splitParagraphs(normalized)
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join("");
}

function splitParagraphs(text) {
  const explicit = text.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  if (explicit.length > 1) return explicit;

  const sentences = text.match(/[^.!?]+[.!?]+["')\]]?|[^.!?]+$/g) || [text];
  const paragraphs = [];
  let current = "";
  for (const sentence of sentences.map((part) => part.trim()).filter(Boolean)) {
    if ((current + " " + sentence).trim().length > 620 && current) {
      paragraphs.push(current);
      current = sentence;
    } else {
      current = (current ? `${current} ` : "") + sentence;
    }
  }
  if (current) paragraphs.push(current);
  return paragraphs;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

function rawFilename(item) {
  const title = item.title || item.id || "transcript";
  const slug = title
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
  return `${slug || "transcript"}.txt`;
}
