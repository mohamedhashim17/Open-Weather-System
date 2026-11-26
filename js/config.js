export const BASE_URL = "https://api.openweathermap.org/data/2.5";
export const GEO_URL = "https://api.openweathermap.org/geo/1.0";
export const DEFAULT_CITY = "Salem";
export const API_KEY_STORAGE_KEY = "skycast_openweather_key";

export function getApiKey() {
    return window.localStorage.getItem(API_KEY_STORAGE_KEY)?.trim() || "10b58bbf298c94916e53dcaa70edad04";
}
