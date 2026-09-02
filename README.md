# CyberNest Payroll

CyberNest Payroll is a Canadian payroll application built with the MERN stack and TypeScript. The project is organized as a monorepo with a Node/Express API and a React client.

## Prerequisites

- Node.js 18+
- npm 9+
- MongoDB 7+ running locally, or Docker if preferred

## Local development

1. Install workspace dependencies:
   npm install
2. Copy environment examples:
   cp server/.env.example server/.env
   cp client/.env.example client/.env
3. Start MongoDB locally if you are using the local database mode:
   mongod --dbpath ./data
4. Start the API:
   npm run dev:server
5. Start the client in a second terminal:
   npm run dev:client

The server listens on http://localhost:5000 and the client on http://localhost:5173.

## Default endpoints

- API health: http://localhost:5000/api/health

## Production build

npm run build

## Testing

npm test

## Notes

- Secrets are never committed; use .env files only.
- All salary and payroll money values are handled through Decimal.js-based utilities, not native floating-point math.
- Government tax configuration is expected to be managed in a versioned database-backed configuration model rather than hard-coded in the client or business logic.
