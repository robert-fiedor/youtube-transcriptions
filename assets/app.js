const state = {
  transcripts: [],
  selected: null,
  query: "",
};

const els = {
  summary: document.querySelector("#summary"),
  list: document.querySelector("#transcriptList"),
  search: document.querySelector("#search"),
  title: document.querySelector("#title"),
  sourceLabel: document.querySelector("#sourceLabel"),
  sourceLink: document.querySelector("#sourceLink"),
  stats: document.querySelector("#stats"),
  text: document.querySelector("#transcriptText"),
  backButton: document.querySelector("#backButton"),
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
        <button class="transcript-item ${isActive ? "active" : ""}" type="button" data-id="${escapeHtml(item.id)}">
          <strong>${escapeHtml(item.title || item.id)}</strong>
          <span>${formatMeta(item)}</span>
          <em>${escapeHtml(item.excerpt || "")}</em>
        </button>
      `;
    })
    .join("");

  els.list.querySelectorAll(".transcript-item").forEach((button) => {
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
  state.selected = item;
  renderList();

  els.title.textContent = item.title || item.id;
  els.sourceLabel.textContent = item.uploader || item.id;
  els.sourceLink.href = item.source_url || "#";
  els.sourceLink.classList.toggle("hidden", !item.source_url);
  els.stats.innerHTML = renderStats(item);
  els.text.innerHTML = `<p>Loading transcript...</p>`;

  try {
    const response = await fetch(item.txt_path, { cache: "no-store" });
    if (!response.ok) throw new Error(`Transcript request failed: ${response.status}`);
    const text = await response.text();
    els.text.innerHTML = formatTranscript(text);
  } catch (error) {
    els.text.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
  }
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
