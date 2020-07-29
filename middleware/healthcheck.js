// const logger = require("@justgoodadvice/justgoodadvice-web-core/logger");
const pkg = require("../package.json");
const fetch = require("node-fetch");

module.exports.check = (app) => {
  const { name } = pkg;
  const testAdviceSetId = process.env.API_CONNECTION_TEST_ADVICESET_ID;
  const healthUrl = `${process.env.API_HOST}/api/advice/${testAdviceSetId}?include[]=filteredVars&showcase=true`;

  // https://www.npmjs.com/package/express-healthcheck
  app.use("/healthcheck", require("express-healthcheck")({
    // when app is healthy...
    healthy: () => {
      return {
        [name]: "is ok",
        uptime: process.uptime(),
        timestamp: new Date()
      };
    },
    // test for healthiness
    test: (callback) => {
      Promise.all([
        fetch(healthUrl)
          .then(res => {
            if (res.status >= 400){
              throw new Error(res.statusText);
            }
          })
      ]).then(() => {
        return callback();
      }).catch(err => {
        return callback({
          [name]: "is down",
          message: err.message ? err.message : null,
          timestamp: new Date()
        });
      });
    }
  }));
}