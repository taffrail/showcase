const express = require("express");
const router = express.Router();
const request = require("request");
const qs = require("querystring");
const { BitlyClient } = require("bitly");
const bitly = new BitlyClient(process.env.BITLY_TOKEN, {
  domain: "advice.link"
});

router.get("/:adviceSetId/:mobile?", (req, res, next) => {
  const { adviceSetId } = req.params;
  if (!adviceSetId) {
    return next(new Error("Advice Set ID required"));
  }

  // advice
  const qrystr = Object.assign({}, req.query, {
    include: ["filteredVars"], showcase: true
  });
  const apiUrl = `${process.env.API_HOST}/_/advice/api/${adviceSetId}?${qs.stringify(qrystr)}`;

  console.warn(apiUrl);

  request.get(apiUrl, {
    headers: {
      "Accept": "application/json; charset=utf-8",
      "Authorization": `Bearer ${process.env.API_KEY}`
    }
  }, (err, resp, body) => {
    if (err) { return next(err); }

    if (resp.statusCode > 200) {
      console.warn(resp);
      return next(new Error(resp.statusMessage));
    }

    if (!err && resp.statusCode == 200) {
      const api = JSON.parse(body);
      if (api.error) { return next(new Error(api.error.message)); }

      const isMobile = req.params.mobile == "mobile";
      const template = isMobile ? "mobile" : "index";

      return res.render(`showcase/${template}`, {
        api: api,
        isMobile: isMobile
      });
    } else {
      console.error("unexpected!");
      return res.status(resp.statusCode).send(body);
    }
  });
});

/**
 * Shorten a long URL
 */
router.post("/api/shorten_only", (req, res, next) => {
  bitly
    .shorten(req.body.long_url)
    .then((result) => {
      return res.json(result);
    })
    .catch((error) => {
      return res.status(500).json(error);
    });
});

/**
 * Shorten AND add title+tags to a URL
 */
router.post("/api/shorten", (req, res, next) => {
  bitly
    .bitlyRequest("bitlinks", {
      long_url: req.body.long_url,
      title: req.body.title,
      tags: ["showcase"],
    })
    .then((result) => {
      return res.json(result);
    })
    .catch((error) => {
      return res.status(500).json(error);
    });
});

module.exports = router;
