import { BASE_URL, GEO_URL, getApiKey } from "./config.js";

const ONE_CALL_URL = "https://api.openweathermap.org/data/3.0/onecall";

async function request(url, optional = false) {
    const apiKey = getApiKey();
    if (!apiKey) {
        throw new Error("Add your OpenWeather API key in Settings to load live weather.");
    }

    const response = await fetch(`${url}${url.includes("?") ? "&" : "?"}appid=${encodeURIComponent(apiKey)}`);
    if (!response.ok) {
        let detail = "";
        try {
            const body = await response.json();
            detail = body.message || "";
        } catch {
            detail = "";
        }
        const error = new Error(detail || `Weather service returned ${response.status}.`);
        error.status = response.status;
        if (optional) throw error;
        throw error;
    }
    return response.json();
}

export async function searchLocations(query) {
    const locations = await request(
        `${GEO_URL}/direct?q=${encodeURIComponent(query)}&limit=5`
    );
    return locations;
}

export async function getWeatherByCoordinates(lat, lon) {
    return request(`${BASE_URL}/weather?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&units=metric`);
}

export async function getForecastByCoordinates(lat, lon) {
    return request(`${BASE_URL}/forecast?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&units=metric`);
}

export async function getAirQuality(lat, lon) {
    return request(`${BASE_URL}/air_pollution?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`);
}

export async function getOneCall(lat, lon) {
    return request(`${ONE_CALL_URL}?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&units=metric&exclude=minutely`, true);
}
