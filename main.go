package main

import (
	"bytes"
	"database/sql"
	"encoding/base64"
	"encoding/csv"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/http/cookiejar"
	"os"
	"path/filepath"
	"strings"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

// Configurations
const (
	API_BASE      = "https://v2.api.axisstream.co/api"
	DATA_API_BASE = "https://data.api.axisstream.co"
	FORECAST_BASE = "https://provider.api.axisstream.co"
)

type Config struct {
	Email    string
	Password string
}

// JSON Structures
type LoginResponse struct {
	Status  string `json:"status"`
	Message string `json:"message"`
	Token   string `json:"token"`
}

type Organisation struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Schema string `json:"schema"`
}

type Project struct {
	ID           string       `json:"id"`
	Name         string       `json:"name"`
	Organisation Organisation `json:"organisation"`
}

type ProjectListResponse struct {
	Data []Project `json:"data"`
}

type Source struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Code        string `json:"code"`
}

type Device struct {
	ID         string   `json:"id"`
	Name       string   `json:"name"`
	ExternalID string   `json:"externalId"`
	Sources    []Source `json:"sources"`
}

type DeviceListResponse struct {
	Data []Device `json:"data"`
}

type Provider struct {
	ID     string `json:"id"`
	Code   string `json:"code"`
	Status string `json:"status"`
}

type ProviderListResponse struct {
	Data []Provider `json:"data"`
}

type AttributeMeta struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Code        string `json:"code"`
	Description string `json:"description"`
}

type TelemetryMeta struct {
	Total      int             `json:"total"`
	Page       int             `json:"page"`
	PerPage    int             `json:"perPage"`
	TotalPages int             `json:"totalPages"`
	Attributes []AttributeMeta `json:"attributes"`
}

type TelemetryResponse struct {
	Data []map[string]interface{} `json:"data"`
	Meta TelemetryMeta            `json:"meta"`
}

func main() {
	serverMode := flag.Bool("server", false, "Run in web server mode")
	flag.Parse()

	// Initialize database
	if err := initDB(); err != nil {
		fmt.Printf("[LỖI] Khởi tạo cơ sở dữ liệu thất bại: %v\n", err)
	} else {
		fmt.Println("[CƠ SỞ DỮ LIỆU] Khởi tạo cơ sở dữ liệu SQLite thành công.")
		importExistingCSVToDB()
	}

	// On Render, the PORT environment variable is always defined.
	port := os.Getenv("PORT")
	if port != "" {
		*serverMode = true
	}

	if *serverMode {
		runWebServer(port)
	} else {
		runCrawlerOnce()
	}
}

func runWebServer(port string) {
	if port == "" {
		port = "8080"
	}

	// Start background crawler goroutine
	go func() {
		for {
			fmt.Println("[BACKGROUND] Khởi chạy crawler thu thập dữ liệu trong nền...")
			runCrawlerOnce()
			fmt.Println("[BACKGROUND] Hoàn thành crawler nền. Đang ngủ 1 giờ...")
			time.Sleep(1 * time.Hour)
		}
	}()

	// Register API data handler
	http.HandleFunc("/api/data", handleAPIData)

	// Serve static files
	fs := http.FileServer(http.Dir("."))
	http.Handle("/", fs)

	fmt.Printf("[SERVER] Trang web chạy chế độ ĐỘNG trên cổng: %s...\n", port)
	err := http.ListenAndServe(":"+port, nil)
	if err != nil {
		log.Fatalf("[SERVER ERROR] %v\n", err)
	}
}

func runCrawlerOnce() {
	fmt.Println("=== BẮT ĐẦU CHƯƠNG TRÌNH THU THẬP DỮ LIỆU AXISSTREAM ===")

	// 1. Load config
	config, err := loadConfig()
	if err != nil {
		fmt.Printf("[LỖI] Không thể đọc cấu hình: %v\n", err)
		return
	}

	// 2. Init HTTP Client
	jar, _ := cookiejar.New(nil)
	client := &http.Client{
		Jar:     jar,
		Timeout: 40 * time.Second,
	}

	// 3. Login
	fmt.Printf("Đang đăng nhập tài khoản: %s...\n", config.Email)
	token, err := login(client, config.Email, config.Password)
	if err != nil {
		fmt.Printf("[LỖI] Đăng nhập thất bại: %v\n", err)
		return
	}
	fmt.Println("[THÀNH CÔNG] Đăng nhập thành công.")

	// 4. Fetch projects
	fmt.Println("Đang lấy danh sách dự án (projects)...")
	projects, err := fetchProjects(client, token)
	if err != nil {
		fmt.Printf("[LỖI] Không lấy được danh sách dự án: %v\n", err)
		return
	}
	fmt.Printf("Tìm thấy %d dự án.\n", len(projects))

	// 5. Scrape data for each project
	for _, proj := range projects {
		fmt.Printf("\n-----------------------------------------\n")
		fmt.Printf("Xử lý dự án: %s (ID: %s)\n", proj.Name, proj.ID)

		// Create directories for the project
		projectDir := sanitizeFilename(proj.Name)
		stationsDir := filepath.Join("data", projectDir, "stations")
		forecastsDir := filepath.Join("data", projectDir, "forecasts")

		if err := os.MkdirAll(stationsDir, 0755); err != nil {
			fmt.Printf("[LỖI] Không thể tạo thư mục %s: %v\n", stationsDir, err)
			continue
		}
		if err := os.MkdirAll(forecastsDir, 0755); err != nil {
			fmt.Printf("[LỖI] Không thể tạo thư mục %s: %v\n", forecastsDir, err)
			continue
		}

		// Scrape weather stations telemetry
		scrapeWeatherStations(client, token, proj, stationsDir)

		// Scrape Jane's Weather forecast
		scrapeJanesForecast(client, token, proj, forecastsDir)
	}

	fmt.Println("\n=== HOÀN THÀNH THU THẬP DỮ LIỆU ===")
	
	// Tự động đồng bộ hóa dữ liệu vào website
	fmt.Println("\nĐang đồng bộ hóa dữ liệu trực tiếp vào website...")
	err = generateDataJS()
	if err != nil {
		fmt.Printf("[LỖI] Không thể tự động đồng bộ hóa website: %v\n", err)
	} else {
		fmt.Println("[THÀNH CÔNG] Website đã được đồng bộ hóa dữ liệu mới nhất.")
	}
}

// Find telemetry and forecast JSON paths recursively inside data directory
func findTelemetryAndForecastPaths() (string, string) {
	var telemetryPath, forecastPath string
	_ = filepath.Walk("data", func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if !info.IsDir() {
			if strings.HasSuffix(info.Name(), "_telemetry.csv") {
				telemetryPath = path
			} else if info.Name() == "janes_weather_forecast.json" {
				forecastPath = path
			}
		}
		return nil
	})
	return telemetryPath, forecastPath
}

// Generates data.js dynamically from telemetry CSV and forecast JSON
func generateDataJS() error {
	telemetryPath, forecastPath := findTelemetryAndForecastPaths()
	if telemetryPath == "" {
		return fmt.Errorf("không tìm thấy file telemetry CSV")
	}
	if forecastPath == "" {
		return fmt.Errorf("không tìm thấy file forecast JSON")
	}

	// 1. Read telemetry CSV
	csvFile, err := os.Open(telemetryPath)
	if err != nil {
		return err
	}
	defer csvFile.Close()

	reader := csv.NewReader(csvFile)
	headers, err := reader.Read()
	if err != nil {
		return err
	}

	colMap := map[string]string{
		"Timestamp":                    "time",
		"Atmospheric Temperature (°C)": "temperature_avg",
		"Average Humidity (%)":         "humidity_avg",
		"Rainfall (mm)":                "rainfall",
		"Total Rainfall (mm)":          "rainfall_total",
		"Average Wind Speed  (km/h)":   "wind_speed_avg",
		"Wind Direction":               "wind_dir_var_avg",
		"MSL Pressure (hPa)":           "msl_pressure",
		"AverageSolarRadiation (W/m2)": "solar_rad_avg",
		"Average Delta T (°C)":         "deltat_avg",
		"Average Dew Point (°C)":       "dew_point_avg",
	}

	var telemetryData []map[string]interface{}
	for {
		row, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}

		record := make(map[string]interface{})
		for i, header := range headers {
			if i >= len(row) {
				break
			}
			h := strings.TrimSpace(header)
			jsKey, ok := colMap[h]
			if !ok {
				jsKey = h
			}
			val := row[i]
			if val == "" {
				record[jsKey] = nil
			} else {
				record[jsKey] = val
			}
		}
		telemetryData = append(telemetryData, record)
		if len(telemetryData) >= 500 {
			break
		}
	}

	// 2. Read forecast JSON
	forecastBytes, err := os.ReadFile(forecastPath)
	if err != nil {
		return err
	}

	var forecastData map[string]interface{}
	err = json.Unmarshal(forecastBytes, &forecastData)
	if err != nil {
		return err
	}
	forecastData["location"] = "Hồ Chí Minh, Việt Nam"

	// 3. Write data.js
	out, err := os.Create("data.js")
	if err != nil {
		return err
	}
	defer out.Close()

	telemetryJSON, _ := json.MarshalIndent(telemetryData, "", "  ")
	forecastJSON, _ := json.MarshalIndent(forecastData, "", "  ")

	_, _ = out.WriteString("// Auto-generated weather data file\n\n")
	_, _ = out.WriteString("const WEATHER_TELEMETRY = ")
	_, _ = out.Write(telemetryJSON)
	_, _ = out.WriteString(";\n\n")
	_, _ = out.WriteString("const JANES_FORECAST = ")
	_, _ = out.Write(forecastJSON)
	_, _ = out.WriteString(";\n")

	return nil
}

// Scrapes weather stations in a project
func scrapeWeatherStations(client *http.Client, token string, proj Project, outDir string) {
	fmt.Println("  Đang lấy danh sách trạm thời tiết...")
	devices, err := fetchWeatherDevices(client, token, proj.ID)
	if err != nil {
		fmt.Printf("  [LỖI] Lỗi lấy danh sách trạm thời tiết: %v\n", err)
		return
	}

	if len(devices) == 0 {
		fmt.Println("  Không tìm thấy trạm thời tiết nào trong dự án này.")
		return
	}

	fmt.Printf("  Tìm thấy %d trạm thời tiết.\n", len(devices))
	for _, dev := range devices {
		fmt.Printf("    -> Cào dữ liệu cho trạm: %s (External ID: %s)...\n", dev.Name, dev.ExternalID)
		
		// Find weather source
		var weatherSource *Source
		for _, src := range dev.Sources {
			if src.Code == "weather" {
				weatherSource = &src
				break
			}
		}

		if weatherSource == nil {
			fmt.Println("      [BỎ QUA] Không tìm thấy nguồn dữ liệu 'weather' của thiết bị này.")
			continue
		}

		// Download telemetry data paginated
		err := downloadTelemetry(client, token, proj.Organisation.Schema, proj.ID, dev.ExternalID, weatherSource.ID, dev.Name, outDir)
		if err != nil {
			fmt.Printf("      [LỖI] Cào dữ liệu thất bại: %v\n", err)
		}
	}
}

// Scrapes Jane's Weather Forecast for a project
func scrapeJanesForecast(client *http.Client, token string, proj Project, outDir string) {
	fmt.Println("  Đang kiểm tra kết nối Jane's Weather...")
	providers, err := fetchProviders(client, token, proj.ID)
	if err != nil {
		fmt.Printf("  [LỖI] Lỗi lấy danh sách nhà cung cấp: %v\n", err)
		return
	}

	var janesProviderID string
	for _, prov := range providers {
		if prov.Code == "janes_weather" && prov.Status == "CONNECTED" {
			janesProviderID = prov.ID
			break
		}
	}

	if janesProviderID == "" {
		fmt.Println("  [THÔNG BÁO] Không có kết nối Jane's Weather hoạt động (CONNECTED) trong dự án này.")
		return
	}

	fmt.Printf("  Tìm thấy kết nối Jane's Weather (ID: %s). Đang tải dự báo...\n", janesProviderID)
	url := fmt.Sprintf("%s/janes_weather/forecast/project/%s/provider/%s", FORECAST_BASE, proj.ID, janesProviderID)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		fmt.Printf("  [LỖI] Không thể tạo request: %v\n", err)
		return
	}
	req.Header.Set("User-Agent", "Mozilla/5.0")
	req.Header.Set("Cookie", fmt.Sprintf("axt_token=%s", token))

	resp, err := client.Do(req)
	if err != nil {
		fmt.Printf("  [LỖI] Gọi API dự báo thất bại: %v\n", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		fmt.Printf("  [LỖI] API dự báo trả về mã trạng thái: %d\n", resp.StatusCode)
		return
	}

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		fmt.Printf("  [LỖI] Lỗi đọc phản hồi dự báo: %v\n", err)
		return
	}

	// Write JSON
	outFile := filepath.Join(outDir, "janes_weather_forecast.json")
	err = os.WriteFile(outFile, bodyBytes, 0644)
	if err != nil {
		fmt.Printf("  [LỖI] Không thể ghi file JSON dự báo: %v\n", err)
		return
	}
	fmt.Printf("  [THÀNH CÔNG] Đã lưu dự báo thời tiết tại: %s\n", outFile)
	saveForecastToDB(proj.ID, bodyBytes)
}

// Downloads telemetry records and writes to CSV
func downloadTelemetry(client *http.Client, token, schema, projID, devExtID, sourceID, devName, outDir string) error {
	perPage := 100
	page := 1
	var csvWriter *csv.Writer
	var file *os.File
	var attributeCodes []string

	defer func() {
		if file != nil {
			csvWriter.Flush()
			file.Close()
		}
	}()

	for {
		// Build serverParams base64 JSON
		paramsMap := map[string]interface{}{
			"page":                 page,
			"perPage":              perPage,
			"serverColumnFilters":  []interface{}{},
		}
		paramsJSON, err := json.Marshal(paramsMap)
		if err != nil {
			return fmt.Errorf("lỗi tạo params: %v", err)
		}
		serverParams := base64.StdEncoding.EncodeToString(paramsJSON)

		url := fmt.Sprintf("%s/tenants/%s/sources/%s/data?project=%s&id=%s&serverParams=%s",
			DATA_API_BASE, schema, sourceID, projID, devExtID, serverParams)

		req, err := http.NewRequest("GET", url, nil)
		if err != nil {
			return err
		}
		req.Header.Set("User-Agent", "Mozilla/5.0")
		req.Header.Set("Cookie", fmt.Sprintf("axt_token=%s", token))

		resp, err := client.Do(req)
		if err != nil {
			return err
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			return fmt.Errorf("trạng thái API không hợp lệ: %d", resp.StatusCode)
		}

		var telResp TelemetryResponse
		err = json.NewDecoder(resp.Body).Decode(&telResp)
		if err != nil {
			return fmt.Errorf("lỗi giải mã JSON: %v", err)
		}

		if len(telResp.Data) == 0 {
			break
		}

		// Initialize CSV file on the first page
		if file == nil {
			fileName := fmt.Sprintf("%s_telemetry.csv", sanitizeFilename(devName))
			filePath := filepath.Join(outDir, fileName)
			file, err = os.Create(filePath)
			if err != nil {
				return fmt.Errorf("lỗi tạo file CSV: %v", err)
			}
			csvWriter = csv.NewWriter(file)

			// Write Headers: using attribute names
			var headers []string
			attributeCodes = make([]string, 0, len(telResp.Meta.Attributes))
			for _, attr := range telResp.Meta.Attributes {
				headers = append(headers, attr.Name)
				attributeCodes = append(attributeCodes, attr.Code)
			}
			if err := csvWriter.Write(headers); err != nil {
				return fmt.Errorf("lỗi ghi dòng tiêu đề: %v", err)
			}
		}

		// Write Rows
		for _, row := range telResp.Data {
			var csvRow []string
			for _, code := range attributeCodes {
				val, exists := row[code]
				if !exists || val == nil {
					csvRow = append(csvRow, "")
				} else {
					csvRow = append(csvRow, fmt.Sprintf("%v", val))
				}
			}
			if err := csvWriter.Write(csvRow); err != nil {
				return fmt.Errorf("lỗi ghi dòng dữ liệu: %v", err)
			}
			saveTelemetryToDB(projID, devName, row)
		}

		fmt.Printf("      -> Đã tải trang %d/%d (Đã lấy %d/%d bản ghi)...\n",
			page, telResp.Meta.TotalPages, page*perPage, telResp.Meta.Total)

		if page >= telResp.Meta.TotalPages {
			break
		}
		page++
		// Add brief delay to be gentle on the server
		time.Sleep(150 * time.Millisecond)
	}

	if file != nil {
		fmt.Printf("      [THÀNH CÔNG] Đã ghi dữ liệu vào file: %s\n", filepath.Join(outDir, fmt.Sprintf("%s_telemetry.csv", sanitizeFilename(devName))))
	} else {
		fmt.Println("      [THÔNG BÁO] Không có dữ liệu lịch sử nào được trả về.")
	}

	return nil
}

// Log in and return the axt_token string
func login(client *http.Client, email, password string) (string, error) {
	loginURL := fmt.Sprintf("%s/account/login", API_BASE)
	payloadMap := map[string]interface{}{
		"email":      email,
		"password":   password,
		"rememberMe": false,
	}
	payloadBytes, err := json.Marshal(payloadMap)
	if err != nil {
		return "", err
	}

	req, err := http.NewRequest("POST", loginURL, bytes.NewBuffer(payloadBytes))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "Mozilla/5.0")

	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("HTTP status %d: %s", resp.StatusCode, string(body))
	}

	var loginResp LoginResponse
	err = json.NewDecoder(resp.Body).Decode(&loginResp)
	if err != nil {
		return "", err
	}

	if loginResp.Status != "success" || loginResp.Token == "" {
		return "", fmt.Errorf("phản hồi đăng nhập không thành công: %s", loginResp.Message)
	}

	return loginResp.Token, nil
}

// Fetches the active project list
func fetchProjects(client *http.Client, token string) ([]Project, error) {
	url := fmt.Sprintf("%s/project/list?page=1&limit=100&sort=name&order=ASC", API_BASE)
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0")
	req.Header.Set("Cookie", fmt.Sprintf("axt_token=%s", token))

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HTTP status %d", resp.StatusCode)
	}

	var projResp ProjectListResponse
	err = json.NewDecoder(resp.Body).Decode(&projResp)
	if err != nil {
		return nil, err
	}

	return projResp.Data, nil
}

// Fetches weather devices of a project
func fetchWeatherDevices(client *http.Client, token, projectID string) ([]Device, error) {
	url := fmt.Sprintf("%s/device/project/%s?page=1&limit=100&source=weather", API_BASE, projectID)
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0")
	req.Header.Set("Cookie", fmt.Sprintf("axt_token=%s", token))

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HTTP status %d", resp.StatusCode)
	}

	var devResp DeviceListResponse
	err = json.NewDecoder(resp.Body).Decode(&devResp)
	if err != nil {
		return nil, err
	}

	return devResp.Data, nil
}

// Fetches connection providers of a project
func fetchProviders(client *http.Client, token, projectID string) ([]Provider, error) {
	url := fmt.Sprintf("%s/provider/list?projectId=%s", API_BASE, projectID)
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0")
	req.Header.Set("Cookie", fmt.Sprintf("axt_token=%s", token))

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HTTP status %d", resp.StatusCode)
	}

	var provResp ProviderListResponse
	err = json.NewDecoder(resp.Body).Decode(&provResp)
	if err != nil {
		return nil, err
	}

	return provResp.Data, nil
}

// Parses key-value pairs from .env
func loadConfig() (Config, error) {
	var config Config

	// 1. Try reading from system environment variables first (Cloud / Production)
	config.Email = os.Getenv("AXIS_EMAIL")
	config.Password = os.Getenv("AXIS_PASSWORD")

	if config.Email != "" && config.Password != "" {
		return config, nil
	}

	// 2. Fallback to reading local .env file (Local development)
	file, err := os.Open(".env")
	if err != nil {
		return config, fmt.Errorf("không có biến môi trường AXIS_EMAIL/AXIS_PASSWORD và không tìm thấy file .env")
	}
	defer file.Close()

	// Simple .env parsing
	var lines []string
	buf := make([]byte, 1024)
	var line bytes.Buffer
	for {
		n, err := file.Read(buf)
		if n > 0 {
			for i := 0; i < n; i++ {
				if buf[i] == '\n' {
					lines = append(lines, strings.TrimSpace(line.String()))
					line.Reset()
				} else {
					line.WriteByte(buf[i])
				}
			}
		}
		if err == io.EOF {
			if line.Len() > 0 {
				lines = append(lines, strings.TrimSpace(line.String()))
			}
			break
		}
		if err != nil {
			return config, err
		}
	}

	for _, l := range lines {
		if l == "" || strings.HasPrefix(l, "#") {
			continue
		}
		parts := strings.SplitN(l, "=", 2)
		if len(parts) != 2 {
			continue
		}
		key := strings.TrimSpace(parts[0])
		val := strings.TrimSpace(parts[1])

		if key == "AXIS_EMAIL" {
			config.Email = val
		} else if key == "AXIS_PASSWORD" {
			config.Password = val
		}
	}

	if config.Email == "" || config.Password == "" {
		return config, fmt.Errorf("AXIS_EMAIL hoặc AXIS_PASSWORD trống trong file .env")
	}

	return config, nil
}

// Sanitizes a string for safe use as a filename/directory
func sanitizeFilename(s string) string {
	s = strings.ReplaceAll(s, " ", "_")
	s = strings.ReplaceAll(s, "/", "-")
	s = strings.ReplaceAll(s, "\\", "-")
	s = strings.ReplaceAll(s, ":", "-")
	s = strings.ReplaceAll(s, "*", "-")
	s = strings.ReplaceAll(s, "?", "-")
	s = strings.ReplaceAll(s, "\"", "-")
	s = strings.ReplaceAll(s, "<", "-")
	s = strings.ReplaceAll(s, ">", "-")
	s = strings.ReplaceAll(s, "|", "-")
	return s
}

// ==========================================
// DATABASE PERSISTENCE LAYER (SQLITE/POSTGRES)
// ==========================================

var db *sql.DB
var isPostgres bool

func readEnvVal(key string) string {
	val := os.Getenv(key)
	if val != "" {
		return val
	}

	file, err := os.Open(".env")
	if err != nil {
		return ""
	}
	defer file.Close()

	contentBytes, err := io.ReadAll(file)
	if err != nil {
		return ""
	}

	lines := strings.Split(string(contentBytes), "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) == 2 {
			k := strings.TrimSpace(parts[0])
			v := strings.TrimSpace(parts[1])
			if k == key {
				return v
			}
		}
	}
	return ""
}

func initDB() error {
	var err error
	dbURL := os.Getenv("SUPABASE_DB_URL")
	if dbURL == "" {
		dbURL = os.Getenv("DATABASE_URL")
	}
	if dbURL == "" {
		dbURL = readEnvVal("SUPABASE_DB_URL")
	}
	if dbURL == "" {
		dbURL = readEnvVal("DATABASE_URL")
	}

	if dbURL != "" {
		fmt.Printf("[DATABASE] Phát hiện cấu hình Postgres (Supabase). Đang kết nối...\n")
		db, err = sql.Open("postgres", dbURL)
		if err != nil {
			return err
		}
		isPostgres = true
	} else {
		fmt.Printf("[DATABASE] Sử dụng SQLite cục bộ (weather.db).\n")
		dbPath := "./weather.db"
		db, err = sql.Open("sqlite3", dbPath)
		if err != nil {
			return err
		}
		isPostgres = false
	}

	err = db.Ping()
	if err != nil {
		return fmt.Errorf("lỗi kết nối database: %v", err)
	}

	var createTelemetryTable string
	if isPostgres {
		createTelemetryTable = `
		CREATE TABLE IF NOT EXISTS telemetry (
			id SERIAL PRIMARY KEY,
			time TEXT,
			project_id TEXT,
			device_name TEXT,
			temperature_avg TEXT,
			humidity_avg TEXT,
			rainfall TEXT,
			rainfall_total TEXT,
			wind_speed_avg TEXT,
			wind_dir_var_avg TEXT,
			msl_pressure TEXT,
			solar_rad_avg TEXT,
			deltat_avg TEXT,
			dew_point_avg TEXT,
			UNIQUE(time, project_id)
		);`
	} else {
		createTelemetryTable = `
		CREATE TABLE IF NOT EXISTS telemetry (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			time TEXT,
			project_id TEXT,
			device_name TEXT,
			temperature_avg TEXT,
			humidity_avg TEXT,
			rainfall TEXT,
			rainfall_total TEXT,
			wind_speed_avg TEXT,
			wind_dir_var_avg TEXT,
			msl_pressure TEXT,
			solar_rad_avg TEXT,
			deltat_avg TEXT,
			dew_point_avg TEXT,
			UNIQUE(time, project_id) ON CONFLICT REPLACE
		);`
	}

	_, err = db.Exec(createTelemetryTable)
	if err != nil {
		return err
	}

	_, _ = db.Exec("CREATE INDEX IF NOT EXISTS idx_telemetry_time ON telemetry (time);")
	_, _ = db.Exec("CREATE INDEX IF NOT EXISTS idx_telemetry_project ON telemetry (project_id);")

	createForecastTable := `
	CREATE TABLE IF NOT EXISTS forecasts (
		project_id TEXT PRIMARY KEY,
		forecast_json TEXT,
		updated_at TEXT
	);`
	_, err = db.Exec(createForecastTable)
	return err
}

func saveTelemetryToDB(projID, devName string, row map[string]interface{}) {
	if db == nil {
		return
	}
	
	timeVal := getStringVal(row, "Timestamp")
	if timeVal == "" {
		timeVal = getStringVal(row, "time")
		if timeVal == "" {
			return
		}
	}
	
	temp := getAnyStringVal(row, []string{"Atmospheric Temperature (°C)", "temperature_avg"})
	humidity := getAnyStringVal(row, []string{"Average Humidity (%)", "humidity_avg"})
	rainfall := getAnyStringVal(row, []string{"Rainfall (mm)", "rainfall"})
	rainfallTotal := getAnyStringVal(row, []string{"Total Rainfall (mm)", "rainfall_total"})
	windSpeed := getAnyStringVal(row, []string{"Average Wind Speed  (km/h)", "wind_speed_avg"})
	windDir := getAnyStringVal(row, []string{"Wind Direction", "wind_dir_var_avg"})
	pressure := getAnyStringVal(row, []string{"MSL Pressure (hPa)", "msl_pressure"})
	solarRad := getAnyStringVal(row, []string{"AverageSolarRadiation (W/m2)", "solar_rad_avg"})
	deltaT := getAnyStringVal(row, []string{"Average Delta T (°C)", "deltat_avg"})
	dewPoint := getAnyStringVal(row, []string{"Average Dew Point (°C)", "dew_point_avg"})

	var query string
	var err error

	if isPostgres {
		query = `
		INSERT INTO telemetry (
			time, project_id, device_name, temperature_avg, humidity_avg, 
			rainfall, rainfall_total, wind_speed_avg, wind_dir_var_avg, 
			msl_pressure, solar_rad_avg, deltat_avg, dew_point_avg
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
		ON CONFLICT (time, project_id) DO UPDATE SET
			device_name = EXCLUDED.device_name,
			temperature_avg = EXCLUDED.temperature_avg,
			humidity_avg = EXCLUDED.humidity_avg,
			rainfall = EXCLUDED.rainfall,
			rainfall_total = EXCLUDED.rainfall_total,
			wind_speed_avg = EXCLUDED.wind_speed_avg,
			wind_dir_var_avg = EXCLUDED.wind_dir_var_avg,
			msl_pressure = EXCLUDED.msl_pressure,
			solar_rad_avg = EXCLUDED.solar_rad_avg,
			deltat_avg = EXCLUDED.deltat_avg,
			dew_point_avg = EXCLUDED.dew_point_avg;`
		_, err = db.Exec(query, 
			timeVal, projID, devName, temp, humidity, 
			rainfall, rainfallTotal, windSpeed, windDir, 
			pressure, solarRad, deltaT, dewPoint,
		)
	} else {
		query = `
		INSERT INTO telemetry (
			time, project_id, device_name, temperature_avg, humidity_avg, 
			rainfall, rainfall_total, wind_speed_avg, wind_dir_var_avg, 
			msl_pressure, solar_rad_avg, deltat_avg, dew_point_avg
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`
		_, err = db.Exec(query, 
			timeVal, projID, devName, temp, humidity, 
			rainfall, rainfallTotal, windSpeed, windDir, 
			pressure, solarRad, deltaT, dewPoint,
		)
	}
	if err != nil {
		// Log silently if needed
	}
}

func getAnyStringVal(row map[string]interface{}, keys []string) string {
	for _, k := range keys {
		if val := getStringVal(row, k); val != "" {
			return val
		}
	}
	return ""
}

func getStringVal(row map[string]interface{}, key string) string {
	val, ok := row[key]
	if !ok || val == nil {
		return ""
	}
	return fmt.Sprintf("%v", val)
}

func saveForecastToDB(projID string, forecastBytes []byte) {
	if db == nil {
		return
	}
	var query string
	var err error

	if isPostgres {
		query = `
		INSERT INTO forecasts (project_id, forecast_json, updated_at) 
		VALUES ($1, $2, $3)
		ON CONFLICT (project_id) DO UPDATE SET
			forecast_json = EXCLUDED.forecast_json,
			updated_at = EXCLUDED.updated_at;`
		_, err = db.Exec(query, projID, string(forecastBytes), time.Now().Format(time.RFC3339))
	} else {
		query = `INSERT OR REPLACE INTO forecasts (project_id, forecast_json, updated_at) VALUES (?, ?, ?);`
		_, err = db.Exec(query, projID, string(forecastBytes), time.Now().Format(time.RFC3339))
	}
	if err != nil {
		fmt.Printf("[DB ERROR] Failed to save forecast: %v\n", err)
	}
}

func getTelemetryFromDB(projectID string) []map[string]interface{} {
	var result []map[string]interface{}
	if db == nil {
		return result
	}

	query := `
	SELECT time, temperature_avg, humidity_avg, rainfall, rainfall_total, 
	       wind_speed_avg, wind_dir_var_avg, msl_pressure, solar_rad_avg, 
	       deltat_avg, dew_point_avg 
	FROM telemetry 
	WHERE project_id = ? 
	ORDER BY time DESC 
	LIMIT 500;`

	rows, err := db.Query(query, projectID)
	if err != nil {
		fmt.Printf("[DB ERROR] Query telemetry failed: %v\n", err)
		return result
	}
	defer rows.Close()

	for rows.Next() {
		var timeVal, temp, humidity, rainfall, rainfallTotal, windSpeed, windDir, pressure, solarRad, deltaT, dewPoint sql.NullString
		err := rows.Scan(&timeVal, &temp, &humidity, &rainfall, &rainfallTotal, &windSpeed, &windDir, &pressure, &solarRad, &deltaT, &dewPoint)
		if err != nil {
			continue
		}

		record := map[string]interface{}{
			"time":             nullStringVal(timeVal),
			"temperature_avg":  nullStringVal(temp),
			"humidity_avg":     nullStringVal(humidity),
			"rainfall":         nullStringVal(rainfall),
			"rainfall_total":   nullStringVal(rainfallTotal),
			"wind_speed_avg":   nullStringVal(windSpeed),
			"wind_dir_var_avg": nullStringVal(windDir),
			"msl_pressure":     nullStringVal(pressure),
			"solar_rad_avg":    nullStringVal(solarRad),
			"deltat_avg":       nullStringVal(deltaT),
			"dew_point_avg":    nullStringVal(dewPoint),
		}
		result = append(result, record)
	}
	return result
}

func nullStringVal(ns sql.NullString) interface{} {
	if !ns.Valid {
		return nil
	}
	return ns.String
}

func getForecastFromDB(projectID string) map[string]interface{} {
	result := make(map[string]interface{})
	if db == nil {
		return result
	}

	var forecastJSON string
	err := db.QueryRow("SELECT forecast_json FROM forecasts WHERE project_id = ?", projectID).Scan(&forecastJSON)
	if err != nil {
		err = db.QueryRow("SELECT forecast_json FROM forecasts LIMIT 1").Scan(&forecastJSON)
		if err != nil {
			return result
		}
	}

	json.Unmarshal([]byte(forecastJSON), &result)
	result["location"] = "Hồ Chí Minh, Việt Nam"
	return result
}

func handleAPIData(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	projectID := r.URL.Query().Get("project_id")
	if projectID == "" {
		projectID = "1b73e2fe-1e6c-46c6-8534-82c0e03be283"
	}

	telemetry := getTelemetryFromDB(projectID)
	forecast := getForecastFromDB(projectID)

	response := map[string]interface{}{
		"telemetry": telemetry,
		"forecast":  forecast,
	}

	json.NewEncoder(w).Encode(response)
}

func importExistingCSVToDB() {
	telemetryPath, forecastPath := findTelemetryAndForecastPaths()
	if telemetryPath != "" {
		fmt.Printf("[DATABASE] Phát hiện file telemetry sẵn có: %s. Tiến hành nạp...\n", telemetryPath)
		file, err := os.Open(telemetryPath)
		if err == nil {
			defer file.Close()
			reader := csv.NewReader(file)
			headers, err := reader.Read()
			if err == nil {
				for {
					row, err := reader.Read()
					if err != nil {
						break
					}
					record := make(map[string]interface{})
					for i, header := range headers {
						if i < len(row) {
							record[strings.TrimSpace(header)] = row[i]
						}
					}
					saveTelemetryToDB("1b73e2fe-1e6c-46c6-8534-82c0e03be283", "LINHBEOCORP", record)
				}
			}
		}
	}
	if forecastPath != "" {
		fmt.Printf("[DATABASE] Phát hiện file forecast sẵn có: %s. Tiến hành nạp...\n", forecastPath)
		bytes, err := os.ReadFile(forecastPath)
		if err == nil {
			saveForecastToDB("1b73e2fe-1e6c-46c6-8534-82c0e03be283", bytes)
		}
	}
}
