/**
 * Middleware to redirect requests from old justgoodadvice.com hostname to new taffrail
 */
module.exports = (req, res, next) => {
  if (req.hostname && req.hostname.includes("justgoodadvice.com")) {
    return res.redirect(301, `${process.env.WEB_HOST}${req.originalUrl}`);
  }
  next();
}