require("./helper.js");
const request = require("supertest");
const mime = require("mime-types");
const chai = require("chai");
const { expect } = chai;
const app = require("../app");
let agent;

describe("API - Health Check", () => {

  // login before
  before((done) => {
    agent = request(app);

    done();
  });

  it("should return a check", (done) => {
    agent
      .get("/healthcheck")
      .expect(res => {
        if (res.body.error) { return new Error(res.body.error.message); }
      })
      .expect(res => {
        const { body: healthcheck } = res;

        expect(healthcheck).to.be.an("object");
        expect(healthcheck.showcase).to.equal("is ok");
        expect(healthcheck.uptime).to.be.greaterThan(0);
        expect(healthcheck).to.have.property("timestamp");
      })
      .expect("Content-Type", mime.contentType("json"))
      .expect(200)
      .end(err => {
        if (err) { return done(err); }
        done();
      });
  });

});
