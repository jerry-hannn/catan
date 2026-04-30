# Hosting Guide for Multiplayer Catan

This project is now configured as a **unified full-stack application**. The Express server hosts the Socket.io backend and serves the production-ready React frontend from a single port.

## Prerequisites
1. You need Node.js and npm installed.
2. You need an Ngrok account and the `ngrok` CLI tool installed (to play over the internet).

## 1. Build the Frontend
Before hosting, you must compile the React application into static files that the server can serve.
```bash
cd client
npm run build
```
*This creates a `dist` folder that the backend will use.*

## 2. Start the Unified Server
Navigate to the `server` directory and start the application:
```bash
cd server
node server.js
```
*The entire application (Frontend + Backend) is now running on port 3001.*

## 3. Expose to the Internet with Ngrok
Open a **new** terminal window and run ngrok to expose port 3001:
```bash
ngrok http 3001
```
*Ngrok will provide a "Forwarding" URL (e.g., `https://a1b2-c3d4.ngrok-free.app`).*

## 4. How Your Friends Connect
Simply send your friends the **Ngrok Forwarding URL**. 
1. They open the URL in any web browser.
2. The frontend will load and automatically connect to your backend via the same host.
3. No environment variables or local setup is required for players!

---

### Development Mode
If you are making code changes and want hot-reloading:
1. Start the backend: `cd server && node server.js`
2. Start the frontend dev server: `cd client && npm run dev`
3. Access the dev site at `http://localhost:5173`.
