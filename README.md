# CSV to CRM Records

A small project that converts uploaded CSV files into CRM-style records using a Next.js frontend and an Express backend.

## Repository structure

- `backend/` — Express API for CSV upload, parsing, optional AI extraction, and returning CRM records.
- `frontend/my-app/` — Next.js app for uploading CSV files, previewing rows, and calling the backend.

## Features

- CSV drag-and-drop upload
- preview parsed CSV rows before import
- convert CSV rows into CRM record objects
- backend routes:
  - `POST /api/upload`
  - `POST /api/import`
  - `GET /api/health`

## Local development

### Backend

1. Open a terminal and go to `backend/`
2. Install dependencies:
   ```bash
   cd backend
   npm install
   ```
3. Copy `.env.example` to `.env` and provide your secret values:
   ```bash
   cp .env.example .env
   ```
4. Start the backend:
   ```bash
   npm start
   ```

The backend listens on `process.env.PORT` or `5000` by default.

### Frontend

1. Open a terminal and go to `frontend/my-app/`
2. Install dependencies:
   ```bash
   cd frontend/my-app
   npm install
   ```
3. Set the backend URL in a local environment file
   create a `.env.local` with:
   ```env
   NEXT_PUBLIC_API_URL=http://localhost:5000
   ```
4. Start the frontend:
   ```bash
   npm run dev
   ```

Then visit `http://localhost:3000`.

## Environment variables

### Backend (`backend/.env`)

Use `backend/.env.example` as a template.

```env
PORT=5000
AI_BASE_URL=https://router.huggingface.co/v1
AI_API_KEY=<YOUR_API_KEY>
AI_MODEL_NAME=Qwen/Qwen2.5-7B-Instruct:together
```

### Frontend (`frontend/my-app/.env.local`)

```env
NEXT_PUBLIC_API_URL=https://<your-backend-url>
```

> Important: for production, `NEXT_PUBLIC_API_URL` must point to the deployed backend URL.

## Deployment

### Frontend on Vercel

1. Create a Vercel project from `frontend/my-app`
2. Set the root directory to `frontend/my-app`
3. Add env var:
   - `NEXT_PUBLIC_API_URL=https://<your-backend-url>`
4. Deploy

### Backend on Render

If Vercel backend deployment is problematic, Render is recommended for the Express service.

1. Create a new Render `Web Service`
2. Set the repository root directory to `backend`
3. Build command: `npm install`
4. Start command: `npm start`
5. Add any required env vars from `backend/.env`
6. Use the generated Render service URL in `NEXT_PUBLIC_API_URL`

### Backend on Vercel (alternative)

If using Vercel for backend, deploy the `backend/` folder as its own project and keep `backend/vercel.json` in place.


## API reference

### `POST /api/upload`

- Content type: `multipart/form-data`
- Field: `file`
- Response:
  - `headers`
  - `rows`
  - `rowObjects`

### `POST /api/import`

- Content type: `application/json`
- Body:
  ```json
  {
    "fileName": "example.csv",
    "rowObjects": [ ... ],
    "headers": [ ... ]
  }
  ```

- Response contains `records` and conversion details.

### `GET /api/health`

- Basic health check endpoint.

## Notes

- The frontend expects the backend to allow CORS from the frontend domain.
- Do not commit real secret keys to GitHub.
- If deploying frontend and backend separately, make sure the frontend uses the backend URL, not the frontend domain.
