// parser.js — minimal shared writeup parsing + rendering
// Format:
//   Title: ...
//   Tag: ...
//   Date: ...
//   (blank line)
//   body (# heading, ## subheading, - list, ```code```, `inline`, **bold**, *italic*, [text](url))

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function parseWriteup(raw) {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const meta = { title: "Untitled", tag: "", date: "" };
  let i = 0;
  while (i < lines.length && lines[i].trim() !== "") {
    const m = lines[i].match(/^(Title|Tag|Date)\s*:\s*(.*)$/i);
    if (m) meta[m[1].toLowerCase()] = m[2].trim();
    i++;
  }
  while (i < lines.length && lines[i].trim() === "") i++;
  return { ...meta, body: lines.slice(i).join("\n") };
}

function renderBody(body) {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  let html = "";
  let inCode = false, codeBuf = [], listBuf = [];

  const flushList = () => { if (listBuf.length) { html += `<ul>${listBuf.join("")}</ul>`; listBuf = []; } };
  const inline = (t) => escapeHtml(t)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      if (inCode) { html += `<pre><code>${escapeHtml(codeBuf.join("\n"))}</code></pre>`; codeBuf = []; inCode = false; }
      else { flushList(); inCode = true; }
      continue;
    }
    if (inCode) { codeBuf.push(line); continue; }
    if (/^##\s+/.test(line)) { flushList(); html += `<h3>${inline(line.replace(/^##\s+/, ""))}</h3>`; continue; }
    if (/^#\s+/.test(line))  { flushList(); html += `<h2>${inline(line.replace(/^#\s+/, ""))}</h2>`; continue; }
    if (/^-\s+/.test(line))  { listBuf.push(`<li>${inline(line.replace(/^-\s+/, ""))}</li>`); continue; }
    flushList();
    if (line.trim() === "") continue;
    html += `<p>${inline(line)}</p>`;
  }
  flushList();
  if (inCode && codeBuf.length) html += `<pre><code>${escapeHtml(codeBuf.join("\n"))}</code></pre>`;
  return html;
}

function renderWriteup(container, { title, tag, date, body }) {
  container.innerHTML = `
    <a class="back-link" href="writeups.html">&larr; Writeups</a>
    <h1 class="reader-title">${escapeHtml(title || "Untitled")}</h1>
    <div class="reader-meta">${tag ? `<span class="writeup-tag">${escapeHtml(tag)}</span>` : ""}${date ? `<span>${escapeHtml(date)}</span>` : ""}</div>
    <div class="reader-body">${renderBody(body)}</div>
  `;
}
