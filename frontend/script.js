document.addEventListener("DOMContentLoaded", () => {
    let currentMode = "transit"; // "transit" | "pandals"

    const transitHubs = {
        howrah: { name: "Howrah Railway Station", coords: [22.5838, 88.3426] },
        sealdah: { name: "Sealdah Railway Station", coords: [22.5675, 88.3712] },
        sovabazar: { name: "Sovabazar Sutanuti Metro", coords: [22.5994, 88.3694] },
        esplanade: { name: "Esplanade Central Metro", coords: [22.5653, 88.3516] },
        kalighat: { name: "Kalighat Metro Station", coords: [22.5181, 88.3468] }
    };

    // Load dataset directly from pandals-data.js
    const pandalData = (typeof PANDALS_DATASET !== "undefined") ? PANDALS_DATASET : [];

    const pandalMarkers = {};
    let currentRouteLayer = null;
    let orderMarkersGroup = L.layerGroup();
    let userLocationMarker = null;

    // 1. Initialize Map with Reliable Mirror Tiles
    const map = L.map("map").setView([22.5629, 88.3639], 12);
    L.tileLayer("https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png", {
        attribution: '&copy; OpenStreetMap France | &copy; OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(map);

    orderMarkersGroup.addTo(map);

    setTimeout(() => { map.invalidateSize(); }, 250);

    // 2. Render Checkboxes & Map Markers
    function renderPandalUI(list) {
        const container = document.getElementById("pandal-checkbox-container");
        if (!container) return;
        container.innerHTML = "";

        // Remove old markers if any
        Object.values(pandalMarkers).forEach(m => map.removeLayer(m));

        list.forEach(p => {
            const marker = L.marker([p.lat, p.lng]).addTo(map);
            marker.bindPopup(`<strong>${p.name}</strong><br>Zone: ${p.zone} • Rank: #${p.rank}<br>Est Wait: ~${p.estWaitMins}m<br><em>${p.description}</em>`);
            pandalMarkers[p.id] = marker;

            const row = document.createElement("div");
            row.className = "pandal-row";
            row.dataset.zone = p.zone;
            row.innerHTML = `
                <input type="checkbox" id="chk-${p.id}" value="${p.id}" checked>
                <label for="chk-${p.id}" class="pandal-label">
                    ${p.name} <span class="rank-badge">#${p.rank}</span>
                    <span>${p.zone} • ~${p.estWaitMins}m wait</span>
                </label>
            `;
            container.appendChild(row);

            row.querySelector("input").addEventListener("change", updateSelectedCount);
        });
    }

    // 3. Populate Mode 2 Anchor Dropdowns
    function populateAnchorDropdowns(list) {
        const firstSelect = document.getElementById("first-pandal-select");
        const lastSelect = document.getElementById("last-pandal-select");
        if (!firstSelect || !lastSelect) return;

        firstSelect.innerHTML = "";
        lastSelect.innerHTML = "";

        const sorted = [...list].sort((a, b) => a.rank - b.rank);
        sorted.forEach(p => {
            firstSelect.insertAdjacentHTML("beforeend", `<option value="${p.id}">${p.name} (${p.zone}) - #${p.rank}</option>`);
            lastSelect.insertAdjacentHTML("beforeend", `<option value="${p.id}">${p.name} (${p.zone}) - #${p.rank}</option>`);
        });

        if (sorted.length > 1) {
            lastSelect.selectedIndex = 1;
        }
    }

    function updateSelectedCount() {
        const checked = document.querySelectorAll("#pandal-checkbox-container input[type='checkbox']:checked");
        const countSpan = document.getElementById("selected-count");
        if (countSpan) countSpan.textContent = checked.length;
    }

    // Initialize UI
    renderPandalUI(pandalData);
    populateAnchorDropdowns(pandalData);
    updateSelectedCount();

    // 4. Tab Mode Switcher
    const btnTransit = document.getElementById("btn-mode-transit");
    const btnPandals = document.getElementById("btn-mode-pandals");
    const transitInputs = document.getElementById("mode-transit-inputs");
    const pandalInputs = document.getElementById("mode-pandal-inputs");

    btnTransit?.addEventListener("click", () => {
        currentMode = "transit";
        btnTransit.classList.add("active");
        btnPandals.classList.remove("active");
        transitInputs.classList.remove("hidden");
        pandalInputs.classList.add("hidden");
    });

    btnPandals?.addEventListener("click", () => {
        currentMode = "pandals";
        btnPandals.classList.add("active");
        btnTransit.classList.remove("active");
        pandalInputs.classList.remove("hidden");
        transitInputs.classList.add("hidden");
    });

    // 5. Zone Filter Buttons
    document.querySelectorAll(".zone-pill").forEach(pill => {
        pill.addEventListener("click", (e) => {
            document.querySelectorAll(".zone-pill").forEach(p => p.classList.remove("active"));
            e.target.classList.add("active");
            const selectedZone = e.target.dataset.zone;

            document.querySelectorAll(".pandal-row").forEach(row => {
                const zone = row.dataset.zone || "";
                if (selectedZone === "all" || zone.toLowerCase().includes(selectedZone.toLowerCase())) {
                    row.style.display = "flex";
                } else {
                    row.style.display = "none";
                }
            });
        });
    });

    // 6. Select All / Clear
    document.getElementById("select-all-btn")?.addEventListener("click", () => {
        document.querySelectorAll("#pandal-checkbox-container input[type='checkbox']").forEach(cb => cb.checked = true);
        updateSelectedCount();
    });

    document.getElementById("clear-all-btn")?.addEventListener("click", () => {
        document.querySelectorAll("#pandal-checkbox-container input[type='checkbox']").forEach(cb => cb.checked = false);
        updateSelectedCount();
    });

    // 7. GPS Trigger
    // --- Continuous Live GPS Tracking Engine (Shared across all modes) ---
    let liveWatchId = null;
    let liveUserCoords = null;
    let userAccuracyCircle = null;

    function startLiveTracking(autoPan = true) {
        if (!navigator.geolocation) {
            alert("Geolocation is not supported by your browser.");
            return;
        }

        const floatingBtn = document.getElementById("live-recenter-btn");

        if (liveWatchId !== null) {
            // If already tracking, re-center map onto user
            if (liveUserCoords) {
                map.setView(liveUserCoords, 16);
            }
            return;
        }

        floatingBtn.classList.add("tracking-active");
        floatingBtn.querySelector(".gps-text").textContent = "Tracking...";

        liveWatchId = navigator.geolocation.watchPosition(
            (pos) => {
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;
                const accuracy = pos.coords.accuracy;
                liveUserCoords = [lat, lng];

                // Store in shared hubs object
                transitHubs.current_gps = { name: "Current GPS Location", coords: liveUserCoords };

                // Update or create GPS Marker
                if (userLocationMarker) {
                    userLocationMarker.setLatLng(liveUserCoords);
                } else {
                    userLocationMarker = L.circleMarker(liveUserCoords, {
                        radius: 8,
                        color: "#ffffff",
                        fillColor: "#007bff",
                        fillOpacity: 1,
                        weight: 3
                    }).addTo(map).bindPopup("<strong>You are here (Live)</strong>");
                }

                // Update Accuracy Circle
                if (userAccuracyCircle) {
                    userAccuracyCircle.setLatLng(liveUserCoords).setRadius(accuracy);
                } else {
                    userAccuracyCircle = L.circle(liveUserCoords, {
                        radius: accuracy,
                        color: "#007bff",
                        fillColor: "#007bff",
                        fillOpacity: 0.12,
                        weight: 1
                    }).addTo(map);
                }

                if (autoPan) {
                    map.setView(liveUserCoords, 15);
                    autoPan = false; // Only auto-center on first acquisition
                }

                floatingBtn.querySelector(".gps-text").textContent = "Live Active";
            },
            (err) => {
                console.error("GPS Error:", err);
                floatingBtn.classList.remove("tracking-active");
                floatingBtn.querySelector(".gps-text").textContent = "Live Track";
                alert("Could not access live GPS. Check location permissions.");
                liveWatchId = null;
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 3000 }
        );
    }

    // Map floating tracking button
    document.getElementById("live-recenter-btn")?.addEventListener("click", () => {
        startLiveTracking(true);
    });

    // Mode 1: Locate Me
    document.getElementById("locate-me-btn")?.addEventListener("click", () => {
        startLiveTracking(true);
        const select = document.getElementById("start-hub");
        if (!select.querySelector("option[value='current_gps']")) {
            select.insertAdjacentHTML("afterbegin", '<option value="current_gps" selected>📍 Current GPS Location</option>');
        }
        select.value = "current_gps";
    });

    // Mode 2: Start from GPS
    document.getElementById("locate-me-mode2-btn")?.addEventListener("click", () => {
        startLiveTracking(true);
        const select = document.getElementById("first-pandal-select");
        if (!select.querySelector("option[value='current_gps']")) {
            select.insertAdjacentHTML("afterbegin", '<option value="current_gps" selected>📍 Live GPS Location</option>');
        }
        select.value = "current_gps";
    });

    // Haversine formula
    function haversine(c1, c2) {
        const R = 6371;
        const dLat = (c2[0] - c1[0]) * Math.PI / 180;
        const dLon = (c2[1] - c1[1]) * Math.PI / 180;
        const a = Math.sin(dLat/2)**2 + Math.cos(c1[0]*Math.PI/180) * Math.cos(c2[0]*Math.PI/180) * Math.sin(dLon/2)**2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    }

    // 8. Calculate Route
    document.getElementById("calculate-route-btn")?.addEventListener("click", () => {
        let startNode, endNode;
        let intermediatePandals = [];

        const checkedIds = Array.from(
            document.querySelectorAll("#pandal-checkbox-container input[type='checkbox']:checked")
        ).map(cb => cb.value);

        if (currentMode === "transit") {
            const startKey = document.getElementById("start-hub").value;
            const endKey = document.getElementById("end-hub").value;

            if (checkedIds.length === 0) {
                alert("Please select at least one pandal from the list!");
                return;
            }

            startNode = { name: transitHubs[startKey].name, coords: transitHubs[startKey].coords, wait: 0 };
            endNode = { name: transitHubs[endKey].name, coords: transitHubs[endKey].coords, wait: 0 };
            intermediatePandals = pandalData.filter(p => checkedIds.includes(p.id));
        } else {
                 // Mode 2: Pandal-to-Pandal
                 const firstId = document.getElementById("first-pandal-select").value;
                 const lastId = document.getElementById("last-pandal-select").value;
                 if (firstId === lastId) {
                     alert("Your 1st Anchor and Exit Anchor pandals must be different!");
                     return;
                    }
            
                 // Check if start is live GPS or a pandal
                 if (firstId === "current_gps") {
                     if (!liveUserCoords) {
                            alert("Live GPS is still locating. Please wait a second and retry.");
                            return;
                        }
                     startNode = { name: "📍 Current Location", coords: liveUserCoords, wait: 0 };
                    } else {
                        const p1 = pandalData.find(p => p.id === firstId);
                        startNode = { name: `🥇 ${p1.name}`, coords: [p1.lat, p1.lng], wait: p1.estWaitMins };
                    }
            
                 const p2 = pandalData.find(p => p.id === lastId);
                 endNode = { name: `🏁 ${p2.name}`, coords: [p2.lat, p2.lng], wait: p2.estWaitMins };
            
                 // Exclude selected start & end from intermediate pool
                 intermediatePandals = pandalData.filter(p => checkedIds.includes(p.id) && p.id !== firstId && p.id !== lastId);
                }

        // Greedy Nearest-Neighbor Route Solver
        let unvisited = [...intermediatePandals];
        let currCoords = startNode.coords;
        let route = [startNode];

        while (unvisited.length > 0) {
            unvisited.sort((a, b) => haversine(currCoords, [a.lat, a.lng]) - haversine(currCoords, [b.lat, b.lng]));
            const next = unvisited.shift();
            route.push({ name: next.name, coords: [next.lat, next.lng], wait: next.estWaitMins });
            currCoords = [next.lat, next.lng];
        }
        route.push(endNode);

        // Distance & Time Totals
        let totalKm = 0;
        for (let i = 0; i < route.length - 1; i++) {
            totalKm += haversine(route[i].coords, route[i+1].coords);
        }
        const walkMins = Math.round((totalKm / 4.2) * 60);
        const waitMins = route.reduce((sum, r) => sum + r.wait, 0);

        // Render Path
        if (currentRouteLayer) map.removeLayer(currentRouteLayer);
        orderMarkersGroup.clearLayers();

        const latLngs = route.map(r => r.coords);
        currentRouteLayer = L.polyline(latLngs, {
            color: "#b22222",
            weight: 5,
            opacity: 0.85,
            dashArray: "8, 6"
        }).addTo(map);

        map.fitBounds(currentRouteLayer.getBounds(), { padding: [40, 40] });

        // Add numbered stop badges
        route.forEach((stop, idx) => {
            const isStart = idx === 0;
            const isEnd = idx === route.length - 1;
            const badgeColor = isStart ? "#2e7d32" : isEnd ? "#1565c0" : "#b22222";
            const label = isStart ? "Start" : isEnd ? "Exit" : `${idx}`;

            const icon = L.divIcon({
                className: "seq-marker",
                html: `<div style="background:${badgeColor};color:#fff;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);">${label}</div>`,
                iconSize: [26, 26],
                iconAnchor: [13, 13]
            });
            L.marker(stop.coords, { icon }).addTo(orderMarkersGroup).bindPopup(`<strong>${stop.name}</strong>`);
        });

        // Summary details
        const resultsEl = document.getElementById("results-panel");
        resultsEl.classList.remove("hidden");
        document.getElementById("stats-summary").innerHTML = `
            <strong>Active Mode:</strong> ${currentMode === "transit" ? "Transit Hubs" : "Pandal-to-Pandal Hop"}<br>
            <strong>Total Walking:</strong> ~${totalKm.toFixed(2)} km (~${walkMins} mins)<br>
            <strong>Queue Wait Time:</strong> ~${waitMins} mins<br>
            <strong>Total Hopper Duration:</strong> ~${walkMins + waitMins} mins
        `;

        const timeline = document.getElementById("timeline-list");
        timeline.innerHTML = "";
        route.forEach(stop => {
            const li = document.createElement("li");
            li.textContent = stop.wait > 0 ? `${stop.name} (~${stop.wait}m wait)` : stop.name;
            timeline.appendChild(li);
        });

        resultsEl.scrollIntoView({ behavior: "smooth" });
    });
    // --- Mobile Screen Switcher (List <-> Map) ---
    const tabListBtn = document.getElementById("tab-list-btn");
    const tabMapBtn = document.getElementById("tab-map-btn");
    const sidebarPanel = document.getElementById("sidebar-panel");
    const mapElement = document.getElementById("map");

    function switchToMap() {
        if (window.innerWidth <= 860) {
            sidebarPanel.classList.add("mobile-hidden");
            mapElement.classList.remove("mobile-hidden");
            tabMapBtn.classList.add("active");
            tabListBtn.classList.remove("active");
            map.invalidateSize();
        }
    }

    function switchToList() {
        if (window.innerWidth <= 860) {
            mapElement.classList.add("mobile-hidden");
            sidebarPanel.classList.remove("mobile-hidden");
            tabListBtn.classList.add("active");
            tabMapBtn.classList.remove("active");
        }
    }

    tabMapBtn?.addEventListener("click", switchToMap);
    tabListBtn?.addEventListener("click", switchToList);

    // Automatically switch to the map when route calculation finishes on mobile
    const originalCalculate = document.getElementById("calculate-route-btn");
    originalCalculate?.addEventListener("click", () => {
        if (window.innerWidth <= 860) {
            setTimeout(switchToMap, 400);
        }
    });

    // Handle screen resize events
    window.addEventListener("resize", () => {
        if (window.innerWidth > 860) {
            sidebarPanel.classList.remove("mobile-hidden");
            mapElement.classList.remove("mobile-hidden");
        }
        map.invalidateSize();
    });
});