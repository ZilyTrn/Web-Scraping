# AxisStream Scraper in Go (Golang)

Đây là chương trình tự động thu thập dữ liệu (Scraper) từ hệ thống AxisStream HQ viết bằng ngôn ngữ Go. Chương trình sẽ tự động đăng nhập, lấy danh sách dự án, cào dữ liệu từ các trạm thời tiết (Weather Stations) và dự báo thời tiết Jane's Weather (Forecast Dashboard) rồi lưu vào cấu trúc thư mục riêng biệt.

## Tính năng chính
1. **Weather Stations**: Tự động tải lịch sử dữ liệu cảm biến (nhiệt độ, lượng mưa, độ ẩm, hướng gió, bức xạ mặt trời, v.v.) của toàn bộ các trạm trong mỗi dự án và lưu thành file CSV.
2. **Jane's Weather Forecast**: Tải dữ liệu dự báo thời tiết mới nhất và lưu thành file JSON.
3. **Phân chia thư mục tự động**: Dữ liệu được gom nhóm theo tên từng dự án trong thư mục `data/`.

## Yêu cầu hệ thống
Để chạy chương trình này, bạn cần cài đặt **Go** trên máy tính của mình:
1. Tải bộ cài đặt Go cho Windows tại [golang.org/dl](https://golang.org/dl/).
2. Chạy file cài đặt (`.msi`) và làm theo hướng dẫn.
3. Sau khi cài đặt xong, mở PowerShell/Command Prompt mới và kiểm tra bằng lệnh:
   ```bash
   go version
   ```

## Cấu hình tài khoản
Chương trình đọc thông tin đăng nhập từ file `.env` nằm cùng thư mục:
```env
AXIS_EMAIL=huynh@tanbaocorp.vn
AXIS_PASSWORD=Tanbao@123
```
*(Bạn có thể thay đổi email/mật khẩu này trong file `.env` nếu cần)*

## Cách chạy chương trình
1. Mở PowerShell hoặc Command Prompt trong thư mục này:
   ```powershell
   cd "c:\Users\PC\OneDrive\Máy tính\Web Scraping"
   ```
2. Chạy lệnh sau để tải dữ liệu:
   ```powershell
   go run main.go
   ```

## Cấu trúc thư mục kết quả sau khi chạy
Sau khi chạy hoàn tất, thư mục `data/` sẽ được tự động tạo với cấu trúc sau:
```
data/
└── {Tên_Dự_Án}/
    ├── stations/
    │   └── {Tên_Trạm}_telemetry.csv
    └── forecasts/
        └── janes_weather_forecast.json
```
