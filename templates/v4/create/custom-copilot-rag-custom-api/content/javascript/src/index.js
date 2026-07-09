const app = require("./app/app");

(async () => {
  await app.start(process.env.PORT || process.env.port || 3978);
  console.log(`\nAgent started, app listening to`, process.env.PORT || process.env.port || 3978);
})();
