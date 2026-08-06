import os
import sys
import json
import base64
import csv
import urllib.request
import urllib.parse
import time

# Reconfigure stdout/stderr to support UTF-8 console output on Windows
if sys.platform.startswith('win'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except AttributeError:
        pass

# Configs
API_BASE = "https://v2.api.axisstream.co/api"
DATA_API_BASE = "https://data.api.axisstream.co"
FORECAST_BASE = "https://provider.api.axisstream.co"

def load_config():
    config = {}
    if not os.path.exists(".env"):
        raise FileNotFoundError("Không tìm thấy file .env. Vui lòng tạo file .env.")
    with open(".env", "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = line.split("=", 1)
            if len(parts) == 2:
                config[parts[0].strip()] = parts[1].strip()
    
    if "AXIS_EMAIL" not in config or "AXIS_PASSWORD" not in config:
        raise ValueError("AXIS_EMAIL hoặc AXIS_PASSWORD thiếu trong file .env")
    return config

def sanitize_filename(s):
    for char in [' ', '/', '\\', ':', '*', '?', '"', '<', '>', '|']:
        s = s.replace(char, '_')
    return s

def login(email, password):
    url = f"{API_BASE}/account/login"
    data = json.dumps({
        "email": email,
        "password": password,
        "rememberMe": False
    }).encode("utf-8")
    
    req = urllib.request.Request(url, data=data, headers={
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0"
    }, method="POST")
    
    with urllib.request.urlopen(req) as resp:
        res_json = json.loads(resp.read().decode("utf-8"))
        if res_json.get("status") == "success" and "token" in res_json:
            return res_json["token"]
        raise ValueError(f"Đăng nhập thất bại: {res_json.get('message', 'Không rõ nguyên nhân')}")

def fetch_projects(token):
    url = f"{API_BASE}/project/list?page=1&limit=100&sort=name&order=ASC"
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0",
        "Cookie": f"axt_token={token}"
    }, method="GET")
    
    with urllib.request.urlopen(req) as resp:
        res_json = json.loads(resp.read().decode("utf-8"))
        return res_json.get("data", [])

def fetch_weather_devices(token, project_id):
    url = f"{API_BASE}/device/project/{project_id}?page=1&limit=100&source=weather"
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0",
        "Cookie": f"axt_token={token}"
    }, method="GET")
    
    with urllib.request.urlopen(req) as resp:
        res_json = json.loads(resp.read().decode("utf-8"))
        return res_json.get("data", [])

def fetch_providers(token, project_id):
    url = f"{API_BASE}/provider/list?projectId={project_id}"
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0",
        "Cookie": f"axt_token={token}"
    }, method="GET")
    
    with urllib.request.urlopen(req) as resp:
        res_json = json.loads(resp.read().decode("utf-8"))
        return res_json.get("data", [])

def download_telemetry(token, schema, project_id, device_external_id, source_id, device_name, out_dir):
    per_page = 100
    page = 1
    file_handle = None
    csv_writer = None
    attribute_codes = []
    
    file_name = f"{sanitize_filename(device_name)}_telemetry.csv"
    file_path = os.path.join(out_dir, file_name)
    
    try:
        while True:
            params_dict = {
                "page": page,
                "perPage": per_page,
                "serverColumnFilters": []
            }
            server_params = base64.b64encode(json.dumps(params_dict).encode("utf-8")).decode("utf-8")
            
            url = f"{DATA_API_BASE}/tenants/{schema}/sources/{source_id}/data?project={project_id}&id={device_external_id}&serverParams={server_params}"
            
            req = urllib.request.Request(url, headers={
                "User-Agent": "Mozilla/5.0",
                "Cookie": f"axt_token={token}"
            }, method="GET")
            
            with urllib.request.urlopen(req) as resp:
                res_json = json.loads(resp.read().decode("utf-8"))
                data_list = res_json.get("data", [])
                meta = res_json.get("meta", {})
                
                if not data_list:
                    break
                
                # Initialize CSV file on first page
                if file_handle is None:
                    file_handle = open(file_path, "w", newline="", encoding="utf-8-sig")
                    csv_writer = csv.writer(file_handle)
                    
                    # Headers
                    attributes = meta.get("attributes", [])
                    headers = [attr.get("name") for attr in attributes]
                    attribute_codes = [attr.get("code") for attr in attributes]
                    csv_writer.writerow(headers)
                
                # Write rows
                for row in data_list:
                    row_data = [row.get(code, "") for code in attribute_codes]
                    csv_writer.writerow(row_data)
                
                total_pages = meta.get("totalPages", 1)
                total_records = meta.get("total", 0)
                print(f"      -> Đã tải trang {page}/{total_pages} (Đã lấy {min(page*per_page, total_records)}/{total_records} bản ghi)...")
                
                if page >= total_pages:
                    break
                page += 1
                time.sleep(0.15)
                
        if file_handle:
            file_handle.close()
            print(f"      [THÀNH CÔNG] Đã ghi dữ liệu vào file: {file_path}")
        else:
            print("      [THÔNG BÁO] Không có dữ liệu lịch sử nào được trả về.")
            
    except Exception as e:
        if file_handle:
            file_handle.close()
        raise e

def scrape_janes_forecast(token, project_id, out_dir):
    print("  Đang kiểm tra kết nối Jane's Weather...")
    providers = fetch_providers(token, project_id)
    
    janes_provider_id = None
    for prov in providers:
        if prov.get("code") == "janes_weather" and prov.get("status") == "CONNECTED":
            janes_provider_id = prov.get("id")
            break
            
    if not janes_provider_id:
        print("  [THÔNG BÁO] Không có kết nối Jane's Weather hoạt động (CONNECTED) trong dự án này.")
        return
        
    print(f"  Tìm thấy kết nối Jane's Weather (ID: {janes_provider_id}). Đang tải dự báo...")
    url = f"{FORECAST_BASE}/janes_weather/forecast/project/{project_id}/provider/{janes_provider_id}"
    
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0",
        "Cookie": f"axt_token={token}"
    }, method="GET")
    
    try:
        with urllib.request.urlopen(req) as resp:
            body = resp.read()
            out_file = os.path.join(out_dir, "janes_weather_forecast.json")
            with open(out_file, "wb") as f:
                f.write(body)
            print(f"  [THÀNH CÔNG] Đã lưu dự báo thời tiết tại: {out_file}")
    except Exception as e:
        print(f"  [LỖI] Gọi API dự báo thất bại: {e}")

def main():
    print("=== BẮT ĐẦU CHƯƠNG TRÌNH THU THẬP DỮ LIỆU AXISSTREAM (PYTHON) ===")
    
    try:
        config = load_config()
    except Exception as e:
        print(f"[LỖI] Không thể đọc cấu hình: {e}")
        return
        
    try:
        print(f"Đang đăng nhập tài khoản: {config['AXIS_EMAIL']}...")
        token = login(config['AXIS_EMAIL'], config['AXIS_PASSWORD'])
        print("[THÀNH CÔNG] Đăng nhập thành công.")
    except Exception as e:
        print(f"[LỖI] Đăng nhập thất bại: {e}")
        return
        
    try:
        print("Đang lấy danh sách dự án (projects)...")
        projects = fetch_projects(token)
        print(f"Tìm thấy {len(projects)} dự án.")
    except Exception as e:
        print(f"[LỖI] Không lấy được danh sách dự án: {e}")
        return
        
    for proj in projects:
        proj_name = proj.get("name")
        proj_id = proj.get("id")
        schema = proj.get("organisation", {}).get("schema")
        
        print("\n-----------------------------------------")
        print(f"Xử lý dự án: {proj_name} (ID: {proj_id})")
        
        project_dir = sanitize_filename(proj_name)
        stations_dir = os.path.join("data", project_dir, "stations")
        forecasts_dir = os.path.join("data", project_dir, "forecasts")
        
        os.makedirs(stations_dir, exist_ok=True)
        os.makedirs(forecasts_dir, exist_ok=True)
        
        # Scrape Stations
        print("  Đang lấy danh sách trạm thời tiết...")
        try:
            devices = fetch_weather_devices(token, proj_id)
            if not devices:
                print("  Không tìm thấy trạm thời tiết nào trong dự án này.")
            else:
                print(f"  Tìm thấy {len(devices)} trạm thời tiết.")
                for dev in devices:
                    dev_name = dev.get("name")
                    dev_ext_id = dev.get("externalId")
                    
                    weather_source = None
                    for src in dev.get("sources", []):
                        if src.get("code") == "weather":
                            weather_source = src
                            break
                            
                    if not weather_source:
                        print(f"      [BỎ QUA] Không tìm thấy nguồn 'weather' cho {dev_name}")
                        continue
                        
                    print(f"    -> Cào dữ liệu cho trạm: {dev_name} (External ID: {dev_ext_id})...")
                    download_telemetry(token, schema, proj_id, dev_ext_id, weather_source.get("id"), dev_name, stations_dir)
        except Exception as e:
            print(f"  [LỖI] Lỗi lấy danh sách hoặc tải dữ liệu trạm: {e}")
            
        # Scrape Forecast
        scrape_janes_forecast(token, proj_id, forecasts_dir)
        
    print("\n=== HOÀN THÀNH THU THẬP DỮ LIỆU ===")
    
    # Auto-compile data.js to update the dashboard website
    try:
        print("\nĐang đồng bộ hóa dữ liệu trực tiếp vào website...")
        import prepare_data
        prepare_data.main()
        print("[THÀNH CÔNG] Website đã được đồng bộ hóa dữ liệu mới nhất.")
    except Exception as e:
        print(f"[CẢNH BÁO] Không thể tự động đồng bộ hóa website: {e}")

if __name__ == "__main__":
    main()
