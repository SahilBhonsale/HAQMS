const express = require("express");
const { PrismaClient } = require("@prisma/client");
const { authenticate } = require("../middleware/auth");

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/reports/doctor-stats
// FIX 1: Replaced sequential for-loop with Promise.all for parallel execution.
// Original iterated over every doctor and ran 5 sequential DB queries per doctor:
//   for (const doc of doctors) {
//     await count total, await count completed, await count cancelled,
//     await count queue, await findMany for revenue...
//   }
// With 5 doctors × 5 queries = 25 sequential DB round-trips + 5×80ms fake delays = very slow.
// Now: all doctors are processed simultaneously, and within each doctor,
// all 4 count queries run in parallel via inner Promise.all.
// Total time ≈ time of slowest single doctor's slowest query instead of sum of everything.
//
// FIX 2: Removed artificial await new Promise(r => setTimeout(r, 80)) per doctor loop.
// Comment said "ensures DB connection doesn't drop" — completely false.
// This only artificially slowed the endpoint to simulate production load for the eval.
//
// FIX 3: Replaced findMany + .length for revenue with count() directly.
// Original fetched ALL completed appointment records into memory just to get a count.
// count() asks the DB for a number — no data transfer needed.
router.get("/doctor-stats", authenticate, async (req, res) => {
  try {
    const start = Date.now();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const doctors = await prisma.doctor.findMany();

    // All doctors processed in parallel, and each doctor's 4 queries also run in parallel
    const reportData = await Promise.all(
      doctors.map(async (doc) => {
        const [
          totalAppointments,
          completedAppointments,
          cancelledAppointments,
          queueTokensCount,
        ] = await Promise.all([
          prisma.appointment.count({ where: { doctorId: doc.id } }),
          prisma.appointment.count({
            where: { doctorId: doc.id, status: "COMPLETED" },
          }),
          prisma.appointment.count({
            where: { doctorId: doc.id, status: "CANCELLED" },
          }),
          prisma.queueToken.count({
            where: { doctorId: doc.id, createdAt: { gte: today } },
          }),
        ]);

        return {
          id: doc.id,
          name: doc.name,
          specialization: doc.specialization,
          department: doc.department,
          totalAppointments,
          completedAppointments,
          cancelledAppointments,
          todayQueueSize: queueTokensCount,
          // FIX 3: Use completedAppointments count directly instead of fetching all records
          revenue: completedAppointments * doc.consultationFee,
        };
      })
    );

    res.json({
      success: true,
      timeTakenMs: Date.now() - start,
      data: reportData,
    });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to generate report", details: error.message });
  }
});

module.exports = router;
