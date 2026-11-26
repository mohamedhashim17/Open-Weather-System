const ICONS = {
    Clear: "fa-sun",
    Clouds: "fa-cloud",
    Rain: "fa-cloud-rain",
    Drizzle: "fa-cloud-rain",
    Thunderstorm: "fa-cloud-bolt",
    Snow: "fa-snowflake",
    Mist: "fa-smog",
    Smoke: "fa-smog",
    Haze: "fa-smog",
    Fog: "fa-smog",
    Tornado: "fa-tornado"
};

export function weatherIcon(condition) {
    return ICONS[condition] || "fa-cloud-sun";
}

function localDate(timestamp, timezoneOffset) {
    return new Date((timestamp + timezoneOffset) * 1000).toISOString().slice(0, 10);
}

function formatTime(timestamp, timezoneOffset) {
    return new Date((timestamp + timezoneOffset) * 1000).toLocaleTimeString("en", {
        hour: "numeric",
        timeZone: "UTC"
    });
}

function formatDay(timestamp, timezoneOffset, options) {
    return new Date((timestamp + timezoneOffset) * 1000).toLocaleDateString("en", {
        ...options,
        timeZone: "UTC"
    });
}

export function createHourlyForecast(forecast, oneCall, timezoneOffset) {
    if (oneCall?.hourly?.length) {
        return oneCall.hourly.slice(0, 24).map(item => ({
            time: formatTime(item.dt, oneCall.timezone_offset || timezoneOffset),
            temperature: item.temp,
            condition: item.weather?.[0]?.main || "Clouds",
            rain: Math.round((item.pop || 0) * 100)
        }));
    }

    return forecast.list.slice(0, 8).map(item => ({
        time: formatTime(item.dt, timezoneOffset),
        temperature: item.main.temp,
        condition: item.weather?.[0]?.main || "Clouds",
        rain: Math.round((item.pop || 0) * 100)
    }));
}

export function createDailyForecast(forecast, oneCall, timezoneOffset) {
    if (oneCall?.daily?.length) {
        const offset = oneCall.timezone_offset || timezoneOffset;
        return oneCall.daily.slice(0, 7).map(item => ({
            day: formatDay(item.dt, offset, { weekday: "short" }),
            date: formatDay(item.dt, offset, { month: "short", day: "numeric" }),
            condition: item.weather?.[0]?.main || "Clouds",
            high: item.temp.max,
            low: item.temp.min
        }));
    }

    const groups = new Map();
    forecast.list.forEach(item => {
        const date = localDate(item.dt, timezoneOffset);
        if (!groups.has(date)) {
            groups.set(date, { items: [], date });
        }
        groups.get(date).items.push(item);
    });

    return [...groups.values()].slice(0, 5).map(({ items, date }) => {
        const representative = items.find(item => item.dt_txt?.includes("12:00:00")) || items[Math.floor(items.length / 2)];
        return {
            day: formatDay(representative.dt, timezoneOffset, { weekday: "short" }),
            date: formatDay(representative.dt, timezoneOffset, { month: "short", day: "numeric" }),
            condition: representative.weather?.[0]?.main || "Clouds",
            high: Math.max(...items.map(item => item.main.temp_max)),
            low: Math.min(...items.map(item => item.main.temp_min))
        };
    });
}
