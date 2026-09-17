// server/routes/finance/index.js

import express from "express";
import db from "../../db.js";

import ticketsRouter from "./tickets.js";

const router = express.Router();

// ============================================================
// FINANCE DASHBOARD
//
// GET /api/finance/dashboard
//
// Authentication + Finance role protection are already applied
// in server.js:
//
// /api/finance
//    -> authenticate
//    -> requireRole("Finance")
//    -> finance/index.js
// ============================================================

router.get("/dashboard", async (req, res) => {
  try {
    // ========================================================
    // 1. PENDING PAYMENT TICKETS
    // ========================================================

    const [pendingRows] = await db.execute(
      `
        SELECT COUNT(*) AS total
        FROM finance_tickets
        WHERE payment_status = 'Pending Payment'
      `,
    );

    // ========================================================
    // 2. PAYMENTS COMPLETED TODAY
    // ========================================================

    const [completedTodayRows] = await db.execute(
      `
        SELECT COUNT(*) AS total
        FROM finance_tickets
        WHERE payment_status = 'Paid'
          AND paid_at IS NOT NULL
          AND DATE(paid_at) = CURDATE()
      `,
    );

    // ========================================================
    // 3. PAID TICKETS WAITING FOR REGISTRAR
    //
    // Finance is already complete.
    // Registrar still needs to process the request.
    // ========================================================

    const [waitingRegistrarRows] = await db.execute(
      `
        SELECT COUNT(*) AS total
        FROM finance_tickets
        WHERE payment_status = 'Paid'
          AND registrar_status IN (
            'Ready for Processing',
            'Processing'
          )
      `,
    );

    return res.status(200).json({
      success: true,
      message: "Finance module is ready.",

      user: {
        user_id: Number(req.user.user_id),
        username: req.user.username,
        email: req.user.email,
        role_id: Number(req.user.role_id),
        role_name: req.user.role_name,
      },

      summary: {
        pending_tickets: Number(pendingRows[0]?.total ?? 0),

        completed_today: Number(completedTodayRows[0]?.total ?? 0),

        waiting_for_registrar: Number(waitingRegistrarRows[0]?.total ?? 0),
      },
    });
  } catch (error) {
    console.error("GET FINANCE DASHBOARD ERROR:", error);

    return res.status(500).json({
      success: false,
      code: "FINANCE_DASHBOARD_LOAD_FAILED",
      message: "Failed to load the Finance dashboard.",
    });
  }
});

// ============================================================
// FINANCE TICKET ROUTES
//
// Base:
// /api/finance/tickets
//
// Available:
//
// GET
// /api/finance/tickets/:ticketNumber
//
// PATCH
// /api/finance/tickets/:ticketNumber/pay
//
// Example:
//
// GET
// /api/finance/tickets/FIN-COR-2026-000001
//
// PATCH
// /api/finance/tickets/FIN-COR-2026-000001/pay
// ============================================================

router.use("/tickets", ticketsRouter);

// ============================================================
// FINANCE ROUTER
// ============================================================

export default router;
