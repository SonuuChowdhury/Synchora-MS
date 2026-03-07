import SerpApi from "google-search-results-nodejs";
import dotenv from "dotenv";
dotenv.config({ quiet: true });

const token = process.env.SERP_API_KEY;

const search = new SerpApi.GoogleSearch(token);

const params = {
  q: "AI agents 2026",
  location: "India",
  hl: "en",
  gl: "in"
};

search.json(params, (data) => {
  console.log("Top Results:\n");

  data.organic_results.forEach((result, i) => {
    console.log(`${i + 1}. ${result.title}`);
    console.log(result.link);
    console.log(result.snippet);
    console.log("------");
  });
});