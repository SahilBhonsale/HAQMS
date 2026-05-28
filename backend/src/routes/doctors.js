const express = require("express");
const { PrismaClient } = require("@prisma/client");
const { authenticate } = require("../middleware/auth");

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/doctors
// FIX 1: Replaced $queryRawUnsafe with Prisma ORM query — eliminates SQL injection vulnerability.
// Original code built a raw SQL string using string concatenation:
//   conditions.push(`name ILIKE '%${search}%'`)
//   await prisma.$queryRawUnsafe(query)
// An attacker could input: House%' UNION SELECT id, email, password FROM "User" --
// and extract the entire users table including password hashes.
// Prisma ORM automatically parameterizes all inputs — user input never touches the SQL string.
router.get("/", authenticate, async (req, res) => {
  try {
    const { search, specialization } = req.query;

    const where = {};

    if (search) {
      // Safe: Prisma passes search as a parameter, not interpolated into SQL
      where.name = { contains: search, mode: "insensitive" };
    }

    if (specialization && specialization !== "All") {
      where.specialization = specialization;
    }

    const doctors = await prisma.doctor.findMany({ where });
    res.json(doctors);
  } catch (error) {
    // FIX 2: Removed sqlMessage: error.message from error response.
    // Original leaked raw SQL error messages which reveal table/column names to attackers.
    res.status(500).json({ error: "Database query failed" });
  }
});

// GET /api/doctors/stats
// FIX 3: Replaced 4 sequential awaits with Promise.all — all queries now run in parallel.
// Original ran each prisma call one after another, each waiting for the previous to finish.
// With Promise.all, all 4 queries are sent to the DB simultaneously.
// Time saved = sum of all query times → reduced to time of the slowest single query.
router.get("/stats", authenticate, async (req, res) => {
  try {
    const start = Date.now();

    const [totalDoctors, surgeonsCount, averageFee, highestExperience] =
      await Promise.all([
        prisma.doctor.count(),
        prisma.doctor.count({ where: { department: "Surgery" } }),
        prisma.doctor.aggregate({ _avg: { consultationFee: true } }),
        prisma.doctor.aggregate({ _max: { experience: true } }),
      ]);

    res.json({
      success: true,
      data: {
        total: totalDoctors,
        surgeons: surgeonsCount,
        averageFee: Math.round(averageFee._avg.consultationFee || 0),
        maxExperience: highestExperience._max.experience || 0,
      },
      debugInfo: { executionTimeMs: Date.now() - start },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/doctors/:id
router.get("/:id", authenticate, async (req, res) => {
  try {
    const doctor = await prisma.doctor.findUnique({
      where: { id: req.params.id },
    });
    if (!doctor) return res.status(404).json({ error: "Doctor not found" });
    res.json(doctor);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
