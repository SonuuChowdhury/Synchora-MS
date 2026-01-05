export function errorHandler(err, req, res, next) {
  console.error("❌ ERROR:", err.stack || err.message);

  // Default values
  const statusCode = err.statusCode || 500;
  const message = err.message || "Internal Server Error";

  res.status(statusCode).json({
    success: false,
    error: message,
  });
}
