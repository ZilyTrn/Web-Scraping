import os
import json
import csv
import sqlite3

DB_PATH = os.path.join("data", "weather_data.db")
PROJECT_ID = "1b73e2fe-1e6c-46c6-8534-82c0e03be283"  # LINHBEOCORP

def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Create telemetry table with project_id
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS telemetry (
            timestamp TEXT NOT NULL,
            project_id TEXT NOT NULL,
            temperature_avg REAL,
            humidity_avg REAL,
            rainfall REAL,
            rainfall_total REAL,
            wind_speed_avg REAL,
            wind_dir_var_avg TEXT,
            msl_pressure REAL,
            solar_rad_avg REAL,
            deltat_avg REAL,
            dew_point_avg REAL,
            device_id TEXT,
            PRIMARY KEY (timestamp, project_id)
        )
    """)
    
    # Create projects_metadata table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS projects_metadata (
            project_id TEXT PRIMARY KEY,
            location TEXT,
            update_time TEXT,
            forecast_json_content TEXT
        )
    """)
    
    conn.commit()
    return conn

def main():
    print("Initializing SQLite Database...")
    conn = init_db()
    cursor = conn.cursor()
    
    # Paths
    telemetry_csv = os.path.join("data", "TANBAOCORP_Demo", "stations", "TanBao_Weather_Station_(A23)_telemetry.csv")
    forecast_json = os.path.join("data", "TANBAOCORP_Demo", "forecasts", "janes_weather_forecast.json")
    output_js = "data.js"
    
    # 1. Read CSV and insert/update database
    if os.path.exists(telemetry_csv):
        print(f"Reading telemetry from CSV and importing into SQLite database...")
        # Map CSV fields to SQL column names
        col_map = {
            "Timestamp": "timestamp",
            "Atmospheric Temperature (°C)": "temperature_avg",
            "Average Humidity (%)": "humidity_avg",
            "Rainfall (mm)": "rainfall",
            "Total Rainfall (mm)": "rainfall_total",
            "Average Wind Speed  (km/h)": "wind_speed_avg",
            "Wind Direction": "wind_dir_var_avg",
            "MSL Pressure (hPa)": "msl_pressure",
            "AverageSolarRadiation (W/m2)": "solar_rad_avg",
            "Average Delta T (°C)": "deltat_avg",
            "Average Dew Point (°C)": "dew_point_avg",
            "Device ID": "device_id"
        }
        
        with open(telemetry_csv, "r", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            inserted_count = 0
            for row in reader:
                vals = {
                    "timestamp": None,
                    "project_id": PROJECT_ID,
                    "temperature_avg": None,
                    "humidity_avg": None,
                    "rainfall": None,
                    "rainfall_total": None,
                    "wind_speed_avg": None,
                    "wind_dir_var_avg": None,
                    "msl_pressure": None,
                    "solar_rad_avg": None,
                    "deltat_avg": None,
                    "dew_point_avg": None,
                    "device_id": None
                }
                for csv_key, val in row.items():
                    k = csv_key.strip()
                    sql_col = col_map.get(k)
                    if sql_col:
                        if val == "":
                            vals[sql_col] = None
                        else:
                            if sql_col not in ["timestamp", "wind_dir_var_avg", "device_id"]:
                                try:
                                    vals[sql_col] = float(val)
                                except ValueError:
                                    vals[sql_col] = val
                            else:
                                vals[sql_col] = val
                                
                if vals.get("timestamp"):
                    cursor.execute("""
                        INSERT OR REPLACE INTO telemetry (
                            timestamp, project_id, temperature_avg, humidity_avg, rainfall, rainfall_total,
                            wind_speed_avg, wind_dir_var_avg, msl_pressure, solar_rad_avg,
                            deltat_avg, dew_point_avg, device_id
                        ) VALUES (
                            :timestamp, :project_id, :temperature_avg, :humidity_avg, :rainfall, :rainfall_total,
                            :wind_speed_avg, :wind_dir_var_avg, :msl_pressure, :solar_rad_avg,
                            :deltat_avg, :dew_point_avg, :device_id
                        )
                    """, vals)
                    inserted_count += 1
            conn.commit()
            print(f"Imported/Updated {inserted_count} telemetry records in SQLite.")
    else:
        print(f"[WARNING] Telemetry file not found: {telemetry_csv}")

    # 2. Read Forecast JSON and save to database
    if os.path.exists(forecast_json):
        print(f"Reading forecast from JSON and importing into SQLite database...")
        with open(forecast_json, "r", encoding="utf-8") as f:
            forecast_data = json.load(f)
            
        location = forecast_data.get("location", "")
        update_time = forecast_data.get("updateTime", "")
        forecast_str = json.dumps(forecast_data)
        
        cursor.execute("""
            INSERT OR REPLACE INTO projects_metadata (
                project_id, location, update_time, forecast_json_content
            ) VALUES (?, ?, ?, ?)
        """, (PROJECT_ID, location, update_time, forecast_str))
        conn.commit()
        print("Imported/Updated forecast data in SQLite.")
    else:
        print(f"[WARNING] Forecast file not found: {forecast_json}")

    # 3. Query DB to generate data.js
    print("Querying SQLite database to generate website data file (data.js)...")
    
    # Query telemetry
    cursor.execute("""
        SELECT timestamp, temperature_avg, humidity_avg, rainfall, rainfall_total,
               wind_speed_avg, wind_dir_var_avg, msl_pressure, solar_rad_avg,
               deltat_avg, dew_point_avg, device_id
        FROM telemetry
        WHERE project_id = ?
        ORDER BY timestamp DESC
        LIMIT 500
    """, (PROJECT_ID,))
    
    columns = [desc[0] for desc in cursor.description]
    telemetry_rows = []
    for row in cursor.fetchall():
        row_dict = dict(zip(columns, row))
        row_dict["time"] = row_dict["timestamp"]
        telemetry_rows.append(row_dict)
        
    # Query forecast
    cursor.execute("""
        SELECT forecast_json_content
        FROM projects_metadata
        WHERE project_id = ?
    """, (PROJECT_ID,))
    
    forecast_row = cursor.fetchone()
    forecast_js_data = {}
    if forecast_row:
        forecast_js_data = json.loads(forecast_row[0])
        
    # Write to data.js
    with open(output_js, "w", encoding="utf-8") as f:
        f.write("// Auto-generated weather data file from SQLite Database\n\n")
        f.write("const WEATHER_TELEMETRY = ")
        json.dump(telemetry_rows, f, indent=2)
        f.write(";\n\n")
        f.write("const JANES_FORECAST = ")
        json.dump(forecast_js_data, f, indent=2)
        f.write(";\n")
        
    print(f"Successfully generated {output_js} from SQLite data!")
    conn.close()

if __name__ == "__main__":
    main()
