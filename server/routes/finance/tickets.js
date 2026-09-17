// server/routes/finance/tickets.js

import express from "express";
import db from "../../db.js";

const router = express.Router();

const ALLOWED_PAYMENT_METHODS = new Set(["Cash", "GCash", "Bank", "Online"]);

// ============================================================
// HELPERS
// ============================================================

function getFinanceUserId(req, res) {
  if (!req.user || req.user.role_name !== "Finance") {
    res.status(403).json({
      success: false,
      code: "FINANCE_ACCESS_REQUIRED",
      message: "Finance access is required.",
    });

    return null;
  }

  const userId = Number(req.user.user_id);

  if (!Number.isInteger(userId) || userId <= 0) {
    res.status(401).json({
      success: false,
      code: "INVALID_AUTHENTICATED_USER",
      message: "Authenticated Finance user ID is invalid.",
    });

    return null;
  }

  return userId;
}

function cleanTicketNumber(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function cleanRequiredText(value, maxLength) {
  const cleaned = String(value || "").trim();

  if (!cleaned) {
    return null;
  }

  return cleaned.slice(0, maxLength);
}

function cleanOptionalText(value, maxLength) {
  if (value === undefined || value === null) {
    return null;
  }

  const cleaned = String(value).trim();

  if (!cleaned) {
    return null;
  }

  return cleaned.slice(0, maxLength);
}

function toMoney(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return null;
  }

  return Number(amount.toFixed(2));
}

function moneyEquals(first, second) {
  return Math.abs(Number(first) - Number(second)) < 0.005;
}

// ============================================================
// SEARCH / LIST FINANCE TICKETS
//
// GET /api/finance/tickets
// GET /api/finance/tickets?q=FIN-COR-2026-000003
//
// Search supports:
// - Finance ticket number
// - Student document request number
// - Student number
// - Student name
// - Transaction code
// - Transaction name
//
// IMPORTANT:
// This route MUST be declared before "/:ticketNumber".
// ============================================================

router.get("/", async (req, res) => {
  const financeUserId = getFinanceUserId(req, res);

  if (!financeUserId) {
    return;
  }

  const query = typeof req.query?.q === "string" ? req.query.q.trim() : "";

  const likeQuery = `%${query}%`;

  try {
    const params = [];

    let searchWhere = "";

    if (query) {
      searchWhere = `
        WHERE (
          ft.ticket_number LIKE ?
          OR sdr.request_number LIKE ?
          OR s.student_number LIKE ?
          OR CONCAT_WS(
            ' ',
            s.first_name,
            NULLIF(s.middle_name, ''),
            s.last_name
          ) LIKE ?
          OR ftt.transaction_code LIKE ?
          OR ftt.transaction_name LIKE ?
        )
      `;

      params.push(
        likeQuery,
        likeQuery,
        likeQuery,
        likeQuery,
        likeQuery,
        likeQuery,
      );
    }

    const [rows] = await db.execute(
      `
        SELECT
          ft.ticket_id,
          ft.ticket_number,

          ft.student_id,
          s.student_number,

          CONCAT_WS(
            ' ',
            s.first_name,
            NULLIF(s.middle_name, ''),
            s.last_name
          ) AS student_name,

          ftt.transaction_type_id,
          ftt.transaction_code,
          ftt.transaction_name,

          ft.document_request_id,

          sdr.request_number,
          sdr.document_type,

          sdr.enrollment_id,
          e.academic_year_id,
          ay.academic_year,
          e.semester_id,
          sem.semester_name,
          e.enrollment_status,

          sdr.purpose,
          sdr.copies,
          sdr.requested_at,
          sdr.cancelled_at,
          sdr.cancellation_reason,

          ft.grade_id,

          ft.amount_due,
          ft.amount_paid,
          ft.payment_method,
          ft.receipt_number,
          ft.payment_status,
          ft.registrar_status,
          ft.finance_remarks,
          ft.registrar_remarks,
          ft.paid_by,
          ft.paid_at,
          ft.registrar_processed_by,
          ft.registrar_started_at,
          ft.registrar_completed_at,
          ft.created_at,
          ft.updated_at

        FROM finance_tickets ft

        INNER JOIN students s
          ON s.student_id = ft.student_id

        INNER JOIN finance_transaction_types ftt
          ON ftt.transaction_type_id = ft.transaction_type_id

        LEFT JOIN student_document_requests sdr
          ON sdr.request_id = ft.document_request_id

        LEFT JOIN enrollments e
          ON e.enrollment_id = sdr.enrollment_id

        LEFT JOIN academic_years ay
          ON ay.academic_year_id = e.academic_year_id

        LEFT JOIN semesters sem
          ON sem.semester_id = e.semester_id

        ${searchWhere}

        ORDER BY ft.ticket_id DESC
        LIMIT 50
      `,
      params,
    );

    const tickets = rows.map((ticket) => ({
      ticket_id: Number(ticket.ticket_id),
      ticket_number: ticket.ticket_number,

      student: {
        student_id: Number(ticket.student_id),
        student_number: ticket.student_number,
        student_name: ticket.student_name,
      },

      transaction: {
        transaction_type_id: Number(ticket.transaction_type_id),
        transaction_code: ticket.transaction_code,
        transaction_name: ticket.transaction_name,
      },

      document_request:
        ticket.document_request_id !== null
          ? {
              request_id: Number(ticket.document_request_id),
              request_number: ticket.request_number,
              document_type: ticket.document_type,

              enrollment_id:
                ticket.enrollment_id === null ||
                ticket.enrollment_id === undefined
                  ? null
                  : Number(ticket.enrollment_id),

              academic_period:
                ticket.enrollment_id === null ||
                ticket.enrollment_id === undefined
                  ? null
                  : {
                      academic_year_id:
                        ticket.academic_year_id === null ||
                        ticket.academic_year_id === undefined
                          ? null
                          : Number(ticket.academic_year_id),

                      academic_year: ticket.academic_year || null,

                      semester_id:
                        ticket.semester_id === null ||
                        ticket.semester_id === undefined
                          ? null
                          : Number(ticket.semester_id),

                      semester_name: ticket.semester_name || null,

                      enrollment_status: ticket.enrollment_status || null,
                    },

              purpose: ticket.purpose,
              copies: Number(ticket.copies ?? 1),
              requested_at: ticket.requested_at,
              cancelled_at: ticket.cancelled_at,
              cancellation_reason: ticket.cancellation_reason,
            }
          : null,

      grade_id:
        ticket.grade_id === null || ticket.grade_id === undefined
          ? null
          : Number(ticket.grade_id),

      payment: {
        amount_due:
          ticket.amount_due === null ? null : Number(ticket.amount_due),

        amount_paid: Number(ticket.amount_paid ?? 0),
        payment_method: ticket.payment_method,
        receipt_number: ticket.receipt_number,
        payment_status: ticket.payment_status,
        finance_remarks: ticket.finance_remarks,

        paid_by:
          ticket.paid_by === null || ticket.paid_by === undefined
            ? null
            : Number(ticket.paid_by),

        paid_at: ticket.paid_at,
      },

      registrar: {
        status: ticket.registrar_status,
        remarks: ticket.registrar_remarks,

        processed_by:
          ticket.registrar_processed_by === null ||
          ticket.registrar_processed_by === undefined
            ? null
            : Number(ticket.registrar_processed_by),

        started_at: ticket.registrar_started_at,
        completed_at: ticket.registrar_completed_at,
      },

      created_at: ticket.created_at,
      updated_at: ticket.updated_at,
    }));

    return res.status(200).json({
      success: true,
      code: "FINANCE_TICKETS_RETRIEVED",
      query: query || null,
      count: tickets.length,
      tickets,
    });
  } catch (error) {
    console.error("GET FINANCE TICKETS ERROR:", error);

    return res.status(500).json({
      success: false,
      code: "FINANCE_TICKETS_LOAD_FAILED",
      message: "Failed to load Finance tickets.",
    });
  }
});

// ============================================================
// GET TICKET BY TICKET NUMBER
//
// GET /api/finance/tickets/:ticketNumber
//
// Example:
// GET /api/finance/tickets/FIN-COR-2026-000001
//
// Used by Cashier when student presents Ticket ID.
// ============================================================

router.get("/:ticketNumber", async (req, res) => {
  const financeUserId = getFinanceUserId(req, res);

  if (!financeUserId) {
    return;
  }

  const ticketNumber = cleanTicketNumber(req.params.ticketNumber);

  if (!ticketNumber) {
    return res.status(400).json({
      success: false,
      code: "TICKET_NUMBER_REQUIRED",
      message: "Ticket number is required.",
    });
  }

  try {
    const [rows] = await db.execute(
      `
        SELECT
          ft.ticket_id,
          ft.ticket_number,

          ft.student_id,
          s.student_number,

          CONCAT_WS(
            ' ',
            s.first_name,
            NULLIF(s.middle_name, ''),
            s.last_name
          ) AS student_name,

          ftt.transaction_type_id,
          ftt.transaction_code,
          ftt.transaction_name,

          ft.document_request_id,

          sdr.request_number,
          sdr.document_type,

          sdr.enrollment_id,
          e.academic_year_id,
          ay.academic_year,
          e.semester_id,
          sem.semester_name,
          e.enrollment_status,

          sdr.purpose,
          sdr.copies,
          sdr.requested_at,
          sdr.cancelled_at,
          sdr.cancellation_reason,

          ft.grade_id,

          ft.amount_due,
          ft.amount_paid,

          ft.payment_method,
          ft.receipt_number,

          ft.payment_status,
          ft.registrar_status,

          ft.finance_remarks,
          ft.registrar_remarks,

          ft.created_by,
          ft.paid_by,
          ft.paid_at,

          ft.registrar_processed_by,
          ft.registrar_started_at,
          ft.registrar_completed_at,

          ft.created_at,
          ft.updated_at

        FROM finance_tickets ft

        INNER JOIN students s
          ON s.student_id = ft.student_id

        INNER JOIN finance_transaction_types ftt
          ON ftt.transaction_type_id =
             ft.transaction_type_id

        LEFT JOIN student_document_requests sdr
          ON sdr.request_id =
             ft.document_request_id

        LEFT JOIN enrollments e
          ON e.enrollment_id =
             sdr.enrollment_id

        LEFT JOIN academic_years ay
          ON ay.academic_year_id =
             e.academic_year_id

        LEFT JOIN semesters sem
          ON sem.semester_id =
             e.semester_id

        WHERE ft.ticket_number = ?

        LIMIT 1
      `,
      [ticketNumber],
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        code: "FINANCE_TICKET_NOT_FOUND",
        message: "Finance ticket was not found.",
      });
    }

    const ticket = rows[0];

    return res.status(200).json({
      success: true,
      code: "FINANCE_TICKET_RETRIEVED",
      ticket: {
        ticket_id: Number(ticket.ticket_id),
        ticket_number: ticket.ticket_number,

        student: {
          student_id: Number(ticket.student_id),
          student_number: ticket.student_number,
          student_name: ticket.student_name,
        },

        transaction: {
          transaction_type_id: Number(ticket.transaction_type_id),
          transaction_code: ticket.transaction_code,
          transaction_name: ticket.transaction_name,
        },

        document_request:
          ticket.document_request_id !== null
            ? {
                request_id: Number(ticket.document_request_id),
                request_number: ticket.request_number,
                document_type: ticket.document_type,

                enrollment_id:
                  ticket.enrollment_id === null ||
                  ticket.enrollment_id === undefined
                    ? null
                    : Number(ticket.enrollment_id),

                academic_period:
                  ticket.enrollment_id === null ||
                  ticket.enrollment_id === undefined
                    ? null
                    : {
                        academic_year_id:
                          ticket.academic_year_id === null ||
                          ticket.academic_year_id === undefined
                            ? null
                            : Number(ticket.academic_year_id),

                        academic_year: ticket.academic_year || null,

                        semester_id:
                          ticket.semester_id === null ||
                          ticket.semester_id === undefined
                            ? null
                            : Number(ticket.semester_id),

                        semester_name: ticket.semester_name || null,

                        enrollment_status: ticket.enrollment_status || null,
                      },

                purpose: ticket.purpose,
                copies: Number(ticket.copies ?? 1),
                requested_at: ticket.requested_at,
                cancelled_at: ticket.cancelled_at,
                cancellation_reason: ticket.cancellation_reason,
              }
            : null,

        grade_id: ticket.grade_id === null ? null : Number(ticket.grade_id),

        payment: {
          amount_due:
            ticket.amount_due === null ? null : Number(ticket.amount_due),

          amount_paid: Number(ticket.amount_paid ?? 0),

          payment_method: ticket.payment_method,

          receipt_number: ticket.receipt_number,

          payment_status: ticket.payment_status,

          finance_remarks: ticket.finance_remarks,

          paid_by: ticket.paid_by === null ? null : Number(ticket.paid_by),

          paid_at: ticket.paid_at,
        },

        registrar: {
          status: ticket.registrar_status,

          remarks: ticket.registrar_remarks,

          processed_by:
            ticket.registrar_processed_by === null
              ? null
              : Number(ticket.registrar_processed_by),

          started_at: ticket.registrar_started_at,

          completed_at: ticket.registrar_completed_at,
        },

        created_at: ticket.created_at,
        updated_at: ticket.updated_at,
      },
    });
  } catch (error) {
    console.error("GET FINANCE TICKET ERROR:", error);

    return res.status(500).json({
      success: false,
      code: "FINANCE_TICKET_LOAD_FAILED",
      message: "Failed to load the Finance ticket.",
    });
  }
});

// ============================================================
// MARK TICKET AS PAID
//
// PATCH /api/finance/tickets/:ticketNumber/pay
//
// Example:
//
// PATCH
// /api/finance/tickets/FIN-COR-2026-000001/pay
//
// Body:
//
// {
//   "amount_due": 100,
//   "amount_paid": 100,
//   "payment_method": "Cash",
//   "receipt_number": "OR-000001",
//   "remarks": "Payment received."
// }
//
// IMPORTANT:
//
// Finance controls:
//   Pending Payment -> Paid
//
// When payment succeeds:
//
// Finance:
//   payment_status = Paid
//
// Registrar:
//   Pending -> Ready for Processing
//
// Finance does NOT mark Registrar Processing or Done.
// ============================================================

router.patch("/:ticketNumber/pay", async (req, res) => {
  const financeUserId = getFinanceUserId(req, res);

  if (!financeUserId) {
    return;
  }

  const ticketNumber = cleanTicketNumber(req.params.ticketNumber);

  if (!ticketNumber) {
    return res.status(400).json({
      success: false,
      code: "TICKET_NUMBER_REQUIRED",
      message: "Ticket number is required.",
    });
  }

  // ==========================================================
  // PAYMENT METHOD
  // ==========================================================

  const paymentMethod = cleanRequiredText(req.body?.payment_method, 30);

  if (!paymentMethod || !ALLOWED_PAYMENT_METHODS.has(paymentMethod)) {
    return res.status(400).json({
      success: false,
      code: "INVALID_PAYMENT_METHOD",
      message: "Payment method must be Cash, GCash, Bank, or Online.",
    });
  }

  // ==========================================================
  // RECEIPT NUMBER
  // ==========================================================

  const receiptNumber = cleanRequiredText(req.body?.receipt_number, 50);

  if (!receiptNumber) {
    return res.status(400).json({
      success: false,
      code: "RECEIPT_NUMBER_REQUIRED",
      message: "Receipt number is required.",
    });
  }

  // ==========================================================
  // AMOUNT PAID
  // ==========================================================

  const amountPaid = toMoney(req.body?.amount_paid);

  if (amountPaid === null || amountPaid <= 0) {
    return res.status(400).json({
      success: false,
      code: "INVALID_AMOUNT_PAID",
      message: "Amount paid must be greater than zero.",
    });
  }

  // ==========================================================
  // OPTIONAL AMOUNT DUE
  //
  // Right now COR/COG default_amount is NULL.
  //
  // Therefore Cashier can provide amount_due when receiving
  // payment.
  //
  // Later, when official COR/COG fees are configured,
  // amount_due can be automatically assigned.
  // ==========================================================

  const requestedAmountDue =
    req.body?.amount_due === undefined ? null : toMoney(req.body.amount_due);

  if (
    req.body?.amount_due !== undefined &&
    (requestedAmountDue === null || requestedAmountDue <= 0)
  ) {
    return res.status(400).json({
      success: false,
      code: "INVALID_AMOUNT_DUE",
      message: "Amount due must be greater than zero.",
    });
  }

  const financeRemarks = cleanOptionalText(req.body?.remarks, 500);

  let connection;
  let transactionActive = false;

  try {
    // ========================================================
    // 1. START DATABASE TRANSACTION
    // ========================================================

    connection = await db.getConnection();

    await connection.beginTransaction();

    transactionActive = true;

    // ========================================================
    // 2. LOCK TICKET
    // ========================================================

    const [ticketRows] = await connection.execute(
      `
          SELECT
            ft.ticket_id,
            ft.ticket_number,

            ft.student_id,

            ft.transaction_type_id,
            ftt.transaction_code,
            ftt.transaction_name,

            ft.document_request_id,
            ft.grade_id,

            ft.amount_due,
            ft.amount_paid,

            ft.payment_method,
            ft.receipt_number,

            ft.payment_status,
            ft.registrar_status,

            s.student_number,

            CONCAT_WS(
              ' ',
              s.first_name,
              NULLIF(s.middle_name, ''),
              s.last_name
            ) AS student_name,

            sdr.request_number,
            sdr.document_type,

            sdr.enrollment_id,
            e.academic_year_id,
            ay.academic_year,
            e.semester_id,
            sem.semester_name,
            e.enrollment_status,

            sdr.purpose,
            sdr.copies,
            sdr.requested_at,
            sdr.cancelled_at

          FROM finance_tickets ft

          INNER JOIN students s
            ON s.student_id =
               ft.student_id

          INNER JOIN finance_transaction_types ftt
            ON ftt.transaction_type_id =
               ft.transaction_type_id

          LEFT JOIN student_document_requests sdr
            ON sdr.request_id =
               ft.document_request_id

          LEFT JOIN enrollments e
            ON e.enrollment_id =
               sdr.enrollment_id

          LEFT JOIN academic_years ay
            ON ay.academic_year_id =
               e.academic_year_id

          LEFT JOIN semesters sem
            ON sem.semester_id =
               e.semester_id

          WHERE ft.ticket_number = ?

          LIMIT 1

          FOR UPDATE
        `,
      [ticketNumber],
    );

    if (ticketRows.length === 0) {
      await connection.rollback();

      transactionActive = false;

      return res.status(404).json({
        success: false,
        code: "FINANCE_TICKET_NOT_FOUND",
        message: "Finance ticket was not found.",
      });
    }

    const ticket = ticketRows[0];

    // ========================================================
    // 3. MAKE SURE DOCUMENT REQUEST IS NOT CANCELLED
    // ========================================================

    if (ticket.document_request_id !== null && ticket.cancelled_at !== null) {
      await connection.rollback();

      transactionActive = false;

      return res.status(409).json({
        success: false,
        code: "DOCUMENT_REQUEST_CANCELLED",
        message:
          "Payment cannot be accepted because this document request has been cancelled.",
      });
    }

    // ========================================================
    // 4. CHECK CURRENT PAYMENT STATUS
    // ========================================================

    if (ticket.payment_status === "Paid") {
      await connection.rollback();

      transactionActive = false;

      return res.status(409).json({
        success: false,
        code: "TICKET_ALREADY_PAID",
        message: "This Finance ticket has already been paid.",

        ticket: {
          ticket_number: ticket.ticket_number,

          payment_status: ticket.payment_status,

          registrar_status: ticket.registrar_status,

          amount_due:
            ticket.amount_due === null ? null : Number(ticket.amount_due),

          amount_paid: Number(ticket.amount_paid ?? 0),

          receipt_number: ticket.receipt_number,
        },
      });
    }

    if (
      ticket.payment_status === "Cancelled" ||
      ticket.payment_status === "Refunded"
    ) {
      await connection.rollback();

      transactionActive = false;

      return res.status(409).json({
        success: false,
        code: "TICKET_NOT_PAYABLE",
        message: `This ticket cannot be paid because its payment status is ${ticket.payment_status}.`,
      });
    }

    if (ticket.payment_status !== "Pending Payment") {
      await connection.rollback();

      transactionActive = false;

      return res.status(409).json({
        success: false,
        code: "INVALID_PAYMENT_STATUS",
        message: "This ticket is not currently waiting for payment.",
      });
    }

    // ========================================================
    // 5. REGISTRAR MUST STILL BE PENDING
    // ========================================================

    if (ticket.registrar_status !== "Pending") {
      await connection.rollback();

      transactionActive = false;

      return res.status(409).json({
        success: false,
        code: "INVALID_REGISTRAR_STATUS",
        message: "The Registrar status is not valid for a new payment.",
      });
    }

    // ========================================================
    // 6. DETERMINE AMOUNT DUE
    //
    // Existing amount_due wins.
    //
    // If database amount_due is NULL, Cashier must provide
    // amount_due in request body.
    // ========================================================

    const currentAmountDue =
      ticket.amount_due === null ? null : Number(ticket.amount_due);

    let finalAmountDue = currentAmountDue;

    if (finalAmountDue === null) {
      if (requestedAmountDue === null || requestedAmountDue <= 0) {
        await connection.rollback();

        transactionActive = false;

        return res.status(400).json({
          success: false,
          code: "AMOUNT_DUE_REQUIRED",
          message:
            "This ticket does not have an amount due yet. Finance must provide amount_due before completing payment.",
        });
      }

      finalAmountDue = requestedAmountDue;
    }

    // ========================================================
    // 7. DO NOT SILENTLY CHANGE AN EXISTING AMOUNT DUE
    // ========================================================

    if (
      currentAmountDue !== null &&
      requestedAmountDue !== null &&
      !moneyEquals(currentAmountDue, requestedAmountDue)
    ) {
      await connection.rollback();

      transactionActive = false;

      return res.status(409).json({
        success: false,
        code: "AMOUNT_DUE_MISMATCH",
        message:
          "The submitted amount_due does not match the amount already assigned to this ticket.",

        amount_due: currentAmountDue,
      });
    }

    // ========================================================
    // 8. PAYMENT MUST MATCH AMOUNT DUE
    //
    // amount_paid means the amount applied to this ticket.
    // For this first workflow we require full payment.
    // ========================================================

    if (!moneyEquals(amountPaid, finalAmountDue)) {
      await connection.rollback();

      transactionActive = false;

      return res.status(400).json({
        success: false,
        code: "FULL_PAYMENT_REQUIRED",
        message:
          "Amount paid must exactly match the amount due before the ticket can be marked Paid.",

        amount_due: finalAmountDue,

        amount_paid: amountPaid,
      });
    }

    // ========================================================
    // 9. MARK FINANCE PAYMENT AS PAID
    //
    // Registrar becomes Ready for Processing.
    //
    // Finance DOES NOT set:
    //   Processing
    //   Done
    // ========================================================

    await connection.execute(
      `
        UPDATE finance_tickets

        SET
          amount_due = ?,
          amount_paid = ?,

          payment_method = ?,
          receipt_number = ?,

          payment_status = 'Paid',

          registrar_status =
            'Ready for Processing',

          finance_remarks = ?,

          paid_by = ?,
          paid_at = NOW()

        WHERE ticket_id = ?
      `,
      [
        finalAmountDue,
        amountPaid,
        paymentMethod,
        receiptNumber,
        financeRemarks,
        financeUserId,
        Number(ticket.ticket_id),
      ],
    );

    // ========================================================
    // 10. COMMIT
    // ========================================================

    await connection.commit();

    transactionActive = false;

    // ========================================================
    // 11. SUCCESS RESPONSE
    // ========================================================

    return res.status(200).json({
      success: true,
      code: "FINANCE_TICKET_PAID",

      message:
        "Payment completed successfully. The request is now ready for Registrar processing.",

      ticket: {
        ticket_id: Number(ticket.ticket_id),

        ticket_number: ticket.ticket_number,

        student: {
          student_id: Number(ticket.student_id),

          student_number: ticket.student_number,

          student_name: ticket.student_name,
        },

        transaction: {
          transaction_code: ticket.transaction_code,

          transaction_name: ticket.transaction_name,
        },

        document_request:
          ticket.document_request_id !== null
            ? {
                request_id: Number(ticket.document_request_id),

                request_number: ticket.request_number,

                document_type: ticket.document_type,

                enrollment_id:
                  ticket.enrollment_id === null ||
                  ticket.enrollment_id === undefined
                    ? null
                    : Number(ticket.enrollment_id),

                academic_period:
                  ticket.enrollment_id === null ||
                  ticket.enrollment_id === undefined
                    ? null
                    : {
                        academic_year_id:
                          ticket.academic_year_id === null ||
                          ticket.academic_year_id === undefined
                            ? null
                            : Number(ticket.academic_year_id),

                        academic_year: ticket.academic_year || null,

                        semester_id:
                          ticket.semester_id === null ||
                          ticket.semester_id === undefined
                            ? null
                            : Number(ticket.semester_id),

                        semester_name: ticket.semester_name || null,

                        enrollment_status: ticket.enrollment_status || null,
                      },

                purpose: ticket.purpose,

                copies: Number(ticket.copies ?? 1),

                requested_at: ticket.requested_at,
              }
            : null,

        payment: {
          amount_due: finalAmountDue,

          amount_paid: amountPaid,

          payment_method: paymentMethod,

          receipt_number: receiptNumber,

          payment_status: "Paid",

          paid_by: financeUserId,
        },

        registrar: {
          status: "Ready for Processing",
        },
      },
    });
  } catch (error) {
    if (connection && transactionActive) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("FINANCE PAYMENT ROLLBACK ERROR:", rollbackError);
      }
    }

    console.error("FINANCE PAYMENT ERROR:", error);

    // Duplicate receipt number
    if (error?.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        code: "DUPLICATE_RECEIPT_NUMBER",
        message:
          "That receipt number is already connected to another Finance transaction.",
      });
    }

    return res.status(500).json({
      success: false,
      code: "FINANCE_PAYMENT_FAILED",
      message: "Failed to complete the Finance payment.",
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

export default router;
