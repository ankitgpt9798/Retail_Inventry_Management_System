# Retail Inventory Management System — Architecture

_Living document. Updated after every step._

## Project Overview
Multi-warehouse retail inventory system (MERN). Two parts:
- **Public website**: Home, Features, About, Contact, Login (real header/footer, not an admin panel).
- **Staff application**: for Admin, Inventory Manager, Staff and Supplier roles, with website-style page layouts.

## Technology Stack
| Layer | Tech |
|---|---|
| Frontend | React + Vite, React Router, Redux Toolkit, Axios, Tailwind CSS + DaisyUI, React Hook Form + Zod, Lucide icons |
| Backend | Node.js, Express 5, Mongoose, dotenv, cors, bcryptjs, jsonwebtoken, cookie-parser |
| Database | MongoDB (local) — `mongodb://127.0.0.1:27017/retail_inventory` |
| Testing | Jest + Supertest (backend), Vitest + React Testing Library (frontend), Postman |

## Key Decisions
| Decision | Why |
|---|---|
| JWT in **HTTP-only cookie** | JavaScript can't read it → safer against XSS. Frontend Axios uses `withCredentials: true`. |
| `app.js` separate from `server.js` | Tests import `app` without starting a server or connecting to the real DB. |
| CommonJS (`require`) in backend | Jest supports it with no extra config. |
| Express 5 | Errors thrown in `async` handlers reach the error middleware automatically (no try/catch wrapper needed just to forward errors). |
| Services layer | Business rules (stock reservation, transfers…) live in plain functions in `services/`, so controllers stay thin and rules are unit-testable. |

## Folder Structure
```
RetailInventory/
├── backend/
│   ├── src/
│   │   ├── config/db.js            MongoDB connection
│   │   ├── models/                 Mongoose schemas
│   │   ├── controllers/            read req → call service → send res
│   │   ├── services/               business logic
│   │   ├── routes/                 URL → middleware → controller
│   │   ├── middleware/             auth, roles, validation, errors
│   │   ├── utils/
│   │   ├── app.js                  Express app (no listen)
│   │   └── server.js               connect DB + listen
│   ├── tests/{unit,integration,api}
│   ├── .env / .env.example
│   └── package.json
├── frontend/                       (Step 17)
└── docs/ARCHITECTURE.md
```

## Request Flow
```
React → Axios → Express route → authMiddleware → roleMiddleware → validation
      → controller → service → Mongoose model → MongoDB
      → back up the chain → JSON response → React
Any thrown error → errorMiddleware → { success:false, message, error }
```

## Response Format
```json
{ "success": true,  "message": "...", "data": {} }
{ "success": false, "message": "...", "error": "ERROR_CODE" }
```

## Database Design
_Step 3._

## API List
| Method | URL | Auth | Purpose |
|---|---|---|---|
| GET | /api/health | none | Check server is running |

## Authentication Flow
_Step 4._

## Frontend Pages
_Step 17._

## Testing Strategy
- Every module: Jest unit tests for services, Supertest API tests for routes, Postman collection.
- Run backend tests: `cd backend && npm test`

## Progress
| Step | Status |
|---|---|
| 1. Project setup | Done |
| 2. MongoDB connection | Done (needs MongoDB installed locally) |
| 3. Database schemas | Next |

## Known Issues
- None yet.

## Future Improvements
- Docker, CI/CD, cloud deployment (explicitly out of scope for now).
