# ⚡ No Login Chats

![License](https://img.shields.io/badge/license-MIT-blue.svg) ![Node](https://img.shields.io/badge/node->=18.0.0-green.svg) ![React](https://img.shields.io/badge/react-18.0.0-blue.svg)

**No Login Chats** is a seamless, anonymous, real-time messaging application designed for instant communication without the friction of sign-up forms or passwords. Just pick a username and start chatting.

## 🚀 Features

### Core Messaging
- **🔒 Truly Anonymous**: No emails, no phone numbers, no passwords. Identity is session-based.
- **🌐 Multi-Platform OAuth**: Seamless login experience using **Google** or **GitHub** accounts for persistent identity without manual signups.
- **⚡ Real-Time Messaging**: Instant delivery using Socket.IO with typing indicators and online presence.
- **⏲️ Ephemeral Groups**: Group chat rooms automatically expire and delete after 48 hours.
- **👥 Direct Messaging**: Private one-on-one chats with advanced security.
- **📞 High-Definition Calls**: CRYSTAL CLEAR video and audio calls.
    - **Desktop**: Full HD (1080p) targets.
    - **Mobile**: HD (720p) targets.
    - **Unlimited Bandwidth**: No artificial capping; scales to your connection speed.
    - **Smart Fallbacks**: Automatically adjusts quality if your device is busy or connection is weak.
- **🔗 Smart Invites**: Share rooms via unique codes or direct links (QR codes included!).

### AI Integration
- **🤖 Sparkle AI**: Integrated context-aware AI assistant (powered by Gemini) for coding help, general knowledge, and conversational support. Includes persistent history and code block formatting.

### Rich Media & Content
- **📝 Rich Text & Code**: Markdown support with syntax highlighting for code blocks and copy-to-clipboard functionality.
- **� Advanced Emoji Support**: Full emoji picker with smart emoji rendering using Twemoji for consistent cross-platform display.
- **🎤 Voice Notes**: Record and send audio messages with waveform previews.
- **🖼️ High-Fidelity Profiles**: Upload high-resolution avatars (up to 2048px) with full-screen zoom interactions.
- **🖼️ Advanced Media Viewer**: Full touch support with pinch-to-zoom (up to 5x), pan, and swipe navigation.
- **🖼️ Smart Image Grouping**: Upload multiple images into beautiful grids with shared or individual captions.
- **📂 File Sharing**: Share any file type with instant previews and dedicated download controls.
- **🎥 GIF Support**: Send animated GIFs powered by Tenor.
- **📋 Todo Lists**: Create and manage shared checklists right in the chat.
- **📈 Enhanced Polls**: Real-time voting with multi-option support and emoji integration.

### Interactive Features
- **📊 Polls**: Create polls with multiple options and emoji support. See real-time voting results and participation.
- **📍 Location Sharing**: Share your current location with an interactive map preview powered by OpenStreetMap.
- **↩️ Enhanced Chat Actions**: Reply to messages (with preview), copy text, and delete messages (for yourself or everyone).
- **⭐ Starred Messages**: Save important messages for quick access in a dedicated view.
- **✨ Message Reactions**: React to messages with any emoji to express yourself.
- **✏️ Edit Messages**: Fix typos or update sent messages instantly.

### Security & Privacy
- **🛡️ Secure**: JWT-based authentication and PostgreSQL persistence.
- **🔐 End-to-End Encryption**: Robust E2EE for all messages.
    - **Mandatory Backups**: Secure your keys with a mandatory backup password during signup.
    - **Device Sync**: Securely sync your keys across devices with real-time approval modals.
- **🔐 App Lock**: Global app-level passcode protection.
- **🔒 Secret Chats**: Lock individual chats with unique 4-digit PINs.

### User Experience
- **� Online Presence**: See who's online and when they were last active.
- **� Typing Indicators**: See when others are typing in real-time.
- **📌 Pin Chats**: Pin important conversations to the top of your chat list.
- **� Archive Chats**: Archive less important chats to keep your inbox clean.
- **🎨 Morphing UI**: Highly interactive "Morphing Send Button" that animates as you type.
- **📱 Native-Like Mobile Experience**: Highly polished responsive design with smooth transitions and touch-friendly controls.
- **📏 Compact Headers**: Optimized UI for maximum screen real estate.

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
- **Redis** (Presence & Session Management)
- **pg** (Postgres Client)

## 📦 Getting Started

Follow these steps to set up the project locally.

### Prerequisites
- Node.js (v18+)
- PostgreSQL installed and running (or a cloud URL)
- Redis installed and running (v6+)

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
2. Set Environment Variables:
    - `DATABASE_URL`
    - `JWT_SECRET`
    - `CLIENT_URL`
    - `REDIS_URL` (Required for online status/presence)
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
