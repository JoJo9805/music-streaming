# Project Proposal: Hybrid Music Streaming Platform

## 1. Tên Dự Án (Project Name)
**Tên dự kiến:** MelodyMix / HarmonyStream (Có thể điều chỉnh theo quyết định của team)

## 2. Lý Do Hình Thành (Background & Rationale)
Trong kỷ nguyên số, âm nhạc là một phần thiết yếu của đời sống. Tuy nhiên, thị trường streaming hiện tại đang tồn tại một sự đánh đổi lớn đối với người dùng:
- **Spotify:** Sở hữu hệ thống gợi ý (Discovery) và thuật toán cá nhân hóa xuất sắc, nhưng giao diện lại thiếu đi sự sang trọng, tinh tế trong quản lý thư viện cá nhân.
- **Apple Music:** Mang đến một giao diện đẹp, chất lượng âm thanh cao và cách tổ chức khoa học, nhưng các tính năng gợi ý và đa dạng hóa danh sách phát tự động chưa thực sự sánh bằng Spotify.

Người dùng hiện nay rất cần một nền tảng **dung hòa được cả hai yếu tố này** — không phải đánh đổi giữa thuật toán thông minh và trải nghiệm thẩm mỹ. Dự án được hình thành để giải quyết "pain-point" này.

## 3. Mục Tiêu Dự Án (Objectives)
Dự án hướng tới việc phát triển một ứng dụng web nghe nhạc trực tuyến (Music Streaming Web Application) mang tính chất "lai tạo và cải tiến" từ những điểm tinh hoa của Spotify và Apple Music. Mục tiêu cụ thể bao gồm:
- **Tạo ra trải nghiệm UI/UX đột phá:** Kết hợp sự tối giản và sang trọng của Apple Music với khả năng điều hướng linh hoạt của Spotify.
- **Tiêu chuẩn hóa quản lý Thư viện (Library):** Giúp người dùng tổ chức bộ sưu tập cá nhân sâu sắc như đang sở hữu những đĩa nhạc/album thực thụ.
- **Cá nhân hóa bằng AI & Thuật toán:** Xây dựng hệ thống gợi ý nhạc thông minh (dựa trên tâm trạng, hoạt động, audio features như bpm, acoustic, danceability). Nổi bật với tính năng **tích hợp Chatbot AI** để giao tiếp và tìm kiếm nhạc linh hoạt theo lời nói/văn bản.
- **Tối ưu hóa đa nền tảng:** Hệ thống hoạt động mượt mà trên môi trường Web, phản hồi siêu tốc, có khả năng tối ưu SEO và tương tác người dùng cao.

## 4. Phạm Vi Dự Án (Scope)

### Trong phạm vi (In-Scope):
- **Phát triển Frontend:** Hệ thống Component UI/UX (Player, Playlist, Library Navigation, Discovery Page) bằng **Next.js/React** kết hợp **Tailwind CSS**.
- **Phát triển Backend / Integration:** Xây dựng server bằng **Node.js/Express** cơ bản kết hợp dùng **Firebase/SQL Server**.
- **Tích hợp Dữ liệu/API:** Sử dụng **Spotify API** (để fetch danh sách bài hát, album, nghệ sĩ) và **Stats.fm / Audio Database** (để lấy dữ liệu audio features).
- **Tính năng Cốt lõi (Core Functions):**
  - Đăng ký/Đăng nhập người dùng.
  - Trình phát nhạc (Web Player) với giao diện classic kiểu iTunes (hiện đại hóa).
  - Quản lý Library (Albums, Artists, Playlists).
  - Khám phá âm nhạc và Recommendation.
  - Chatbot AI tìm nhạc theo cảm xúc.

### Ngoài phạm vi (Out-of-Scope) trong giai đoạn V1:
- Thanh toán và gói Premium (Tích hợp payment gateway).
- Upload nhạc tự định dạng từ local của người dùng.
- Native Mobile App (iOS / Android), chỉ tập trung vào Web App Responsive.
- Quản lý bản quyền âm nhạc (Digital Rights Management) vì dự án dùng API cấp sẵn hoặc API giả lập để phục vụ demo học thuật/thử nghiệm.
