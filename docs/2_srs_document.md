# Software Requirement Specification (SRS)
## Hybrid Music Streaming Platform

## 1. Giới thiệu (Introduction)
### 1.1 Mục đích (Purpose)
Tài liệu SRS này cung cấp thông số kỹ thuật và yêu cầu phần mềm cho Ứng dụng web nghe nhạc trực tuyến Hybrid. Tài liệu dùng làm cơ sở cho đội ngũ phát triển (Frontend, Backend), đội ngũ thiết kế UI/UX và người quản lý dự án để hiểu rõ và triển khai chính xác các tính năng của hệ thống.

### 1.2 Nhóm tác giả và Đối tượng đọc (Audience)
- **Đối tượng đọc:** Developer, Designer, Tester, Project Manager.
- **Phạm vi áp dụng:** Áp dụng cho giai đoạn thiết kế và phát triển V1.

## 2. Mô tả tổng quan (Overall Description)
Hệ thống là một Web Application cho phép người dùng nghe nhạc trực tuyến, quản lý thư viện cá nhân sâu sắc theo dạng Album/Artist giống Apple Music, và khám phá nhạc mới với sự linh hoạt, thông minh của Spotify. Đặc biệt, app tích hợp một chatbot AI giúp người dùng tìm kiếm nhạc và tạo playlist theo ngữ cảnh.

## 3. Yêu cầu chức năng (Functional Requirements)

### F.01 Quản lý Người Dùng (User Management)
- **F.01.1:** Đăng ký bằng Email/Password, hoặc OAuth (Google).
- **F.01.2:** Đăng nhập, đăng xuất, khôi phục mật khẩu.
- **F.01.3:** Cập nhật thông tin hồ sơ cá nhân (Avatar, Username).

### F.02 Trình phát nhạc (Music Player)
- **F.02.1:** Các chức năng điều khiển cơ bản: Play, Pause, Next, Previous.
- **F.02.2:** Thanh trượt tiến trình bài hát (Progress bar) và chỉnh âm lượng.
- **F.02.3:** Tuỳ chọn chế độ phát: Shuffle (trộn bài), Repeat (Lặp lại 1 bài hoặc Lặp lại toàn list).
- **F.02.4:** Hiển thị lời bài hát (Lyrics) đồng bộ (nếu có API hỗ trợ).

### F.03 Quản lý Thư viện (Library Management)
- **F.03.1:** Xem danh sách Bài hát yêu thích (Liked Songs).
- **F.03.2:** Phân loại và hiển thị chi tiết theo Album (như một bộ sưu tập).
- **F.03.3:** Phân loại và hiển thị danh sách Nghệ sĩ (Artists) đã theo dõi.
- **F.03.4:** Tạo, sửa, xóa, và sắp xếp tự do Playlist cá nhân.

### F.04 Khám phá âm nhạc (Music Discovery)
- **F.04.1:** Hiển thị đề xuất thông minh dựa trên lịch sử nghe và "audio features" (bpm, acoustic, danceable...).
- **F.04.2:** Các playlist tự động (Ví dụ: Discover Weekly, Daily Mix).
- **F.04.3:** Tìm kiếm bài hát, album, nghệ sĩ theo từ khóa.

### F.05 Chatbot AI Tích hợp (AI Assistant)
- **F.05.1:** Giao diện chat trực tiếp trên ứng dụng.
- **F.05.2:** Phân tích ngôn ngữ tự nhiên từ người dùng (VD: "Tìm cho tôi những bài nhạc buồn nhịp chậm thập niên 90").
- **F.05.3:** Xuất kết quả bài hát dạng thẻ có thể bấm [Play] trực tiếp hoặc lưu thành Playlist mới.

## 4. Yêu cầu phi chức năng (Non-Functional Requirements)
- **Hiệu năng (Performance):** Ứng dụng load xong trang chính trong vòng < 3 giây. Trình phát nhạc không bị gián đoạn khi chuyển đổi giữa các trang (Sử dụng kiến trúc SPA - Single Page Application).
- **Độ tin cậy và Khả dụng (Reliability & Availability):** Hệ thống đảm bảo hoạt động 99.9% uptime.
- **Bảo mật (Security):** Mật khẩu phải được mã hóa (Hash/Bcrypt). API phải có xác thực token (JWT).
- **Tương thích (Compatibility):** Hoạt động tốt trên Chrome, Firefox, Safari và Microsoft Edge. Thiết kế phải đáp ứng (Responsive) tốt với màn hình Desktop và Mobile Web.

## 5. Ràng buộc công nghệ (Technology Constraints)
- **Giao diện/Frontend:** React.js / Next.js, Tailwind CSS. Sử dụng tính năng Server Components hoặc SSG từ Next.js cho SEO.
- **Backend:** Node.js Express hoặc Serverless functions.
- **Database:** SQL Server để lưu trữ thông tin User, Playlists (kèm theo Prisma ORM hoặc TypeORM).
- **External APIs:** Kết nối song song giữa Spotify API (Metadata) và AI API (OpenAI/Gemini).
