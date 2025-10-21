// Tool definitions, add more tools here
const tools = [
	{
		name: "Period Tracker",
		desc: "Track your cycle and export/import data securely, all stored locally on your device.",
		link: "ptracker/index.html"
	},
	{
		name: "Loan Calculator",
		desc: "Calculate loan payments, interest, and visualize amortization schedules with optional extra payments.",
		link: "loanCalculator/index.html"
	},
	{
		name: "PeerLive",
		desc: "Peer-to-peer encrypted live camera app with real-time chat and customizable display names.",
		link: "https://peerlive.duckdns.org"
	}
];

// Populate cards
const container = document.getElementById("toolList");

tools.forEach(tool => {
	const card = document.createElement("div");
	card.className = "card";

	const title = document.createElement("h2");
	title.textContent = tool.name;

	const desc = document.createElement("p");
	desc.textContent = tool.desc;

	const btn = document.createElement("button");
	btn.textContent = "Open";
	btn.addEventListener("click", () => {
		window.location.href = tool.link;
	});

	card.append(title, desc, btn);
	container.appendChild(card);
});

// Auto Year in Footer
document.getElementById("year").textContent = new Date().getFullYear();

// BTC Copy Functionality
document.getElementById("copyBTC").addEventListener("click", () => {
	const btcAddress = document.getElementById("btcDisplay").textContent.trim();
	navigator.clipboard.writeText(btcAddress)
		.then(() => alert("BTC address copied to clipboard!"))
		.catch(() => alert("Failed to copy address. Please copy manually."));
});