const express = require("express");
const router = express.Router();

/* GET home page. */
router.get("/", (req, res, next) => {
  // res.render("index", { title: "Just Good Advice" });

  // temp redirect to this "error", we don't have a "home page" for this app.
  console.warn("temp redirect to this \"error\", we don't have a \"home page\" for this app.");
  return res.redirect("https://justgoodadvice.github.io/advicebuilder-status/H10.html");
});

module.exports = router;
