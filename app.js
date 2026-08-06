// app.js - Live Client Logic for AxisStream Dashboard

document.addEventListener("DOMContentLoaded", () => {
    console.log("Initializing AxisStream Dashboard App...");
    
    // Check if data is loaded
    if (typeof WEATHER_TELEMETRY === "undefined" || typeof JANES_FORECAST === "undefined") {
        console.error("Error: data.js not loaded. Please run prepare_data.py first.");
        return;
    }
    
    // State
    let currentTab = "dashboard";
    let logPage = 1;
    const logRowsPerPage = 15;
    let filteredLogs = [...WEATHER_TELEMETRY];
    let trendChartInstance = null;
    
    // --- DOM Elements ---
    const navItems = document.querySelectorAll(".sidebar-nav li");
    const tabs = document.querySelectorAll(".tab-content");
    const updateTimeEl = document.getElementById("update-time");
    const btnBackNav = document.getElementById("btn-back-nav");
    const syncIcon = document.getElementById("sync-icon");
    
    // --- NAVIGATION HISTORY STATE ---
    let tabHistory = [];
    let isBackNavigating = false;

    // --- AUTH DOM Elements ---
    const authContainer = document.getElementById("auth-container");
    const appContainer = document.querySelector(".app-container");
    
    const loginCard = document.getElementById("login-card");
    const registerCard = document.getElementById("register-card");
    const loginForm = document.getElementById("login-form");
    const registerForm = document.getElementById("register-form");
    
    const loginEmailInput = document.getElementById("login-email");
    const loginPasswordInput = document.getElementById("login-password");
    const loginError = document.getElementById("login-error");
    
    const registerNameInput = document.getElementById("register-name");
    const registerEmailInput = document.getElementById("register-email");
    const registerPasswordInput = document.getElementById("register-password");
    const registerConfirmInput = document.getElementById("register-confirm");
    const registerError = document.getElementById("register-error");
    
    const toRegisterLink = document.getElementById("to-register");
    const toLoginLink = document.getElementById("to-login");
    const logoutBtn = document.getElementById("btn-logout");
    
    const userAvatarEl = document.getElementById("user-avatar");
    const userNameEl = document.getElementById("user-name");
    const userEmailEl = document.getElementById("user-email");

    // --- PROJECT DOM Elements ---
    const btnAddProject = document.getElementById("btn-add-project");
    const projectModal = document.getElementById("project-modal");
    const btnCloseModal = document.getElementById("btn-close-modal");
    const projectForm = document.getElementById("project-form");
    
    const projectEditIndexInput = document.getElementById("project-edit-index");
    const projectNameInput = document.getElementById("project-name-input");
    const projectIdInput = document.getElementById("project-id-input");
    const projectSchemaInput = document.getElementById("project-schema-input");
    const projectsGrid = document.getElementById("projects-grid");
    const modalTitle = document.getElementById("modal-title");

    // --- PROJECT STATE ---
    let projectsList = [];
    let activeProjectId = localStorage.getItem("axt_active_project_id") || null;

    // Load projects list from localStorage
    // --- DETAILS MODAL DOM Elements ---
    const detailsModal = document.getElementById("details-modal");
    const btnCloseDetails = document.getElementById("btn-close-details");
    const detailsModalTitle = document.getElementById("details-modal-title");
    const btnModalChartTab = document.getElementById("btn-modal-chart-tab");
    const btnModalLogTab = document.getElementById("btn-modal-log-tab");
    const detailsModalChartView = document.getElementById("details-modal-chart-view");
    const detailsModalLogView = document.getElementById("details-modal-log-view");
    const detailsModalLogBody = document.getElementById("details-modal-log-body");

    // --- DETAILS MODAL STATE ---
    let detailsChartInstance = null;
    function loadProjectsList() {
        const projsJSON = localStorage.getItem("axt_projects");
        let list = [];
        if (projsJSON) {
            try {
                list = JSON.parse(projsJSON);
            } catch (e) {}
        }
        
        if (list && list.length > 0) {
            // Automatically migrate and rename old project names if they exist in localStorage
            projectsList = list.map(p => {
                if (p.name === "TANBAOCORP_Demo") p.name = "LINHBEOCORP";
                if (p.name === "TBSG") p.name = "LBLB";
                return p;
            });
            saveProjectsList();
        } else {
            // Seed the default projects of the scraped AxisStream web data
            projectsList = [
                {
                    name: "LINHBEOCORP",
                    id: "1b73e2fe-1e6c-46c6-8534-82c0e03be283",
                    schema: "tanbaocorp"
                },
                {
                    name: "LBLB",
                    id: "1c623db4-80a3-4523-9aa4-979c8620a7a9",
                    schema: "tbsg"
                }
            ];
            saveProjectsList();
            activeProjectId = "1b73e2fe-1e6c-46c6-8534-82c0e03be283";
            localStorage.setItem("axt_active_project_id", activeProjectId);
        }
    }

    function saveProjectsList() {
        localStorage.setItem("axt_projects", JSON.stringify(projectsList));
    }

    // --- AUTH LOGIC ---
    
    // Default Admin User Config
    const DEFAULT_ADMIN = {
        name: "Linh",
        email: "linh@linhbeocorp.vn",
        password: "Linhbeo@123"
    };

    // Get users array from localStorage, or initialize it
    function getLocalUsers() {
        const usersJSON = localStorage.getItem("axt_users");
        return usersJSON ? JSON.parse(usersJSON) : [];
    }

    function saveLocalUser(user) {
        const users = getLocalUsers();
        users.push(user);
        localStorage.setItem("axt_users", JSON.stringify(users));
    }

    // Toggle between Login and Register Cards
    toRegisterLink.addEventListener("click", (e) => {
        e.preventDefault();
        loginCard.classList.add("hidden");
        registerCard.classList.remove("hidden");
        loginError.textContent = "";
        registerError.textContent = "";
    });

    toLoginLink.addEventListener("click", (e) => {
        e.preventDefault();
        registerCard.classList.add("hidden");
        loginCard.classList.remove("hidden");
        loginError.textContent = "";
        registerError.textContent = "";
    });

    // Check auth on load
    const savedUser = localStorage.getItem("axt_current_user");
    if (savedUser) {
        try {
            const user = JSON.parse(savedUser);
            loginSuccess(user);
        } catch (e) {
            showAuthScreen();
        }
    } else {
        showAuthScreen();
    }

    function showAuthScreen() {
        authContainer.style.display = "flex";
        appContainer.style.display = "none";
        
        const navUsers = document.getElementById("nav-users");
        if (navUsers) navUsers.style.display = "none";
    }

    function loginSuccess(user) {
        authContainer.style.display = "none";
        appContainer.style.display = "flex";
        
        // Check if user is the admin to show/hide the User Management tab
        const navUsers = document.getElementById("nav-users");
        if (navUsers) {
            if (user.email === DEFAULT_ADMIN.email) {
                navUsers.style.display = "flex";
            } else {
                navUsers.style.display = "none";
                // If they are a standard user, redirect them away if they were somehow on the users tab
                if (currentTab === "users") {
                    currentTab = "dashboard";
                    const dashboardNav = document.querySelector('[data-target="dashboard"]');
                    if (dashboardNav) {
                        navItems.forEach(n => n.classList.remove("active"));
                        dashboardNav.classList.add("active");
                    }
                    tabs.forEach(t => t.classList.remove("active"));
                    const dashTab = document.getElementById("dashboard-tab");
                    if (dashTab) dashTab.classList.add("active");
                }
            }
        }
        
        // Populate profile info in sidebar
        userNameEl.textContent = user.name;
        userEmailEl.textContent = user.email;
        userAvatarEl.textContent = user.name.charAt(0).toUpperCase();
        
        // Load projects list and check active status
        loadProjectsList();
        checkActiveProject();
    }

    // Handle Login Submit
    loginForm.addEventListener("submit", (e) => {
        e.preventDefault();
        loginError.textContent = "";
        
        const email = loginEmailInput.value.trim().toLowerCase();
        const password = loginPasswordInput.value;
        
        // 1. Check default admin
        if (email === DEFAULT_ADMIN.email && password === DEFAULT_ADMIN.password) {
            const user = { name: DEFAULT_ADMIN.name, email: DEFAULT_ADMIN.email };
            localStorage.setItem("axt_current_user", JSON.stringify(user));
            loginSuccess(user);
            return;
        }
        
        // 2. Check local registered users
        const users = getLocalUsers();
        const matchedUser = users.find(u => u.email === email && u.password === password);
        
        if (matchedUser) {
            const user = { name: matchedUser.name, email: matchedUser.email };
            localStorage.setItem("axt_current_user", JSON.stringify(user));
            loginSuccess(user);
        } else {
            loginError.textContent = "Invalid email or password.";
        }
    });

    // Handle Register Submit
    registerForm.addEventListener("submit", (e) => {
        e.preventDefault();
        registerError.textContent = "";
        
        const name = registerNameInput.value.trim();
        const email = registerEmailInput.value.trim().toLowerCase();
        const password = registerPasswordInput.value;
        const confirm = registerConfirmInput.value;
        
        // Validation checks
        if (password !== confirm) {
            registerError.textContent = "Passwords do not match.";
            return;
        }
        
        if (password.length < 4) {
            registerError.textContent = "Password must be at least 4 characters.";
            return;
        }
        
        // Check if email already exists
        if (email === DEFAULT_ADMIN.email) {
            registerError.textContent = "This email is already registered.";
            return;
        }
        
        const users = getLocalUsers();
        if (users.some(u => u.email === email)) {
            registerError.textContent = "This email is already registered.";
            return;
        }
        
        // Save user
        const newUser = { name, email, password };
        saveLocalUser(newUser);
        
        // Auto log in after sign up
        const userSession = { name, email };
        localStorage.setItem("axt_current_user", JSON.stringify(userSession));
        
        // Reset form
        registerForm.reset();
        loginSuccess(userSession);
    });

    // Handle Logout
    logoutBtn.addEventListener("click", () => {
        localStorage.removeItem("axt_current_user");
        loginForm.reset();
        showAuthScreen();
    });

    
    // Tab switching
    navItems.forEach(item => {
        item.addEventListener("click", () => {
            const targetTab = item.getAttribute("data-target");
            
            // Update active navigation item
            navItems.forEach(nav => nav.classList.remove("active"));
            item.classList.add("active");
            
            // Switch tabs
            tabs.forEach(tab => {
                tab.classList.remove("active");
                tab.style.display = "none";
            });
            const targetEl = document.getElementById(`${targetTab}-tab`);
            if (targetEl) {
                targetEl.classList.add("active");
                targetEl.style.display = "flex";
            }
            
            if (!isBackNavigating && currentTab !== targetTab) {
                if (tabHistory.length === 0 || tabHistory[tabHistory.length - 1] !== currentTab) {
                    tabHistory.push(currentTab);
                    if (tabHistory.length > 20) tabHistory.shift();
                }
            }
            
            currentTab = targetTab;
            console.log(`Switched to tab: ${currentTab}`);
            updateBackButtonVisibility();
            
            // Re-render chart if switching back to dashboard
            if (currentTab === "dashboard") {
                renderTrendChart();
            } else if (currentTab === "users") {
                populateUserTable();
            } else if (currentTab === "projects") {
                populateProjectsList();
            }
        });
    });



    // --- Core Functions ---
    
    function setMockDeviceState(deviceName) {
        // Simple blank state mock for other devices
        const fields = ["val-temp", "val-humidity", "val-rainfall", "val-wind", "val-rainfall-total", "val-wind-dir", "val-pressure", "val-solar", "val-uv", "val-deltat"];
        fields.forEach(f => {
            const el = document.getElementById(f);
            if (el) el.textContent = "--";
        });
        document.getElementById("update-time").textContent = "Device Connecting...";
        
        // Clear chart
        if (trendChartInstance) {
            trendChartInstance.destroy();
            trendChartInstance = null;
        }
    }

    function generateAgriculturalAdvisory() {
        const recent = JANES_FORECAST.recentData || {};
        const daily = (JANES_FORECAST.dailyData && JANES_FORECAST.dailyData[0]) || {};
        
        const temp = parseFloat(recent.temperature) || 25;
        const humidity = parseFloat(recent.humidity) || 60;
        const rainProb = parseFloat(recent.rainfallProbability) || 0;
        const wind = parseFloat(recent.windSpeed) || 10;
        const uv = parseFloat(recent.uvIndex) || 5;
        const soilMoisture = parseFloat(recent.soil_moisture_0_10) || 0;
        
        let cropStatus = "Favorable";
        let cropIcon = "mdi-leaf";
        let cropColor = "var(--green)";
        let cropDesc = "Conditions are highly favorable for crop growth and photosynthesis.";
        let cropAction = "Standard watering routine and scheduled weeding.";
        
        let livestockStatus = "Comfortable";
        let livestockIcon = "mdi-cow";
        let livestockColor = "var(--green)";
        let livestockDesc = "Livestock are experiencing a stable thermal neutral zone.";
        let livestockAction = "Ensure continuous supply of fresh drinking water.";
        
        let prediction = "No major weather alerts. Harvesting and field operations can proceed as scheduled.";
        let predictionIcon = "mdi-check-decagram";
        
        // Rules for Crops
        if (temp > 30) {
            cropStatus = "Heat Stress Risk";
            cropIcon = "mdi-alert-outline";
            cropColor = "var(--orange)";
            cropDesc = "High heat may accelerate evaporation and cause leaf wilting.";
            cropAction = "Apply mulching to retain moisture; increase watering frequency.";
        } else if (temp < 15) {
            cropStatus = "Cold Stress Risk";
            cropIcon = "mdi-snowflake";
            cropColor = "var(--blue)";
            cropDesc = "Cooler weather slows down cell division and delays fruit ripening.";
            cropAction = "Deploy protective covers; reduce moisture applications.";
        }
        
        if (soilMoisture === 0 && temp > 25) {
            cropStatus = "Dehydrated Soil";
            cropIcon = "mdi-water-off";
            cropColor = "var(--red)";
            cropDesc = "Severe low moisture (0.00 kg/m²) detected at the 0-10cm crop root zone.";
            cropAction = "Critical: Initiate deep irrigation cycles immediately.";
        }
        
        if (rainProb > 40) {
            cropStatus = "Rainfall Anticipated";
            cropIcon = "mdi-weather-rainy";
            cropColor = "var(--primary)";
            cropDesc = "Elevated chance of precipitation. Potential for nutrient run-off.";
            cropAction = "Suspend fertilizer spreading until the topsoil dries.";
        }
        
        // Rules for Livestock
        if (temp > 30 && humidity > 70) {
            livestockStatus = "Severe Heat Strain";
            livestockIcon = "mdi-alert-circle";
            livestockColor = "var(--red)";
            livestockDesc = "Dangerous Temperature-Humidity Index (THI). Extreme heat stress potential.";
            livestockAction = "Activate ventilation fans/misters in barns; keep herds shaded.";
        } else if (temp > 28) {
            livestockStatus = "Mild Heat Stress";
            livestockIcon = "mdi-alert-outline";
            livestockColor = "var(--orange)";
            livestockDesc = "High temperatures may reduce feed intake and animal comfort.";
            livestockAction = "Provide electrolyte-rich drinking water; avoid transport.";
        } else if (temp < 12) {
            livestockStatus = "Cold Stress";
            livestockIcon = "mdi-snowflake";
            livestockColor = "var(--blue)";
            livestockDesc = "Chilly air requires animals to burn more energy to stay warm.";
            livestockAction = "Ensure dry bedding; increase calorie portions in feed.";
        }
        
        // Predictions
        if (wind > 22) {
            prediction = "High wind gusts predicted. Secure light structures and postpone drone or tractor spray operations.";
            predictionIcon = "mdi-weather-windy";
        } else if (rainProb > 60) {
            prediction = "Heavy rain expected. Soil compaction and runoff risk. Delay field entry with heavy machinery.";
            predictionIcon = "mdi-weather-pouring";
        } else if (uv > 8) {
            prediction = "Very high UV index. Intense sunlight increases evapotranspiration. Soil moisture will drop rapidly.";
            predictionIcon = "mdi-white-balance-sunny";
        }
        
        return {
            crop: { status: cropStatus, icon: cropIcon, color: cropColor, desc: cropDesc, action: cropAction },
            livestock: { status: livestockStatus, icon: livestockIcon, color: livestockColor, desc: livestockDesc, action: livestockAction },
            prediction: { text: prediction, icon: predictionIcon }
        };
    }

    function loadDashboardData() {
        if (!WEATHER_TELEMETRY || WEATHER_TELEMETRY.length === 0) {
            console.warn("No telemetry data found.");
            return;
        }
        
        // Spin sync icon briefly
        syncIcon.classList.add("spinning");
        setTimeout(() => syncIcon.classList.remove("spinning"), 800);
        
        // Get the latest telemetry record (index 0)
        const latest = WEATHER_TELEMETRY[0];
        
        // Set update time
        if (latest.time) {
            const date = new Date(latest.time);
            updateTimeEl.textContent = "Live as of " + date.toLocaleTimeString("en-AU", {hour: '2-digit', minute:'2-digit'}) + " " + date.toLocaleDateString("en-AU", {day: 'numeric', month: 'short'});
        }
        
        // Update metric values (match keys from JSON payload)
        document.getElementById("val-temp").textContent = latest.temperature_avg || "--";
        document.getElementById("val-humidity").textContent = latest.humidity_avg || "--";
        document.getElementById("val-rainfall").textContent = latest.rainfall || "0.00";
        document.getElementById("val-rainfall-total").textContent = latest.rainfall_total || "--";
        document.getElementById("val-wind").textContent = latest.wind_speed_avg || "0.0";
        document.getElementById("val-wind-dir").textContent = latest.wind_dir_var_avg || "--";
        
        // Sub-metrics
        document.getElementById("val-pressure").textContent = latest.msl_pressure ? `${latest.msl_pressure} hPa` : "-- hPa";
        document.getElementById("val-solar").textContent = latest.solar_rad_avg ? `${latest.solar_rad_avg} W/m²` : "-- W/m²";
        document.getElementById("val-uv").textContent = latest.uv_index_avg || "--";
        document.getElementById("val-deltat").textContent = latest.deltat_avg ? `${latest.deltat_avg} °C` : "-- °C";
        
        // Populate Soil table from Jane's recentData (which holds the soil probe metrics!)
        populateSoilProbe();
        
        // Update Dashboard Forecast Widget
        const recentForecast = JANES_FORECAST.recentData || {};
        const dailyForecast = (JANES_FORECAST.dailyData && JANES_FORECAST.dailyData[0]) || {};
        
        const dashForecastIcon = document.getElementById("dash-forecast-icon");
        const dashForecastTemp = document.getElementById("dash-forecast-temp");
        const dashForecastText = document.getElementById("dash-forecast-text");
        
        if (dashForecastIcon && dashForecastTemp && dashForecastText) {
            if (recentForecast.weatherIcon) {
                dashForecastIcon.src = getLocalWeatherIconUrl(recentForecast.weatherIcon);
                dashForecastIcon.style.display = "block";
            } else {
                dashForecastIcon.style.display = "none";
            }
            
            const maxTemp = dailyForecast.temperatureMax || "--";
            const minTemp = dailyForecast.temperatureMin || "--";
            dashForecastTemp.textContent = `${minTemp}° – ${maxTemp}°`;
            
            dashForecastText.textContent = recentForecast.weatherSummary || "No forecast summary available";
        }
        
        // Update Smart Farm Advisor Widget
        const advisory = generateAgriculturalAdvisory();
        
        const advisorCropStatus = document.getElementById("advisor-crop-status");
        const advisorCropDesc = document.getElementById("advisor-crop-desc");
        const advisorCropAction = document.getElementById("advisor-crop-action");
        const advisorCropIcon = document.getElementById("advisor-crop-icon");
        
        const advisorLiveStatus = document.getElementById("advisor-live-status");
        const advisorLiveDesc = document.getElementById("advisor-live-desc");
        const advisorLiveAction = document.getElementById("advisor-live-action");
        const advisorLiveIcon = document.getElementById("advisor-live-icon");
        
        const advisorAlertText = document.getElementById("advisor-alert-text");
        const advisorAlertIcon = document.getElementById("advisor-alert-icon");
        const advisorAlertBox = document.getElementById("advisor-alert-box");
        
        if (advisorCropStatus) {
            advisorCropStatus.textContent = advisory.crop.status;
            advisorCropStatus.style.color = advisory.crop.color;
            advisorCropDesc.textContent = advisory.crop.desc;
            advisorCropAction.textContent = advisory.crop.action;
            if (advisorCropIcon) {
                advisorCropIcon.className = `mdi ${advisory.crop.icon}`;
                advisorCropIcon.style.color = advisory.crop.color;
            }
        }
        
        if (advisorLiveStatus) {
            advisorLiveStatus.textContent = advisory.livestock.status;
            advisorLiveStatus.style.color = advisory.livestock.color;
            advisorLiveDesc.textContent = advisory.livestock.desc;
            advisorLiveAction.textContent = advisory.livestock.action;
            if (advisorLiveIcon) {
                advisorLiveIcon.className = `mdi ${advisory.livestock.icon}`;
                advisorLiveIcon.style.color = advisory.livestock.color;
            }
        }
        
        if (advisorAlertText) {
            advisorAlertText.textContent = advisory.prediction.text;
            if (advisorAlertIcon) {
                advisorAlertIcon.className = `mdi ${advisory.prediction.icon}`;
            }
        }
        
        // Render Chart
        renderTrendChart();
    }
    
    function populateSoilProbe() {
        const tbody = document.getElementById("soil-table-body");
        tbody.innerHTML = "";
        
        const recent = JANES_FORECAST.recentData || {};
        
        const depths = [
            { name: "Surface (0 cm)", moisture: "-", temp: recent.soil_temp || "--" },
            { name: "0 – 1 cm", moisture: recent.soil_moisture_0_1 || "--", temp: "-" },
            { name: "0 – 10 cm", moisture: recent.soil_moisture_0_10 || "--", temp: recent.soil_temp_0_10 || "--" },
            { name: "10 – 28 cm", moisture: recent.soil_moisture_10_28 || "--", temp: recent.soil_temp_10_28 || "--" },
            { name: "28 – 100 cm", moisture: recent.soil_moisture_28_100 || "--", temp: recent.soil_temp_28_100 || "--" },
            { name: "100 – 289 cm", moisture: recent.soil_moisture_100_289 || "--", temp: recent.soil_temp_100_289 || "--" }
        ];
        
        depths.forEach(d => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${d.name}</td>
                <td>${d.moisture}</td>
                <td>${d.temp}</td>
            `;
            tbody.appendChild(tr);
        });
    }
    
    function renderTrendChart() {
        const ctx = document.getElementById("trendChart").getContext("2d");
        
        if (trendChartInstance) {
            trendChartInstance.destroy();
        }
        
        // Get the latest 12 records for rendering trend, reverse to chronological order
        const chartData = [...WEATHER_TELEMETRY].slice(0, 12).reverse();
        
        const labels = chartData.map(d => {
            const t = new Date(d.time);
            return t.toLocaleTimeString("en-AU", {hour: '2-digit', minute:'2-digit'});
        });
        
        const temps = chartData.map(d => parseFloat(d.temperature_avg) || 0);
        const humidities = chartData.map(d => parseFloat(d.humidity_avg) || 0);
        
        trendChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Temperature (°C)',
                        data: temps,
                        borderColor: '#ff5e7e',
                        backgroundColor: 'rgba(255, 94, 126, 0.1)',
                        borderWidth: 3,
                        tension: 0.4,
                        yAxisID: 'y'
                    },
                    {
                        label: 'Humidity (%)',
                        data: humidities,
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        borderWidth: 3,
                        tension: 0.4,
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: {
                            color: '#8b9bb4',
                            font: { family: 'Plus Jakarta Sans', weight: '600' }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: { color: '#8b9bb4', font: { family: 'Plus Jakarta Sans' } }
                    },
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: { color: '#8b9bb4' }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        grid: { drawOnChartArea: false },
                        ticks: { color: '#8b9bb4' }
                    }
                }
            }
        });
    }

    // --- Jane's Weather Forecast ---
    
    function loadForecastData() {
        if (!JANES_FORECAST || !JANES_FORECAST.location) {
            console.warn("No forecast data found.");
            return;
        }
        
        // Location & Update time
        document.getElementById("forecast-location").innerHTML = `<span class="mdi mdi-map-marker"></span> ${JANES_FORECAST.location}`;
        
        if (JANES_FORECAST.updateTime) {
            const date = new Date(JANES_FORECAST.updateTime);
            document.getElementById("forecast-update-time").textContent = "Updated " + date.toLocaleTimeString("en-AU", {hour: '2-digit', minute:'2-digit'});
        }
        
        // Recent / Backdrop details
        const recent = JANES_FORECAST.recentData || {};
        document.getElementById("forecast-main-temp").textContent = recent.temperature || "--";
        document.getElementById("forecast-summary-text").textContent = recent.weatherSummary || "...";
        
        document.getElementById("b-stat-rain").textContent = recent.rainfallProbability || "--%";
        document.getElementById("b-stat-wind").textContent = recent.windSpeed ? `${recent.windSpeed} km/h` : "-- km/h";
        document.getElementById("b-stat-pressure").textContent = recent.pressure ? `${recent.pressure} hPa` : "-- hPa";
        
        // Render dynamic weather Icon
        const iconWrap = document.getElementById("forecast-avatar-wrap");
        iconWrap.innerHTML = "";
        if (recent.weatherIcon) {
            const iconImg = document.createElement("img");
            iconImg.src = getLocalWeatherIconUrl(recent.weatherIcon);
            iconImg.alt = recent.weatherIconPrecis || "Weather Icon";
            iconWrap.appendChild(iconImg);
        }
        
        // Spray conditions
        const badge = document.getElementById("spray-badge");
        const title = document.getElementById("spray-title");
        const desc = document.getElementById("spray-desc");
        
        if (recent.sprayRating) {
            badge.textContent = recent.sprayRating;
            
            // Map rating to description text
            if (recent.sprayRating === "A") {
                title.textContent = "Excellent Conditions";
                desc.textContent = "Conditions are highly favorable for crop spraying operations. Wind speed and temperature are within ideal ranges.";
                badge.style.background = "#10b981"; // green
            } else if (recent.sprayRating === "B") {
                title.textContent = "Caution Advised";
                desc.textContent = "Conditions are moderate. Check local wind drifts or dew point changes before application.";
                badge.style.background = "#f59e0b"; // yellow
            } else {
                title.textContent = "Spraying Restricted";
                desc.textContent = "Spraying operations should be avoided. High wind speeds, thermal inversion risk, or extreme temperatures detected.";
                badge.style.background = "#ff5e7e"; // red
            }
        }
        
        // Update Forecast Planning Advisory
        const forecastAdvisory = generateAgriculturalAdvisory();
        const fAlertTitle = document.getElementById("forecast-alert-title");
        const fAlertDesc = document.getElementById("forecast-alert-desc");
        const fAlertIcon = document.getElementById("forecast-alert-icon");
        
        if (fAlertDesc) {
            fAlertDesc.textContent = forecastAdvisory.prediction.text;
            if (fAlertTitle) {
                if (forecastAdvisory.prediction.icon === "mdi-check-decagram") {
                    fAlertTitle.textContent = "Favorable Planning Suggestion";
                } else {
                    fAlertTitle.textContent = "Planning Alert & Notice";
                }
            }
            if (fAlertIcon) {
                fAlertIcon.className = `mdi ${forecastAdvisory.prediction.icon}`;
                fAlertIcon.style.color = forecastAdvisory.prediction.icon === "mdi-check-decagram" ? "var(--green)" : "var(--primary)";
            }
        }
        
        // Daily Grid Forecast
        populateDailyForecast();
    }
    
    function populateDailyForecast() {
        const grid = document.getElementById("daily-forecast-grid");
        grid.innerHTML = "";
        
        const dailyData = JANES_FORECAST.dailyData || [];
        // Skip first day (which is today) or show all
        dailyData.forEach((day, idx) => {
            const dateObj = new Date(day.time);
            const dayLabel = idx === 0 ? "Today" : idx === 1 ? "Tomorrow" : dateObj.toLocaleDateString("en-AU", {weekday: 'long'});
            const dateLabel = dateObj.toLocaleDateString("en-AU", {day: 'numeric', month: 'short'});
            
            const card = document.createElement("div");
            card.className = "daily-card";
            card.innerHTML = `
                <span class="day">${dayLabel}</span>
                <span class="date">${dateLabel}</span>
                <img src="${getLocalWeatherIconUrl(day.dayIcon)}" alt="${day.dayIconPrecis}">
                <span class="prob"><span class="mdi mdi-water"></span> ${day.rainfallProbability || "0%"}</span>
                <div class="temp-range">
                    <span class="max">${day.temperatureMax || "--"}°</span>
                    <span class="min">${day.temperatureMin || "--"}°</span>
                </div>
            `;
            grid.appendChild(card);
        });
    }

    // Maps the API icon name to standard openweather/weather icon URLs, or falls back to standard placeholder images
    function getLocalWeatherIconUrl(iconCode) {
        if (!iconCode) return "";
        // Map codes like SUNNY, CLOUDY, RAIN, etc. to nice emojis or public weather icons
        // AxisStream bundle imports them locally from assets, we can load clean icons from a CDN
        const mapping = {
            "SUNNY": "https://img.icons8.com/color/96/000000/sun.png",
            "CLOUDY": "https://img.icons8.com/color/96/000000/cloud.png",
            "PARTLY_CLOUDY": "https://img.icons8.com/color/96/000000/partly-cloudy-day.png",
            "MOSTLY_CLOUDY": "https://img.icons8.com/color/96/000000/partly-cloudy-day.png",
            "RAIN": "https://img.icons8.com/color/96/000000/rain.png",
            "SHOWERS": "https://img.icons8.com/color/96/000000/rain.png",
            "LIGHT_RAIN": "https://img.icons8.com/color/96/000000/rain.png",
            "SHOWER": "https://img.icons8.com/color/96/000000/rain.png",
            "THUNDERSTORM": "https://img.icons8.com/color/96/000000/storm.png",
            "POSSIBLE_STORM": "https://img.icons8.com/color/96/000000/storm.png",
            "WIND": "https://img.icons8.com/color/96/000000/wind.png",
            "FOG": "https://img.icons8.com/color/96/000000/fog-day.png",
            "NIGHT_CLEAR": "https://img.icons8.com/color/96/000000/bright-moon.png",
            "NIGHT_PARTLY_CLOUDY": "https://img.icons8.com/color/96/000000/cloud-moon.png"
        };
        return mapping[iconCode] || "https://img.icons8.com/color/96/000000/sun.png";
    }

    // --- Telemetry Logs Table ---
    
    function initLogsTable() {
        const headersRow = document.getElementById("logs-headers");
        headersRow.innerHTML = "";
        
        // Define Columns based on typical weather attributes
        const cols = [
            { code: "time", label: "Timestamp" },
            { code: "temperature_avg", label: "Temp (°C)" },
            { code: "humidity_avg", label: "Humidity (%)" },
            { code: "rainfall", label: "Rain (mm)" },
            { code: "rainfall_total", label: "Total Rain (mm)" },
            { code: "wind_speed_avg", label: "Wind (km/h)" },
            { code: "wind_dir_var_avg", label: "Wind Dir" },
            { code: "msl_pressure", label: "Pressure (hPa)" },
            { code: "solar_rad_avg", label: "Solar (W/m²)" }
        ];
        
        cols.forEach(c => {
            const th = document.createElement("th");
            th.textContent = c.label;
            th.setAttribute("data-code", c.code);
            headersRow.appendChild(th);
        });
        
        // Populate Logs stats in the logs tab header grid
        const statCount = document.getElementById("log-stat-count");
        const statStart = document.getElementById("log-stat-start");
        const statEnd = document.getElementById("log-stat-end");
        
        if (statCount && WEATHER_TELEMETRY && WEATHER_TELEMETRY.length > 0) {
            statCount.textContent = WEATHER_TELEMETRY.length.toLocaleString();
            
            // First record (earliest)
            const firstDate = new Date(WEATHER_TELEMETRY[WEATHER_TELEMETRY.length - 1].time);
            statStart.textContent = firstDate.toLocaleDateString("en-AU") + " " + firstDate.toLocaleTimeString("en-AU", {hour: '2-digit', minute:'2-digit'});
            
            // Latest record (newest)
            const latestDate = new Date(WEATHER_TELEMETRY[0].time);
            statEnd.textContent = latestDate.toLocaleDateString("en-AU") + " " + latestDate.toLocaleTimeString("en-AU", {hour: '2-digit', minute:'2-digit'});
        }
        
        renderLogsBody(cols);
        setupLogsEvents(cols);
    }
    
    function renderLogsBody(cols) {
        const tbody = document.getElementById("logs-body");
        tbody.innerHTML = "";
        
        const start = (logPage - 1) * logRowsPerPage;
        const end = start + logRowsPerPage;
        const pageData = filteredLogs.slice(start, end);
        
        pageData.forEach(row => {
            const tr = document.createElement("tr");
            cols.forEach(c => {
                const td = document.createElement("td");
                let val = row[c.code] || "";
                
                // Format timestamp
                if (c.code === "time" && val) {
                    try {
                        const d = new Date(val);
                        val = d.toLocaleDateString("en-AU") + " " + d.toLocaleTimeString("en-AU", {hour: '2-digit', minute:'2-digit'});
                    } catch {}
                }
                
                td.textContent = val;
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        });
        
        // Update pagination UI
        const pageInfo = document.getElementById("page-info");
        const totalPages = Math.ceil(filteredLogs.length / logRowsPerPage) || 1;
        pageInfo.textContent = `Showing page ${logPage} of ${totalPages} (Total: ${filteredLogs.length} rows)`;
        
        document.getElementById("btn-prev-page").disabled = logPage === 1;
        document.getElementById("btn-next-page").disabled = logPage >= totalPages;
    }
    
    function setupLogsEvents(cols) {
        const btnPrev = document.getElementById("btn-prev-page");
        const btnNext = document.getElementById("btn-next-page");
        const searchInput = document.getElementById("log-search");
        const btnExport = document.getElementById("btn-export");
        
        btnPrev.addEventListener("click", () => {
            if (logPage > 1) {
                logPage--;
                renderLogsBody(cols);
            }
        });
        
        btnNext.addEventListener("click", () => {
            const totalPages = Math.ceil(filteredLogs.length / logRowsPerPage);
            if (logPage < totalPages) {
                logPage++;
                renderLogsBody(cols);
            }
        });
        
        // Search filter
        searchInput.addEventListener("input", (e) => {
            const term = e.target.value.toLowerCase().trim();
            if (!term) {
                filteredLogs = [...WEATHER_TELEMETRY];
            } else {
                filteredLogs = WEATHER_TELEMETRY.filter(row => {
                    const timeStr = row.time || "";
                    return timeStr.toLowerCase().includes(term);
                });
            }
            logPage = 1;
            renderLogsBody(cols);
        });
        
        // CSV Export
        btnExport.addEventListener("click", () => {
            let csvContent = "data:text/csv;charset=utf-8-sig,";
            
            // Add headers
            const headerNames = cols.map(c => c.label);
            csvContent += headerNames.join(",") + "\n";
            
            // Add rows
            filteredLogs.forEach(row => {
                const values = cols.map(c => {
                    let val = row[c.code] || "";
                    // Remove commas to prevent broken columns
                    if (typeof val === "string") val = val.replace(/,/g, " ");
                    return `"${val}"`;
                });
                csvContent += values.join(",") + "\n";
            });
            
            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", "axisstream_telemetry_logs.csv");
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });
    }

    function populateUserTable() {
        const tbody = document.getElementById("users-table-body");
        if (!tbody) return;
        tbody.innerHTML = "";
        
        const users = getLocalUsers();
        
        if (users.length === 0) {
            const tr = document.createElement("tr");
            tr.innerHTML = `<td colspan="4" style="text-align: center; color: var(--text-muted); padding: 20px;">No registered accounts found. Only the default Admin is active.</td>`;
            tbody.appendChild(tr);
            return;
        }
        
        users.forEach((u, index) => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${u.name}</td>
                <td>${u.email}</td>
                <td>
                    <span class="password-text" id="pwd-${index}" style="-webkit-text-security: disc;">${u.password}</span>
                    <button class="btn btn-outline" style="padding: 4px 8px; font-size: 11px; margin-left: 10px; display: inline-flex;" onclick="togglePwdVisibility(${index})">
                        Show
                    </button>
                </td>
                <td style="text-align: center;">
                    <button class="btn btn-outline" style="color: var(--red); border-color: rgba(255, 94, 126, 0.2); padding: 6px 12px;" onclick="deleteUserAccount(${index})">
                        Delete
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    // Expose password toggle and delete helper functions globally so inline event handlers work
    window.togglePwdVisibility = function(index) {
        const span = document.getElementById(`pwd-${index}`);
        const btn = span.nextElementSibling;
        if (span.style.webkitTextSecurity === "none") {
            span.style.webkitTextSecurity = "disc";
            btn.textContent = "Show";
        } else {
            span.style.webkitTextSecurity = "none";
            btn.textContent = "Hide";
        }
    };

    window.deleteUserAccount = function(index) {
        if (confirm("Are you sure you want to delete this user account?")) {
            const users = getLocalUsers();
            users.splice(index, 1);
            localStorage.setItem("axt_users", JSON.stringify(users));
            populateUserTable();
        }
    };

    // --- PROJECT MANAGEMENT ---

    function checkActiveProject() {
        const banner = document.getElementById("no-project-banner");
        const dashboardTab = document.getElementById("dashboard-tab");
        const forecastTab = document.getElementById("forecast-tab");
        const logsTab = document.getElementById("logs-tab");
        
        if (!activeProjectId || projectsList.length === 0) {
            // Create banner if not exists
            if (!banner) {
                const newBanner = document.createElement("div");
                newBanner.id = "no-project-banner";
                newBanner.className = "empty-state-box";
                newBanner.style.marginBottom = "20px";
                newBanner.innerHTML = `
                    <span class="empty-icon mdi mdi-folder-alert-outline"></span>
                    <h4>No Active Project Selected</h4>
                    <p>Go to the <strong>Manage Projects</strong> tab to add a project and activate it to view device analytics.</p>
                `;
                const main = document.querySelector(".main-content");
                main.insertBefore(newBanner, main.firstChild);
            }
            // Hide other contents
            tabs.forEach(tab => {
                if (tab.id === "projects-tab") {
                    tab.style.display = "flex";
                    tab.classList.add("active");
                } else {
                    tab.style.display = "none";
                    tab.classList.remove("active");
                }
            });
            // Update sidebar nav to projects
            navItems.forEach(nav => {
                if (nav.getAttribute("data-target") === "projects") {
                    nav.classList.add("active");
                } else {
                    nav.classList.remove("active");
                }
            });
            currentTab = "projects";
            
            document.getElementById("project-badge").textContent = "No Project Active";
            document.getElementById("project-badge").style.background = "rgba(255, 94, 126, 0.1)";
            document.getElementById("project-badge").style.color = "var(--red)";
            document.getElementById("project-badge").style.borderColor = "rgba(255, 94, 126, 0.2)";
        } else {
            // Remove banner if exists
            if (banner) banner.remove();
            
            // Show only the current active tab
            tabs.forEach(tab => {
                if (tab.id === `${currentTab}-tab`) {
                    tab.style.display = "flex";
                    tab.classList.add("active");
                } else {
                    tab.style.display = "none";
                    tab.classList.remove("active");
                }
            });
            
            const activeProj = projectsList.find(p => p.id === activeProjectId);
            if (activeProj) {
                document.getElementById("project-badge").textContent = activeProj.name;
                document.getElementById("project-badge").style.background = "rgba(0, 242, 254, 0.1)";
                document.getElementById("project-badge").style.color = "var(--primary)";
                document.getElementById("project-badge").style.borderColor = "rgba(0, 242, 254, 0.2)";
                
                // If the active project is the real cào project (matched by ID), load real telemetry
                if (activeProj.id === "1b73e2fe-1e6c-46c6-8534-82c0e03be283") {
                    loadDashboardData();
                    loadForecastData();
                    initLogsTable();
                } else {
                    setMockDeviceState(activeProj.name);
                }
            }
        }
        if (typeof updateBackButtonVisibility === "function") {
            updateBackButtonVisibility();
        }
    }

    // Modal Control
    if (btnAddProject) {
        btnAddProject.addEventListener("click", () => {
            modalTitle.textContent = "Add New Project";
            projectForm.reset();
            projectEditIndexInput.value = "";
            projectModal.style.display = "flex";
            updateBackButtonVisibility();
        });
    }

    if (btnCloseModal) {
        btnCloseModal.addEventListener("click", () => {
            projectModal.style.display = "none";
            updateBackButtonVisibility();
        });
    }

    // Submit Project Form
    if (projectForm) {
        projectForm.addEventListener("submit", (e) => {
            e.preventDefault();
            
            const name = projectNameInput.value.trim();
            const id = projectIdInput.value.trim();
            const schema = projectSchemaInput.value.trim();
            const editIndex = projectEditIndexInput.value;
            
            if (editIndex !== "") {
                // Edit existing
                const idx = parseInt(editIndex);
                projectsList[idx] = { name, id, schema };
            } else {
                // Add new
                projectsList.push({ name, id, schema });
                // If this is the first project, set it active automatically
                if (projectsList.length === 1) {
                    activeProjectId = id;
                    localStorage.setItem("axt_active_project_id", id);
                }
            }
            
            saveProjectsList();
            projectModal.style.display = "none";
            
            populateProjectsList();
            checkActiveProject();
        });
    }

    function populateProjectsList() {
        if (!projectsGrid) return;
        projectsGrid.innerHTML = "";
        
        if (projectsList.length === 0) {
            projectsGrid.innerHTML = `
                <div class="empty-state-box">
                    <span class="empty-icon mdi mdi-folder-outline"></span>
                    <h4>No Projects Configured</h4>
                    <p>There are currently no projects in your dashboard. Click the <strong>Add Project</strong> button, or restore the default scraped projects below.</p>
                    <button class="btn btn-primary" onclick="seedDefaultProjects()" style="margin-top: 10px;">
                        <span class="mdi mdi-restore"></span> Load Default Projects
                    </button>
                </div>
            `;
            return;
        }
        
        projectsList.forEach((proj, index) => {
            const isActive = proj.id === activeProjectId;
            const card = document.createElement("div");
            card.className = `project-card ${isActive ? "active" : ""}`;
            card.innerHTML = `
                <div class="project-card-header">
                    <div class="project-card-icon">
                        <span class="mdi mdi-folder-network-outline"></span>
                    </div>
                    <div class="project-card-title">
                        <h4>${proj.name}</h4>
                        <span>${isActive ? "Active Project" : "Inactive"}</span>
                    </div>
                </div>
                <div class="project-card-details">
                    <div>
                        <span>Project ID:</span>
                        <strong>${proj.id.substring(0, 8)}...</strong>
                    </div>
                    <div>
                        <span>Org Schema:</span>
                        <strong>${proj.schema}</strong>
                    </div>
                </div>
                <div class="project-card-actions">
                    <button class="btn ${isActive ? 'btn-primary' : 'btn-outline'}" onclick="activateProject(${index})" ${isActive ? 'disabled' : ''}>
                        ${isActive ? 'Active' : 'Activate'}
                    </button>
                    <button class="btn btn-outline" onclick="editProject(${index})">
                        Edit
                    </button>
                    <button class="btn btn-outline" style="color: var(--red); border-color: rgba(255, 94, 126, 0.2);" onclick="deleteProject(${index})">
                        Delete
                    </button>
                </div>
            `;
            projectsGrid.appendChild(card);
        });
    }

    // Expose helpers globally for projects
    window.activateProject = function(index) {
        const proj = projectsList[index];
        activeProjectId = proj.id;
        localStorage.setItem("axt_active_project_id", proj.id);
        populateProjectsList();
        checkActiveProject();
    };

    window.editProject = function(index) {
        const proj = projectsList[index];
        modalTitle.textContent = "Edit Project";
        projectEditIndexInput.value = index;
        projectNameInput.value = proj.name;
        projectIdInput.value = proj.id;
        projectSchemaInput.value = proj.schema;
        projectModal.style.display = "flex";
        updateBackButtonVisibility();
    };

    window.deleteProject = function(index) {
        if (confirm("Are you sure you want to delete this project? This will disconnect its telemetry data dashboard.")) {
            const deletedProj = projectsList[index];
            projectsList.splice(index, 1);
            
            // If the deleted project was active, reset active project selection
            if (activeProjectId === deletedProj.id) {
                activeProjectId = projectsList.length > 0 ? projectsList[0].id : null;
                if (activeProjectId) {
                    localStorage.setItem("axt_active_project_id", activeProjectId);
                } else {
                    localStorage.removeItem("axt_active_project_id");
                }
            }
            
            saveProjectsList();
            populateProjectsList();
            checkActiveProject();
        }
    };

    window.seedDefaultProjects = function() {
        projectsList = [
            {
                name: "LINHBEOCORP",
                id: "1b73e2fe-1e6c-46c6-8534-82c0e03be283",
                schema: "tanbaocorp"
            },
            {
                name: "LBLB",
                id: "1c623db4-80a3-4523-9aa4-979c8620a7a9",
                schema: "tbsg"
            }
        ];
        saveProjectsList();
        activeProjectId = "1b73e2fe-1e6c-46c6-8534-82c0e03be283";
        localStorage.setItem("axt_active_project_id", activeProjectId);
        populateProjectsList();
        checkActiveProject();
    };

    // --- METRIC DETAILS MODAL ---

    // Expose a helper to style metric cards on hover
    const clickableCards = ["card-temp", "card-humidity", "card-rainfall", "card-wind", "card-forecast"];
    clickableCards.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.cursor = "pointer";
    });

    // Toggle Modal Tabs
    if (btnModalChartTab) {
        btnModalChartTab.addEventListener("click", () => {
            btnModalChartTab.className = "btn btn-primary";
            btnModalLogTab.className = "btn btn-outline";
            detailsModalChartView.style.display = "block";
            detailsModalLogView.style.display = "none";
        });
    }

    if (btnModalLogTab) {
        btnModalLogTab.addEventListener("click", () => {
            btnModalLogTab.className = "btn btn-primary";
            btnModalChartTab.className = "btn btn-outline";
            detailsModalChartView.style.display = "none";
            detailsModalLogView.style.display = "block";
        });
    }

    if (btnCloseDetails) {
        btnCloseDetails.addEventListener("click", () => {
            detailsModal.style.display = "none";
            updateBackButtonVisibility();
        });
    }

    function openMetricDetails(metricCode, metricLabel, color) {
        if (!WEATHER_TELEMETRY || WEATHER_TELEMETRY.length === 0) return;
        
        detailsModalTitle.innerHTML = `<span class="mdi mdi-chart-timeline-variant"></span> ${metricLabel} Details`;
        
        // Reset tabs
        btnModalChartTab.click();
        
        // Get the latest 15 records for details, reverse to chronological order
        const detailData = [...WEATHER_TELEMETRY].slice(0, 15).reverse();
        
        const labels = detailData.map(d => {
            const t = new Date(d.time);
            return t.toLocaleTimeString("en-AU", {hour: '2-digit', minute:'2-digit'});
        });
        const values = detailData.map(d => parseFloat(d[metricCode]) || 0);
        
        // Render large detailed chart
        const ctx = document.getElementById("detailsChart").getContext("2d");
        if (detailsChartInstance) {
            detailsChartInstance.destroy();
        }
        
        detailsChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: metricLabel,
                    data: values,
                    borderColor: color,
                    backgroundColor: `${color}15`, // semi transparent fill
                    borderWidth: 3,
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: { color: '#8b9bb4', font: { family: 'Plus Jakarta Sans' } }
                    },
                    y: {
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: { color: '#8b9bb4' }
                    }
                }
            }
        });
        
        // Populate modal recent history table
        detailsModalLogBody.innerHTML = "";
        const tableData = [...WEATHER_TELEMETRY].slice(0, 30); // Show up to 30 rows in popup table
        tableData.forEach(row => {
            const tr = document.createElement("tr");
            const date = new Date(row.time);
            const timeStr = date.toLocaleDateString("en-AU") + " " + date.toLocaleTimeString("en-AU", {hour: '2-digit', minute:'2-digit'});
            const val = row[metricCode] !== undefined ? `${row[metricCode]}` : "--";
            
            tr.innerHTML = `
                <td>${timeStr}</td>
                <td style="font-weight: 700; color: var(--text-primary);">${val}</td>
            `;
            detailsModalLogBody.appendChild(tr);
        });
        
        // Show modal
        detailsModal.style.display = "flex";
        updateBackButtonVisibility();
    }

    // Add Click Listeners to Dashboard Metric Cards
    const cardTemp = document.getElementById("card-temp");
    if (cardTemp) {
        cardTemp.addEventListener("click", () => {
            openMetricDetails("temperature_avg", "Temperature (°C)", "#ff5e7e");
        });
    }

    const cardHumidity = document.getElementById("card-humidity");
    if (cardHumidity) {
        cardHumidity.addEventListener("click", () => {
            openMetricDetails("humidity_avg", "Humidity (%)", "#3b82f6");
        });
    }

    const cardRainfall = document.getElementById("card-rainfall");
    if (cardRainfall) {
        cardRainfall.addEventListener("click", () => {
            openMetricDetails("rainfall", "Rainfall (mm)", "#06b6d4");
        });
    }

    const cardWind = document.getElementById("card-wind");
    if (cardWind) {
        cardWind.addEventListener("click", () => {
            openMetricDetails("wind_speed_avg", "Wind Speed (km/h)", "#14b8a6");
        });
    }

    const cardForecast = document.getElementById("card-forecast");
    if (cardForecast) {
        cardForecast.addEventListener("click", () => {
            // Click forecast -> redirect to detailed Jane's Forecast Tab!
            const forecastNav = document.querySelector('[data-target="forecast"]');
            if (forecastNav) forecastNav.click();
        });
    }

    // --- BACK BUTTON NAVIGATION & HISTORY ---
    function updateBackButtonVisibility() {
        const hasHistory = tabHistory.length > 0;
        const isModalOpen = (detailsModal && detailsModal.style.display === "flex") || 
                            (projectModal && projectModal.style.display === "flex");
        if (btnBackNav) {
            btnBackNav.style.display = (hasHistory || isModalOpen) ? "inline-flex" : "none";
        }
    }
    window.updateBackButtonVisibility = updateBackButtonVisibility;

    if (btnBackNav) {
        btnBackNav.addEventListener("click", () => {
            // 1. Close details modal if open
            if (detailsModal && detailsModal.style.display === "flex") {
                detailsModal.style.display = "none";
                updateBackButtonVisibility();
                return;
            }
            // 2. Close project modal if open
            if (projectModal && projectModal.style.display === "flex") {
                projectModal.style.display = "none";
                updateBackButtonVisibility();
                return;
            }
            // 3. Navigate back in tab history
            if (tabHistory.length > 0) {
                const prevTab = tabHistory.pop();
                isBackNavigating = true;
                const navItem = document.querySelector(`.sidebar-nav li[data-target="${prevTab}"]`);
                if (navItem) {
                    navItem.click();
                }
                isBackNavigating = false;
                updateBackButtonVisibility();
            }
        });
    }

    // --- Start App ---
    // Initialization is completely handled by the authentication check on load
});
