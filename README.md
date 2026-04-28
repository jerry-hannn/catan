# Hosting Guide for Multiplayer Catan

Follow these steps to host the game on your laptop and allow your friends to connect over the internet using Ngrok.

## Prerequisites
1. You need Node.js and npm installed.
2. You need an Ngrok account and the `ngrok` CLI tool installed.

## 1. Start the Backend Server
Open a terminal, navigate to the `server` directory, and start the backend:
```bash
cd server
node server.js
```
*The server should now be running on port 3001.*

## 2. Expose the Backend with Ngrok
Open a **new** terminal window and run ngrok to expose your local port 3001 to the public internet:
```bash
ngrok http 3001
```
*Ngrok will provide a "Forwarding" URL (e.g., `https://1234-abcd.ngrok-free.app`). Copy this URL.*

## 3. Configure and Start the Frontend Client
Your friends will need to tell their client where your server is. 
Open a **third** terminal window, navigate to the `client` directory:
```bash
cd client
```

Create a `.env` file in the `client` directory (or edit the existing one) and set the `VITE_SERVER_URL` to your Ngrok URL:
```env
VITE_SERVER_URL=https://1234-abcd.ngrok-free.app
```

Then start the client:
```bash
npm run dev
```

## 4. How Your Friends Connect
You have two options for your friends:
1. **Host the frontend yourself (Recommended):** If you also expose your frontend via Ngrok (`ngrok http 5173`), you can give your friends that URL. They open it in their browser, and their browser will automatically connect to your backend via the `VITE_SERVER_URL` you configured.
   ```bash
   ngrok http 5173
   ```
   Then give them the new Ngrok URL for port 5173.
   
2. **They run the client locally:** Send them the `client` folder. They run `npm install`, create the `.env` file with your backend Ngrok URL, and run `npm run dev`.