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
    const loginRememberInput = document.getElementById("login-remember");
    
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
    const projectSearchInput = document.getElementById("project-search-input");
    const modalTitle = document.getElementById("modal-title");

    // --- PROJECT STATE ---
    let allProjectsList = []; // All projects stored globally
    let projectsList = [];    // Projects belonging only to the logged-in user
    let activeProjectId = null;
    let activeProjectIdKey = "";

    function getActiveProjectId() {
        const savedUser = localStorage.getItem("axt_current_user") || sessionStorage.getItem("axt_current_user");
        if (savedUser) {
            const currentUser = JSON.parse(savedUser);
            activeProjectIdKey = `axt_active_project_id_${currentUser.email.replace("@", "_").replace(".", "_")}`;
            return localStorage.getItem(activeProjectIdKey) || null;
        }
        return null;
    }

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
        
        // Seed default projects if empty
        if (list.length === 0) {
            list = [
                {
                    id: "1b73e2fe-1e6c-46c6-8534-82c0e03be283",
                    name: "LINHBEOCORP",
                    schema: "tanbaocorp",
                    ownerEmail: "linh@linhbeocorp.vn",
                    deviceId: "device_A23",
                    latitude: 10.762622,
                    longitude: 106.660172
                },
                {
                    id: "1c623db4-80a3-4523-9aa4-979c8620a7a9",
                    name: "LBLB",
                    schema: "lblb",
                    ownerEmail: "test1@gmail.com",
                    deviceId: "device_B01",
                    latitude: 10.762622,
                    longitude: 106.660172
                }
            ];
            localStorage.setItem("axt_projects", JSON.stringify(list));
        }

        // Migrate and rename old legacy names if present
        allProjectsList = list.map(p => {
            if (p.name === "TANBAOCORP_Demo") p.name = "LINHBEOCORP";
            if (p.name === "TBSG") p.name = "LBLB";
            
            // Dynamically override LBLB owner to test1@gmail.com
            if (p.id === "1c623db4-80a3-4523-9aa4-979c8620a7a9") {
                p.ownerEmail = "test1@gmail.com";
            }
            
            if (!p.ownerEmail) p.ownerEmail = "linh@linhbeocorp.vn";
            if (!p.deviceId) p.deviceId = p.id === "1b73e2fe-1e6c-46c6-8534-82c0e03be283" ? "device_A23" : "device_B01";
            if (!p.latitude) p.latitude = 10.762622;
            if (!p.longitude) p.longitude = 106.660172;
            return p;
        });
        saveProjectsList();

        // Filter projects based on the logged-in user
        const savedUser = localStorage.getItem("axt_current_user") || sessionStorage.getItem("axt_current_user");
        if (savedUser) {
            const currentUser = JSON.parse(savedUser);
            const admin = getAdminUser();
            if (currentUser.email.toLowerCase() === admin.email.toLowerCase()) {
                // Admin sees all projects
                projectsList = allProjectsList;
            } else {
                // Normal users see only their own projects
                projectsList = allProjectsList.filter(p => p.ownerEmail && p.ownerEmail.toLowerCase() === currentUser.email.toLowerCase());
            }
        } else {
            projectsList = [];
        }

        // Load active project ID
        activeProjectId = getActiveProjectId();
        if (!activeProjectId && projectsList.length > 0) {
            activeProjectId = projectsList[0].id;
            localStorage.setItem(activeProjectIdKey, activeProjectId);
        }
    }

    function saveProjectsList() {
        localStorage.setItem("axt_projects", JSON.stringify(allProjectsList));
    }

    // --- AUTH LOGIC ---
    
    // Admin user config with persistence
    function getAdminUser() {
        const adminJSON = localStorage.getItem("axt_admin");
        if (adminJSON) {
            try {
                return JSON.parse(adminJSON);
            } catch (e) {}
        }
        return {
            name: "Linh",
            email: "linh@linhbeocorp.vn",
            password: "Linhbeo@123"
        };
    }

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
    const savedUser = localStorage.getItem("axt_current_user") || sessionStorage.getItem("axt_current_user");
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

        const chatWidget = document.getElementById("chat-widget");
        if (chatWidget) {
            chatWidget.style.display = "none";
            const chatWindow = document.getElementById("chat-window");
            if (chatWindow) chatWindow.style.display = "none";
        }
    }

    function loginSuccess(user) {
        authContainer.style.display = "none";
        appContainer.style.display = "flex";
        
        // Check if user is the admin to show/hide the User Management tab
        const navUsers = document.getElementById("nav-users");
        if (navUsers) {
            const admin = getAdminUser();
            if (user.email.toLowerCase() === admin.email.toLowerCase()) {
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
        
        // Update online status in database
        if (typeof setOnlineStatus === "function") setOnlineStatus(user.email, true);
        
        // Load projects list and check active status
        loadProjectsList();
        checkActiveProject();

        const chatWidget = document.getElementById("chat-widget");
        if (chatWidget) {
            chatWidget.style.display = "block";
            if (typeof initChatWidget === "function") initChatWidget();
        }
    }

    function getFailedAttempts() {
        const attemptsJSON = localStorage.getItem("axt_failed_attempts");
        if (attemptsJSON) {
            try { return JSON.parse(attemptsJSON); } catch (e) {}
        }
        return {};
    }
    function saveFailedAttempts(attempts) {
        localStorage.setItem("axt_failed_attempts", JSON.stringify(attempts));
    }

    // Handle Login Submit
    loginForm.addEventListener("submit", (e) => {
        e.preventDefault();
        loginError.textContent = "";
        
        const email = loginEmailInput.value.trim().toLowerCase();
        const password = loginPasswordInput.value;
        const remember = loginRememberInput ? loginRememberInput.checked : false;
        
        const attempts = getFailedAttempts();
        const currentAttempts = attempts[email] || 0;

        if (currentAttempts >= 5) {
            alert(`Cảnh báo: Tài khoản ${email} đã cố đăng nhập sai ${currentAttempts} lần! Vui lòng liên hệ Admin để được hỗ trợ.`);
            loginError.textContent = `Tài khoản đã đăng nhập sai quá 5 lần. Vui lòng liên hệ Admin.`;
            return;
        }

        // 1. Check default admin
        const admin = getAdminUser();
        let success = false;
        let loggedInUser = null;

        if (email === admin.email.toLowerCase() && password === admin.password) {
            loggedInUser = { name: admin.name, email: admin.email, isAdmin: true };
            success = true;
        } else {
            // 2. Check local registered users
            const users = getLocalUsers();
            const matchedUser = users.find(u => u.email === email && u.password === password);
            if (matchedUser) {
                loggedInUser = { name: matchedUser.name, email: matchedUser.email };
                success = true;
            }
        }

        if (success) {
            // Clear attempts on success
            attempts[email] = 0;
            saveFailedAttempts(attempts);

            if (remember) {
                localStorage.setItem("axt_current_user", JSON.stringify(loggedInUser));
            } else {
                sessionStorage.setItem("axt_current_user", JSON.stringify(loggedInUser));
            }
            loginSuccess(loggedInUser);
        } else {
            // Increment failed attempts
            attempts[email] = (attempts[email] || 0) + 1;
            saveFailedAttempts(attempts);

            if (attempts[email] >= 5) {
                alert(`Cảnh báo: Tài khoản ${email} đã cố đăng nhập sai ${attempts[email]} lần liên tiếp nhưng không thành công!`);
                loginError.textContent = `Tài khoản đã đăng nhập sai quá 5 lần. Vui lòng liên hệ Admin.`;
            } else {
                loginError.textContent = `Email hoặc mật khẩu không chính xác. (Đã sai ${attempts[email]}/5 lần)`;
            }
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
        if (confirm("Bạn có chắc chắn muốn đăng xuất khỏi hệ thống không?")) {
            const savedUser = localStorage.getItem("axt_current_user") || sessionStorage.getItem("axt_current_user");
            if (savedUser) {
                try {
                    const u = JSON.parse(savedUser);
                    setOnlineStatus(u.email, false);
                } catch(e) {}
            }
            localStorage.removeItem("axt_current_user");
            sessionStorage.removeItem("axt_current_user");
            loginForm.reset();
            showAuthScreen();
        }
    });

    
    function switchToTab(targetTab) {
        const item = document.querySelector(`.sidebar-nav li[data-target="${targetTab}"]`);
        if (!item) return;
        
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
        
        currentTab = targetTab;
        console.log(`Switched to tab: ${currentTab}`);
        updateBackButtonVisibility();
        
        // Re-render chart / tables
        if (currentTab === "dashboard") {
            renderTrendChart();
        } else if (currentTab === "users") {
            populateUserTable();
        } else if (currentTab === "projects") {
            populateProjectsList();
        }
    }

    // Tab switching (updates URL hash to trigger hashchange router)
    navItems.forEach(item => {
        item.addEventListener("click", () => {
            const targetTab = item.getAttribute("data-target");
            window.location.hash = targetTab;
        });
    });

    // Listen for browser Back/Forward navigation hashchange
    window.addEventListener("hashchange", () => {
        const hash = window.location.hash.replace("#", "") || "dashboard";
        
        // Check if there is an active project (prevent viewing other tabs if no active project)
        const activeProj = projectsList.find(p => p.id === activeProjectId);
        if ((!activeProj || projectsList.length === 0) && hash !== "projects" && hash !== "users") {
            window.location.hash = "projects";
            return;
        }
        
        // Handle metric details navigation via hash
        if (hash.startsWith("details-")) {
            // Underneath the modal, the dashboard tab must remain visible
            switchToTab("dashboard");
            
            const metric = hash.replace("details-", "");
            if (metric === "temp") {
                openMetricDetails("temperature_avg", "Temperature (°C)", "#ff5e7e");
            } else if (metric === "humidity") {
                openMetricDetails("humidity_avg", "Humidity (%)", "#3b82f6");
            } else if (metric === "rainfall") {
                openMetricDetails("rainfall", "Rainfall (mm)", "#06b6d4");
            } else if (metric === "wind") {
                openMetricDetails("wind_speed_avg", "Wind Speed (km/h)", "#14b8a6");
            }
            return;
        }
        
        // If we are navigating to a normal tab, make sure the details modal is closed!
        if (detailsModal && detailsModal.style.display === "flex") {
            detailsModal.style.display = "none";
        }
        
        switchToTab(hash);
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
        document.getElementById("forecast-location").innerHTML = `<span class="mdi mdi-map-marker"></span> Hồ Chí Minh, Việt Nam`;
        
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
        if (typeof populateAdminApprovalsTable === "function") {
            populateAdminApprovalsTable();
        }
        const tbody = document.getElementById("users-table-body");
        if (!tbody) return;
        tbody.innerHTML = "";
        
        const users = getLocalUsers();
        
        if (users.length === 0) {
            const tr = document.createElement("tr");
            tr.innerHTML = `<td colspan="5" style="text-align: center; color: var(--text-muted); padding: 20px;">No registered accounts found. Only the default Admin is active.</td>`;
            tbody.appendChild(tr);
            return;
        }

        const onlineUsers = JSON.parse(localStorage.getItem("axt_online_users") || "[]");
        
        users.forEach((u, index) => {
            const tr = document.createElement("tr");
            const isOnline = onlineUsers.includes(u.email.toLowerCase());
            tr.innerHTML = `
                <td>${u.name}</td>
                <td>${u.email}</td>
                <td>
                    ${isOnline ? 
                        `<span class="badge" style="background: rgba(46, 204, 113, 0.1); color: var(--green); border-color: rgba(46, 204, 113, 0.2); font-size: 11px; display: inline-flex; align-items: center; gap: 6px;">
                            <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #2ecc71; box-shadow: 0 0 8px #2ecc71;"></span> Online
                         </span>` : 
                        `<span class="badge" style="background: rgba(149, 165, 166, 0.1); color: var(--text-muted); border-color: rgba(149, 165, 166, 0.2); font-size: 11px; display: inline-flex; align-items: center; gap: 6px;">
                            <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #95a5a6;"></span> Offline
                         </span>`
                    }
                </td>
                <td>
                    <span class="password-text" id="pwd-${index}" style="-webkit-text-security: disc;">${u.password}</span>
                    <button class="btn btn-outline" style="padding: 4px 8px; font-size: 11px; margin-left: 10px; display: inline-flex;" onclick="togglePwdVisibility(${index})">
                        Show
                    </button>
                </td>
                <td style="text-align: center;">
                    <button class="btn btn-outline" style="padding: 6px 12px; margin-right: 5px;" onclick="editUserAccount(${index})">
                        Edit
                    </button>
                    <button class="btn btn-outline" style="color: var(--red); border-color: rgba(255, 94, 126, 0.2); padding: 6px 12px;" onclick="deleteUserAccount(${index})">
                        Delete
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    // Expose password toggle, edit, and delete helper functions globally so inline event handlers work
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

    window.editUserAccount = function(index) {
        const users = getLocalUsers();
        const u = users[index];
        if (!u) return;

        document.getElementById("profile-name-input").value = u.name;
        document.getElementById("profile-email-input").value = u.email;
        document.getElementById("profile-password-input").value = u.password;
        document.getElementById("profile-edit-email").value = u.email;

        const profileModal = document.getElementById("profile-modal");
        if (profileModal) profileModal.style.display = "flex";
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
            
            document.getElementById("project-badge").textContent = "No Project Active";
            document.getElementById("project-badge").style.background = "rgba(255, 94, 126, 0.1)";
            document.getElementById("project-badge").style.color = "var(--red)";
            document.getElementById("project-badge").style.borderColor = "rgba(255, 94, 126, 0.2)";
            
            document.getElementById("active-device-name").textContent = "No Device Connected";
            document.getElementById("project-gps").textContent = "";
            
            // Force hash router to projects tab
            window.location.hash = "projects";
        } else {
            // Remove banner if exists
            if (banner) banner.remove();
            
            const activeProj = projectsList.find(p => p.id === activeProjectId);
            if (activeProj) {
                document.getElementById("project-badge").textContent = activeProj.name;
                document.getElementById("project-badge").style.background = "rgba(0, 242, 254, 0.1)";
                document.getElementById("project-badge").style.color = "var(--primary)";
                document.getElementById("project-badge").style.borderColor = "rgba(0, 242, 254, 0.2)";
                
                document.getElementById("active-device-name").textContent = `${activeProj.name} Device (${activeProj.deviceId || 'A23'})`;
                if (activeProj.latitude && activeProj.longitude) {
                    document.getElementById("project-gps").textContent = `GPS: ${activeProj.latitude.toFixed(4)}, ${activeProj.longitude.toFixed(4)}`;
                } else {
                    document.getElementById("project-gps").textContent = "";
                }
                
                // Load telemetry data dynamically (every custom user project is simulated with real scraped data!)
                loadDashboardData();
                loadForecastData();
                initLogsTable();
            }
            
            // Navigate to current hash or fallback to dashboard
            const hash = window.location.hash.replace("#", "") || "dashboard";
            if (!window.location.hash) {
                window.location.replace("#" + hash);
            }
            switchToTab(hash);
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
            
            const savedUser = localStorage.getItem("axt_current_user") || sessionStorage.getItem("axt_current_user");
            if (!savedUser) return;
            const currentUser = JSON.parse(savedUser);
            const ownerEmail = currentUser.email.toLowerCase();

            // Create project object
            const projectObj = {
                name,
                id,
                schema,
                ownerEmail,
                deviceId: "device_" + Math.random().toString(36).substr(2, 6).toUpperCase(), // Registered device ID!
                latitude: 10.762622 + (Math.random() - 0.5) * 0.1, // Nearby random HCMC GPS coordinates!
                longitude: 106.660172 + (Math.random() - 0.5) * 0.1
            };

            if (editIndex !== "") {
                // editIndex is index in projectsList (filtered list)
                const idx = parseInt(editIndex);
                const originalProj = projectsList[idx];
                if (originalProj) {
                    // Find in allProjectsList
                    const globalIdx = allProjectsList.findIndex(p => p.id === originalProj.id);
                    if (globalIdx !== -1) {
                        // Preserve coordinates, owner, and device ID!
                        projectObj.ownerEmail = originalProj.ownerEmail;
                        projectObj.deviceId = originalProj.deviceId || projectObj.deviceId;
                        projectObj.latitude = originalProj.latitude || projectObj.latitude;
                        projectObj.longitude = originalProj.longitude || projectObj.longitude;
                        
                        allProjectsList[globalIdx] = projectObj;
                    }
                }
            } else {
                // Add new
                allProjectsList.push(projectObj);
                
                // If the user currently has no active project set, activate this one
                const activeId = getActiveProjectId();
                if (!activeId) {
                    localStorage.setItem(activeProjectIdKey, id);
                    activeProjectId = id;
                }
            }
            
            saveProjectsList();
            loadProjectsList();
            
            projectModal.style.display = "none";
            populateProjectsList();
            checkActiveProject();
        });
    }

    // Real-time project search event listener
    if (projectSearchInput) {
        projectSearchInput.addEventListener("input", () => {
            populateProjectsList();
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

        const query = projectSearchInput ? projectSearchInput.value.trim().toLowerCase() : "";
        let displayList = projectsList;
        
        if (query) {
            displayList = projectsList.filter(proj => 
                proj.name.toLowerCase().includes(query) || 
                proj.id.toLowerCase().includes(query) || 
                (proj.schema && proj.schema.toLowerCase().includes(query)) ||
                (proj.deviceId && proj.deviceId.toLowerCase().includes(query))
            );
        }

        if (displayList.length === 0) {
            projectsGrid.innerHTML = `
                <div class="empty-state-box" style="padding: 30px;">
                    <span class="empty-icon mdi mdi-magnify-minus"></span>
                    <h4>Không tìm thấy kết quả</h4>
                    <p>Không tìm thấy dự án nào khớp với từ khóa "<strong>${query}</strong>".</p>
                </div>
            `;
            return;
        }
        
        displayList.forEach((proj) => {
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
                        <span>Device ID:</span>
                        <strong>${proj.deviceId || 'A23'}</strong>
                    </div>
                    <div>
                        <span>Org Schema:</span>
                        <strong>${proj.schema}</strong>
                    </div>
                </div>
                <div class="project-card-actions">
                    <button class="btn ${isActive ? 'btn-primary' : 'btn-outline'}" onclick="activateProject('${proj.id}')" ${isActive ? 'disabled' : ''}>
                        ${isActive ? 'Active' : 'Activate'}
                    </button>
                    <button class="btn btn-outline" onclick="editProject('${proj.id}')">
                        Edit
                    </button>
                    <button class="btn btn-outline" style="color: var(--red); border-color: rgba(255, 94, 126, 0.2);" onclick="deleteProject('${proj.id}')">
                        Delete
                    </button>
                </div>
            `;
            projectsGrid.appendChild(card);
        });
    }

    // Expose helpers globally for projects
    window.activateProject = function(projId) {
        const proj = projectsList.find(p => p.id === projId);
        if (!proj) return;
        activeProjectId = proj.id;
        localStorage.setItem(activeProjectIdKey, proj.id);
        populateProjectsList();
        checkActiveProject();
    };

    window.editProject = function(projId) {
        const proj = projectsList.find(p => p.id === projId);
        if (!proj) return;
        const index = projectsList.findIndex(p => p.id === projId);
        
        modalTitle.textContent = "Edit Project";
        projectEditIndexInput.value = index;
        projectNameInput.value = proj.name;
        projectIdInput.value = proj.id;
        projectSchemaInput.value = proj.schema;
        projectModal.style.display = "flex";
        updateBackButtonVisibility();
    };

    window.deleteProject = function(projId) {
        const deletedProj = projectsList.find(p => p.id === projId);
        if (!deletedProj) return;

        if (confirm("Are you sure you want to delete this project? This will disconnect its telemetry data dashboard.")) {
            // Find in allProjectsList
            const globalIdx = allProjectsList.findIndex(p => p.id === deletedProj.id);
            if (globalIdx !== -1) {
                allProjectsList.splice(globalIdx, 1);
            }
            
            // If the deleted project was active, reset active project selection
            if (activeProjectId === deletedProj.id) {
                const userProjs = allProjectsList.filter(p => p.ownerEmail && p.ownerEmail.toLowerCase() === deletedProj.ownerEmail.toLowerCase());
                activeProjectId = userProjs.length > 0 ? userProjs[0].id : null;
                if (activeProjectId) {
                    localStorage.setItem(activeProjectIdKey, activeProjectId);
                } else {
                    localStorage.removeItem(activeProjectIdKey);
                }
            }
            
            saveProjectsList();
            loadProjectsList();
            populateProjectsList();
            checkActiveProject();
        }
    };

    window.seedDefaultProjects = function() {
        localStorage.removeItem("axt_projects");
        loadProjectsList();
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
            window.location.hash = "dashboard";
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

    // Add Click Listeners to Dashboard Metric Cards (set hash to trigger detail views via router)
    const cardTemp = document.getElementById("card-temp");
    if (cardTemp) {
        cardTemp.addEventListener("click", () => {
            window.location.hash = "details-temp";
        });
    }

    const cardHumidity = document.getElementById("card-humidity");
    if (cardHumidity) {
        cardHumidity.addEventListener("click", () => {
            window.location.hash = "details-humidity";
        });
    }

    const cardRainfall = document.getElementById("card-rainfall");
    if (cardRainfall) {
        cardRainfall.addEventListener("click", () => {
            window.location.hash = "details-rainfall";
        });
    }

    const cardWind = document.getElementById("card-wind");
    if (cardWind) {
        cardWind.addEventListener("click", () => {
            window.location.hash = "details-wind";
        });
    }

    const cardForecast = document.getElementById("card-forecast");
    if (cardForecast) {
        cardForecast.addEventListener("click", () => {
            window.location.hash = "forecast";
        });
    }

    // --- BACK BUTTON NAVIGATION & HISTORY ---
    function updateBackButtonVisibility() {
        const hasHistory = window.location.hash !== "" && window.location.hash !== "#dashboard";
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
            // 3. Otherwise, navigate back in browser history
            window.history.back();
        });
    }

    // --- PROFILE SETTINGS MODAL & ACCOUNT PERSONALIZATION ---
    const accountProfile = document.querySelector(".account-profile");
    const profileModal = document.getElementById("profile-modal");
    const btnCloseProfile = document.getElementById("btn-close-profile");
    const profileForm = document.getElementById("profile-form");

    if (accountProfile) {
        accountProfile.addEventListener("click", (e) => {
            // Stop modal opening if clicking the logout button directly
            if (e.target.closest("#btn-logout") || e.target.closest(".logout-btn")) {
                return;
            }

            // Load currently logged in session
            const savedUser = localStorage.getItem("axt_current_user") || sessionStorage.getItem("axt_current_user");
            if (!savedUser) return;
            const currentUser = JSON.parse(savedUser);

            let fullName = "";
            let email = "";
            let password = "";

            const admin = getAdminUser();
            if (currentUser.email.toLowerCase() === admin.email.toLowerCase()) {
                fullName = admin.name;
                email = admin.email;
                password = admin.password;
            } else {
                const users = getLocalUsers();
                const u = users.find(x => x.email.toLowerCase() === currentUser.email.toLowerCase());
                if (u) {
                    fullName = u.name;
                    email = u.email;
                    password = u.password;
                }
            }

            document.getElementById("profile-name-input").value = fullName;
            document.getElementById("profile-email-input").value = email;
            document.getElementById("profile-password-input").value = password;
            document.getElementById("profile-edit-email").value = email;

            if (profileModal) profileModal.style.display = "flex";
        });
    }

    if (btnCloseProfile) {
        btnCloseProfile.addEventListener("click", () => {
            if (profileModal) profileModal.style.display = "none";
        });
    }

    if (profileForm) {
        profileForm.addEventListener("submit", (e) => {
            e.preventDefault();

            const name = document.getElementById("profile-name-input").value.trim();
            const email = document.getElementById("profile-email-input").value.trim().toLowerCase();
            const password = document.getElementById("profile-password-input").value;
            const origEmail = document.getElementById("profile-edit-email").value.toLowerCase();

            const users = getLocalUsers();
            const admin = getAdminUser();
            
            // Validation: Prevent email collision
            if (email !== origEmail) {
                if (email === admin.email.toLowerCase()) {
                    alert("Email address is already in use by the Admin account.");
                    return;
                }
                if (users.some(u => u.email.toLowerCase() === email)) {
                    alert("Email address is already in use by another account.");
                    return;
                }
            }

            const savedUser = localStorage.getItem("axt_current_user") || sessionStorage.getItem("axt_current_user");
            if (!savedUser) return;
            const currentUser = JSON.parse(savedUser);
            const isEditingSelf = (origEmail === currentUser.email.toLowerCase());
            const isPersistent = (localStorage.getItem("axt_current_user") !== null);

            if (origEmail === admin.email.toLowerCase()) {
                // Updating Admin User details
                const updatedAdmin = { name, email, password };
                localStorage.setItem("axt_admin", JSON.stringify(updatedAdmin));

                if (isEditingSelf) {
                    const session = { name, email, isAdmin: true };
                    if (isPersistent) {
                        localStorage.setItem("axt_current_user", JSON.stringify(session));
                    } else {
                        sessionStorage.setItem("axt_current_user", JSON.stringify(session));
                    }
                    
                    // Immediately synchronize profile card UI in sidebar footer
                    userNameEl.textContent = name;
                    userEmailEl.textContent = email;
                    userAvatarEl.textContent = name.charAt(0).toUpperCase();
                }
            } else {
                // Updating standard user details
                const userIdx = users.findIndex(u => u.email.toLowerCase() === origEmail);
                if (userIdx !== -1) {
                    users[userIdx] = { name, email, password };
                    localStorage.setItem("axt_users", JSON.stringify(users));
                }

                if (isEditingSelf) {
                    const session = { name, email };
                    if (isPersistent) {
                        localStorage.setItem("axt_current_user", JSON.stringify(session));
                    } else {
                        sessionStorage.setItem("axt_current_user", JSON.stringify(session));
                    }
                    
                    // Immediately synchronize profile card UI in sidebar footer
                    userNameEl.textContent = name;
                    userEmailEl.textContent = email;
                    userAvatarEl.textContent = name.charAt(0).toUpperCase();
                }

                // If Admin was editing someone else, refresh the user list control panel
                if (currentUser.email.toLowerCase() === admin.email.toLowerCase()) {
                    populateUserTable();
                }
            }

            alert("Account information saved successfully!");
            if (profileModal) profileModal.style.display = "none";
        });
    }

    // --- USER ONLINE / OFFLINE STATUS CONTROLLER ---
    function setOnlineStatus(email, isOnline) {
        if (!email) return;
        let online = [];
        try {
            online = JSON.parse(localStorage.getItem("axt_online_users") || "[]");
        } catch(e) {}
        
        if (isOnline) {
            if (!online.includes(email.toLowerCase())) {
                online.push(email.toLowerCase());
            }
        } else {
            online = online.filter(e => e !== email.toLowerCase());
        }
        localStorage.setItem("axt_online_users", JSON.stringify(online));
        
        // Update sidebar avatar online dot class
        const sidebarAvatarDot = document.querySelector(".account-profile .status-dot");
        if (sidebarAvatarDot) {
            if (isOnline) {
                sidebarAvatarDot.className = "status-dot online";
                sidebarAvatarDot.style.background = "#2ecc71";
            } else {
                sidebarAvatarDot.className = "status-dot offline";
                sidebarAvatarDot.style.background = "#7f8c8d";
            }
        }
    }

    // Set offline on tab close or refresh
    window.addEventListener("beforeunload", () => {
        const savedUser = localStorage.getItem("axt_current_user") || sessionStorage.getItem("axt_current_user");
        if (savedUser) {
            try {
                const u = JSON.parse(savedUser);
                setOnlineStatus(u.email, false);
            } catch(e) {}
        }
    });

    // Real-time synchronization across parallel tabs/devices
    window.addEventListener("storage", (e) => {
        // 1. If auth session changed
        if (e.key === "axt_current_user" || e.key === "axt_admin" || e.key === "axt_users" || e.key === "axt_online_users") {
            const savedUser = localStorage.getItem("axt_current_user") || sessionStorage.getItem("axt_current_user");
            if (!savedUser) {
                // Force logout in this tab
                showAuthScreen();
            } else {
                const user = JSON.parse(savedUser);
                // Refresh profile sidebar card
                userNameEl.textContent = user.name;
                userEmailEl.textContent = user.email;
                userAvatarEl.textContent = user.name.charAt(0).toUpperCase();
                
                // Refresh user list if admin
                if (currentTab === "users") {
                    populateUserTable();
                }
            }
        }
        
        // 2. If projects list changed
        if (e.key === "axt_projects") {
            loadProjectsList();
            populateProjectsList();
            checkActiveProject();
        }

        // 3. If chat messages changed
        if (e.key === "axt_chat_messages") {
            if (typeof initChatWidget === "function") {
                initChatWidget();
            }
            const chatWindow = document.getElementById("chat-window");
            if (chatWindow && chatWindow.style.display === "flex") {
                // If admin, refresh thread list or current thread messages
                const savedUser = localStorage.getItem("axt_current_user") || sessionStorage.getItem("axt_current_user");
                if (savedUser) {
                    const currentUser = JSON.parse(savedUser);
                    const admin = getAdminUser();
                    const isAdmin = currentUser.email.toLowerCase() === admin.email.toLowerCase();
                    if (isAdmin) {
                        if (selectedThreadUser) {
                            renderMessages(selectedThreadUser);
                        } else {
                            renderThreadsList();
                        }
                    } else {
                        renderMessages(currentUser.email);
                    }
                }
            }
        }

        // 4. If password reset requests changed
        if (e.key === "axt_reset_requests") {
            if (currentTab === "users") {
                populateAdminApprovalsTable();
            }
        }
    });

    // --- PASSWORD VISIBILITY TOGGLE TOOL ---
    function setupPasswordToggles() {
        document.querySelectorAll(".toggle-password").forEach(icon => {
            icon.onclick = (e) => {
                e.preventDefault();
                const targetId = icon.getAttribute("data-target");
                const input = document.getElementById(targetId);
                if (input) {
                    if (input.type === "password") {
                        input.type = "text";
                        icon.classList.remove("mdi-eye-outline");
                        icon.classList.add("mdi-eye-off-outline");
                    } else {
                        input.type = "password";
                        icon.classList.remove("mdi-eye-off-outline");
                        icon.classList.add("mdi-eye-outline");
                    }
                }
            };
        });
    }

    // --- PASSWORD RESET & VERIFICATION FLOW CONTROLLER ---
    let activeResetEmail = "";
    let approvalIntervalId = null;

    function getResetRequests() {
        const reqs = localStorage.getItem("axt_reset_requests");
        if (reqs) {
            try { return JSON.parse(reqs); } catch (e) {}
        }
        return {};
    }

    function saveResetRequests(reqs) {
        localStorage.setItem("axt_reset_requests", JSON.stringify(reqs));
    }

    function pruneExpiredRequests() {
        const reqs = getResetRequests();
        const now = Date.now();
        let changed = false;
        for (const email in reqs) {
            if (now - reqs[email].timestamp > 5 * 60 * 1000) { // 5 minutes expiry
                delete reqs[email];
                changed = true;
            }
        }
        if (changed) {
            saveResetRequests(reqs);
        }
    }

    function setupPasswordResetFlow() {
        setupPasswordToggles();

        const loginCard = document.getElementById("login-card");
        const forgotCard = document.getElementById("forgot-card");
        const verifyCard = document.getElementById("verify-card");
        const waitApprovalCard = document.getElementById("wait-approval-card");
        const resetPasswordCard = document.getElementById("reset-password-card");

        const toForgotPwdLink = document.getElementById("to-forgot-pwd");
        const toLoginFromForgot = document.getElementById("to-login-from-forgot");
        const toLoginFromVerify = document.getElementById("to-login-from-verify");
        const cancelApprovalBtn = document.getElementById("cancel-approval-btn");

        const forgotForm = document.getElementById("forgot-form");
        const forgotEmailInput = document.getElementById("forgot-email");
        const forgotModeSelect = document.getElementById("forgot-mode");
        const forgotError = document.getElementById("forgot-error");

        const verifyForm = document.getElementById("verify-form");
        const verifyCodeInput = document.getElementById("verify-code");
        const verifyError = document.getElementById("verify-error");
        const verifySubtitle = document.getElementById("verify-subtitle");

        const btnCheckApproval = document.getElementById("btn-check-approval");
        const approvalTimeLeft = document.getElementById("approval-time-left");

        const resetPasswordForm = document.getElementById("reset-password-form");
        const resetOldPwdInput = document.getElementById("reset-old-password");
        const resetNewPwdInput = document.getElementById("reset-new-password");
        const resetConfirmPwdInput = document.getElementById("reset-confirm-password");
        const resetPasswordError = document.getElementById("reset-password-error");

        // Navigation toggles
        if (toForgotPwdLink) {
            toForgotPwdLink.onclick = (e) => {
                e.preventDefault();
                loginCard.classList.add("hidden");
                forgotCard.classList.remove("hidden");
                forgotForm.reset();
                forgotError.textContent = "";
            };
        }

        if (toLoginFromForgot) {
            toLoginFromForgot.onclick = (e) => {
                e.preventDefault();
                forgotCard.classList.add("hidden");
                loginCard.classList.remove("hidden");
            };
        }

        if (toLoginFromVerify) {
            toLoginFromVerify.onclick = (e) => {
                e.preventDefault();
                verifyCard.classList.add("hidden");
                loginCard.classList.remove("hidden");
            };
        }

        if (cancelApprovalBtn) {
            cancelApprovalBtn.onclick = (e) => {
                e.preventDefault();
                if (approvalIntervalId) {
                    clearInterval(approvalIntervalId);
                    approvalIntervalId = null;
                }
                // Delete active request
                if (activeResetEmail) {
                    const reqs = getResetRequests();
                    delete reqs[activeResetEmail];
                    saveResetRequests(reqs);
                }
                waitApprovalCard.classList.add("hidden");
                loginCard.classList.remove("hidden");
            };
        }

        // 1. Submit Request to Recover Password
        if (forgotForm) {
            forgotForm.onsubmit = (e) => {
                e.preventDefault();
                forgotError.textContent = "";
                pruneExpiredRequests();

                const email = forgotEmailInput.value.trim().toLowerCase();
                const mode = forgotModeSelect.value;

                // Validate account exists
                const admin = getAdminUser();
                const users = getLocalUsers();
                const accountExists = (email === admin.email.toLowerCase()) || users.some(u => u.email.toLowerCase() === email);

                if (!accountExists) {
                    forgotError.textContent = "Email này chưa được đăng ký trong hệ thống.";
                    return;
                }

                // Generate random OTP
                const code = Math.floor(1000 + Math.random() * 9000).toString();

                const reqs = getResetRequests();
                reqs[email] = {
                    email: email,
                    mode: mode,
                    code: code,
                    status: "pending",
                    timestamp: Date.now()
                };
                saveResetRequests(reqs);
                activeResetEmail = email;

                // Sync admin approvals table if admin is logged in
                if (typeof populateAdminApprovalsTable === "function") {
                    populateAdminApprovalsTable();
                }

                if (mode === "code") {
                    // Simulating sending Code to Email with prompt/alert
                    alert(`[EMAIL SIMULATOR] Gửi tới ${email}:\nMã OTP xác nhận đổi mật khẩu của bạn là: ${code}\n(Mã có hiệu lực trong vòng 5 phút)`);
                    
                    forgotCard.classList.add("hidden");
                    verifyCard.classList.remove("hidden");
                    verifyCodeInput.value = "";
                    verifyError.textContent = "";
                    verifySubtitle.innerHTML = `Nhập mã OTP 4 số đã được gửi tới <strong>${email}</strong> (hiệu lực 5 phút)`;
                } else {
                    // Send to admin approval waiting room
                    alert(`Yêu cầu đổi mật khẩu đã được chuyển tiếp đến Admin. Vui lòng liên hệ Admin phê duyệt trong vòng 5 phút.`);
                    
                    forgotCard.classList.add("hidden");
                    waitApprovalCard.classList.remove("hidden");
                    approvalTimeLeft.textContent = "Đang chờ Admin click phê duyệt trên hệ thống...";
                    
                    // Periodically poll for status updates
                    if (approvalIntervalId) clearInterval(approvalIntervalId);
                    approvalIntervalId = setInterval(() => {
                        pruneExpiredRequests();
                        const r = getResetRequests()[activeResetEmail];
                        if (!r) {
                            clearInterval(approvalIntervalId);
                            approvalIntervalId = null;
                            alert("Yêu cầu của bạn đã hết hạn hoặc bị hủy (quá 5 phút).");
                            waitApprovalCard.classList.add("hidden");
                            loginCard.classList.remove("hidden");
                        } else if (r.status === "approved") {
                            clearInterval(approvalIntervalId);
                            approvalIntervalId = null;
                            alert("Yêu cầu của bạn đã được Admin phê duyệt thành công!");
                            waitApprovalCard.classList.add("hidden");
                            resetPasswordCard.classList.remove("hidden");
                            resetPasswordForm.reset();
                            resetPasswordError.textContent = "";
                        }
                    }, 5000); // Poll every 5s
                }
            };
        }

        // 2. Submit OTP Code Verification
        if (verifyForm) {
            verifyForm.onsubmit = (e) => {
                e.preventDefault();
                verifyError.textContent = "";
                pruneExpiredRequests();

                const codeEntered = verifyCodeInput.value.trim();
                const reqs = getResetRequests();
                const r = reqs[activeResetEmail];

                if (!r) {
                    verifyError.textContent = "Yêu cầu đã hết hạn (quá 5 phút). Vui lòng gửi lại yêu cầu mới.";
                    return;
                }

                if (r.code !== codeEntered) {
                    verifyError.textContent = "Mã xác thực OTP không chính xác.";
                    return;
                }

                // Authorized successfully! Move to reset page
                verifyCard.classList.add("hidden");
                resetPasswordCard.classList.remove("hidden");
                resetPasswordForm.reset();
                resetPasswordError.textContent = "";
            };
        }

        // 3. Manual status check button
        if (btnCheckApproval) {
            btnCheckApproval.onclick = () => {
                pruneExpiredRequests();
                const r = getResetRequests()[activeResetEmail];
                if (!r) {
                    alert("Yêu cầu đã hết hạn hoặc không tồn tại. Vui lòng thử lại!");
                    waitApprovalCard.classList.add("hidden");
                    loginCard.classList.remove("hidden");
                } else if (r.status === "approved") {
                    if (approvalIntervalId) {
                        clearInterval(approvalIntervalId);
                        approvalIntervalId = null;
                    }
                    alert("Yêu cầu đã được phê duyệt!");
                    waitApprovalCard.classList.add("hidden");
                    resetPasswordCard.classList.remove("hidden");
                    resetPasswordForm.reset();
                    resetPasswordError.textContent = "";
                } else {
                    alert("Admin vẫn đang xử lý yêu cầu của bạn. Vui lòng đợi thêm hoặc báo Admin phê duyệt.");
                }
            };
        }

        // 4. Update Password Form
        if (resetPasswordForm) {
            resetPasswordForm.onsubmit = (e) => {
                e.preventDefault();
                resetPasswordError.textContent = "";
                
                const oldPwd = resetOldPwdInput.value;
                const newPwd = resetNewPwdInput.value;
                const confirmPwd = resetConfirmPwdInput.value;

                if (newPwd !== confirmPwd) {
                    resetPasswordError.textContent = "Xác nhận mật khẩu mới không khớp.";
                    return;
                }

                if (newPwd.length < 4) {
                    resetPasswordError.textContent = "Mật khẩu mới phải từ 4 ký tự trở lên.";
                    return;
                }

                const admin = getAdminUser();
                const users = getLocalUsers();

                if (activeResetEmail === admin.email.toLowerCase()) {
                    // Check old password
                    if (admin.password !== oldPwd) {
                        resetPasswordError.textContent = "Mật khẩu cũ của Admin không chính xác.";
                        return;
                    }
                    // Update admin password
                    admin.password = newPwd;
                    localStorage.setItem("axt_admin", JSON.stringify(admin));
                } else {
                    // Standard user
                    const uIdx = users.findIndex(u => u.email.toLowerCase() === activeResetEmail);
                    if (uIdx !== -1) {
                        if (users[uIdx].password !== oldPwd) {
                            resetPasswordError.textContent = "Mật khẩu cũ không chính xác.";
                            return;
                        }
                        users[uIdx].password = newPwd;
                        localStorage.setItem("axt_users", JSON.stringify(users));
                    } else {
                        resetPasswordError.textContent = "Lỗi hệ thống: Không tìm thấy tài khoản.";
                        return;
                    }
                }

                // Delete request
                const reqs = getResetRequests();
                delete reqs[activeResetEmail];
                saveResetRequests(reqs);

                alert("Chúc mừng! Mật khẩu tài khoản đã được đặt lại thành công. Vui lòng đăng nhập.");
                resetPasswordCard.classList.add("hidden");
                loginCard.classList.remove("hidden");
            };
        }
    }

    // --- ADMIN APPROVAL CENTER HANDLERS ---
    window.populateAdminApprovalsTable = function() {
        const tbody = document.getElementById("admin-approvals-table-body");
        if (!tbody) return;
        tbody.innerHTML = "";
        
        pruneExpiredRequests();
        const reqs = getResetRequests();
        const emails = Object.keys(reqs).filter(email => reqs[email].mode === "admin");

        if (emails.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 20px;">Không có yêu cầu phê duyệt đổi mật khẩu nào đang chờ.</td></tr>`;
            return;
        }

        emails.forEach(email => {
            const req = reqs[email];
            const tr = document.createElement("tr");

            // Calculate countdown
            const elapsed = Date.now() - req.timestamp;
            const remainingSec = Math.max(0, Math.floor((5 * 60 * 1000 - elapsed) / 1000));
            const min = Math.floor(remainingSec / 60);
            const sec = remainingSec % 60;
            const timeStr = `${min} phút ${sec} giây`;

            const date = new Date(req.timestamp);
            const requestedTime = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

            tr.innerHTML = `
                <td><strong>${req.email}</strong></td>
                <td>${requestedTime}</td>
                <td><span class="badge ${remainingSec < 60 ? 'badge-low' : ''}" style="color: var(--primary); border-color: rgba(0, 242, 254, 0.2); background: rgba(0, 242, 254, 0.05);">${timeStr}</span></td>
                <td style="text-align: center;">
                    ${req.status === 'approved' ? 
                        `<span style="color: var(--green); font-weight: 600; font-size: 13px;"><span class="mdi mdi-check-circle-outline"></span> Đã phê duyệt</span>` :
                        `<button class="btn btn-outline" style="padding: 6px 12px; border-color: var(--green); color: var(--green); margin-right: 5px;" onclick="approveResetRequest('${req.email}')">Đồng ý</button>
                         <button class="btn btn-outline" style="padding: 6px 12px; border-color: var(--red); color: var(--red);" onclick="rejectResetRequest('${req.email}')">Từ chối</button>`
                    }
                </td>
            `;
            tbody.appendChild(tr);
        });
    };

    window.approveResetRequest = function(email) {
        const reqs = getResetRequests();
        if (reqs[email]) {
            reqs[email].status = "approved";
            saveResetRequests(reqs);
            populateAdminApprovalsTable();
            alert(`Đã phê duyệt yêu cầu đổi mật khẩu của tài khoản ${email}.`);
        }
    };

    window.rejectResetRequest = function(email) {
        const reqs = getResetRequests();
        if (reqs[email]) {
            delete reqs[email];
            saveResetRequests(reqs);
            populateAdminApprovalsTable();
            alert(`Đã từ chối yêu cầu đổi mật khẩu của tài khoản ${email}.`);
        }
    };

    // Auto-update countdown every 10 seconds for admin panel approvals
    setInterval(() => {
        const activeTab = document.getElementById("users-tab");
        if (activeTab && activeTab.classList.contains("active")) {
            populateAdminApprovalsTable();
        }
    }, 10000);

    // --- FLOATING CHAT WIDGET CONTROLLER ---
    let selectedThreadUser = null;
    let chatUnreadCount = 0;

    function getChatMessages() {
        const msgs = localStorage.getItem("axt_chat_messages");
        if (msgs) {
            try { return JSON.parse(msgs); } catch(e) {}
        }
        return [];
    }

    function saveChatMessages(msgs) {
        localStorage.setItem("axt_chat_messages", JSON.stringify(msgs));
    }

    window.initChatWidget = function() {
        const savedUser = localStorage.getItem("axt_current_user") || sessionStorage.getItem("axt_current_user");
        if (!savedUser) return;
        const currentUser = JSON.parse(savedUser);
        const admin = getAdminUser();
        const isAdmin = currentUser.email.toLowerCase() === admin.email.toLowerCase();

        const chatWindow = document.getElementById("chat-window");
        const chatTriggerBtn = document.getElementById("chat-trigger-btn");
        const chatBadge = document.getElementById("chat-badge");
        const chatMinimizeBtn = document.getElementById("chat-minimize-btn");
        const chatAdminConfig = document.getElementById("chat-admin-config");
        const aiModeSelect = document.getElementById("ai-mode-select");
        const chatThreadsPane = document.getElementById("chat-threads-pane");
        const chatThreadsList = document.getElementById("chat-threads-list");
        const chatMessagesPane = document.getElementById("chat-messages-pane");
        const chatMessagesScroll = document.getElementById("chat-messages-scroll");
        const chatSuggestions = document.getElementById("chat-suggestions");
        const chatInputForm = document.getElementById("chat-input-form");
        const chatMessageInput = document.getElementById("chat-message-input");
        const chatBackThreadsBtn = document.getElementById("chat-back-threads-btn");
        const chatWindowTitle = document.getElementById("chat-window-title");
        const chatWindowStatus = document.getElementById("chat-window-status");
        const chatAvatarIcon = document.getElementById("chat-avatar-icon");

        // Load messages database
        let messages = getChatMessages();

        // Load AI settings
        let aiMode = localStorage.getItem("axt_ai_mode") || "ON";
        if (aiModeSelect) aiModeSelect.value = aiMode;

        // Toggle chat window visibility
        chatTriggerBtn.onclick = (e) => {
            e.stopPropagation();
            if (chatWindow.style.display === "none") {
                chatWindow.style.display = "flex";
                chatTriggerBtn.querySelector(".chat-icon").style.display = "none";
                chatTriggerBtn.querySelector(".close-icon").style.display = "block";
                chatUnreadCount = 0;
                chatBadge.style.display = "none";
                chatBadge.textContent = "0";
                
                // If standard user, seed greeting
                if (!isAdmin) {
                    seedUserGreeting(currentUser);
                }
                renderChatContent();
            } else {
                closeChatWindow();
            }
        };

        chatMinimizeBtn.onclick = (e) => {
            e.stopPropagation();
            closeChatWindow();
        };

        function closeChatWindow() {
            chatWindow.style.display = "none";
            chatTriggerBtn.querySelector(".chat-icon").style.display = "block";
            chatTriggerBtn.querySelector(".close-icon").style.display = "none";
        }

        // Handle AI select settings
        if (aiModeSelect) {
            aiModeSelect.onchange = () => {
                aiMode = aiModeSelect.value;
                localStorage.setItem("axt_ai_mode", aiMode);
                updateAIStatusDisplay();
                
                // Refresh suggestions view based on new AI Mode
                if (!isAdmin) {
                    if (aiMode === "ON") {
                        chatSuggestions.style.display = "flex";
                        renderSuggestionsChips();
                    } else {
                        chatSuggestions.style.display = "none";
                    }
                }
            };
        }

        function updateAIStatusDisplay() {
            if (isAdmin) {
                chatWindowTitle.textContent = "Admin Chat Center";
                chatWindowStatus.innerHTML = `<span class="status-dot online"></span>Trực tuyến (AI: ${aiMode})`;
                chatAvatarIcon.className = "mdi mdi-shield-account-outline";
            } else {
                if (aiMode === "ON") {
                    chatWindowTitle.textContent = "AI Assistant";
                    chatWindowStatus.innerHTML = `<span class="status-dot online"></span>Trực tuyến`;
                    chatAvatarIcon.className = "mdi mdi-robot-outline";
                } else if (aiMode === "AWAY") {
                    chatWindowTitle.textContent = "AI Assistant (Away)";
                    chatWindowStatus.innerHTML = `<span class="status-dot away"></span>Vắng mặt`;
                    chatAvatarIcon.className = "mdi mdi-robot-off-outline";
                } else {
                    chatWindowTitle.textContent = "LinhBeo Admin Support";
                    chatWindowStatus.innerHTML = `<span class="status-dot away"></span>Chờ phản hồi`;
                    chatAvatarIcon.className = "mdi mdi-account-outline";
                }
            }
        }

        function seedUserGreeting(user) {
            messages = getChatMessages();
            const userMsgs = messages.filter(m => m.from === user.email || m.to === user.email);
            if (userMsgs.length === 0) {
                // Initial message
                const newMsg = {
                    id: "greeting_" + Date.now(),
                    from: "ai",
                    to: user.email,
                    text: `Xin chào ${user.name}! Mình là Trợ lý AI của LinhBeo Weather. Mình có thể giúp gì cho bạn hôm nay?`,
                    timestamp: new Date().toISOString(),
                    senderName: "AI Assistant",
                    isRead: true
                };
                messages.push(newMsg);
                saveChatMessages(messages);
            }
        }

        function renderChatContent() {
            messages = getChatMessages();
            updateAIStatusDisplay();

            if (isAdmin) {
                chatAdminConfig.style.display = "flex";
                if (!selectedThreadUser) {
                    // Show thread selector pane
                    chatThreadsPane.style.display = "block";
                    chatMessagesPane.style.display = "none";
                    chatSuggestions.style.display = "none";
                    chatBackThreadsBtn.style.display = "none";
                    renderThreadsList();
                } else {
                    // Show conversation with the selected user
                    chatThreadsPane.style.display = "none";
                    chatMessagesPane.style.display = "flex";
                    chatSuggestions.style.display = "none";
                    chatBackThreadsBtn.style.display = "flex";
                    
                    // Mark messages in this thread as read
                    messages.forEach(m => {
                        if (m.from === selectedThreadUser && m.to === admin.email) {
                            m.isRead = true;
                        }
                    });
                    saveChatMessages(messages);
                    
                    renderMessages(selectedThreadUser);
                }
            } else {
                // Standard user
                chatAdminConfig.style.display = "none";
                chatThreadsPane.style.display = "none";
                chatMessagesPane.style.display = "flex";
                chatBackThreadsBtn.style.display = "none";
                
                if (aiMode === "ON") {
                    chatSuggestions.style.display = "flex";
                    renderSuggestionsChips();
                } else {
                    chatSuggestions.style.display = "none";
                }
                
                renderMessages(currentUser.email);
            }
        }

        chatBackThreadsBtn.onclick = () => {
            selectedThreadUser = null;
            renderChatContent();
        };

        function renderThreadsList() {
            chatThreadsList.innerHTML = "";
            messages = getChatMessages();
            
            // Get unique standard user emails
            const userEmails = [...new Set(messages.map(m => m.from === admin.email ? m.to : m.from))].filter(email => email !== admin.email && email !== "ai");
            
            if (userEmails.length === 0) {
                chatThreadsList.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 30px 10px; font-size: 13px;">Chưa có cuộc hội thoại nào.</div>`;
                return;
            }

            // Find names of users
            const usersDb = getLocalUsers();
            
            userEmails.forEach(email => {
                const u = usersDb.find(x => x.email.toLowerCase() === email.toLowerCase()) || { name: email.split("@")[0] };
                const userThreadMsgs = messages.filter(m => (m.from === email && m.to === admin.email) || (m.from === admin.email && m.to === email));
                const unreadCount = userThreadMsgs.filter(m => m.from === email && !m.isRead).length;
                
                const item = document.createElement("div");
                item.className = "chat-thread-item";
                item.onclick = () => {
                    selectedThreadUser = email;
                    renderChatContent();
                };
                
                item.innerHTML = `
                    <div class="thread-item-info">
                        <div class="thread-avatar">${u.name.charAt(0).toUpperCase()}</div>
                        <div class="thread-name">${u.name}</div>
                    </div>
                    ${unreadCount > 0 ? `<div class="thread-unread-badge">${unreadCount}</div>` : ""}
                `;
                chatThreadsList.appendChild(item);
            });
        }

        function renderMessages(userEmail) {
            chatMessagesScroll.innerHTML = "";
            messages = getChatMessages();
            
            const threadMsgs = messages.filter(m => 
                (m.from === userEmail && m.to === admin.email) || 
                (m.from === admin.email && m.to === userEmail) ||
                (m.from === "ai" && m.to === userEmail)
            );

            threadMsgs.forEach(m => {
                const isSent = isAdmin ? (m.from === admin.email) : (m.from === currentUser.email);
                const bubble = document.createElement("div");
                bubble.className = `chat-bubble ${isSent ? "sent" : "received"}`;
                
                let sender = m.senderName;
                if (m.from === "ai") sender = "AI Assistant";

                // Format timestamp
                const date = new Date(m.timestamp);
                const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                bubble.innerHTML = `
                    <span class="bubble-sender">${sender}</span>
                    <div class="bubble-content">${m.text}</div>
                    <span class="bubble-time">${timeStr}</span>
                `;
                chatMessagesScroll.appendChild(bubble);
            });

            // Scroll to bottom
            setTimeout(() => {
                chatMessagesScroll.scrollTop = chatMessagesScroll.scrollHeight;
            }, 50);
        }

        function renderSuggestionsChips() {
            chatSuggestions.innerHTML = "";
            const chips = [
                "Thiết bị đo thông số gì?",
                "Xem tọa độ GPS thiết bị",
                "Cách xuất dữ liệu CSV",
                "Làm sao sửa thông tin cá nhân?"
            ];

            chips.forEach(text => {
                const chip = document.createElement("div");
                chip.className = "suggestion-chip";
                chip.textContent = text;
                chip.onclick = () => {
                    sendMessage(text);
                };
                chatSuggestions.appendChild(chip);
            });
        }

        // Handle sending messages
        chatInputForm.onsubmit = (e) => {
            e.preventDefault();
            const text = chatMessageInput.value.trim();
            if (!text) return;
            chatMessageInput.value = "";
            sendMessage(text);
        };

        function sendMessage(text) {
            messages = getChatMessages();
            const timestamp = new Date().toISOString();
            
            // 1. Create message from user
            const fromEmail = isAdmin ? admin.email : currentUser.email;
            const toEmail = isAdmin ? selectedThreadUser : admin.email;
            const senderName = isAdmin ? admin.name : currentUser.name;

            const newMsg = {
                id: "msg_" + Date.now(),
                from: fromEmail,
                to: toEmail,
                text: text,
                timestamp: timestamp,
                senderName: senderName,
                isRead: false
            };

            messages.push(newMsg);
            saveChatMessages(messages);
            renderMessages(isAdmin ? selectedThreadUser : currentUser.email);

            // 2. Handle AI automatic replies if sending to admin and we are not admin
            if (!isAdmin) {
                handleAIReply(text, currentUser.email);
            }
        }

        function handleAIReply(userText, userEmail) {
            messages = getChatMessages();
            const timestamp = new Date().toISOString();
            
            let replyText = "";
            if (aiMode === "AWAY") {
                replyText = "Admin hiện đang vắng mặt. Vui lòng đợi đến khi Admin online để được tư vấn trực tiếp.";
            } else if (aiMode === "ON") {
                const cleanText = userText.toLowerCase();
                const activeProj = projectsList.find(p => p.id === activeProjectId) || { name: "Mặc định", deviceId: "device_A23", latitude: 10.762622, longitude: 106.660172 };

                if (cleanText.includes("đo") || cleanText.includes("thông số") || cleanText.includes("tính năng") || cleanText.includes("thiết bị") || cleanText.includes("chức năng")) {
                    replyText = `Dự án hiện tại của bạn là **${activeProj.name}** đang chạy Thiết bị **${activeProj.deviceId || 'device_A23'}** tại tọa độ GPS: **${activeProj.latitude.toFixed(4)}, ${activeProj.longitude.toFixed(4)}**. Thiết bị này đo đạc các chỉ số: Nhiệt độ (°C), Độ ẩm (%), Lượng mưa (mm), Tốc độ gió (km/h), Bức xạ UV và Bức xạ mặt trời (W/m²).`;
                } else if (cleanText.includes("vị trí") || cleanText.includes("gps") || cleanText.includes("tọa độ") || cleanText.includes("địa điểm") || cleanText.includes("hồ chí minh") || cleanText.includes("hcm")) {
                    replyText = `Thiết bị của dự án **${activeProj.name}** hiện đang được định vị tại khu vực TP. Hồ Chí Minh với tọa độ GPS chính xác là: Latitude **${activeProj.latitude.toFixed(4)}**, Longitude **${activeProj.longitude.toFixed(4)}**.`;
                } else if (cleanText.includes("xuất") || cleanText.includes("tải") || cleanText.includes("download") || cleanText.includes("csv") || cleanText.includes("excel") || cleanText.includes("lịch sử") || cleanText.includes("nhật ký") || cleanText.includes("log")) {
                    replyText = "Để tải về lịch sử đo đạc, bạn hãy chuyển sang tab **Telemetry Logs** (hoặc truy cập đường dẫn #logs), chọn khoảng thời gian mong muốn rồi nhấn nút **Export CSV** hoặc **Export Excel** ở phía trên bảng ghi chép dữ liệu.";
                } else if (cleanText.includes("đổi mật khẩu") || cleanText.includes("mật khẩu") || cleanText.includes("tài khoản") || cleanText.includes("cá nhân") || cleanText.includes("profile") || cleanText.includes("sửa thông tin")) {
                    replyText = "Bạn có thể tự chỉnh sửa thông tin cá nhân (Tên, Email, Mật khẩu) của mình bằng cách bấm trực tiếp vào thẻ thông tin tài khoản hiển thị ở dưới cùng thanh Sidebar bên trái.";
                } else if (cleanText.includes("thêm dự án") || cleanText.includes("thêm thiết bị") || cleanText.includes("dự án mới") || cleanText.includes("quản lý")) {
                    replyText = "Bạn có thể quản lý và đăng ký thiết bị mới tại tab **Manage Projects** (#projects). Hãy click vào nút **Add Project**, nhập tên dự án và mã ID thiết bị của bạn.";
                } else if (cleanText.includes("chào") || cleanText.includes("hello") || cleanText.includes("hi") || cleanText.includes("xin chào")) {
                    replyText = `Xin chào ${currentUser.name}! Mình là Trợ lý AI, mình có thể giúp bạn giải đáp các thông tin về hoạt động thiết bị, thông số đo đạc, tọa độ GPS hoặc cách sử dụng trang web.`;
                } else {
                    replyText = "Cảm ơn câu hỏi của bạn! Mình là Trợ lý AI. Bạn có thể hỏi mình các câu hỏi về: tính năng thiết bị, vị trí GPS dự án, cách xuất file CSV, hay chỉnh sửa tài khoản cá nhân. Nếu bạn cần gặp trực tiếp Admin, vui lòng để lại lời nhắn, Admin sẽ rep lại bạn ngay khi online nhé!";
                }
            }

            if (replyText) {
                // Add AI reply message after a slight delay for realistic chat feel
                setTimeout(() => {
                    messages = getChatMessages();
                    const aiMsg = {
                        id: "ai_" + Date.now(),
                        from: "ai",
                        to: userEmail,
                        text: replyText,
                        timestamp: new Date().toISOString(),
                        senderName: "AI Assistant",
                        isRead: true
                    };
                    messages.push(aiMsg);
                    saveChatMessages(messages);
                    
                    if (chatWindow.style.display === "flex") {
                        renderMessages(userEmail);
                    }
                }, 600);
            }
        }
    };

    // --- Start App ---
    setupPasswordResetFlow();
    // Initialization is completely handled by the authentication check on load
});
