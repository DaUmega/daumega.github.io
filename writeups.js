// Each writeup is a plain .txt file parsed at view-time by reader.html.
// Add new writeups here after publishing the .txt file into /writeups/.
const writeups = [
  { title: "2025 Hackfest SilentShadow", tag: "CTF", date: "2025-10-16", file: "writeups/202510_hackfest_silentshadow.txt" },
];

const wlist = document.getElementById("writeupList");
writeups.forEach(({ title, tag, date, file }) => {
  const row = document.createElement("div");
  row.className = "writeup-row";
  row.innerHTML = `
    <a href="reader.html?file=${encodeURIComponent(file)}">${title}</a>
    <span class="writeup-meta"><span class="writeup-tag">${tag}</span>${date}</span>
  `;
  wlist.appendChild(row);
});

document.getElementById("year").textContent = new Date().getFullYear();
