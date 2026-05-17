# Đề xuất Triển khai Frontend (Frontend Implementation Recommendation)

Dựa trên yêu cầu của dự án (tối ưu hóa SEO, hiệu suất, giao diện lai tạo và tích hợp AI chatbot), dưới đây là đề xuất chi tiết để xây dựng Frontend bằng **Next.js/React** và **Tailwind CSS**.

## 1. Stack Công nghệ Cốt lõi (Core Stack)
- **Framework:** Next.js (Khuyến nghị sử dụng App Router `app/` directory).
  - *Lý do:* Hỗ trợ Server-Side Rendering (SSR) giúp SEO tốt cho trang Discovery/Nghệ sĩ. Tối ưu load time (Web Vitals) bằng Server Components. Cấu trúc file-based routing rất thuận tiện cho Web App đa dạng layout.
- **UI & Styling:** Tailwind CSS.
  - *Lý do:* Phát triển siêu nhanh (utility-first). Dễ dàng tạo "Dark Mode" (một tính năng cực kỳ quan trọng cho music app) bằng class `dark:`. Tạo giao diện lai tạp linh hoạt mà không bị gò bó bởi các UI framework truyền thống.
- **Components Library:** Shadcn/UI kết hợp Radix UI.
  - *Lý do:* Cung cấp các components (Slider, Dropdown, Dialog) có khả năng accessibility cực tốt (A11y) nhưng hoàn toàn tùy biến được giao diện bằng Tailwind.
- **Animations:** Framer Motion (cho React).
  - *Lý do:* Trải nghiệm của Apple Music nổi bật nhờ animation mượt mà. Framer Motion giúp tạo hiệu ứng chuyển trang (page transition), layout transition (như thanh player mở rộng) dễ dàng.

## 2. Quản lý trạng thái (State Management)
App nghe nhạc có một State rất phức tạp: Dữ liệu của bài hát đang phát (Player state) phải được giữ nguyên khi user chuyển trang (Navigation).
- **Giải pháp:** Sử dụng **Zustand** hoặc **Redux Toolkit**.
  - *Zustand:* Đang là xu hướng vì cực kỳ nhẹ, syntax đơn giản (hooks), không dính boilerplate code như Redux, rất phù hợp quản lý state của `Player` (isPlaying, currentTrack, queue).
- **Data Fetching State:** Sử dụng **TanStack Query (React Query)** kết hợp với Next.js Server Components.
  - *Lý do:* React Query tự động caching dữ liệu (ví dụ: playlists, list bài hát trong library), giúp app cảm giác siêu mượt và offline-ready ở mức cơ bản.

## 3. Kiến trúc Layout & Component (Architecture)

### Layout chính (Root Layout)
Để Player nhạc không bị ngắt khi điều hướng trang, kiến trúc App cần được phân tách rõ (Persistence Layout):
```jsx
// Tham khảo kiến trúc layout bề mặt:
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="flex h-screen overflow-hidden bg-black text-white">
        <Sidebar className="w-64" /> {/* Thanh điều hướng (Spotify vibe) */}
        
        <main className="flex-1 overflow-y-auto">
          <TopNavigation />
          {children} {/* Nội dung các trang: Home, Album, Artist sẽ render tại đây */}
        </main>
        
        <BottomMusicPlayer className="fixed bottom-0 w-full h-24" /> {/* Thanh Player (Apple Music vibe) */}
      </body>
    </html>
  );
}
```

### Các Component Quan trọng (Key Components)
1. `<MusicPlayer />`: Thanh điều khiển dưới cùng, sử dụng thẻ `<audio>` của HTML5 và liên kết state với Global Store (Zustand).
2. `<AIWindow />`: Giao diện Chatbot có thể là một Floating Action Button ở góc phải dưới, mở ra một modal hoặc slide-over panel.
3. `<TrackList />`: Danh sách bài hát. Khuyến nghị áp dụng kỹ thuật **Virtualization** (vd: thư viện `@tanstack/react-virtual`) nếu một playlist có hàng ngàn bài hát để tránh giật lag trình duyệt.

## 4. Gợi ý Thiết kế UI/UX theo Tailwind
- **Màu sắc (Colors):** Sử dụng nền tối sâu (Ví dụ: `bg-zinc-950`), chữ màu sáng ( `text-zinc-100`), và một màu nhấn linh hoạt hoặc màu Gradient dựa trên hình đại diện Album (Sử dụng thư viện chiết xuất màu như `colorthief`).
- **Giao diện lai (Hybrid Concept):**
  - Giữ Sidebar bên trái để điều hướng nhanh như Spotify.
  - Vùng nội dung chính (Main View) dùng các Title lớn, padding thoáng, bo góc lớn (như Apple Music).
  - Sử dụng Hiệu ứng kính mờ (Glassmorphism): `<div className="backdrop-blur-md bg-white/10" />` cho thanh Player và Navbar khi cuộn trang.
