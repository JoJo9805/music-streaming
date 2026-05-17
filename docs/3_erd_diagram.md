# Entity Relationship Diagram (ERD)

Sơ đồ ERD sử dụng Mermaid JS để biểu diễn các thực thể cần lưu trữ trên SQL Server.

```mermaid
erDiagram
    USER ||--o{ PLAYLIST : "creates/owns"
    USER ||--o{ FAVORITE_SONG : "likes"
    USER ||--o{ FOLLOWED_ARTIST : "follows"
    PLAYLIST ||--o{ PLAYLIST_SONG : "contains"
    
    USER {
        int user_id PK
        string email
        string username
        string password_hash
        string avatar_url
        datetime created_at
    }

    PLAYLIST {
        int playlist_id PK
        int user_id FK
        string name
        string description
        string cover_image_url
        boolean is_public
        datetime created_at
    }

    FAVORITE_SONG {
        int user_id PK
        string spotify_song_id PK
        datetime added_at
    }

    PLAYLIST_SONG {
        int playlist_id PK
        string spotify_song_id PK
        int position
        datetime added_at
    }

    FOLLOWED_ARTIST {
        int user_id PK
        string spotify_artist_id PK
        datetime followed_at
    }

```

*Lưu ý:* Các thực thể như Song, Album, Artist sẽ không được lưu trữ đầy đủ toàn bộ trong database nội bộ để tránh dư thừa. App chủ yếu lưu trữ `spotify_id` để tham chiếu dữ liệu từ Spotify API.
