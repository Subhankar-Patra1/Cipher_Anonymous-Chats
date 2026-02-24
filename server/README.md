# ⚡ Cipher Server

The backend for Cipher, providing real-time messaging, authentication, and data persistence.

## 🚀 Features
- **Real-time Engine**: Powered by Socket.io for messaging and presence.
- **Robust Auth**: JWT-based authentication and OAuth support (Google, GitHub).
- **Privacy**: Message request queue logic for incoming chats from new contacts.
- **Security**: QR session management and encrypted key storage.
- **Database**: PostgreSQL for persistent data and Redis for presence/session tracking.

## 🛠️ Tech Stack
- **Node.js & Express**
- **Socket.io**
- **PostgreSQL** (pg)
- **Redis**
- **JWT**

## 📦 Getting Started

### Prerequisites
- Node.js (v18+)
- PostgreSQL
- Redis

### Installation
1. Install dependencies:
```bash
npm install
```

2. Configure environment:
Create a `.env` file:
```env
PORT=3000
DATABASE_URL=postgresql://user:password@localhost:5432/your_database_name
JWT_SECRET=your_super_secret_key
CLIENT_URL=http://localhost:5173
REDIS_URL=redis://localhost:6373
```

3. Start development server:
```bash
npm run dev
```

## 📂 Core Modules
- `index.js`: Server entry point and Socket.io setup.
- `routes/`: API endpoint definitions.
- `db/`: Database models and connection logic.
- `socket/`: Real-time event handlers.

---
[Go back to Main README](../README.md)
