const express = require("express");
const router = express.Router();
const qs = require("querystring");

/* GET home page. */
router.get("/", (req, res, next) => {
  // res.render("index", { title: "Just Good Advice" });

  // temp redirect to this "error", we don't have a "home page" for this app.
  console.warn("temp redirect to this \"error\", we don't have a \"home page\" for this app.");
  return res.redirect("https://justgoodadvice.github.io/advicebuilder-status/H10.html");
});

// Handle redirects from classic `app` URL to this new format
router.get("/_/advice/widget/:adviceSetId/_/:config?/", (req, res, next) => {
  return res.redirect(`/s/${req.params.adviceSetId}?${qs.stringify(req.query)}`);
})

module.exports = router;
