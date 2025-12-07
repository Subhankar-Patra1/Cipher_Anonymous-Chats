# ⚡ No Login Chats

![License](https://img.shields.io/badge/license-MIT-blue.svg) ![Node](https://img.shields.io/badge/node->=18.0.0-green.svg) ![React](https://img.shields.io/badge/react-18.0.0-blue.svg)

**No Login Chats** is a seamless, anonymous, real-time messaging application designed for instant communication without the friction of sign-up forms or passwords. Just pick a username and start chatting.

## 🚀 Features

- **🔒 Truly Anonymous**: No emails, no phone numbers, no passwords. Identity is session-based.
- **⚡ Real-Time Messaging**: Instant delivery using Socket.IO.
- **⏲️ Ephemeral Groups**: Group chat rooms automatically expire and delete after 48 hours.
- **👥 Direct Messaging**: Private one-on-one chats with other users.
- **🔗 Smart Invites**: Share rooms via unique codes or direct links (QR codes included!).
- **📱 Fully Responsive**: a beautiful, mobile-first interface built with TailwindCSS.
- **🛡️ Secure**: JWT-based authentication and PostgreSQL persistence.

## 🛠️ Tech Stack

### Frontend
- **React** (Vite)
- **TailwindCSS** (Styling)
- **Socket.io-client** (Real-time connection)
- **React Router** (Navigation)

### Backend
- **Node.js & Express**
- **Socket.io** (WebSockets)
- **PostgreSQL** (Database)
- **pg** (Postgres Client)

## 📦 Getting Started

Follow these steps to set up the project locally.

### Prerequisites
- Node.js (v18+)
- PostgreSQL installed and running (or a cloud URL)

### 1. Clone the Repository
```bash
git clone https://github.com/Subhankar-Patra1/No-Login-Chats.git
cd No-Login-Chats
```

### 2. Backend Setup
Navigate to the server directory and install dependencies.
```bash
cd server
npm install
```

Create a `.env` file in `server/` with the following:
```env
PORT=3000
DATABASE_URL=postgresql://user:password@localhost:5432/your_database_name
JWT_SECRET=your_super_secret_key
CLIENT_URL=http://localhost:5173
```
*Note: The server will automatically create the necessary tables on startup.*

Start the server (with auto-reload):
```bash
npm run dev
```

### 3. Frontend Setup
Open a new terminal, navigate to the client directory, and install dependencies.
```bash
cd client
npm install
```

Create a `.env` file in `client/` (optional for local, defaults to localhost:3000):
```env
VITE_API_URL=http://localhost:3000
```

Start the client:
```bash
npm run dev
```

Visit `http://localhost:5173` in your browser.

## 🌍 Deployment

### Server (Render/Railway/Heroku)
1. Deploy `server/` directory.
2. Set Environment Variables: `DATABASE_URL`, `JWT_SECRET`, `CLIENT_URL`.
3. Use Build Command: `npm install`.
4. Use Start Command: `node index.js`.

### Client (Vercel/Netlify)
1. Deploy `client/` directory.
2. Set Environment Variable: `VITE_API_URL` (URL of your deployed server).
3. Build Command: `npm run build`.
4. Output Directory: `dist`.

## 🤝 Contributing
Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License
This project is licensed under the MIT License.
