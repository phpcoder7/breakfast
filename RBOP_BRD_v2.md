# Business Requirements Document (BRD)

# Restaurant Buffet Operations Platform (RBOP)

**Version:** 2.0 (Draft)

---

# 1. Project Overview

## Purpose

Restaurant Buffet Operations Platform (RBOP) is a cloud-based SaaS application designed to manage buffet operations for restaurants and hotels.

The system focuses on three meal sessions:

- Breakfast
- Lunch
- Dinner

The platform provides real-time guest check-in, table occupancy management, meal capacity monitoring, dashboards, and operational reports.

---

# 2. Project Scope

## Included

- Multi-tenant SaaS
- Restaurant Management
- Floors
- Rooms
- Tables
- Breakfast
- Lunch
- Dinner
- Guest Check-in
- Guest Check-out
- Dashboard
- Reports
- User Roles
- Real-time Updates

## Excluded

- POS
- Inventory
- Reservation System
- Loyalty
- Payment Gateway
- Mobile Applications
- Offline Mode

---

# 3. Technology Stack

## Frontend

- Vue 3
- TypeScript
- Pinia
- Vue Router
- Tailwind CSS v4
- shadcn-vue

## Backend

- Laravel
- PostgreSQL
- Spatie Multitenancy
- Spatie Permission
- Laravel Reverb
- Redis

---

# 4. Restaurant Structure

Restaurant

- Floors
    - Rooms
        - Tables

Example:

Restaurant

- Ground Floor
    - Main Hall
        - Table 1
        - Table 2
- First Floor
    - Terrace
        - Table 20

---

# 5. Meal Sessions

The system supports exactly three sessions:

| Session | Description |
|---------|-------------|
| Breakfast | Morning Buffet |
| Lunch | Afternoon Buffet |
| Dinner | Evening Buffet |

Each session contains:

- Opening Time
- Closing Time
- Capacity
- Menu
- Status

---

# 6. Guest Types

- Hotel Guest
- Walk-in Guest

---

# 7. User Roles

## Supervisor

- Configure restaurant
- Manage users
- Reports
- Dashboard
- Check-in / Check-out

## Hostess

- Search guests
- Check-in
- Check-out
- Change tables

## Waiter

- View tables
- View guests
- View dashboard

---

# 8. Table Status

- Available
- Occupied
- Reserved (Future)
- Cleaning
- Out of Service

---

# 9. Check-in Workflow

1. Select Meal
2. Search Guest
3. Select Table
4. Confirm Check-in
5. Update Dashboard
6. Broadcast Real-time Update

---

# 10. Dashboard

Dashboard displays:

- Total Guests
- Walk-in Guests
- Hotel Guests
- Available Tables
- Occupied Tables
- Capacity %
- Average Guests per Table
- Current Meal
- Live Floor Status

---

# 11. Reports

- Daily Summary
- Meal Summary
- Guest Statistics
- Table Utilization
- Accounting Summary

---

# 12. Business Rules

- One guest cannot be checked into two tables simultaneously.
- A table cannot exceed its seating capacity.
- Closed meal sessions do not allow new check-ins.
- Every check-in must belong to one meal session.
- Every user belongs to one tenant.

---

# 13. Non-Functional Requirements

- Responsive UI for iPad
- Real-time synchronization
- Secure authentication
- Tenant data isolation
- PostgreSQL database per tenant
- High availability

---

# 14. Future Enhancements

- PMS Integration
- POS Integration
- Reservations
- Mobile Apps
- Loyalty Program

---

# 15. Rebuild Guidance for AI Agents

Any AI agent rebuilding this project SHALL:

1. Preserve all business rules.
2. Maintain tenant isolation.
3. Use Vue 3 and Laravel.
4. Keep the UI optimized for iPad.
5. Preserve meal workflow.
6. Preserve role permissions.
7. Preserve real-time synchronization.
