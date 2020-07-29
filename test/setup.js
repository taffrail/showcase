// https://devcenter.heroku.com/articles/heroku-ci#immutable-environment-variables
// do not load env config in "CI" mode, i.e., when Heroku is running tests
if (!process.env.CI) {
  require("dotenv").config({ path: ".env.test" });
}

// use the HerokuRedis AddOn `REDIS_URL` var
// as the value for the unique `ENGINE_REDIS_URL` var
if (!process.env.ENGINE_REDIS_URL && process.env.REDIS_URL) {
  process.env.ENGINE_REDIS_URL = process.env.REDIS_URL;
}