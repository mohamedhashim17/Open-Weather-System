import { API_KEY_STORAGE_KEY, DEFAULT_CITY, getApiKey } from "./config.js";
import {
    getAirQuality,
    getForecastByCoordinates,
    getOneCall,
    getWeatherByCoordinates,
    searchLocations
} from "./weather.js";
import { createDailyForecast, createHourlyForecast, weatherIcon } from "./forecast.js";

const $ = selector => document.querySelector(selector);
const cityInput = $("#cityInput");
const searchBtn = $("#searchBtn");
const locationBtn = $("#locationBtn");
const notice = $("#notice");
const settingsDialog = $("#settingsDialog");
const settingsForm = $("#settingsForm");
const apiKeyInput = $("#apiKeyInput");
const suggestions = $("#suggestions");
const STORAGE = {
    theme: "skycast_theme",
    recent: "skycast_recent_cities",
    favorites: "skycast_favorite_cities",
    unit: "skycast_temperature_unit"
};
let currentUnit = localStorage.getItem(STORAGE.unit) || "C";
let currentWeather = null;
let currentForecast = null;
let currentOneCall = null;
let currentCityLabel = "";
let map;
let marker;
let weatherLayer;
let suggestionTimer;
let requestSequence = 0;
const mapLayerButtons = [...document.querySelectorAll(".layer-button")];

function showNotice(message, success = false) {
    notice.textContent = message;
    notice.hidden = false;
    notice.classList.toggle("success", success);
}

function clearNotice() {
    notice.hidden = true;
    notice.textContent = "";
    notice.classList.remove("success");
}

function setLoading(loading) {
    searchBtn.disabled = loading;
    searchBtn.innerHTML = loading ? '<span class="loader"></span>' : '<i class="fa-solid fa-arrow-right"></i>';
    searchBtn.setAttribute("aria-label", loading ? "Loading weather" : "Search");
}

function showLoadingForecasts() {
    $("#hourlyForecast").innerHTML = '<div class="loading-state"><span class="loader"></span> Loading forecast</div>';
    $("#dailyForecast").innerHTML = '<div class="loading-state"><span class="loader"></span> Loading forecast</div>';
}

function showForecastError() {
    $("#hourlyForecast").textContent = "Forecast is temporarily unavailable.";
    $("#dailyForecast").textContent = "Forecast is temporarily unavailable.";
}

function temperature(value) {
    const converted = currentUnit === "F" ? value * 9 / 5 + 32 : value;
    return `${Math.round(converted)}°`;
}

function displayTime(timestamp, timezoneOffset) {
    return new Date((timestamp + timezoneOffset) * 1000).toLocaleTimeString("en", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: "UTC"
    });
}

function displayWeather(data, oneCall) {
    currentWeather = data;
    currentOneCall = oneCall;
    const timezoneOffset = oneCall?.timezone_offset ?? data.timezone ?? 0;
    const condition = data.weather?.[0]?.main || "Clouds";
    const localNow = new Date((Date.now() / 1000 + timezoneOffset) * 1000);
    const country = new Intl.DisplayNames(["en"], { type: "region" }).of(data.sys.country);

    document.body.dataset.condition = condition.toLowerCase();
    document.body.dataset.daylight =
        Date.now() / 1000 > data.sys.sunrise && Date.now() / 1000 < data.sys.sunset ? "day" : "night";
    $("#cityName").textContent = `${data.name}, ${country || data.sys.country}`;
    $("#mapCity").textContent = `${data.name}, ${country || data.sys.country}`;
    $("#weatherDate").textContent = localNow.toLocaleString("en", {
        weekday: "long",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "UTC"
    });
    $("#weatherDescription").textContent = data.weather?.[0]?.description || "Current conditions";
    $("#temperature").textContent = temperature(data.main.temp);
    $("#feelsLike").textContent = temperature(data.main.feels_like);
    $("#tempHigh").textContent = temperature(data.main.temp_max);
    $("#tempLow").textContent = temperature(data.main.temp_min);
    $("#humidity").innerHTML = `${data.main.humidity}<small>%</small>`;
    $("#windSpeed").innerHTML = `${(data.wind.speed * 3.6).toFixed(1)}<small> km/h</small>`;
    $("#pressure").innerHTML = `${data.main.pressure}<small> hPa</small>`;
    $("#visibility").innerHTML = `${(data.visibility / 1000).toFixed(1)}<small> km</small>`;
    $("#cloudCover").innerHTML = `${data.clouds.all}<small>%</small>`;
    $("#weatherIcon").className = `fa-solid ${weatherIcon(condition)} hero-weather-icon`;
    $("#sunrise").textContent = displayTime(data.sys.sunrise, data.timezone || 0);
    $("#sunset").textContent = displayTime(data.sys.sunset, data.timezone || 0);
    const daylightProgress = Math.min(1, Math.max(0,
        (Date.now() / 1000 - data.sys.sunrise) / (data.sys.sunset - data.sys.sunrise)));
    $(".sun-progress-fill").style.right = `${(1 - daylightProgress) * 100}%`;
    $(".sun-progress > i").style.left = `${daylightProgress * 100}%`;

    $("#uvIndex").textContent = oneCall?.current?.uvi != null ? oneCall.current.uvi.toFixed(1) : "N/A";
    $("#uvNote").textContent = oneCall?.current?.uvi != null ? "Current UV exposure" : "Requires One Call 3.0";
    if (oneCall?.alerts?.length) {
        $("#alertText").textContent = oneCall.alerts.map(alert => alert.event).join(" · ");
        $("#alertSource").textContent = oneCall.alerts[0].sender_name || "Official weather alert";
    } else {
        $("#alertText").textContent = oneCall ? "No active alerts reported" : "Alert feed requires One Call 3.0";
        $("#alertSource").textContent = oneCall ? "From OpenWeather" : "Upgrade API access for alerts";
    }

    $("#unitToggle").innerHTML = `<span class="${currentUnit === "C" ? "selected" : ""}">°C</span><span class="${currentUnit === "F" ? "selected" : ""}">°F</span>`;
    syncFavoriteButtons();
    updateMap(data.coord.lat, data.coord.lon, data.name);
    updateWeatherMapLayer();
}

function displayAirQuality(result) {
    const info = result?.list?.[0];
    if (!info) {
        $("#airIndex").textContent = "N/A";
        $("#airBadge").textContent = "Unavailable";
        $("#airDescription").textContent = "Air quality data unavailable";
        return;
    }
    const labels = ["", "Good", "Fair", "Moderate", "Poor", "Very poor"];
    const index = info.main.aqi;
    $("#airIndex").textContent = String(index);
    $("#airBadge").textContent = labels[index] || "Unknown";
    $("#airDescription").textContent = `${labels[index] || "Unknown"} air quality`;
    $(".air-scale").dataset.index = String(index);
}

function displayHourly(data, oneCall) {
    const items = createHourlyForecast(data, oneCall, currentWeather.timezone || 0);
    const container = $("#hourlyForecast");
    container.replaceChildren();
    items.forEach(item => {
        const card = document.createElement("article");
        card.className = "hour-card";
        const time = document.createElement("p");
        time.textContent = item.time;
        const icon = document.createElement("i");
        icon.className = `fa-solid ${weatherIcon(item.condition)} hour-icon`;
        icon.setAttribute("aria-hidden", "true");
        const temp = document.createElement("strong");
        temp.textContent = temperature(item.temperature);
        const rain = document.createElement("span");
        rain.className = "rain-prob";
        rain.innerHTML = `<i class="fa-solid fa-droplet"></i> ${item.rain}%`;
        card.append(time, icon, temp, rain);
        container.append(card);
    });
}

function displayDaily(data, oneCall) {
    const items = createDailyForecast(data, oneCall, currentWeather.timezone || 0);
    const container = $("#dailyForecast");
    container.replaceChildren();
    items.forEach((item, index) => {
        const card = document.createElement("article");
        card.className = "daily-card";
        const day = document.createElement("p");
        day.className = "daily-day";
        day.textContent = index === 0 ? "Today" : item.day;
        const date = document.createElement("p");
        date.className = "daily-date";
        date.textContent = item.date;
        const icon = document.createElement("i");
        icon.className = `fa-solid ${weatherIcon(item.condition)} daily-icon`;
        icon.setAttribute("aria-hidden", "true");
        const condition = document.createElement("p");
        condition.className = "daily-condition";
        condition.textContent = item.condition;
        const temps = document.createElement("div");
        temps.className = "daily-temps";
        const high = document.createElement("span");
        high.textContent = temperature(item.high);
        const low = document.createElement("span");
        low.textContent = temperature(item.low);
        temps.append(high, low);
        card.append(day, date, icon, condition, temps);
        container.append(card);
    });
    $("#forecastAvailability").textContent = oneCall?.daily?.length
        ? "7-day outlook · One Call 3.0"
        : "5-day outlook · 3-hour forecast";
}

function saveList(key, values) {
    localStorage.setItem(key, JSON.stringify(values));
}

function readList(key) {
    try {
        const parsed = JSON.parse(localStorage.getItem(key) || "[]");
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function cityKey(value) {
    return value.trim().toLocaleLowerCase();
}

function recordRecent(name) {
    const previous = readList(STORAGE.recent).filter(item => cityKey(item) !== cityKey(name));
    saveList(STORAGE.recent, [name, ...previous].slice(0, 6));
    renderPlaces();
}

function renderPlaces() {
    const recent = readList(STORAGE.recent);
    const favorites = readList(STORAGE.favorites);
    const section = $("#recentSection");
    const list = $("#recentList");
    list.replaceChildren();
    const allPlaces = [...new Set([...favorites, ...recent])];
    section.hidden = allPlaces.length === 0;
    allPlaces.forEach(name => {
        const button = document.createElement("button");
        button.className = "place-chip";
        button.type = "button";
        button.textContent = name;
        button.addEventListener("click", () => loadCity(name));
        list.append(button);
    });
    $("#favoritesNav").querySelector("span").textContent = favorites.length
        ? `Saved places · ${favorites.length}`
        : "Saved places";
    $("#favoritesNav").onclick = () => {
        if (favorites.length) loadCity(favorites[0]);
        else showNotice("Save a city with the heart button to add it to your saved places.", true);
    };
}

function syncFavoriteButtons() {
    const saved = readList(STORAGE.favorites).some(item => cityKey(item) === cityKey(currentCityLabel));
    $("#favoriteHeroBtn").classList.toggle("saved", saved);
    $("#favoriteHeroBtn").innerHTML = `<i class="fa-${saved ? "solid" : "regular"} fa-heart"></i>`;
    $("#favoriteCurrentBtn").innerHTML = `<i class="fa-${saved ? "solid" : "regular"} fa-heart"></i> ${saved ? "Saved" : "Save place"}`;
}

function toggleFavorite() {
    if (!currentCityLabel) return;
    const favorites = readList(STORAGE.favorites);
    const exists = favorites.some(item => cityKey(item) === cityKey(currentCityLabel));
    const next = exists
        ? favorites.filter(item => cityKey(item) !== cityKey(currentCityLabel))
        : [currentCityLabel, ...favorites].slice(0, 10);
    saveList(STORAGE.favorites, next);
    renderPlaces();
    syncFavoriteButtons();
}

function initializeMap() {
    if (!window.L) {
        $("#weatherMapContainer").textContent = "Map library could not be loaded.";
        return;
    }
    map = L.map("weatherMapContainer", { zoomControl: true }).setView([20, 0], 2);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 18
    }).addTo(map);
}

function updateMap(lat, lon, city) {
    if (!map) return;
    const point = [lat, lon];
    map.setView(point, 8, { animate: true });
    if (!marker) marker = L.marker(point).addTo(map);
    else marker.setLatLng(point);
    const label = document.createElement("span");
    label.textContent = city;
    marker.bindPopup(label);
    window.setTimeout(() => map.invalidateSize(), 100);
}

function updateWeatherMapLayer() {
    if (!map || !currentWeather) return;
    if (weatherLayer) {
        map.removeLayer(weatherLayer);
        weatherLayer = null;
    }
    const selected = $(".layer-button.active");
    if (!selected || !getApiKey()) return;
    const layerName = selected.dataset.layer;
    const tileUrl = `https://tile.openweathermap.org/map/${layerName}/{z}/{x}/{y}.png?appid=${encodeURIComponent(getApiKey())}`;
    weatherLayer = L.tileLayer(tileUrl, { opacity: .63, maxZoom: 18, attribution: "&copy; OpenWeather" });
    weatherLayer.addTo(map);
}

async function loadCoordinates(lat, lon, locationName) {
    const sequence = ++requestSequence;
    clearNotice();
    showLoadingForecasts();
    setLoading(true);
    try {
        const [weather, forecast] = await Promise.all([
            getWeatherByCoordinates(lat, lon),
            getForecastByCoordinates(lat, lon)
        ]);
        if (sequence !== requestSequence) return;
        const [oneCallResult, airResult] = await Promise.allSettled([
            getOneCall(lat, lon),
            getAirQuality(lat, lon)
        ]);
        if (sequence !== requestSequence) return;
        const oneCall = oneCallResult.status === "fulfilled" ? oneCallResult.value : null;
        currentForecast = forecast;
        currentOneCall = oneCall;
        currentCityLabel = locationName || weather.name;
        displayWeather(weather, oneCall);
        displayHourly(forecast, oneCall);
        displayDaily(forecast, oneCall);
        displayAirQuality(airResult.status === "fulfilled" ? airResult.value : null);
        recordRecent(currentCityLabel);
        clearNotice();
        if (oneCallResult.status === "rejected") {
            $("#uvNote").title = "One Call 3.0 is not available for this API key.";
        } else {
            $("#uvNote").removeAttribute("title");
        }
    } catch (error) {
        if (sequence !== requestSequence) return;
        showForecastError();
        showNotice(error.status === 401
            ? "This API key is invalid or not active yet. Check the key in Settings and allow time for activation."
            : error.message || "Unable to load weather. Please try again.");
    } finally {
        if (sequence === requestSequence) setLoading(false);
    }
}

async function loadCity(query) {
    const city = query.trim();
    if (!city) {
        showNotice("Enter a city name to search.");
        cityInput.focus();
        return;
    }
    suggestions.hidden = true;
    cityInput.value = city;
    clearNotice();
    const sequence = ++requestSequence;
    setLoading(true);
    try {
        const locations = await searchLocations(city);
        if (sequence !== requestSequence) return;
        if (!locations.length) {
            showNotice(`We couldn't find “${city}”. Check the spelling and try again.`);
            return;
        }
        const location = locations[0];
        const name = [location.name, location.state, location.country].filter(Boolean).join(", ");
        await loadCoordinates(location.lat, location.lon, name);
    } catch (error) {
        if (sequence !== requestSequence) return;
        showNotice(error.status === 401
            ? "Your OpenWeather API key is invalid or still activating. Check Settings."
            : error.message || "Location search failed. Please try again.");
    } finally {
        if (sequence === requestSequence) setLoading(false);
    }
}

function renderSuggestions(locations) {
    suggestions.replaceChildren();
    locations.forEach(location => {
        const button = document.createElement("button");
        button.className = "suggestion";
        button.type = "button";
        button.setAttribute("role", "option");
        const icon = document.createElement("i");
        icon.className = "fa-solid fa-location-dot";
        const name = document.createElement("span");
        name.textContent = location.name;
        const detail = document.createElement("small");
        detail.textContent = [location.state, location.country].filter(Boolean).join(", ");
        button.append(icon, name, detail);
        button.addEventListener("click", () => {
            const label = [location.name, location.state, location.country].filter(Boolean).join(", ");
            cityInput.value = label;
            suggestions.hidden = true;
            loadCoordinates(location.lat, location.lon, label);
        });
        suggestions.append(button);
    });
    suggestions.hidden = locations.length === 0;
}

async function findSuggestions(query) {
    if (query.trim().length < 2 || !getApiKey()) {
        suggestions.hidden = true;
        return;
    }
    try {
        renderSuggestions(await searchLocations(query.trim()));
    } catch {
        suggestions.hidden = true;
    }
}

function applyTheme(theme) {
    document.documentElement.classList.toggle("light-theme", theme === "light");
    $("#themeToggle").innerHTML = theme === "light"
        ? '<i class="fa-solid fa-sun"></i>'
        : '<i class="fa-regular fa-moon"></i>';
    $("#themeToggle").title = theme === "light" ? "Switch to dark theme" : "Switch to light theme";
}

function openSettings() {
    apiKeyInput.value = "";
    $("#settingsMessage").textContent = getApiKey()
        ? "A key is saved in this browser. Enter a new value to replace it."
        : "";
    if (!settingsDialog.open) settingsDialog.showModal();
}

searchBtn.addEventListener("click", () => loadCity(cityInput.value));
cityInput.addEventListener("keydown", event => {
    if (event.key === "Enter") loadCity(cityInput.value);
    if (event.key === "Escape") suggestions.hidden = true;
});
cityInput.addEventListener("input", () => {
    window.clearTimeout(suggestionTimer);
    suggestionTimer = window.setTimeout(() => findSuggestions(cityInput.value), 250);
});
document.addEventListener("click", event => {
    if (!event.target.closest(".search-wrap")) suggestions.hidden = true;
});

$("#unitToggle").addEventListener("click", () => {
    currentUnit = currentUnit === "C" ? "F" : "C";
    localStorage.setItem(STORAGE.unit, currentUnit);
    if (currentWeather) displayWeather(currentWeather, currentOneCall);
    if (currentForecast) {
        displayHourly(currentForecast, currentOneCall);
        displayDaily(currentForecast, currentOneCall);
    }
});
$("#favoriteHeroBtn").addEventListener("click", toggleFavorite);
$("#favoriteCurrentBtn").addEventListener("click", toggleFavorite);
$("#settingsBtn").addEventListener("click", openSettings);
$("#settingsTopBtn").addEventListener("click", openSettings);
$("#themeToggle").addEventListener("click", () => {
    const next = document.documentElement.classList.contains("light-theme") ? "dark" : "light";
    localStorage.setItem(STORAGE.theme, next);
    applyTheme(next);
});
$("#keyVisibilityBtn").addEventListener("click", () => {
    const visible = apiKeyInput.type === "password";
    apiKeyInput.type = visible ? "text" : "password";
    $("#keyVisibilityBtn").setAttribute("aria-label", visible ? "Hide API key" : "Show API key");
});
$("#clearKeyBtn").addEventListener("click", () => {
    localStorage.removeItem(API_KEY_STORAGE_KEY);
    apiKeyInput.value = "";
    updateWeatherMapLayer();
    $("#settingsMessage").textContent = "Saved API key removed from this browser.";
});
settingsForm.addEventListener("submit", event => {
    event.preventDefault();
    const key = apiKeyInput.value.trim();
    if (key) localStorage.setItem(API_KEY_STORAGE_KEY, key);
    settingsDialog.close();
    if (getApiKey()) loadCity(cityInput.value || DEFAULT_CITY);
});

locationBtn.addEventListener("click", () => {
    if (!navigator.geolocation) {
        showNotice("This browser does not support location services.");
        return;
    }
    locationBtn.disabled = true;
    locationBtn.innerHTML = '<span class="loader"></span>';
    navigator.geolocation.getCurrentPosition(
        position => loadCoordinates(position.coords.latitude, position.coords.longitude)
            .finally(() => {
                locationBtn.disabled = false;
                locationBtn.innerHTML = '<i class="fa-solid fa-location-crosshairs"></i>';
            }),
        error => {
            locationBtn.disabled = false;
            locationBtn.innerHTML = '<i class="fa-solid fa-location-crosshairs"></i>';
            showNotice(error.code === error.PERMISSION_DENIED
                ? "Location access was denied. Allow location access in your browser settings."
                : "We couldn't determine your location. Please try again.");
        },
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
});
mapLayerButtons.forEach(button => button.addEventListener("click", () => {
    mapLayerButtons.forEach(item => item.classList.toggle("active", item === button));
    updateWeatherMapLayer();
    if (currentWeather && !getApiKey()) showNotice("Add an OpenWeather API key in Settings to use weather map layers.");
    else clearNotice();
}));

applyTheme(localStorage.getItem(STORAGE.theme) || "dark");
renderPlaces();
initializeMap();
if (getApiKey()) {
    loadCity(DEFAULT_CITY);
} else {
    showNotice("Add your OpenWeather API key in Settings to get started.");
    openSettings();
}
