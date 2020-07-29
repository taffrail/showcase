require("./setup");
const request = require("supertest");
const app = require("../app");
const agent = request.agent(app);

describe("Root", () => {

  it("should return 302 on the default route", (done) => {
    agent
      .get("/")
      .set("Accept", "application/json")
      .expect(302)
      .end(done);
  });
});