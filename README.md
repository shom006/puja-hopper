# 🛕 Puja Hopper

**Puja Hopper** is a smart, interactive walking route optimizer designed for Kolkata's Durga Puja. Instead of zigzagging across the city or exhausting yourself with unplanned detours, Puja Hopper arranges your selected pandals into the most efficient sequential walking itinerary—from your starting point right up to your final exit.

> **Designed & Developed by Shomdutta Biswas**

---

## ✨ Key Features

- **🗺️ Interactive Kolkata Map**: Built on Leaflet.js with zero-API-key OpenStreetMap tiles, plotting ~100 iconic Durga Puja pandals across Kolkata with interactive popups, popularity ranks, and estimated darshan queue wait times.
- **🔀 Dual Hopping Modes**:
  - **Mode 1 — Transit Hubs**: Select your entry point (Howrah, Sealdah, Sovabazar Metro, Esplanade, Kalighat, or Live GPS) and your exit destination. The engine optimizes every selected pandal in between.
  - **Mode 2 — Pandal-to-Pandal Tour**: Pick your 1st entry anchor pandal (or start directly from Live GPS) and your final exit pandal. The solver finds the shortest walking tour through all intermediate stops.
- **📍 Continuous Live GPS Tracking**: Real-time geolocation tracking (`navigator.geolocation.watchPosition`) works across both modes with a dedicated floating **Live Track** button and accuracy radius indicator.
- **🏙️ Zone-Based Filtering**: Filter nearly 100 verified pandals across **North Kolkata**, **Central Kolkata**, **South Kolkata**, **Salt Lake / East**, and **Behala / South-West**.
- **📱 Responsive Desktop & Mobile UI**: Full-viewport desktop layout paired with a dedicated mobile view switcher (`List` ↔ `Map`) for on-the-go pandal hopping.
- **⏱️ Trip Time & Distance Estimator**: Calculates total walking distance (km), estimated walking duration, queue wait times, and overall trip duration with numbered sequential markers on the map.

---

## 📂 Project Structure

```text
puja-hopper/
├── frontend/
│   ├── index.html          # Modern landing page & feature overview
│   ├── home.css            # Styling for the hero landing page
│   ├── planner.html        # Interactive route planner & map interface
│   ├── style.css           # Responsive layout, sidebar & mobile controls
│   ├── pandals-data.js     # Master client-side dataset (~100 Kolkata pandals)
│   └── script.js           # Leaflet rendering, TSP solver & live GPS engine
├── backend/                # Optional FastAPI routing & OSRM street-geometry API
│   ├── main.py             # Python FastAPI server (2-Opt TSP + OSRM foot routing)
│   └── requirements.txt    # Python dependencies
├── data/
│   └── pandals.json        # Raw JSON pandal dataset
└── README.md
