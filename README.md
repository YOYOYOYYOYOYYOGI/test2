# Flash Agent

A dependency-free web app that lets a visitor paste their own **Google AI Studio Gemini API key**, verifies it with Google's model API, selects an available Flash-compatible model, and starts a chat.

## Run locally

Requires Node.js 18 or newer.

```bash
npm start
```

Open `http://localhost:3000`.

## How keys are handled

- The browser sends a pasted key to this app's server only over the current connection.
- The server checks `GET /v1beta/models` at Google's Gemini API.
- When valid, the key lives **only in memory** in a random, HTTP-only session cookie mapping for two hours.
- It is not written to local storage, files, logs, or a database. Restarting the server removes all connected keys.
- The server, not the browser, sends generation requests to Google.

This is suitable for a starter/demo or a single trusted deployment. For a public production product, use HTTPS, add authentication and rate limiting, use a shared encrypted session store if multiple instances run, and publish a privacy policy.

## Cost note

The app itself uses no paid libraries or hosted agent platform. Gemini availability and free quota are determined by the Google account/API project behind the key. A valid key can still receive a quota/rate-limit response; that is shown in the chat rather than bypassed. Google AI Studio is where a visitor creates and manages their own key.

## Routes

- `POST /api/connect` — validates a supplied API key and starts the temporary session
- `GET /api/session` — restores the current session state
- `POST /api/chat` — sends chat to the selected verified model
- `POST /api/disconnect` — immediately discards the temporary key session
