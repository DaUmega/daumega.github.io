// Each writeup is a plain .txt file parsed at view-time by reader.html.
// Add new writeups here after publishing the .txt file into /writeups/.
const writeups = [
  { title: "2025 Hackfest - SilentShadow", tag: "CTF", date: "2025-10-16", file: "writeups/202510_hackfest_silentshadow.txt" },
  { title: "2025 HTB - Code", tag: "HTB", date: "2025-01-01", file: "writeups/202501_htb_code.txt" },
  { title: "2025 HTB - Artificial", tag: "HTB", date: "2025-01-01", file: "writeups/202501_htb_artificial.txt" },
  { title: "2025 HTB - Backfire", tag: "HTB", date: "2025-01-01", file: "writeups/202501_htb_backfire.txt" },
  { title: "2025 HTB - Cat", tag: "HTB", date: "2025-01-01", file: "writeups/202501_htb_cat.txt" },
  { title: "2025 HTB - Code Two", tag: "HTB", date: "2025-01-01", file: "writeups/202501_htb_codetwo.txt" },
  { title: "2025 HTB - Cypher", tag: "HTB", date: "2025-01-01", file: "writeups/202501_htb_cypher.txt" },
  { title: "2025 HTB - Dog", tag: "HTB", date: "2025-01-01", file: "writeups/202501_htb_dog.txt" },
  { title: "2025 HTB - Environment", tag: "HTB", date: "2025-01-01", file: "writeups/202501_htb_environment.txt" },
  { title: "2025 HTB - Escape Two", tag: "HTB", date: "2025-01-01", file: "writeups/202501_htb_escapetwo.txt" },
  { title: "2025 HTB - Eureka", tag: "HTB", date: "2025-01-01", file: "writeups/202501_htb_eureka.txt" },
  { title: "2025 HTB - Expressway", tag: "HTB", date: "2025-01-01", file: "writeups/202501_htb_expressway.txt" },
  { title: "2025 HTB - Fluffy", tag: "HTB", date: "2025-01-01", file: "writeups/202501_htb_fluffy.txt" },
  { title: "2025 HTB - Imagery", tag: "HTB", date: "2025-01-01", file: "writeups/202501_htb_imagery.txt" },
  { title: "2025 HTB - Mirage", tag: "HTB", date: "2025-01-01", file: "writeups/202501_htb_mirage.txt" },
  { title: "2025 HTB - Nocturnal", tag: "HTB", date: "2025-01-01", file: "writeups/202501_htb_nocturnal.txt" },
  { title: "2025 HTB - Planning", tag: "HTB", date: "2025-01-01", file: "writeups/202501_htb_planning.txt" },
  { title: "2025 HTB - Puppy", tag: "HTB", date: "2025-01-01", file: "writeups/202501_htb_puppy.txt" },
  { title: "2025 HTB - Rustykey", tag: "HTB", date: "2025-01-01", file: "writeups/202501_htb_rustykey.txt" },
  { title: "2025 HTB - Sorcery", tag: "HTB", date: "2025-01-01", file: "writeups/202501_htb_sorcery.txt" },
  { title: "2025 HTB - Soulmate", tag: "HTB", date: "2025-01-01", file: "writeups/202501_htb_soulmate.txt" },
  { title: "2025 HTB - TheFrizz", tag: "HTB", date: "2025-01-01", file: "writeups/202501_htb_thefrizz.txt" },
  { title: "2025 HTB - Titanic", tag: "HTB", date: "2025-01-01", file: "writeups/202501_htb_titanic.txt" },
  { title: "2025 HTB - Tombwatcher", tag: "HTB", date: "2025-01-01", file: "writeups/202501_htb_tombwatcher.txt" },
  { title: "2025 HTB - Voleur", tag: "HTB", date: "2025-01-01", file: "writeups/202501_htb_voleur.txt" }
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
