const express = require("express");
const isbot = require("isbot");
const router = express.Router();
const request = require("request");
const qs = require("querystring");
const { BitlyClient } = require("bitly");
const bitly = new BitlyClient(process.env.BITLY_TOKEN, {
  domain: "advice.link"
});

// serve OG meta tags to bots since this app is sorta like a SPA
const botMiddleware = (req, res, next) => {
  const { adviceSetId } = req.params;
  const { nobot } = req.query;
  if (nobot == 1) {
    return next();
  }

  if (isbot(req.get("user-agent"))) {
    // get data from Advice API for meta tags
    // and prerendering basic HTML structure
    const qrystr = Object.assign({}, req.query, {
      include: ["filteredVars"], showcase: true
    });
    const apiUrl = `${process.env.API_HOST}/api/advice/${adviceSetId}?${qs.stringify(qrystr)}`;
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

        return res.render("showcase/bot", {
          api: api
        });
      } else {
        console.error("unexpected!");
        return res.status(resp.statusCode).send(body);
      }
    });
  } else {
    return next();
  }
}

router.get("/:adviceSetId/:view?", botMiddleware, (req, res, next) => {
  const { adviceSetId, view = "index" } = req.params;
  const allowedViews = ["index", "mobile", "virtual-assistant", "salesforce"];
  const template = (allowedViews.includes(view)) ? view : allowedViews[0];
  const isMobile = view == "mobile" || view == "virtual-assistant";

  return res.render(`showcase/${template}`, {
    adviceSetId: adviceSetId,
    isMobile: isMobile
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
