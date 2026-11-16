const STORAGE_KEY = "daumegaTravelTracker";
const COUNTRY_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson";
const REGION_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_1_states_provinces.geojson";
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

const map = L.map("map", { minZoom: 2, worldCopyJump: true }).setView([22, 8], 2);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

const countryModeBtn = document.getElementById("countryMode");
const regionModeBtn = document.getElementById("regionMode");
const mapStatus = document.getElementById("mapStatus");
const placeTitle = document.getElementById("placeTitle");
const placeHint = document.getElementById("placeHint");
const citySection = document.getElementById("citySection");
const citySearch = document.getElementById("citySearch");
const cityResults = document.getElementById("cityResults");
const cityList = document.getElementById("cityList");
const messageEl = document.getElementById("message");

let data = loadData();
let countriesLayer;
let regionsLayer;
let markersLayer = L.layerGroup().addTo(map);
let selectedCountry = null;
let mode = "country";
let searchTimer;
let requestId = 0;
let allRegions;
let lastSearchAt = 0;

function loadData() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || saved.version !== 1 || !saved.places || typeof saved.places !== "object") return { version: 1, places: {} };
    return normalizeData(saved);
  } catch {
    return { version: 1, places: {} };
  }
}

function normalizeData(saved) {
  const places = {};
  Object.entries(saved.places).forEach(([code, place]) => {
    if (!place || !Array.isArray(place.cities) || !place.cities.length) return;
    places[code] = {
      name: String(place.name || code),
      cities: place.cities.filter(city => city && Number.isFinite(Number(city.lat)) && Number.isFinite(Number(city.lon)))
        .map(city => ({
          id: String(city.id || `${city.lat},${city.lon}`),
          name: String(city.name || "Unnamed city"),
          regionName: String(city.regionName || city.detail?.split(",")[0] || "").trim(),
          detail: String(city.detail || ""),
          lat: Number(city.lat),
          lon: Number(city.lon)
        }))
    };
  });
  return { version: 1, places };
}

function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    render();
  } catch {
    showMessage("Could not save data in this browser.", true);
  }
}

function showMessage(text, error = false) {
  messageEl.textContent = text;
  messageEl.classList.toggle("error", error);
  messageEl.style.display = "block";
  clearTimeout(showMessage.timer);
  showMessage.timer = setTimeout(() => { messageEl.style.display = "none"; }, 3500);
}

function countryProps(feature) {
  const props = feature.properties || {};
  return {
    name: props.ADMIN || props.NAME || props.name || "Unknown country",
    code: props.ADM0_A3 || props.ISO_A3 || props.SOV_A3 || ""
  };
}

function ensurePlace(country) {
  if (!data.places[country.code]) {
    data.places[country.code] = { name: country.name, cities: [] };
  }
  return data.places[country.code];
}

function visitCount() {
  return Object.values(data.places).filter(place => place.cities.length > 0).length;
}

function regionKey(name) {
  return String(name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function visitedRegionCount(place) {
  return new Set((place?.cities || []).map(city => regionKey(city.regionName)).filter(Boolean)).size;
}

function featureStyle(feature) {
  const country = countryProps(feature);
  const visited = Boolean(data.places[country.code]?.cities.length);
  const selected = selectedCountry?.code === country.code;
  return {
    color: selected ? "#ffffff" : visited ? "#167b61" : "#8a9baa",
    weight: selected ? 2 : 0.8,
    fillColor: visited ? "#34d399" : selected ? "#28b6c8" : "#cbd7d6",
    fillOpacity: visited ? 0.72 : selected ? 0.48 : 0.2
  };
}

function setMapStatus(text) {
  mapStatus.textContent = text;
}

async function loadCountries() {
  try {
    const response = await fetch(COUNTRY_URL);
    if (!response.ok) throw new Error("Country boundaries are unavailable.");
    const geojson = await response.json();
    countriesLayer = L.geoJSON(geojson, {
      style: featureStyle,
      onEachFeature(feature, layer) {
        const country = countryProps(feature);
        layer.bindTooltip(country.name, { sticky: true, className: "map-tooltip" });
        layer.on("click", () => selectCountry(country, layer));
      }
    }).addTo(map);
    setMapStatus("");
    render();
  } catch (error) {
    setMapStatus("Country boundaries could not load. Check your connection and reload.");
  }
}

function selectCountry(country, layer = null) {
  if (!country.code || country.code === "-99") {
    showMessage("This map boundary does not have a usable country code.", true);
    return;
  }
  selectedCountry = country;
  regionModeBtn.disabled = false;
  placeTitle.textContent = country.name;
  placeHint.textContent = "Add or remove cities to update visited countries and regions.";
  citySection.hidden = false;
  citySearch.value = "";
  hideSearchResults();
  if (layer) map.fitBounds(layer.getBounds(), { padding: [24, 24], maxZoom: 5 });
  if (mode === "region") setMode("country");
  render();
}

async function loadRegions() {
  if (!selectedCountry) return;
  setMapStatus(`Loading ${selectedCountry.name} regions...`);
  if (regionsLayer) map.removeLayer(regionsLayer);
  selectedRegion = null;
  try {
    if (!allRegions) {
      const response = await fetch(REGION_URL);
      if (!response.ok) throw new Error("Region boundaries are unavailable.");
      allRegions = await response.json();
    }
    const geojson = {
      type: "FeatureCollection",
      features: allRegions.features.filter(feature => feature.properties?.adm0_a3 === selectedCountry.code)
    };
    if (!geojson.features.length) throw new Error("No mapped regions for this country.");
    regionsLayer = L.geoJSON(geojson, {
      style: feature => regionStyle(feature),
      onEachFeature(feature, layer) {
        const region = regionProps(feature);
        layer.bindTooltip(region.name, { sticky: true });
      }
    }).addTo(map);
    if (regionsLayer.getBounds().isValid()) map.fitBounds(regionsLayer.getBounds(), { padding: [20, 20], maxZoom: 6 });
    setMapStatus("");
    render();
  } catch (error) {
    setMapStatus("State / province boundaries are not available for this country.");
    setTimeout(() => { if (mapStatus.textContent.startsWith("State / province")) setMapStatus(""); }, 4500);
    setMode("country");
  }
}

function regionProps(feature) {
  const props = feature.properties || {};
  return {
    name: props.name_en || props.name || props.admin || "Unnamed region"
  };
}

function regionStyle(feature) {
  const region = regionProps(feature);
  const cities = data.places[selectedCountry?.code]?.cities || [];
  const visited = cities.some(city => regionKey(city.regionName) === regionKey(region.name));
  return {
    color: visited ? "#064e3b" : "#718395",
    weight: visited ? 2 : 1,
    fillColor: visited ? "#059669" : "#9fb5bb",
    fillOpacity: visited ? 0.95 : 0.35
  };
}

function setMode(nextMode) {
  if (nextMode === "region" && !selectedCountry) return;
  mode = nextMode;
  countryModeBtn.classList.toggle("active", mode === "country");
  regionModeBtn.classList.toggle("active", mode === "region");
  countryModeBtn.setAttribute("aria-pressed", String(mode === "country"));
  regionModeBtn.setAttribute("aria-pressed", String(mode === "region"));
  if (mode === "region") loadRegions();
  else {
    if (regionsLayer) map.removeLayer(regionsLayer);
    regionsLayer = null;
    if (countriesLayer) countriesLayer.setStyle(featureStyle);
    setMapStatus("");
    render();
  }
}

function addCity(result) {
  if (!selectedCountry) return;
  const place = ensurePlace(selectedCountry);
  const regionName = result.address?.state || result.address?.province || result.address?.state_district || "";
  const city = {
    id: `${result.lat},${result.lon}`,
    name: result.name,
    regionName,
    detail: [regionName, result.address?.country].filter(Boolean).join(", "),
    lat: Number(result.lat),
    lon: Number(result.lon)
  };
  if (!place.cities.some(item => item.id === city.id)) place.cities.push(city);
  else {
    showMessage(`${city.name} is already in your visited cities.`);
    hideSearchResults();
    return;
  }
  saveData();
  hideSearchResults();
  citySearch.value = "";
  map.setView([city.lat, city.lon], Math.max(map.getZoom(), 7));
  showMessage(`${city.name} added to ${selectedCountry.name}.`);
}

function cityName(result) {
  const address = result.address || {};
  return address.city || address.town || address.village || address.municipality || result.name || result.display_name.split(",")[0];
}

async function searchCities(query) {
  const id = ++requestId;
  if (!selectedCountry || query.trim().length < 2) {
    hideSearchResults();
    return;
  }
  setSearchMessage("Searching OpenStreetMap...");
  const params = new URLSearchParams({
    q: `${query.trim()}, ${selectedCountry.name}`,
    format: "jsonv2",
    addressdetails: "1",
    limit: "6",
    featuretype: "city"
  });
  lastSearchAt = Date.now();
  try {
    const response = await fetch(`${NOMINATIM_URL}?${params}`, { headers: { "Accept-Language": "en" } });
    if (!response.ok) throw new Error("City search is unavailable.");
    const results = await response.json();
    if (id !== requestId) return;
    cityResults.replaceChildren();
    if (!results.length) {
      setSearchMessage("No matching cities found.");
      return;
    }
    results.forEach(result => {
      const button = document.createElement("button");
      button.type = "button";
      button.role = "option";
      button.textContent = `${cityName(result)} · ${result.display_name.split(",").slice(1, 3).join(",").trim()}`;
      button.addEventListener("click", () => addCity({ ...result, name: cityName(result) }));
      cityResults.append(button);
    });
    cityResults.hidden = false;
  } catch {
    if (id === requestId) setSearchMessage("Search failed. Try again in a moment.");
  }
}

function setSearchMessage(text) {
  cityResults.replaceChildren();
  const message = document.createElement("div");
  message.className = "search-hint result-message";
  message.textContent = text;
  cityResults.append(message);
  cityResults.hidden = false;
}

function hideSearchResults() {
  cityResults.hidden = true;
  cityResults.replaceChildren();
}

function makeListItem(name, detail, onRemove) {
  const item = document.createElement("li");
  const label = document.createElement("span");
  label.className = "place-name";
  label.textContent = name;
  if (detail) {
    const meta = document.createElement("span");
    meta.className = "place-meta";
    meta.textContent = detail;
    label.append(meta);
  }
  const remove = document.createElement("button");
  remove.className = "remove-btn";
  remove.type = "button";
  remove.textContent = "Remove";
  remove.setAttribute("aria-label", `Remove ${name}`);
  remove.addEventListener("click", onRemove);
  item.append(label, remove);
  return item;
}

function render() {
  if (countriesLayer) countriesLayer.setStyle(featureStyle);
  const place = selectedCountry ? data.places[selectedCountry.code] : null;
  const cities = place?.cities || [];
  cityList.replaceChildren();
  cities.forEach(city => cityList.append(makeListItem(city.name, city.detail, () => {
    place.cities = place.cities.filter(item => item.id !== city.id);
    if (!place.cities.length) delete data.places[selectedCountry.code];
    saveData();
  })));
  document.getElementById("cityCount").textContent = String(cities.length);
  document.getElementById("emptyCities").hidden = cities.length > 0;
  const countriesVisited = visitCount();
  const cityTotal = Object.values(data.places).reduce((total, item) => total + item.cities.length, 0);
  const regionTotal = Object.values(data.places).reduce((total, item) => total + visitedRegionCount(item), 0);
  document.getElementById("visitSummary").textContent = `${countriesVisited} ${countriesVisited === 1 ? "country" : "countries"} · ${cityTotal} ${cityTotal === 1 ? "city" : "cities"} · ${regionTotal} ${regionTotal === 1 ? "region" : "regions"}`;
  renderMarkers();
  if (regionsLayer) regionsLayer.setStyle(feature => regionStyle(feature));
}

function renderMarkers() {
  markersLayer.clearLayers();
  Object.entries(data.places).forEach(([code, place]) => {
    (place.cities || []).forEach(city => {
      const marker = L.circleMarker([city.lat, city.lon], {
        radius: selectedCountry?.code === code ? 6 : 4,
        color: "#073b36", weight: 1.5,
        fillColor: "#34d399", fillOpacity: 0.95
      }).bindTooltip(`${city.name}, ${place.name}`);
      marker.addTo(markersLayer);
    });
  });
}

countryModeBtn.addEventListener("click", () => setMode("country"));
regionModeBtn.addEventListener("click", () => setMode("region"));
document.getElementById("worldBtn").addEventListener("click", () => {
  selectedCountry = null;
  regionModeBtn.disabled = true;
  mode = "country";
  countryModeBtn.classList.add("active");
  regionModeBtn.classList.remove("active");
  countryModeBtn.setAttribute("aria-pressed", "true");
  regionModeBtn.setAttribute("aria-pressed", "false");
  if (regionsLayer) map.removeLayer(regionsLayer);
  regionsLayer = null;
  countriesLayer?.setStyle(featureStyle);
  placeTitle.textContent = "Choose a country";
  placeHint.textContent = "Select a country on the map to add cities and explore its regions.";
  citySection.hidden = true;
  hideSearchResults();
  map.setView([22, 8], 2);
  render();
});
citySearch.addEventListener("input", () => {
  clearTimeout(searchTimer);
  const query = citySearch.value;
  const wait = Math.max(550, 1000 - (Date.now() - lastSearchAt));
  searchTimer = setTimeout(() => searchCities(query), wait);
});
citySearch.addEventListener("keydown", event => {
  if (event.key === "Escape") hideSearchResults();
});
document.addEventListener("click", event => {
  if (!event.target.closest(".search-wrap")) hideSearchResults();
});
document.getElementById("exportBtn").addEventListener("click", async () => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  try {
    if (window.showSaveFilePicker) {
      const handle = await window.showSaveFilePicker({
        suggestedName: "travel-tracker.json",
        types: [{ description: "JSON file", accept: { "application/json": [".json"] } }]
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      showMessage("Travel data exported.");
      return;
    }
    const filename = window.prompt("Save travel data as:", "travel-tracker.json");
    if (!filename) return;
    const safeName = filename.replace(/[\\/:*?"<>|]/g, "-").trim() || "travel-tracker.json";
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = safeName.endsWith(".json") ? safeName : `${safeName}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    if (error.name !== "AbortError") showMessage("Could not export travel data.", true);
  }
});
const importFile = document.getElementById("importFile");
document.getElementById("importBtn").addEventListener("click", () => importFile.click());
importFile.addEventListener("change", async () => {
  const file = importFile.files[0];
  if (!file) return;
  try {
    const imported = JSON.parse(await file.text());
    if (imported?.version !== 1 || !imported.places || typeof imported.places !== "object" || Array.isArray(imported.places)) {
      throw new Error("This file is not a Travel Tracker backup.");
    }
    data = normalizeData(imported);
    saveData();
    showMessage("Travel data imported.");
  } catch (error) {
    showMessage(error.message || "Could not read that JSON file.", true);
  }
  importFile.value = "";
});

loadCountries();
render();