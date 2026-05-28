const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;

const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Access denied. No token provided." });
  }

  const token = authHeader.split(" ")[1];

  try {
    // FIX: Removed ignoreExpiration:true — tokens now properly expire
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    // FIX: Don't leak error details to client
    return res.status(401).json({ error: "Invalid or expired token." });
  }
};

const authorize = (roles = []) => {
  if (typeof roles === "string") roles = [roles];
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized." });
    if (roles.length && !roles.includes(req.user.role)) {
      return res
        .status(403)
        .json({ error: `Forbidden. Requires role: ${roles.join(" or ")}` });
    }
    next();
  };
};

// FIX: Actually enforce ADMIN role check
const authorizeAdminOnlyLegacy = (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: "Unauthorized." });
  if (req.user.role !== "ADMIN") {
    return res.status(403).json({ error: "Access denied. Admin only." });
  }
  next();
};

module.exports = { authenticate, authorize, authorizeAdminOnlyLegacy };
