# Smart Airport Ride Pooling Backend

A high-performance backend system for grouping airport passengers into shared cabs, optimizing for route deviation and vehicle capacity. Built with Node.js, TypeScript, and PostgreSQL.

## 🚀 Features

- **Smart Pooling Engine**: Matches passengers efficiently based on route deviation and vehicle capacity (4 seats).
- **Dynamic Pricing**: Real-time price calculation influenced by distance and current supply/demand (Surge Pricing).
- **High Concurrency**: Atomic database locks prevent driver overbooking even under heavy load.
- **Real-Time Cancellation**: Instantly frees up seats and drivers upon cancellation.
- **Geospatial Aware**: Uses Haversine formula for precise distance and deviation calculations.

---

## 🏗 High-Level Architecture

The system follows a standard **Layered Architecture** to ensure separation of concerns and scalability.

```mermaid
graph TD
    Client[Client / Mobile App] -->|HTTP Request| API[Express API Layer]
    API -->|Validate| Controller[Controllers]
    Controller -->|Business Logic| Service[Services (Pooling, Pricing)]
    Service -->|Data Access| Prisma[Prisma ORM]
    Prisma -->|Persist| DB[(PostgreSQL)]
    
    subgraph Services
    Pooling[Pooling Service]
    Pricing[Pricing Service]
    Matcher[Ride Matcher]
    end
```

**Flow:** `Client` → `Express Routes` → `Controllers` → `Services` → `Prisma ORM` → `PostgreSQL`

## 🧩 Low-Level Design (Class Structure)

```mermaid
classDiagram
    class PoolingService {
        +matchRide(bookingId, pickup, dropoff)
        -findExistingRide(pickup, dropoff)
        -createNewRide(bookingId, pickup, dropoff)
        -isPathValid(ride, newPickup, newDropoff)
    }

    class PricingService {
        +calculatePrice(distance)
        -getSupplyDemandMultiplier()
    }

    class BookingController {
        +createBooking(req, res)
        +cancelBooking(req, res)
        +getBooking(req, res)
    }

    BookingController --> PoolingService : uses
    BookingController --> PricingService : uses
```

### PoolingService Responsibilities

1.  **Client/API Layer**: RESTful endpoints receiving HTTP requests.
2.  **Controller Layer**: Handles request validation (e.g., coordinates check) and response formatting.
3.  **Service Layer**: Contains core business logic (Pooling, Pricing, Matching).
4.  **Data Access Layer (Prisma)**: Type-safe database interactions.
5.  **Database (PostgreSQL)**: Persists Users, Drivers, Rides, and Bookings.

---

## ⚙️ Low-Level Design

### PoolingService Responsibilities
The `PoolingService` is the heart of the system.
1.  **Matchmaking**: Upon a booking request, it first searches for *existing* active rides (`SCHEDULED` status).
2.  **Constraint Validation**:
    -   **Capacity**: Checks if `active_passengers + new_passengers <= 4`.
    -   **Deviation**: Validates if adding the new pickup/dropoff points increases the total trip duration/distance beyond a threshold (e.g., 20%).
3.  **Driver Allocation**: If no existing ride matches, it searches for an `AVAILABLE` driver and matches them.

### Driver Allocation Logic
-   The system queries for drivers with `status: AVAILABLE`.
-   It prioritizes drivers based on proximity (future improvement) or simple availability (current implementation).
-   Once a candidate is found, it attempts to claim them using an **atomic lock**.

### Transaction Handling
All critical state changes occur within ACID transactions (`prisma.$transaction`).
-   *Creating a Ride*: The system creates the `Ride` record and updates the `Booking` status to `CONFIRMED` atomically. If one fails, both roll back.

---

## 🔒 Concurrency Strategy

Handling simultaneous booking requests is critical for a ride-sharing app.

### Atomic Driver Claiming
We prevent **Race Conditions** (e.g., two users booking the same driver simultaneously) using **Optimistic Locking via Database Queries**.

Instead of fetching a driver and then updating them (which leaves a gap for race conditions), we use a single atomic query:

```typescript
// Atomic Update: Returns count > 0 ONLY if status was still 'AVAILABLE' at the moment of update
const result = await prisma.driver.updateMany({
    where: { 
        id: candidate.id, 
        status: 'AVAILABLE' 
    },
    data: { 
        status: 'BUSY' 
    }
});
```

-   If `result.count === 1`: The lock was acquired successfully. Proceed to create ride.
-   If `result.count === 0`: Another process claimed this driver milliseconds ago. The system skips this driver and tries the next candidate.

This ensures **Zero Overbooking** without needing complex Redis locks or heavy serialized transactions.

---

## 📊 Algorithm Complexity Analysis

### 1. Ride Matching
-   **Operation**: Iterating through active `SCHEDULED` rides.
-   **Complexity**: `O(N)` where `N` is the number of active rides.
-   *Optimization*: Database indexing on `status` ensures we only fetch relevant rides. Geospacial indexing (e.g. PostGIS) would further reduce `N` to only rides in the vicinity.

### 2. Driver Allocation
-   **Operation**: Fetching available drivers and attempting to claim.
-   **Complexity**: `O(K)` where `K` is the number of candidates checked (e.g., top 5). Since `K` is small and constant, this is effectively `O(1)`.

### 3. Overall Request Complexity
-   **Complexity**: `O(N)` per booking request.
-   This is highly scalable. For very large datasets, geospatial partitioning would keep `N` small.

---

## 💰 Dynamic Pricing Design

The price logic ensures profitability while managing demand.

**Formula:**
`Total Price = (Base Fare + (Distance * Rate_Per_Km)) * Surge_Multiplier`

### Surge Multiplier
Calculated based on the **Utilization Ratio** (`Busy Drivers / Total Drivers`).
-   Utilization > 80% → **1.5x Multiplier**
-   Utilization > 50% → **1.2x Multiplier**
-   Otherwise → **1.0x (Standard Price)**

---

## 🗄 Database Schema & Indexing

### Relationships
-   **User** (1) ↔ (N) **Booking**
-   **Driver** (1) ↔ (N) **Ride**
-   **Ride** (1) ↔ (N) **Booking**

### Key Indices
Efficiency is maintained via database indices defined in `schema.prisma`:
-   `Ride(status)`: Speeds up finding candidate rides for pooling.
-   `User(email)`: Fast user lookups.
-   Prisma automatically indexes all primary keys (`id`) and foreign keys (`driverId`, `rideId`).

---

## 🧪 Testing Strategy

### 1. Manual Testing (API)
-   **Health Check**: `GET /health`
-   **Create User/Driver**: `POST /users`, `POST /drivers`
-   **Book Ride**: `POST /bookings` (Response includes `rideId`, `price`, `status`)
-   **Cancel**: `POST /bookings/:id/cancel`

### 2. Concurrency Testing
A dedicated script `scripts/test-concurrency.ts` simulates high-load scenarios.
-   **Scenario**: Fires 20 simultaneous booking requests with only 5 drivers available.
-   **Pass Criteria**: Exactly 5 rides created, 0 drivers double-booked.
-   **Run**: `npx ts-node scripts/test-concurrency.ts`

### API Documentation

The full API specification is available in the `openapi.yaml` file. You can import this file into [Swagger Editor](https://editor.swagger.io/) or Postman to test the endpoints.

### 3. Cancellation Testing
Script `scripts/test-cancellation.ts` verifies resource cleanup.
-   **Run**: `npx ts-node scripts/test-cancellation.ts`

---

## 🛠 Setup & Running

### Prerequisites
-   Node.js (v18+)
-   PostgreSQL

### Installation
```bash
npm install
```

### Database
Create a `.env` file:
```env
DATABASE_URL="postgresql://user:pass@localhost:5432/airport_pooling?schema=public"
PORT=3000
```
Push Schema:
```bash
npx prisma db push
```

### Run Server
```bash
npm run dev
```

---
*Submitted by Rohit Yadav*
