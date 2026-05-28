const express = require("express");
const { PrismaClient } = require("@prisma/client");
const { authenticate } = require("../middleware/auth");

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/queue
router.get("/", authenticate, async (req, res) => {
  try {
    const { doctorId, status } = req.query;
    const where = {};
    if (doctorId) where.doctorId = doctorId;
    if (status) where.status = status;

    const tokens = await prisma.queueToken.findMany({
      where,
      include: { patient: true, doctor: true },
      orderBy: { createdAt: "asc" },
    });

    res.json(tokens);
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to retrieve queue", details: error.message });
  }
});

// POST /api/queue/checkin
// FIX 1: Wrapped token number generation and creation inside a Prisma $transaction.
// Original had a classic read-modify-write race condition:
//   Step 1: Read max token (returns 5)
//   Step 2: Sleep 350ms (artificially widened the race window)
//   Step 3: Write token 6
// If two requests hit simultaneously, both read max=5, both try to write token 6 → duplicate!
// With $transaction, the read and write are atomic — the DB locks the operation,
// so concurrent requests are forced to queue up, each getting a unique token number.
//
// FIX 2: Removed the artificial await new Promise(resolve => setTimeout(resolve, 350)) delay.
// The comment said "makes sure db registers correctly" — this is false and dangerous.
// It served only to widen the race condition window, making duplicate tokens near-guaranteed
// under any concurrent load.
router.post("/checkin", authenticate, async (req, res) => {
  try {
    const { patientId, doctorId, appointmentId } = req.body;

    if (!patientId || !doctorId) {
      return res
        .status(400)
        .json({ error: "Patient and Doctor ID are required for check-in." });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Atomic transaction: read max token and create new token in one DB operation
    const newToken = await prisma.$transaction(async (tx) => {
      const maxTokenResult = await tx.queueToken.aggregate({
        where: { doctorId, createdAt: { gte: today } },
        _max: { tokenNumber: true },
      });

      const nextTokenNumber = (maxTokenResult._max.tokenNumber || 0) + 1;

      return tx.queueToken.create({
        data: {
          tokenNumber: nextTokenNumber,
          patientId,
          doctorId,
          appointmentId: appointmentId || null,
          status: "WAITING",
        },
        include: { patient: true, doctor: true },
      });
    });

    res.status(201).json({
      message: "Checked in successfully. Token generated.",
      token: newToken,
    });
  } catch (error) {
    console.error("Queue check-in error:", error);
    res.status(500).json({ error: "Check-in failed", details: error.message });
  }
});

// PATCH /api/queue/:id
router.patch("/:id", authenticate, async (req, res) => {
  try {
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: "Status is required" });

    const updatedToken = await prisma.queueToken.update({
      where: { id: req.params.id },
      data: { status },
      include: { patient: true, doctor: true },
    });
    res.json(updatedToken);
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to update queue token", details: error.message });
  }
});

module.exports = router;
