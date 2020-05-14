const express = require("express");
const router = express.Router();
const request = require("request");
const qs = require("querystring");

router.get("/:adviceSetId", (req, res, next) => {
  const { adviceSetId } = req.params;
  if (!adviceSetId) {
    return next(new Error("Advice Set ID required"));
  }

  // advice
  const qrystr = Object.assign({}, req.query, {
    include: ["filteredVars"]
  });
  const apiUrl = `${process.env.API_HOST}/_/advice/api/${adviceSetId}?${qs.stringify(qrystr)}`;

  request.get(apiUrl, {
    headers: {
      "Accept": "application/json; charset=utf-8",
      "Authorization": `Bearer ${process.env.API_KEY}`
    }
  }, (err, resp, body) => {
    if (err) { return next(err); }

    const api = JSON.parse(body);

    if (api.error) { return next(new Error(api.error.message)); }

    return res.render("showcase/advice", {
      api: api
    });
  });
});

module.exports = router;
