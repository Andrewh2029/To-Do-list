import "dotenv/config";
import express     from "express";
import cors        from "cors";
import helmet      from "helmet";
import rateLimit   from "express-rate-limit";
import path        from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app  = express();
const PORT = process.env.PORT || 3000;

// ── Security headers ──────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));

// ── CORS — lock to allowed origins in production ──────────────────────────────
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map(o => o.trim())
  : true; // allow all in dev

app.use(cors({ origin: allowedOrigins }));

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: "50kb" }));

// ── Rate limiting — 100 requests per minute per IP ───────────────────────────
app.use("/api/", rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests — please slow down." },
}));

// ── Static files ──────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname), { index: "index.HTML" }));

// ── Helpers ───────────────────────────────────────────────────────────────────
function calcPriority(dueDateStr) {
  if (!dueDateStr) return { label: "None", color: "#aaa", order: 4 };
  const due = new Date(dueDateStr);
  if (isNaN(due))  return { label: "None", color: "#aaa", order: 4 };

  const hours = (due - Date.now()) / 36e5;
  if (hours < 0)    return { label: "Overdue",  color: "#c0392b", order: 0 };
  if (hours <= 24)  return { label: "Critical", color: "#e74c3c", order: 1 };
  if (hours <= 72)  return { label: "High",     color: "#e67e22", order: 2 };
  if (hours <= 168) return { label: "Medium",   color: "#f1c40f", order: 3 };
  return                   { label: "Low",      color: "#27ae60", order: 4 };
}

function codeToHazards(code, wind, temp) {
  const h = [];
  if ([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code)) h.push("rain");
  if ([71,73,75,77,85,86].includes(code))                       h.push("snow");
  if ([95,96,99].includes(code))                                 h.push("storm");
  if (wind > 20)                                                 h.push("wind");
  if (temp > 95)                                                 h.push("heat");
  return h;
}

function validateLatLon(lat, lon) {
  const la = parseFloat(lat);
  const lo = parseFloat(lon);
  if (isNaN(la) || isNaN(lo))  return false;
  if (la < -90  || la > 90)    return false;
  if (lo < -180 || lo > 180)   return false;
  return { lat: la, lon: lo };
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/health
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// GET /api/priority?dueDate=<ISO string>
app.get("/api/priority", (req, res) => {
  res.json(calcPriority(req.query.dueDate));
});

// POST /api/prioritize  { tasks: [{ id, name, dueDate }] }
app.post("/api/prioritize", (req, res) => {
  const { tasks } = req.body;
  if (!Array.isArray(tasks))
    return res.status(400).json({ error: "tasks must be an array" });
  if (tasks.length > 500)
    return res.status(400).json({ error: "too many tasks (max 500)" });

  const result = tasks
    .map(t => ({ ...t, priority: calcPriority(t.dueDate) }))
    .sort((a, b) => a.priority.order - b.priority.order);

  res.json({ tasks: result });
});

// GET /api/weather?lat=X&lon=Y
app.get("/api/weather", async (req, res) => {
  const coords = validateLatLon(req.query.lat, req.query.lon);
  if (!coords)
    return res.status(400).json({ error: "Valid lat (-90–90) and lon (-180–180) are required" });

  try {
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${coords.lat}&longitude=${coords.lon}` +
      `&current=weather_code,wind_speed_10m,temperature_2m` +
      `&daily=weather_code,wind_speed_10m_max,temperature_2m_max` +
      `&wind_speed_unit=mph&temperature_unit=fahrenheit` +
      `&timezone=auto&forecast_days=16`;

    const r = await fetch(url);
    if (!r.ok) throw new Error(`Open-Meteo responded with ${r.status}`);
    const data = await r.json();

    const cur     = data.current;
    const current = codeToHazards(cur.weather_code, cur.wind_speed_10m, cur.temperature_2m);

    const forecast = {};
    const d = data.daily;
    d.time.forEach((date, i) => {
      forecast[date] = codeToHazards(d.weather_code[i], d.wind_speed_10m_max[i], d.temperature_2m_max[i]);
    });

    res.json({ current, forecast });
  } catch (e) {
    console.error("Weather fetch error:", e.message);
    res.status(502).json({ error: "Could not fetch weather data. Try again shortly." });
  }
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const server = app.listen(PORT, () =>
  console.log(`To-Do server running at http://localhost:${PORT}`)
);

process.on("SIGTERM", () => {
  server.close(() => console.log("Server shut down gracefully."));
});
