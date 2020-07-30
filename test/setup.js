// https://devcenter.heroku.com/articles/heroku-ci#immutable-environment-variables
// do not load env config in "CI" mode, i.e., when Heroku is running tests
if (!process.env.CI) {
  require("dotenv").config({ path: ".env.test" });
}
