# SkyCast — Smart Weather Dashboard

A responsive weather dashboard built with HTML, CSS, and vanilla JavaScript. It uses OpenWeather for current conditions, geocoding, the 5-day/3-hour forecast, air pollution, and optional One Call 3.0 data.

## Run locally

Serve this folder with any local static HTTP server, then open its URL in a modern browser. For example:

```powershell
python -m http.server 5500
```

Open `http://localhost:5500`.

## Configure OpenWeather

1. Create an OpenWeather API key and wait until the provider activates it.
2. Open **Settings** in SkyCast and enter the key.
3. Use a key with One Call 3.0 access for the 7-day outlook, UV index, and weather alerts.

The key is saved in this browser's `localStorage`; it is not included in the project source. Browser storage is not a secure secret vault, and any key used by a browser can be inspected by that browser's user. For a public production deployment, route weather requests through a backend/proxy and keep the provider key in server-side environment configuration. Because a key was previously present in the client-side project, revoke or rotate that key with OpenWeather.

Without One Call 3.0 access, SkyCast displays the real 5-day/3-hour forecast and marks UV and alert data as unavailable rather than fabricating values.

## Features

- City search with geocoded suggestions, recent searches, and saved places
- Browser geolocation
- Current conditions and metric details, with Celsius/Fahrenheit conversion
- Hourly precipitation probability and daily high/low forecasts
- Optional air quality and One Call 3.0 alert/UV data
- Leaflet map with OpenWeather temperature, cloud, precipitation, and wind overlays
- Responsive dark/light themes and weather-responsive visual treatments
